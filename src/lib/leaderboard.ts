import { supabase } from "./supabase";

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  bestCorrectStreak: number;
  currentCorrectStreak: number;
  totalAnswered: number;
  totalCorrect: number;
  totalPracticeSeconds: number;
  updatedAt: string | null;
  isCurrentUser: boolean;
};

export type LeaderboardProfile = {
  displayName: string;
};

type LeaderboardProfileRow = {
  user_id?: unknown;
  display_name?: unknown;
};

type LeaderboardStatsRow = {
  user_id?: unknown;
  best_correct_streak?: unknown;
  current_correct_streak?: unknown;
  total_answered?: unknown;
  total_correct?: unknown;
  total_practice_seconds?: unknown;
  updated_at?: unknown;
};

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function defaultDisplayName(userId: string): string {
  const shortId = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `考生-${shortId || "000000"}`;
}

async function getDisplayNames(userIds: string[]): Promise<Map<string, string>> {
  const profileByUserId = new Map<string, string>();
  if (!supabase || userIds.length === 0) return profileByUserId;

  const { data: profileRows, error: profileError } = await supabase
    .from("user_leaderboard_profiles")
    .select("user_id, display_name")
    .in("user_id", userIds);
  if (profileError) throw profileError;

  for (const profile of (profileRows ?? []) as LeaderboardProfileRow[]) {
    profileByUserId.set(String(profile.user_id), String(profile.display_name ?? ""));
  }

  return profileByUserId;
}

function mapLeaderboardRows(
  rows: LeaderboardStatsRow[],
  profileByUserId: Map<string, string>,
  currentUserId: string | null,
): LeaderboardEntry[] {
  return rows.map((row) => {
    const userId = String(row.user_id);
    const displayName = profileByUserId.get(userId)?.trim() || defaultDisplayName(userId);
    return {
      userId,
      displayName,
      bestCorrectStreak: Number(row.best_correct_streak ?? 0),
      currentCorrectStreak: Number(row.current_correct_streak ?? 0),
      totalAnswered: Number(row.total_answered ?? 0),
      totalCorrect: Number(row.total_correct ?? 0),
      totalPracticeSeconds: Number(row.total_practice_seconds ?? 0),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      isCurrentUser: currentUserId === userId,
    };
  });
}

export async function getCurrentLeaderboardProfile(): Promise<LeaderboardProfile> {
  if (!supabase) return { displayName: "" };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { displayName: "" };

  const { data, error } = await supabase
    .from("user_leaderboard_profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  return { displayName: String(data?.display_name ?? "").trim() || defaultDisplayName(userId) };
}

export async function updateLeaderboardDisplayName(name: string): Promise<void> {
  if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。");
  const displayName = sanitizeName(name);
  if (displayName.length < 2) throw new Error("排行榜名稱至少需要 2 個字。");
  const { error } = await supabase.rpc("update_leaderboard_display_name", { p_display_name: displayName });
  if (error) throw error;
}

export async function listLeaderboard(limit = 30): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id ?? null;

  const { data: statsRows, error: statsError } = await supabase
    .from("user_leaderboard_stats")
    .select("user_id, best_correct_streak, current_correct_streak, total_answered, total_correct, total_practice_seconds, updated_at")
    .gt("best_correct_streak", 0)
    .order("best_correct_streak", { ascending: false })
    .order("total_correct", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (statsError) throw statsError;

  const stats = (statsRows ?? []) as LeaderboardStatsRow[];
  const userIds = stats.map((row) => String(row.user_id));
  const profileByUserId = await getDisplayNames(userIds);
  return mapLeaderboardRows(stats, profileByUserId, currentUserId);
}

export async function listPracticeTimeLeaderboard(limit = 30): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id ?? null;

  const { data: statsRows, error: statsError } = await supabase
    .from("user_leaderboard_stats")
    .select("user_id, best_correct_streak, current_correct_streak, total_answered, total_correct, total_practice_seconds, updated_at")
    .gt("total_practice_seconds", 0)
    .order("total_practice_seconds", { ascending: false })
    .order("total_answered", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (statsError) throw statsError;

  const stats = (statsRows ?? []) as LeaderboardStatsRow[];
  const userIds = stats.map((row) => String(row.user_id));
  const profileByUserId = await getDisplayNames(userIds);
  return mapLeaderboardRows(stats, profileByUserId, currentUserId);
}
