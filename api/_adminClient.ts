import { createClient } from "@supabase/supabase-js";

export interface ApiRequest {
  method?: string;
  headers?: Record<string, string | string[] | undefined>;
  query?: Record<string, string | string[] | undefined>;
  body?: unknown;
  socket?: { remoteAddress?: string | null };
}

export interface ApiResponse {
  statusCode: number;
  setHeader(name: string, value: string): void;
  end(body?: string): void;
}

export class HttpError extends Error {
  constructor(message: string, readonly statusCode: number) {
    super(message);
  }
}

export function getErrorStatusCode(error: unknown): number {
  if (typeof error !== "object" || error === null || !("statusCode" in error)) return 500;
  const statusCode = (error as { statusCode?: unknown }).statusCode;
  return typeof statusCode === "number" ? statusCode : 500;
}

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

export function getConfiguredAdminEmails(): string[] {
  return [...configuredAdminEmails];
}

async function isDatabaseAdmin(email: string): Promise<boolean> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return false;

  const { data, error } = await getAdminClient()
    .from("admin_users")
    .select("email, is_active")
    .eq("email", normalizedEmail)
    .eq("is_active", true)
    .maybeSingle();

  if (error) {
    const message = String(error.message || "");
    if (message.includes("admin_users") || message.includes("Could not find the table")) return false;
    throw error;
  }
  return Boolean(data);
}

function extractBearerToken(req: ApiRequest): string | null {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export async function requireAdminUser(req: ApiRequest) {
  const token = extractBearerToken(req);
  if (!token) {
    throw new HttpError("尚未登入，或登入狀態已過期。", 401);
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    throw new HttpError("無法驗證目前登入帳號。", 401);
  }

  const email = data.user.email?.toLowerCase() || "";
  const hasAdminAccess = configuredAdminEmails.includes(email) || await isDatabaseAdmin(email);
  if (!hasAdminAccess) {
    throw new HttpError("這個帳號沒有管理員權限。請設定 ADMIN_EMAILS。 ", 403);
  }

  return { supabase, user: data.user };
}

function setAdminResponseHeaders(res: ApiResponse): void {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
}

export function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  setAdminResponseHeaders(res);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function sendError(res: ApiResponse, error: unknown): void {
  const statusCode = getErrorStatusCode(error);
  const message = error instanceof Error ? error.message : "未知錯誤。";
  sendJson(res, statusCode, { error: message });
}

function requestIpAddress(req: ApiRequest): string | null {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "").split(",")[0]?.trim();
  return forwarded || req.socket?.remoteAddress || null;
}

export async function writeAdminAudit(args: {
  supabase: ReturnType<typeof getAdminClient>;
  actor: { id: string; email?: string | null };
  req: ApiRequest;
  action: string;
  targetUserId?: string | null;
  targetEmail?: string | null;
  metadata?: Record<string, unknown>;
}): Promise<void> {
  const { error } = await args.supabase.from("admin_audit_events").insert({
    actor_user_id: args.actor.id,
    actor_email: args.actor.email?.trim().toLowerCase() || args.actor.id,
    target_user_id: args.targetUserId || null,
    target_email: args.targetEmail?.trim().toLowerCase() || null,
    action: args.action.slice(0, 120),
    metadata: args.metadata || {},
    ip_address: requestIpAddress(args.req),
  });
  if (error) {
    console.warn("Failed to write admin audit event:", error.message);
  }
}
