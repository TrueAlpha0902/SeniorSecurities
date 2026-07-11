import { HttpError, type ApiRequest, type ApiResponse, requireAdminUser, sendError, sendJson } from "../_adminClient.js";

type DataRow = Record<string, unknown>;

const ONLINE_WINDOW_SECONDS = 90;
const RECENT_ACTIVITY_LIMIT = 16;

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function isoDate(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function newestDate(...values: unknown[]): string | null {
  let newest: { value: string; time: number } | null = null;
  for (const value of values) {
    const normalized = isoDate(value);
    if (!normalized) continue;
    const time = new Date(normalized).getTime();
    if (!Number.isNaN(time) && (!newest || time > newest.time)) newest = { value: normalized, time };
  }
  return newest?.value || null;
}

function isOnline(lastSeenAt: string | null): boolean {
  if (!lastSeenAt) return false;
  const seenAt = new Date(lastSeenAt).getTime();
  return !Number.isNaN(seenAt) && Date.now() - seenAt <= ONLINE_WINDOW_SECONDS * 1000;
}

function maskFingerprint(value: unknown): string | null {
  const fingerprint = String(value || "").trim();
  if (!fingerprint) return null;
  if (fingerprint.length <= 12) return fingerprint;
  return `${fingerprint.slice(0, 8)}…${fingerprint.slice(-4)}`;
}

async function optionalRows<T>(promise: PromiseLike<{ data: T | null; error: unknown }>, fallback: T): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    const message = typeof error === "object" && error !== null && "message" in error
      ? String((error as { message?: unknown }).message || "")
      : String(error || "");
    console.warn("Admin user detail optional query failed:", message);
    return fallback;
  }
  return data ?? fallback;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "private, no-store, max-age=0");
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase } = await requireAdminUser(req);
    const userId = queryValue(req.query?.userId).trim();
    if (!userId) throw new HttpError("缺少 userId。", 400);

    const { data: authData, error: authError } = await supabase.auth.admin.getUserById(userId);
    if (authError || !authData.user) throw new HttpError("找不到這個使用者。", 404);

    const [entitlement, presence, leaderboard, loginEvents, devices, answers, sessions, wrongCountResult, favoriteCountResult] = await Promise.all([
      optionalRows(
        supabase
          .from("user_entitlements")
          .select("user_id, plan, status, source_code_hash, granted_at, expires_at")
          .eq("user_id", userId)
          .maybeSingle(),
        null,
      ),
      optionalRows(
        supabase.from("user_presence").select("user_id, last_seen_at").eq("user_id", userId).maybeSingle(),
        null,
      ),
      optionalRows(
        supabase
          .from("user_leaderboard_stats")
          .select("current_correct_streak, best_correct_streak, total_answered, total_correct, total_practice_seconds, updated_at")
          .eq("user_id", userId)
          .maybeSingle(),
        null,
      ),
      optionalRows(
        supabase
          .from("login_audit_events")
          .select("id, event_type, ip_address, user_agent, created_at")
          .eq("user_id", userId)
          .order("created_at", { ascending: false })
          .limit(RECENT_ACTIVITY_LIMIT),
        [],
      ),
      optionalRows(
        supabase
          .from("user_devices")
          .select("id, device_fingerprint, device_label, first_seen, last_seen, revoked_at")
          .eq("user_id", userId)
          .order("last_seen", { ascending: false })
          .limit(20),
        [],
      ),
      optionalRows(
        supabase
          .from("user_answer_records")
          .select("question_id, selected_answer, correct_answer, is_correct, answered_at, bank_id, chapter")
          .eq("user_id", userId)
          .order("answered_at", { ascending: false })
          .limit(RECENT_ACTIVITY_LIMIT),
        [],
      ),
      optionalRows(
        supabase
          .from("user_quiz_sessions")
          .select("session_id, mode, started_at, finished_at, total_questions, correct_count, wrong_count, accuracy")
          .eq("user_id", userId)
          .order("finished_at", { ascending: false })
          .limit(10),
        [],
      ),
      supabase.from("user_wrong_records").select("question_id", { count: "exact", head: true }).eq("user_id", userId),
      supabase.from("user_favorite_records").select("question_id", { count: "exact", head: true }).eq("user_id", userId),
    ]);

    const entitlementRow = entitlement as DataRow | null;
    const presenceRow = presence as DataRow | null;
    const leaderboardRow = leaderboard as DataRow | null;
    const loginRows = (loginEvents || []) as DataRow[];
    const deviceRows = (devices || []) as DataRow[];
    const answerRows = (answers || []) as DataRow[];
    const sessionRows = (sessions || []) as DataRow[];
    const sourceCodeHash = String(entitlementRow?.source_code_hash || "");
    const activationCode = sourceCodeHash
      ? await optionalRows(
        supabase
          .from("activation_codes")
          .select("code_preview, max_uses, use_count, is_active, note, created_at, redeemed_at")
          .eq("code_hash", sourceCodeHash)
          .maybeSingle(),
        null,
      )
      : null;

    const lastSeenAt = isoDate(presenceRow?.last_seen_at);
    const latestLogin = loginRows[0];
    const latestAnswer = answerRows[0];
    const latestSession = sessionRows[0];
    const totalAnswered = Number(leaderboardRow?.total_answered || 0);
    const totalCorrect = Number(leaderboardRow?.total_correct || 0);
    const lastActivityAt = newestDate(
      lastSeenAt,
      latestLogin?.created_at,
      latestAnswer?.answered_at,
      latestSession?.finished_at,
      leaderboardRow?.updated_at,
      authData.user.last_sign_in_at,
    );

    sendJson(res, 200, {
      user: {
        id: authData.user.id,
        email: authData.user.email || "",
        createdAt: isoDate(authData.user.created_at),
        lastSignInAt: isoDate(authData.user.last_sign_in_at),
        emailConfirmedAt: isoDate(authData.user.email_confirmed_at),
        phone: authData.user.phone || null,
        lastSeenAt,
        lastActivityAt,
        isOnline: isOnline(lastSeenAt),
      },
      entitlement: entitlementRow ? {
        plan: entitlementRow.plan || null,
        status: entitlementRow.status || "none",
        grantedAt: isoDate(entitlementRow.granted_at),
        expiresAt: isoDate(entitlementRow.expires_at),
        activationCode: activationCode || null,
      } : null,
      learning: {
        totalAnswered,
        totalCorrect,
        accuracy: totalAnswered > 0 ? Math.round((totalCorrect / totalAnswered) * 1000) / 10 : 0,
        currentCorrectStreak: Number(leaderboardRow?.current_correct_streak || 0),
        bestCorrectStreak: Number(leaderboardRow?.best_correct_streak || 0),
        totalPracticeSeconds: Number(leaderboardRow?.total_practice_seconds || 0),
        practicedQuestionCount: totalAnswered || answerRows.length,
        wrongQuestionCount: wrongCountResult.error ? null : (wrongCountResult.count || 0),
        favoriteQuestionCount: favoriteCountResult.error ? null : (favoriteCountResult.count || 0),
      },
      loginEvents: loginRows.map((row) => ({
        id: String(row.id || ""),
        eventType: String(row.event_type || "session_seen"),
        ipAddress: row.ip_address || null,
        userAgent: row.user_agent || null,
        createdAt: isoDate(row.created_at),
      })),
      devices: deviceRows.map((row) => ({
        id: String(row.id || ""),
        label: row.device_label || "未命名裝置",
        fingerprintPreview: maskFingerprint(row.device_fingerprint),
        firstSeenAt: isoDate(row.first_seen),
        lastSeenAt: isoDate(row.last_seen),
        revokedAt: isoDate(row.revoked_at),
      })),
      recentAnswers: answerRows.map((row) => ({
        questionId: String(row.question_id || ""),
        selectedAnswer: row.selected_answer || null,
        correctAnswer: row.correct_answer || null,
        isCorrect: Boolean(row.is_correct),
        answeredAt: isoDate(row.answered_at),
        bankId: row.bank_id || null,
        chapter: row.chapter || null,
      })),
      recentSessions: sessionRows.map((row) => ({
        sessionId: String(row.session_id || ""),
        mode: row.mode || null,
        startedAt: isoDate(row.started_at),
        finishedAt: isoDate(row.finished_at),
        totalQuestions: Number(row.total_questions || 0),
        correctCount: Number(row.correct_count || 0),
        wrongCount: Number(row.wrong_count || 0),
        accuracy: Number(row.accuracy || 0),
      })),
    });
  } catch (error) {
    console.error("/api/admin/user-detail failed:", error);
    sendError(res, error);
  }
}
