import { createHash, randomBytes } from "node:crypto";
import {
  getConfiguredAdminEmails,
  HttpError,
  requestIpAddress,
  requireAdminUser,
  sendError,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "../_adminClient.js";

type JsonObject = Record<string, unknown>;

function parseBody(req: ApiRequest): JsonObject {
  const parsed: unknown = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as JsonObject : {};
}

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function normalizeEmail(value: unknown): string {
  const email = String(value || "").trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new HttpError("Email 格式不正確。", 400);
  return email;
}

function normalizeActivationCode(value: unknown): string | null {
  const code = String(value || "").trim();
  if (!code) return null;
  if (!/^[A-Za-z0-9-]{10,80}$/.test(code)) throw new HttpError("自訂啟用碼需為 10–80 個英數字或連字號。", 400);
  return code;
}

function activationCodeRecord(customCode: string | null) {
  const raw = customCode || `SENIOR${randomBytes(8).toString("hex")}`;
  const normalized = raw.replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  if (normalized.length < 10) throw new HttpError("啟用碼至少需要 10 個英數字元。", 400);
  const formatted = normalized.match(/.{1,4}/g)?.join("-") || normalized;
  const preview = normalized.length <= 8 ? normalized : `${normalized.slice(0, 6)}...${normalized.slice(-4)}`;
  const hash = createHash("sha256").update(normalized).digest("hex");
  return { formatted, preview, hash };
}

async function findAuthUserIdByEmail(
  supabase: Awaited<ReturnType<typeof requireAdminUser>>["supabase"],
  email: string,
): Promise<string | null> {
  for (let page = 1; page <= 20; page += 1) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    const match = data.users.find((candidate) => candidate.email?.toLowerCase() === email);
    if (match) return match.id;
    if (data.users.length < 1000) break;
  }
  return null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    const tool = req.method === "GET" ? queryValue(req.query?.tool) : "";

    if (req.method === "GET") {
      if (tool === "access") {
        const auth = await requireAdminUser(req, { roles: ["primary_admin", "admin"] });
        sendJson(res, 200, {
          role: auth.role,
          isPrimaryAdmin: auth.isPrimaryAdmin,
        });
        return;
      }

      if (tool === "admins") {
        const auth = await requireAdminUser(req, { roles: ["primary_admin"] });
        const { data, error } = await auth.supabase
          .from("admin_users")
          .select("id, email, role, is_active, note, created_by, created_at, updated_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        sendJson(res, 200, {
          admins: data || [],
          primaryEmails: getConfiguredAdminEmails(),
          isPrimaryAdmin: auth.isPrimaryAdmin,
        });
        return;
      }

      if (tool === "activation-codes") {
        const auth = await requireAdminUser(req, { roles: ["primary_admin", "admin"] });
        const { data, error } = await auth.supabase
          .from("activation_codes")
          .select("id, code_preview, max_uses, use_count, is_active, note, created_at, redeemed_at")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        sendJson(res, 200, {
          activationCodes: data || [],
          isPrimaryAdmin: auth.isPrimaryAdmin,
        });
        return;
      }

      throw new HttpError("未知的管理工具。", 400);
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || "");
    const highRiskActions = new Set([
      "delete-activation-code",
      "upsert-admin",
      "disable-admin",
      "delete-admin",
    ]);
    const auth = await requireAdminUser(req, highRiskActions.has(action)
      ? { roles: ["primary_admin"] }
      : { roles: ["primary_admin", "admin"] });
    const { supabase, user } = auth;
    const actorEmail = user.email?.toLowerCase() || user.id;
    const ipAddress = requestIpAddress(req);

    if (action === "delete-activation-code") {
      const activationCodeId = String(body.activationCodeId || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(activationCodeId)) throw new HttpError("啟用碼識別碼不正確。", 400);
      const { data: existing, error: lookupError } = await supabase
        .from("activation_codes")
        .select("id")
        .eq("id", activationCodeId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) throw new HttpError("找不到指定啟用碼。", 404);
      const { error } = await supabase.rpc("delete_activation_code_v79", {
        p_actor_user_id: user.id,
        p_actor_email: actorEmail,
        p_activation_code_id: activationCodeId,
        p_ip_address: ipAddress,
      });
      if (error) throw error;
      sendJson(res, 200, { ok: true, message: "啟用碼已刪除。" });
      return;
    }

    if (action === "create-activation-code") {
      const customCode = normalizeActivationCode(body.code);
      const note = String(body.note || "").trim().slice(0, 500) || null;
      const maxUses = Math.min(999, Math.max(1, Math.trunc(Number(body.maxUses) || 1)));
      const code = activationCodeRecord(customCode);
      const { error } = await supabase.rpc("create_activation_code_v79", {
        p_actor_user_id: user.id,
        p_actor_email: actorEmail,
        p_code_hash: code.hash,
        p_code_preview: code.preview,
        p_max_uses: maxUses,
        p_note: note,
        p_custom_code: Boolean(customCode),
        p_ip_address: ipAddress,
      });
      if (error) throw error;
      sendJson(res, 200, { ok: true, code: code.formatted, message: "啟用碼已建立。" });
      return;
    }

    if (!["upsert-admin", "disable-admin", "delete-admin"].includes(action)) {
      throw new HttpError("未知操作。", 400);
    }

    const targetEmail = normalizeEmail(body.email);
    const primaryEmails = getConfiguredAdminEmails();
    const currentEmail = user.email?.toLowerCase() || "";
    if (primaryEmails.includes(targetEmail)) throw new HttpError("主要管理員帳號不可修改。", 400);
    if (targetEmail === currentEmail && action !== "upsert-admin") throw new HttpError("不可停用或刪除目前登入的管理員帳號。", 400);
    const targetUserId = await findAuthUserIdByEmail(supabase, targetEmail);

    if (action === "upsert-admin" || action === "disable-admin") {
      const note = String(body.note || "").trim().slice(0, 500) || null;
      const isActive = action === "upsert-admin";
      const { error } = await supabase.rpc("set_admin_access_v79", {
        p_actor_user_id: user.id,
        p_actor_email: actorEmail,
        p_target_user_id: targetUserId,
        p_target_email: targetEmail,
        p_role: "admin",
        p_is_active: isActive,
        p_mfa_required: false,
        p_note: note || (isActive ? null : `disabled by ${currentEmail}`),
        p_action: isActive ? "admin_account.upsert" : "admin_account.disable",
        p_ip_address: ipAddress,
      });
      if (error) throw error;
      sendJson(res, 200, {
        ok: true,
        message: isActive ? `已加入或恢復管理員：${targetEmail}` : `已停用管理員：${targetEmail}`,
      });
      return;
    }

    const { error } = await supabase.rpc("delete_admin_access_v79", {
      p_actor_user_id: user.id,
      p_actor_email: actorEmail,
      p_target_user_id: targetUserId,
      p_target_email: targetEmail,
      p_action: "admin_account.delete",
      p_ip_address: ipAddress,
    });
    if (error) throw error;
    sendJson(res, 200, { ok: true, message: `已刪除管理員：${targetEmail}` });
  } catch (error) {
    console.error("/api/admin/tools failed:", error);
    sendError(res, error);
  }
}
