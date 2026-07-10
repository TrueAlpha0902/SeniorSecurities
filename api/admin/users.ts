import { createClient } from "@supabase/supabase-js";
import { getErrorStatusCode, HttpError, type ApiRequest, type ApiResponse } from "../_adminClient.js";

interface AdminDataRow {
  user_id?: string | null;
  [key: string]: unknown;
}

const DEFAULT_ADMIN_EMAILS = "true.alpha0902@gmail.com";
const ONLINE_WINDOW_SECONDS = 120;
type AdminClient = ReturnType<typeof getAdminClient>;

function getEnv(name: string): string {
  return String(process.env[name] || "").trim();
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


function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res: ApiResponse, error: unknown): void {
  const statusCode = getErrorStatusCode(error);
  const rawMessage = error instanceof Error ? error.message : String(error || "未知錯誤。");
  const message = rawMessage.includes("FUNCTION_INVOCATION_FAILED")
    ? "Vercel 後端 API 執行失敗。請到 Vercel Functions Logs 查看錯誤細節。"
    : rawMessage;
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

function toMapByUserId(rows: AdminDataRow[] | null | undefined): Map<string, AdminDataRow> {
  const map = new Map<string, AdminDataRow>();
  for (const row of rows || []) {
    if (row.user_id && !map.has(row.user_id)) map.set(row.user_id, row);
  }
  return map;
}

function normalizeDate(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

async function safeSelect<T>(promise: PromiseLike<{ data: T | null; error: unknown }>, fallback: T): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    const message = typeof error === "object" && error !== null && "message" in error
      ? (error as { message?: unknown }).message
      : error;
    console.error("Admin optional query failed:", message || error);
    return fallback;
  }
  return data ?? fallback;
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const seenTime = new Date(lastSeenAt).getTime();
  if (Number.isNaN(seenTime)) return false;
  return Date.now() - seenTime <= ONLINE_WINDOW_SECONDS * 1000;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase } = await requireAdminUser(req);

    const page = Math.max(Number(req.query?.page || 1), 1);
    const perPage = Math.min(Math.max(Number(req.query?.perPage || 200), 1), 1000);
    const { data: authData, error: usersError } = await supabase.auth.admin.listUsers({ page, perPage });
    if (usersError) throw usersError;

    const users = authData.users || [];
    const userIds = users.map((user) => user.id).filter(Boolean);

    if (userIds.length === 0) {
      sendJson(res, 200, { users: [] });
      return;
    }

    const [entitlements, logs, answerRows, leaderboardRows, presenceRows] = await Promise.all([
      safeSelect(
        supabase.from("user_entitlements").select("user_id, plan, status, source_code_hash, granted_at, expires_at").in("user_id", userIds),
        [],
      ),
      safeSelect(
        supabase
          .from("login_audit_events")
          .select("user_id, email, event_type, ip_address, user_agent, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .limit(1000),
        [],
      ),
      safeSelect(
        supabase
          .from("user_answer_records")
          .select("user_id, question_id")
          .in("user_id", userIds)
          .limit(50000),
        [],
      ),
      safeSelect(
        supabase
          .from("user_leaderboard_stats")
          .select("user_id, total_practice_seconds")
          .in("user_id", userIds),
        [],
      ),
      safeSelect(
        supabase
          .from("user_presence")
          .select("user_id, last_seen_at")
          .in("user_id", userIds),
        [],
      ),
    ]);

    const entitlementByUser = toMapByUserId(entitlements as AdminDataRow[]);
    const lastLogByUser = toMapByUserId(logs as AdminDataRow[]);
    const leaderboardByUser = toMapByUserId(leaderboardRows as AdminDataRow[]);
    const presenceByUser = toMapByUserId(presenceRows as AdminDataRow[]);
    const logRows = (logs || []) as AdminDataRow[];
    const practicedByUser = new Map<string, Set<string>>();
    for (const answer of (answerRows || []) as AdminDataRow[]) {
      if (!answer.user_id) continue;
      if (!practicedByUser.has(answer.user_id)) practicedByUser.set(answer.user_id, new Set<string>());
      practicedByUser.get(answer.user_id)?.add(String(answer.question_id || ""));
    }

    const sourceCodeHashes = Array.from(new Set((entitlements as AdminDataRow[])
      .map((row) => String(row.source_code_hash || ""))
      .filter(Boolean)));
    const activationCodeByHash = new Map<string, string>();
    if (sourceCodeHashes.length > 0) {
      const activationRows = await safeSelect(
        supabase
          .from("activation_codes")
          .select("code_hash, code_plain, code_preview")
          .in("code_hash", sourceCodeHashes),
        [],
      );
      for (const code of activationRows as AdminDataRow[]) {
        activationCodeByHash.set(String(code.code_hash), String(code.code_plain || code.code_preview || ""));
      }
    }

    const result = users.map((user) => {
      const entitlement = entitlementByUser.get(user.id);
      const userLogs = logRows.filter((row) => row.user_id === user.id);
      const lastLog = lastLogByUser.get(user.id);
      const presence = presenceByUser.get(user.id);
      const lastSeenAt = normalizeDate(presence?.last_seen_at);
      const sourceCodeHash = String(entitlement?.source_code_hash || "");

      return {
        id: user.id,
        email: user.email || "",
        createdAt: normalizeDate(user.created_at),
        lastSignInAt: normalizeDate(user.last_sign_in_at),
        entitlementStatus: entitlement?.status || "none",
        plan: entitlement?.plan || null,
        grantedAt: normalizeDate(entitlement?.granted_at),
        expiresAt: normalizeDate(entitlement?.expires_at),
        activationCode: sourceCodeHash ? activationCodeByHash.get(sourceCodeHash) || null : null,
        lastEventAt: normalizeDate(lastLog?.created_at),
        lastEventType: lastLog?.event_type || null,
        lastIp: lastLog?.ip_address || null,
        loginEventCount: userLogs.length,
        practicedQuestionCount: practicedByUser.get(user.id)?.size || 0,
        totalPracticeSeconds: Number(leaderboardByUser.get(user.id)?.total_practice_seconds ?? 0),
        lastSeenAt,
        isOnline: isOnline(lastSeenAt),
      };
    });

    sendJson(res, 200, { users: result });
  } catch (error) {
    console.error("/api/admin/users failed:", error);
    sendError(res, error);
  }
}
