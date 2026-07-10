import { createClient } from "@supabase/supabase-js";
import { getErrorStatusCode, HttpError, type ApiRequest, type ApiResponse } from "../_adminClient.js";

const DEFAULT_ADMIN_EMAILS = "true.alpha0902@gmail.com";
const DEFAULT_PASSWORD_RESET_URL = "https://senior-securities.vercel.app/reset-password";
const EMAIL_LIMIT_PER_HOUR = Number(process.env.PASSWORD_RESET_EMAIL_LIMIT_PER_HOUR || 3);
type AdminClient = ReturnType<typeof getAdminClient>;
type JsonObject = Record<string, unknown>;

function getEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res: ApiResponse, error: unknown): void {
  const statusCode = getErrorStatusCode(error);
  const message = error instanceof Error ? error.message : String(error || "未知錯誤。");
  sendJson(res, statusCode, { error: message });
}

function getAdminClient() {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_SECRET_KEY");

  if (!supabaseUrl) {
    throw new HttpError("缺少 Vercel 環境變數：VITE_SUPABASE_URL 或 SUPABASE_URL。", 500);
  }

  if (!serviceRoleKey) {
    throw new HttpError("缺少 Vercel 環境變數：SUPABASE_SERVICE_ROLE_KEY。管理後台需要這個 server-only key。", 500);
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function getConfiguredAdminEmails(): string[] {
  return (getEnv("ADMIN_EMAILS") || DEFAULT_ADMIN_EMAILS)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}


async function isDatabaseAdmin(supabase: AdminClient, email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const { data, error } = await supabase
    .from("admin_users")
    .select("email, is_active")
    .eq("email", normalizedEmail)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    const message = String(error.message || "");
    if (message.includes("admin_users") || message.includes("Could not find the table")) {
      console.warn("admin_users table not found. Falling back to ADMIN_EMAILS only.");
      return false;
    }
    console.error("Database admin lookup failed:", message || error);
    return false;
  }

  return Boolean(data);
}


function extractBearerToken(req: ApiRequest): string | null {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function requireAdminUser(req: ApiRequest) {
  const token = extractBearerToken(req);
  if (!token) {
    throw new HttpError("尚未登入，或登入狀態已過期。", 401);
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError("無法驗證目前登入帳號，請重新登入管理員帳號。", 401);
  }

  const email = data.user.email?.toLowerCase() || "";
  const isConfiguredAdmin = getConfiguredAdminEmails().includes(email);
  const isDbAdmin = isConfiguredAdmin ? true : await isDatabaseAdmin(supabase, email);

  if (!isDbAdmin) {
    throw new HttpError(`這個帳號沒有管理員權限：${email}。請先用管理員帳號產生器加入 admin_users，或確認 Vercel 環境變數 ADMIN_EMAILS。`, 403);
  }

  return { supabase, user: data.user };
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
    const { supabase } = await requireAdminUser(req);
    const body = parseBody(req);
    const action = String(body.action || "");
    const email = String(body.email || "").trim();
    const userId = body.userId ? String(body.userId) : email ? await findUserIdByEmail(supabase, email) : "";

    if (!userId) throw new Error("缺少 userId 或 email。 ");

    if (action === "revoke") {
      const { error: entitlementError } = await supabase
        .from("user_entitlements")
        .update({ status: "revoked" })
        .eq("user_id", userId);
      if (entitlementError) throw entitlementError;

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

      sendJson(res, 200, { ok: true, message: "已恢復永久完整題庫權限。" });
      return;
    }



    if (action === "delete-leaderboard") {
      const [{ error: statsError }, { error: profileError }] = await Promise.all([
        supabase.from("user_leaderboard_stats").delete().eq("user_id", userId),
        supabase.from("user_leaderboard_profiles").delete().eq("user_id", userId),
      ]);
      if (statsError) throw statsError;
      if (profileError) throw profileError;

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
      sendJson(res, 200, { ok: true, message: "已寄出重設密碼信。" });
      return;
    }

    throw new Error("未知操作。 ");
  } catch (error) {
    console.error("/api/admin/action failed:", error);
    sendError(res, error);
  }
}
