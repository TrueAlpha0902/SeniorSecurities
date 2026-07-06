import { supabase } from "./supabase";

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  bestCorrectStreak: number;
  currentCorrectStreak: number;
  totalAnswered: number;
  totalCorrect: number;
  updatedAt: string | null;
  isCurrentUser: boolean;
};

export type LeaderboardProfile = {
  displayName: string;
};

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function defaultDisplayName(userId: string): string {
  const shortId = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `考生-${shortId || "000000"}`;
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
    .select("user_id, best_correct_streak, current_correct_streak, total_answered, total_correct, updated_at")
    .gt("best_correct_streak", 0)
    .order("best_correct_streak", { ascending: false })
    .order("total_correct", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);

  if (statsError) throw statsError;

  const stats = statsRows ?? [];
  const userIds = stats.map((row: any) => String(row.user_id));
  const profileByUserId = new Map<string, string>();

  if (userIds.length > 0) {
    const { data: profileRows, error: profileError } = await supabase
      .from("user_leaderboard_profiles")
      .select("user_id, display_name")
      .in("user_id", userIds);
    if (profileError) throw profileError;
    for (const profile of profileRows ?? []) {
      profileByUserId.set(String((profile as any).user_id), String((profile as any).display_name ?? ""));
    }
  }

  return stats.map((row: any) => {
    const userId = String(row.user_id);
    const displayName = profileByUserId.get(userId)?.trim() || defaultDisplayName(userId);
    return {
      userId,
      displayName,
      bestCorrectStreak: Number(row.best_correct_streak ?? 0),
      currentCorrectStreak: Number(row.current_correct_streak ?? 0),
      totalAnswered: Number(row.total_answered ?? 0),
      totalCorrect: Number(row.total_correct ?? 0),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      isCurrentUser: currentUserId === userId,
    };
  });
}
