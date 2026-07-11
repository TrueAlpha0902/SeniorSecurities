import {
  requireAdminUser,
  sendError,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "../_adminClient.js";

interface LeaderboardProfileRow {
  user_id: string;
  display_name?: string | null;
}

interface LeaderboardStatsRow {
  user_id: string;
  current_correct_streak?: number | null;
  best_correct_streak?: number | null;
  total_answered?: number | null;
  total_correct?: number | null;
  total_practice_seconds?: number | null;
  updated_at?: string | null;
}

function defaultDisplayName(userId: string): string {
  const shortId = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `考生-${shortId || "000000"}`;
}

function normalizeDate(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

function queryNumber(value: string | string[] | undefined, fallback: number): number {
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number(raw);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase } = await requireAdminUser(req, { roles: ["primary_admin", "admin"] });
    const page = Math.max(1, Math.trunc(queryNumber(req.query?.page, 1)));
    const perPage = Math.min(100, Math.max(1, Math.trunc(queryNumber(req.query?.perPage, 50))));
    const from = (page - 1) * perPage;
    const to = from + perPage - 1;

    const { data: statsRows, error: statsError, count } = await supabase
      .from("user_leaderboard_stats")
      .select(
        "user_id, current_correct_streak, best_correct_streak, total_answered, total_correct, total_practice_seconds, updated_at",
        { count: "exact" },
      )
      .order("best_correct_streak", { ascending: false })
      .order("total_correct", { ascending: false })
      .order("updated_at", { ascending: true })
      .range(from, to);

    if (statsError) {
      if (String(statsError.message || "").includes("user_leaderboard_stats")) {
        throw new Error("缺少排行榜資料表。請先執行排行榜 migration。");
      }
      throw statsError;
    }

    const stats = (statsRows || []) as LeaderboardStatsRow[];
    const userIds = stats.map((row) => row.user_id);
    const [{ data: profileRows, error: profileError }, authResults] = await Promise.all([
      userIds.length
        ? supabase.from("user_leaderboard_profiles").select("user_id, display_name, updated_at").in("user_id", userIds)
        : Promise.resolve({ data: [], error: null }),
      Promise.all(userIds.map((userId) => supabase.auth.admin.getUserById(userId))),
    ]);
    if (profileError) throw profileError;

    const profileByUser = new Map<string, LeaderboardProfileRow>();
    for (const profile of (profileRows || []) as LeaderboardProfileRow[]) profileByUser.set(profile.user_id, profile);
    const emailByUser = new Map<string, string>();
    authResults.forEach((result, index) => {
      const userId = userIds[index];
      if (userId && !result.error) emailByUser.set(userId, result.data.user?.email || "");
    });

    const entries = stats.map((stat, index) => {
      const profile = profileByUser.get(stat.user_id);
      return {
        rank: from + index + 1,
        userId: stat.user_id,
        email: emailByUser.get(stat.user_id) || "未知 Email",
        displayName: profile?.display_name || defaultDisplayName(stat.user_id),
        bestCorrectStreak: stat.best_correct_streak || 0,
        currentCorrectStreak: stat.current_correct_streak || 0,
        totalAnswered: stat.total_answered || 0,
        totalCorrect: stat.total_correct || 0,
        totalPracticeSeconds: stat.total_practice_seconds || 0,
        updatedAt: normalizeDate(stat.updated_at),
      };
    });

    sendJson(res, 200, {
      entries,
      pagination: {
        page,
        perPage,
        total: count ?? entries.length,
        hasMore: to + 1 < (count ?? entries.length),
      },
    });
  } catch (error) {
    console.error("/api/admin/leaderboard failed:", error);
    sendError(res, error);
  }
}
