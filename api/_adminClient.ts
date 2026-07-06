import { createClient } from "@supabase/supabase-js";

const supabaseUrl = (process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || "").trim();
const serviceRoleKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || "").trim();
const defaultAdminEmails = "true.alpha0902@gmail.com";
const configuredAdminEmails = (process.env.ADMIN_EMAILS || defaultAdminEmails)
  .split(",")
  .map((email) => email.trim().toLowerCase())
  .filter(Boolean);

export function getAdminClient() {
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error("Vercel server env missing: VITE_SUPABASE_URL/SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.");
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function extractBearerToken(req: any): string | null {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function requireAdminUser(req: any) {
  const token = extractBearerToken(req);
  if (!token) {
    const error: any = new Error("尚未登入，或登入狀態已過期。");
    error.statusCode = 401;
    throw error;
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const authError: any = new Error("無法驗證目前登入帳號。");
    authError.statusCode = 401;
    throw authError;
  }

  const email = data.user.email?.toLowerCase() || "";
  if (!configuredAdminEmails.includes(email)) {
    const adminError: any = new Error("這個帳號沒有管理員權限。請設定 ADMIN_EMAILS。 ");
    adminError.statusCode = 403;
    throw adminError;
  }

  return { supabase, user: data.user };
}

export function sendJson(res: any, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function sendError(res: any, error: unknown): void {
  const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : 500;
  const message = error instanceof Error ? error.message : "未知錯誤。";
  sendJson(res, statusCode, { error: message });
}
