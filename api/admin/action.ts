import {
  HttpError,
  requireAdminUser,
  sendError,
  sendJson,
  type ApiRequest,
  type ApiResponse,
  writeAdminAudit,
} from "../_adminClient.js";

const DEFAULT_PASSWORD_RESET_URL = "https://senior-securities.vercel.app/reset-password";
const EMAIL_LIMIT_PER_HOUR = Number(process.env.PASSWORD_RESET_EMAIL_LIMIT_PER_HOUR || 3);
type AdminClient = Awaited<ReturnType<typeof requireAdminUser>>["supabase"];
type JsonObject = Record<string, unknown>;

function getEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

async function findUserIdByEmail(supabase: AdminClient, email: string): Promise<string> {
  let page = 1;
  const perPage = 200;
  const normalizedEmail = email.trim().toLowerCase();

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = (data.users || []).find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (found?.id) return found.id;
    if ((data.users || []).length < perPage) break;
    page += 1;
  }

  throw new Error(`找不到使用者：${email}`);
}

function normalizePasswordResetUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/reset-password") ? trimmed : `${trimmed}/reset-password`;
}

function getPasswordResetRedirectUrl(): string {
  const explicitUrl = normalizePasswordResetUrl(getEnv("PASSWORD_RESET_REDIRECT_URL"));
  if (explicitUrl) return explicitUrl;

  const siteUrl = normalizePasswordResetUrl(getEnv("SITE_URL") || getEnv("VITE_SITE_URL") || getEnv("VITE_PUBLIC_SITE_URL"));
  if (siteUrl) return siteUrl;

  const vercelUrl = (getEnv("VERCEL_PROJECT_PRODUCTION_URL") || getEnv("VERCEL_URL"))
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (vercelUrl) return `https://${vercelUrl}/reset-password`;

  return DEFAULT_PASSWORD_RESET_URL;
}

function parseBody(req: ApiRequest): JsonObject {
  const parsed: unknown = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as JsonObject
    : {};
}

async function countRecentPasswordResetRequests(supabase: AdminClient, email: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("password_reset_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase())
    .gte("created_at", since);

  if (error) {
    if (String(error.message || "").includes("password_reset_requests")) {
      throw new Error("缺少 password_reset_requests 資料表。請先到 Supabase SQL Editor 執行 supabase/password-reset-rate-limit-v15.sql。");
    }
    throw error;
  }

  return count || 0;
}

async function recordPasswordResetRequest(supabase: AdminClient, args: {
  email: string;
  status: "sent" | "blocked" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const { error } = await supabase.from("password_reset_requests").insert({
    email: args.email.trim().toLowerCase(),
    request_kind: "admin",
    status: args.status,
    error_message: args.errorMessage || null,
  });
  if (error) console.error("Failed to record admin password reset request:", error);
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase, user } = await requireAdminUser(req, { roles: ["primary_admin", "admin"] });
    const body = parseBody(req);
    const action = String(body.action || "");
    const email = String(body.email || "").trim();
    const deviceId = String(body.deviceId || "").trim();
    const userId = body.userId ? String(body.userId) : email ? await findUserIdByEmail(supabase, email) : "";

    if (!userId) throw new Error("缺少 userId 或 email。 ");

    if (action === "revoke") {
      const { data: updatedEntitlements, error: entitlementError } = await supabase
        .from("user_entitlements")
        .update({ status: "revoked" })
        .eq("user_id", userId)
        .select("user_id");
      if (entitlementError) throw entitlementError;
      if (!updatedEntitlements?.length) throw new HttpError("找不到可取消的有效授權。", 404);

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.entitlement.revoke",
        targetUserId: userId,
        targetEmail: email,
      });

      sendJson(res, 200, { ok: true, message: "已取消完整題庫權限。" });
      return;
    }

    if (action === "restore") {
      const { error: upsertError } = await supabase.from("user_entitlements").upsert({
        user_id: userId,
        plan: "full",
        status: "active",
        granted_at: new Date().toISOString(),
        expires_at: null,
      });
      if (upsertError) throw upsertError;

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.entitlement.restore",
        targetUserId: userId,
        targetEmail: email,
      });

      sendJson(res, 200, { ok: true, message: "已恢復永久完整題庫權限。" });
      return;
    }

    if (action === "reset-devices") {
      const { data: revokedDevices, error: resetDevicesError } = await supabase
        .from("user_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("revoked_at", null)
        .select("id");
      if (resetDevicesError) throw resetDevicesError;

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.devices.archive_all",
        targetUserId: userId,
        targetEmail: email,
        metadata: { affectedDevices: revokedDevices?.length || 0 },
      });

      sendJson(res, 200, { ok: true, message: `已封存 ${revokedDevices?.length || 0} 台有效裝置；這不會強制登出現有工作階段。` });
      return;
    }

    if (action === "revoke-device") {
      if (!deviceId) throw new HttpError("缺少 deviceId。", 400);
      const { data: revokedDevice, error: revokeDeviceError } = await supabase
        .from("user_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", deviceId)
        .eq("user_id", userId)
        .is("revoked_at", null)
        .select("id");
      if (revokeDeviceError) throw revokeDeviceError;
      if (!revokedDevice?.length) throw new HttpError("找不到這台有效裝置，可能已經封存。", 404);

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.device.archive",
        targetUserId: userId,
        targetEmail: email,
        metadata: { deviceId },
      });

      sendJson(res, 200, { ok: true, message: "已封存指定裝置紀錄；這不會強制登出現有工作階段。" });
      return;
    }



    if (action === "delete-leaderboard") {
      const [{ error: statsError }, { error: profileError }] = await Promise.all([
        supabase.from("user_leaderboard_stats").delete().eq("user_id", userId),
        supabase.from("user_leaderboard_profiles").delete().eq("user_id", userId),
      ]);
      if (statsError) throw statsError;
      if (profileError) throw profileError;

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "leaderboard.entry.delete",
        targetUserId: userId,
        targetEmail: email,
      });

      sendJson(res, 200, { ok: true, message: "已刪除該使用者的排行榜紀錄。" });
      return;
    }

    if (action === "send-password-reset") {
      if (!email) throw new Error("寄送重設密碼信需要 email。");
      const normalizedEmail = email.trim().toLowerCase();
      const recentCount = await countRecentPasswordResetRequests(supabase, normalizedEmail);
      if (recentCount >= EMAIL_LIMIT_PER_HOUR) {
        await recordPasswordResetRequest(supabase, {
          email: normalizedEmail,
          status: "blocked",
          errorMessage: "email hourly limit",
        });
        throw new HttpError(`這個 Email 1 小時內已經寄送 ${EMAIL_LIMIT_PER_HOUR} 次重設密碼信，請稍後再試。`, 429);
      }

      const redirectTo = getPasswordResetRedirectUrl();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (resetError) {
        await recordPasswordResetRequest(supabase, {
          email: normalizedEmail,
          status: "failed",
          errorMessage: resetError.message,
        });
        throw resetError;
      }

      await recordPasswordResetRequest(supabase, { email: normalizedEmail, status: "sent" });
      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.password_reset.send",
        targetUserId: userId,
        targetEmail: normalizedEmail,
      });
      sendJson(res, 200, { ok: true, message: "已寄出重設密碼信。" });
      return;
    }

    throw new Error("未知操作。 ");
  } catch (error) {
    console.error("/api/admin/action failed:", error);
    sendError(res, error);
  }
}
