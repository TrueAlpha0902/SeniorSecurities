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
const configuredAdminEmails = Array.from(new Set(
  [process.env.PRIMARY_ADMIN_EMAILS || "", process.env.ADMIN_EMAILS || ""]
    .join(",")
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean),
));

export type AdminRole = "primary_admin" | "admin";

type DatabaseAdminAccess = {
  role: AdminRole;
  mfaRequired: boolean;
};

function normalizeAdminRole(value: unknown): AdminRole {
  return String(value || "admin") === "primary_admin" ? "primary_admin" : "admin";
}

function decodeJwtPayload(token: string): Record<string, unknown> {
  try {
    const payload = token.split(".")[1];
    if (!payload) return {};
    const normalized = payload.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(normalized, "base64").toString("utf8")) as Record<string, unknown>;
  } catch {
    return {};
  }
}

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

async function getDatabaseAdminAccess(userId: string, email: string): Promise<DatabaseAdminAccess | null> {
  const client = getAdminClient();
  const { data: assignment, error: assignmentError } = await client
    .from("admin_role_assignments")
    .select("role, is_active, mfa_required")
    .eq("user_id", userId)
    .maybeSingle();
  if (!assignmentError && assignment) {
    if (!assignment.is_active) return null;
    return {
      role: normalizeAdminRole(assignment.role),
      mfaRequired: Boolean(assignment.mfa_required),
    };
  }
  if (assignmentError) {
    const message = String(assignmentError.message || "");
    if (!message.includes("admin_role_assignments") && !message.includes("Could not find the table")) throw assignmentError;
  }

  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail) return null;
  const { data, error } = await client
    .from("admin_users")
    .select("email, role, is_active")
    .eq("email", normalizedEmail)
    .eq("is_active", true)
    .maybeSingle();
  if (error) {
    const message = String(error.message || "");
    if (message.includes("admin_users") || message.includes("Could not find the table")) return null;
    throw error;
  }
  if (!data) return null;
  return { role: normalizeAdminRole(data.role), mfaRequired: false };
}

function extractBearerToken(req: ApiRequest): string | null {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] ?? null;
}

export async function requireAdminUser(
  req: ApiRequest,
  options: { roles?: AdminRole[]; requireAal2?: boolean } = {},
) {
  const token = extractBearerToken(req);
  if (!token) throw new HttpError("尚未登入，或登入狀態已過期。", 401);

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new HttpError("無法驗證目前登入帳號。", 401);

  const email = data.user.email?.toLowerCase() || "";
  const isConfiguredPrimaryAdmin = configuredAdminEmails.includes(email);
  const databaseAccess = isConfiguredPrimaryAdmin
    ? { role: "primary_admin" as AdminRole, mfaRequired: false }
    : await getDatabaseAdminAccess(data.user.id, email);
  if (!databaseAccess) throw new HttpError("這個帳號沒有管理員權限。", 403);
  const isPrimaryAdmin = databaseAccess.role === "primary_admin";

  const jwt = decodeJwtPayload(token);
  const aal = String(jwt.aal || "aal1");
  const globalMfaRequired = String(process.env.ADMIN_REQUIRE_MFA || "").toLowerCase() === "true";
  const mfaRequired = globalMfaRequired || databaseAccess.mfaRequired || options.requireAal2 === true;
  if (mfaRequired && aal !== "aal2") {
    throw new HttpError("此管理員操作需要完成多因素驗證（MFA）。", 403);
  }
  if (options.roles?.length && !options.roles.includes(databaseAccess.role)) {
    throw new HttpError("目前管理員角色沒有執行此操作的權限。", 403);
  }

  return {
    supabase,
    user: data.user,
    role: databaseAccess.role,
    isPrimaryAdmin,
    mfaVerified: aal === "aal2",
  };
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

export function sendPublicJson(
  res: ApiResponse,
  statusCode: number,
  payload: unknown,
  options: { cacheControl?: string; etag?: string } = {},
): void {
  res.statusCode = statusCode;
  res.setHeader("Cache-Control", options.cacheControl || "public, max-age=0, s-maxage=300, stale-while-revalidate=86400");
  if (options.etag) res.setHeader("ETag", options.etag);
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

export function requestIpAddress(req: ApiRequest): string | null {
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
  if (error) throw new Error(`Failed to write admin audit event: ${error.message}`);
}
