import { createClient } from "@supabase/supabase-js";
import { getErrorStatusCode, HttpError, sendJson, type ApiRequest, type ApiResponse } from "../_adminClient.js";

interface AdminDataRow {
  user_id?: string | null;
  [key: string]: unknown;
}

const DEFAULT_ADMIN_EMAILS = "true.alpha0902@gmail.com";
const ONLINE_WINDOW_SECONDS = 90;
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

function newestDate(...values: unknown[]): string | null {
  let newest: { value: string; time: number } | null = null;
  for (const value of values) {
    const normalized = normalizeDate(value);
    if (!normalized) continue;
    const time = new Date(normalized).getTime();
    if (!Number.isNaN(time) && (!newest || time > newest.time)) newest = { value: normalized, time };
  }
  return newest?.value || null;
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

async function loadLegacyOverviewFallback(supabase: AdminClient, userIds: string[]): Promise<AdminDataRow[]> {
  const [logs, answerRows] = await Promise.all([
    safeSelect(
      supabase
        .from("login_audit_events")
        .select("user_id, event_type, ip_address, created_at")
        .in("user_id", userIds)
        .order("created_at", { ascending: false })
        .limit(1000),
      [],
    ),
    safeSelect(
      supabase
        .from("user_answer_records")
        .select("user_id, question_id, answered_at")
        .in("user_id", userIds)
        .limit(50000),
      [],
    ),
  ]);

  const overviewByUser = new Map<string, AdminDataRow>(userIds.map((userId) => [userId, {
    user_id: userId,
    practiced_question_count: 0,
    last_answer_at: null,
    login_event_count: 0,
    last_event_at: null,
    last_event_type: null,
    last_ip: null,
  }]));
  const practicedByUser = new Map<string, Set<string>>();

  for (const answer of (answerRows || []) as AdminDataRow[]) {
    const userId = String(answer.user_id || "");
    const overview = overviewByUser.get(userId);
    if (!overview) continue;
    if (!practicedByUser.has(userId)) practicedByUser.set(userId, new Set<string>());
    practicedByUser.get(userId)?.add(String(answer.question_id || ""));
    const answeredAt = normalizeDate(answer.answered_at);
    overview.last_answer_at = newestDate(overview.last_answer_at, answeredAt);
  }

  for (const [userId, questions] of practicedByUser) {
    const overview = overviewByUser.get(userId);
    if (overview) overview.practiced_question_count = questions.size;
  }

  for (const login of (logs || []) as AdminDataRow[]) {
    const userId = String(login.user_id || "");
    const overview = overviewByUser.get(userId);
    if (!overview) continue;
    overview.login_event_count = Number(overview.login_event_count || 0) + 1;
    if (!overview.last_event_at) {
      overview.last_event_at = normalizeDate(login.created_at);
      overview.last_event_type = login.event_type || null;
      overview.last_ip = login.ip_address || null;
    }
  }

  return userIds.map((userId) => overviewByUser.get(userId) as AdminDataRow);
}

async function loadUserOverview(supabase: AdminClient, userIds: string[]): Promise<AdminDataRow[]> {
  const { data, error } = await supabase.rpc("admin_user_overview_aggregates", { p_user_ids: userIds });
  if (!error) return (data || []) as AdminDataRow[];

  console.warn(
    "admin_user_overview_aggregates RPC unavailable; using bounded legacy overview fallback:",
    error.message || error,
  );
  return loadLegacyOverviewFallback(supabase, userIds);
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

    const [entitlements, overviewRows, leaderboardRows, presenceRows] = await Promise.all([
      safeSelect(
        supabase.from("user_entitlements").select("user_id, plan, status, source_code_hash, granted_at, expires_at").in("user_id", userIds),
        [],
      ),
      loadUserOverview(supabase, userIds),
      safeSelect(
        supabase
          .from("user_leaderboard_stats")
          .select("user_id, current_correct_streak, best_correct_streak, total_answered, total_correct, total_practice_seconds, updated_at")
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
    const overviewByUser = toMapByUserId(overviewRows as AdminDataRow[]);
    const leaderboardByUser = toMapByUserId(leaderboardRows as AdminDataRow[]);
    const presenceByUser = toMapByUserId(presenceRows as AdminDataRow[]);

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
      const overview = overviewByUser.get(user.id);
      const presence = presenceByUser.get(user.id);
      const lastSeenAt = normalizeDate(presence?.last_seen_at);
      const leaderboard = leaderboardByUser.get(user.id);
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
        lastEventAt: normalizeDate(overview?.last_event_at),
        lastEventType: overview?.last_event_type || null,
        lastIp: overview?.last_ip || null,
        loginEventCount: Number(overview?.login_event_count ?? 0),
        practicedQuestionCount: Number(overview?.practiced_question_count ?? 0),
        totalPracticeSeconds: Number(leaderboard?.total_practice_seconds ?? 0),
        totalAnswered: Number(leaderboard?.total_answered ?? 0),
        totalCorrect: Number(leaderboard?.total_correct ?? 0),
        currentCorrectStreak: Number(leaderboard?.current_correct_streak ?? 0),
        bestCorrectStreak: Number(leaderboard?.best_correct_streak ?? 0),
        lastSeenAt,
        lastActivityAt: newestDate(lastSeenAt, overview?.last_event_at, overview?.last_answer_at, leaderboard?.updated_at, user.last_sign_in_at),
        isOnline: isOnline(lastSeenAt),
      };
    });

    sendJson(res, 200, { users: result });
  } catch (error) {
    console.error("/api/admin/users failed:", error);
    sendError(res, error);
  }
}
