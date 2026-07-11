import { createHash, randomBytes } from "node:crypto";
import {
  getConfiguredAdminEmails,
  HttpError,
  requireAdminUser,
  sendError,
  sendJson,
  writeAdminAudit,
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
  if (!/^[A-Za-z0-9-]{10,80}$/.test(code)) {
    throw new HttpError("自訂啟用碼需為 10–80 個英數字或連字號。", 400);
  }
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

function normalizeAdminRole(value: unknown): "admin" | "content_reviewer" | "support_admin" {
  const role = String(value || "admin");
  if (role === "content_reviewer" || role === "support_admin") return role;
  return "admin";
}

async function findAuthUserIdByEmail(supabase: Awaited<ReturnType<typeof requireAdminUser>>["supabase"], email: string): Promise<string | null> {
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
    const { supabase, user, isPrimaryAdmin } = await requireAdminUser(req);

    if (req.method === "GET") {
      const tool = queryValue(req.query?.tool);
      if (tool === "admins") {
        const { data, error } = await supabase
          .from("admin_users")
          .select("id, email, role, is_active, note, created_by, created_at, updated_at")
          .order("created_at", { ascending: false });
        if (error) throw error;
        sendJson(res, 200, { admins: data || [], primaryEmails: getConfiguredAdminEmails() });
        return;
      }

      if (tool === "activation-codes") {
        const { data, error } = await supabase
          .from("activation_codes")
          .select("id, code_plain, code_preview, max_uses, use_count, is_active, note, created_at, redeemed_at")
          .order("created_at", { ascending: false })
          .limit(100);
        if (error) throw error;
        sendJson(res, 200, {
          activationCodes: data || [],
          isPrimaryAdmin,
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

    if (action === "delete-activation-code") {
      if (!isPrimaryAdmin) {
        throw new HttpError("只有主要管理員可以刪除啟用碼。", 403);
      }
      const activationCodeId = String(body.activationCodeId || "").trim();
      if (!/^[0-9a-f-]{36}$/i.test(activationCodeId)) throw new HttpError("啟用碼識別碼不正確。", 400);
      const { data: existing, error: lookupError } = await supabase
        .from("activation_codes")
        .select("id, code_preview, use_count, max_uses")
        .eq("id", activationCodeId)
        .maybeSingle();
      if (lookupError) throw lookupError;
      if (!existing) throw new HttpError("找不到指定啟用碼。", 404);
      const { error } = await supabase.from("activation_codes").delete().eq("id", activationCodeId);
      if (error) throw error;
      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "activation_code.delete",
        metadata: {
          activationCodeId,
          codePreview: existing.code_preview,
          useCount: existing.use_count,
          maxUses: existing.max_uses,
        },
      });
      sendJson(res, 200, { ok: true, message: "啟用碼已刪除。" });
      return;
    }

    if (action === "create-activation-code") {
      const customCode = normalizeActivationCode(body.code);
      const note = String(body.note || "").trim().slice(0, 500) || null;
      const maxUses = Math.min(999, Math.max(1, Math.trunc(Number(body.maxUses) || 1)));
      const code = activationCodeRecord(customCode);
      const { error } = await supabase.from("activation_codes").insert({
        code_hash: code.hash,
        code_preview: code.preview,
        code_plain: code.formatted,
        max_uses: maxUses,
        note,
      });
      if (error) throw error;
      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "activation_code.create",
        metadata: { maxUses, hasNote: Boolean(note), customCode: Boolean(customCode) },
      });
      sendJson(res, 200, { ok: true, code: code.formatted, message: "啟用碼已建立。" });
      return;
    }

    const targetEmail = normalizeEmail(body.email);
    const primaryEmails = getConfiguredAdminEmails();
    const currentEmail = user.email?.toLowerCase() || "";

    if (action === "upsert-admin") {
      const note = String(body.note || "").trim().slice(0, 500) || null;
      const role = normalizeAdminRole(body.role);
      const { error } = await supabase.from("admin_users").upsert({
        email: targetEmail,
        role,
        is_active: true,
        note,
        created_by: currentEmail || "admin-web-tools",
      }, { onConflict: "email" });
      if (error) throw error;
      const targetUserId = await findAuthUserIdByEmail(supabase, targetEmail);
      if (targetUserId) {
        const { error: assignmentError } = await supabase.from("admin_role_assignments").upsert({
          user_id: targetUserId,
          role,
          is_active: true,
          mfa_required: Boolean(body.mfaRequired),
          assigned_by: user.id,
          note,
          updated_at: new Date().toISOString(),
        }, { onConflict: "user_id" });
        if (assignmentError && !String(assignmentError.message || "").includes("admin_role_assignments")) throw assignmentError;
      }
      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "admin_account.upsert",
        targetEmail,
        targetUserId,
        metadata: { hasNote: Boolean(note), role, mfaRequired: Boolean(body.mfaRequired) },
      });
      sendJson(res, 200, { ok: true, message: `已加入或恢復管理員：${targetEmail}（${role}）` });
      return;
    }

    if (action === "disable-admin" || action === "delete-admin") {
      if (primaryEmails.includes(targetEmail)) throw new HttpError("主要管理員帳號不可停用或刪除。", 400);
      if (targetEmail === currentEmail) throw new HttpError("不可停用或刪除目前登入的管理員帳號。", 400);

      const query = supabase.from("admin_users");
      const { error } = action === "disable-admin"
        ? await query.update({ is_active: false, note: `disabled by ${currentEmail}` }).eq("email", targetEmail)
        : await query.delete().eq("email", targetEmail);
      if (error) throw error;
      const targetUserId = await findAuthUserIdByEmail(supabase, targetEmail);
      if (targetUserId) {
        const assignmentQuery = supabase.from("admin_role_assignments");
        const { error: assignmentError } = action === "disable-admin"
          ? await assignmentQuery.update({ is_active: false, updated_at: new Date().toISOString() }).eq("user_id", targetUserId)
          : await assignmentQuery.delete().eq("user_id", targetUserId);
        if (assignmentError && !String(assignmentError.message || "").includes("admin_role_assignments")) throw assignmentError;
      }
      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: action === "disable-admin" ? "admin_account.disable" : "admin_account.delete",
        targetEmail,
        targetUserId,
      });
      sendJson(res, 200, {
        ok: true,
        message: action === "disable-admin" ? `已停用管理員：${targetEmail}` : `已刪除管理員：${targetEmail}`,
      });
      return;
    }

    throw new HttpError("未知操作。", 400);
  } catch (error) {
    console.error("/api/admin/tools failed:", error);
    sendError(res, error);
  }
}
