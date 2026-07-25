import {
  requireAdminUser,
  sendError,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "../_adminClient.js";

interface AdminDataRow {
  user_id?: string | null;
  [key: string]: unknown;
}

type ExamId = "senior-securities" | "junior-foreign-exchange";

const ONLINE_WINDOW_SECONDS = 90;
const EXAM_IDS: readonly ExamId[] = ["senior-securities", "junior-foreign-exchange"];
type AdminClient = Awaited<ReturnType<typeof requireAdminUser>>["supabase"];

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

function examIdOf(value: unknown): ExamId | null {
  return value === "senior-securities" || value === "junior-foreign-exchange" ? value : null;
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

function buildEntitlementMap(examRows: AdminDataRow[], legacyRows: AdminDataRow[]): Map<string, Map<ExamId, AdminDataRow>> {
  const byUser = new Map<string, Map<ExamId, AdminDataRow>>();
  const ensureUser = (userId: string): Map<ExamId, AdminDataRow> => {
    const current = byUser.get(userId);
    if (current) return current;
    const created = new Map<ExamId, AdminDataRow>();
    byUser.set(userId, created);
    return created;
  };

  for (const row of examRows) {
    const userId = String(row.user_id || "");
    const examId = examIdOf(row.exam_id);
    if (userId && examId) ensureUser(userId).set(examId, row);
  }
  for (const row of legacyRows) {
    const userId = String(row.user_id || "");
    if (!userId) continue;
    const map = ensureUser(userId);
    if (!map.has("senior-securities")) map.set("senior-securities", { ...row, exam_id: "senior-securities" });
  }
  return byUser;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase } = await requireAdminUser(req, { roles: ["primary_admin", "admin"] });

    const page = Math.max(Number(req.query?.page || 1), 1);
    const perPage = Math.min(Math.max(Number(req.query?.perPage || 50), 1), 100);
    const { data: authData, error: usersError } = await supabase.auth.admin.listUsers({ page, perPage });
    if (usersError) throw usersError;

    const users = authData.users || [];
    const userIds = users.map((user) => user.id).filter(Boolean);

    if (userIds.length === 0) {
      sendJson(res, 200, { users: [], pagination: { page, perPage, hasMore: false } });
      return;
    }

    const [examEntitlements, legacyEntitlements, overviewRows, leaderboardRows, presenceRows] = await Promise.all([
      safeSelect(
        supabase
          .from("user_exam_entitlements")
          .select("user_id, exam_id, plan, status, source_code_hash, granted_at, expires_at")
          .in("user_id", userIds),
        [],
      ),
      safeSelect(
        supabase
          .from("user_entitlements")
          .select("user_id, plan, status, source_code_hash, granted_at, expires_at")
          .in("user_id", userIds),
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

    const entitlementByUser = buildEntitlementMap(
      examEntitlements as AdminDataRow[],
      legacyEntitlements as AdminDataRow[],
    );
    const overviewByUser = toMapByUserId(overviewRows as AdminDataRow[]);
    const leaderboardByUser = toMapByUserId(leaderboardRows as AdminDataRow[]);
    const presenceByUser = toMapByUserId(presenceRows as AdminDataRow[]);

    const allEntitlementRows = Array.from(entitlementByUser.values()).flatMap((rows) => Array.from(rows.values()));
    const sourceCodeHashes = Array.from(new Set(allEntitlementRows
      .map((row) => String(row.source_code_hash || ""))
      .filter(Boolean)));
    const activationCodeByHash = new Map<string, string>();
    if (sourceCodeHashes.length > 0) {
      const activationRows = await safeSelect(
        supabase
          .from("activation_codes")
          .select("code_hash, code_preview")
          .in("code_hash", sourceCodeHashes),
        [],
      );
      for (const code of activationRows as AdminDataRow[]) {
        activationCodeByHash.set(String(code.code_hash), String(code.code_preview || ""));
      }
    }

    const result = users.map((user) => {
      const userEntitlements = entitlementByUser.get(user.id) || new Map<ExamId, AdminDataRow>();
      const overview = overviewByUser.get(user.id);
      const presence = presenceByUser.get(user.id);
      const lastSeenAt = normalizeDate(presence?.last_seen_at);
      const leaderboard = leaderboardByUser.get(user.id);
      const entitlements = EXAM_IDS.map((examId) => {
        const row = userEntitlements.get(examId);
        const sourceCodeHash = String(row?.source_code_hash || "");
        return {
          examId,
          status: row?.status || "none",
          plan: row?.plan || null,
          grantedAt: normalizeDate(row?.granted_at),
          expiresAt: normalizeDate(row?.expires_at),
          activationCode: sourceCodeHash ? activationCodeByHash.get(sourceCodeHash) || null : null,
        };
      });
      const securities = entitlements.find((row) => row.examId === "senior-securities")!;

      return {
        id: user.id,
        email: user.email || "",
        createdAt: normalizeDate(user.created_at),
        lastSignInAt: normalizeDate(user.last_sign_in_at),
        entitlements,
        entitlementStatus: securities.status,
        plan: securities.plan,
        grantedAt: securities.grantedAt,
        expiresAt: securities.expiresAt,
        activationCode: securities.activationCode,
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

    sendJson(res, 200, { users: result, pagination: { page, perPage, hasMore: users.length === perPage } });
  } catch (error) {
    console.error("/api/admin/users failed:", error);
    sendError(res, error);
  }
}
