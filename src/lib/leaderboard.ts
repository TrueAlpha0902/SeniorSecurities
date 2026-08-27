import { supabase } from "./supabase";

const AVATAR_BUCKET = "leaderboard-avatars";
const MAX_AVATAR_BYTES = 5 * 1024 * 1024;
const AVATAR_SIZE = 320;

export type LeaderboardEntry = {
  userId: string;
  displayName: string;
  avatarUrl: string | null;
  bestCorrectStreak: number;
  currentCorrectStreak: number;
  totalAnswered: number;
  totalCorrect: number;
  totalPracticeSeconds: number;
  uniqueAnswered: number;
  updatedAt: string | null;
  isCurrentUser: boolean;
};

export type LeaderboardProfile = {
  displayName: string;
  avatarUrl: string | null;
};

type LeaderboardProfileRow = {
  user_id?: unknown;
  display_name?: unknown;
  avatar_path?: unknown;
  updated_at?: unknown;
};

type LeaderboardStatsRow = {
  user_id?: unknown;
  best_correct_streak?: unknown;
  current_correct_streak?: unknown;
  total_answered?: unknown;
  total_correct?: unknown;
  total_practice_seconds?: unknown;
  unique_answered?: unknown;
  updated_at?: unknown;
};

type PublicProfile = {
  displayName: string;
  avatarUrl: string | null;
};

function sanitizeName(name: string): string {
  return name.trim().replace(/\s+/g, " ").slice(0, 24);
}

function defaultDisplayName(userId: string): string {
  const shortId = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `考生-${shortId || "000000"}`;
}

function publicAvatarUrl(path: string | null, version?: string | null): string | null {
  if (!supabase || !path) return null;
  const { data } = supabase.storage.from(AVATAR_BUCKET).getPublicUrl(path);
  if (!data.publicUrl) return null;
  return version ? `${data.publicUrl}?v=${encodeURIComponent(version)}` : data.publicUrl;
}

async function getPublicProfiles(userIds: string[]): Promise<Map<string, PublicProfile>> {
  const profiles = new Map<string, PublicProfile>();
  if (!supabase || userIds.length === 0) return profiles;

  const { data: rows, error } = await supabase
    .from("user_leaderboard_profiles")
    .select("user_id, display_name, avatar_path, updated_at")
    .in("user_id", userIds);
  if (error) throw error;

  for (const row of (rows ?? []) as LeaderboardProfileRow[]) {
    const userId = String(row.user_id);
    const avatarPath = row.avatar_path ? String(row.avatar_path) : null;
    const updatedAt = row.updated_at ? String(row.updated_at) : null;
    profiles.set(userId, {
      displayName: String(row.display_name ?? "").trim() || defaultDisplayName(userId),
      avatarUrl: publicAvatarUrl(avatarPath, updatedAt),
    });
  }
  return profiles;
}

function mapLeaderboardRows(
  rows: LeaderboardStatsRow[],
  profiles: Map<string, PublicProfile>,
  currentUserId: string | null,
): LeaderboardEntry[] {
  return rows.map((row) => {
    const userId = String(row.user_id);
    const profile = profiles.get(userId);
    return {
      userId,
      displayName: profile?.displayName || defaultDisplayName(userId),
      avatarUrl: profile?.avatarUrl || null,
      bestCorrectStreak: Number(row.best_correct_streak ?? 0),
      currentCorrectStreak: Number(row.current_correct_streak ?? 0),
      totalAnswered: Number(row.total_answered ?? 0),
      totalCorrect: Number(row.total_correct ?? 0),
      totalPracticeSeconds: Number(row.total_practice_seconds ?? 0),
      uniqueAnswered: Number(row.unique_answered ?? 0),
      updatedAt: row.updated_at ? String(row.updated_at) : null,
      isCurrentUser: currentUserId === userId,
    };
  });
}

export function validateLeaderboardAvatarFile(file: File): void {
  if (!file.type.startsWith("image/")) throw new Error("請選擇 JPG、PNG 或 WebP 圖片。");
  if (file.size > MAX_AVATAR_BYTES) throw new Error("頭像原始檔不可超過 5 MB。");
}

async function imageToAvatarBlob(file: File): Promise<Blob> {
  validateLeaderboardAvatarFile(file);

  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const sourceX = Math.max(0, Math.floor((bitmap.width - side) / 2));
  const sourceY = Math.max(0, Math.floor((bitmap.height - side) / 2));
  const canvas = document.createElement("canvas");
  canvas.width = AVATAR_SIZE;
  canvas.height = AVATAR_SIZE;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    throw new Error("瀏覽器無法處理這張圖片。");
  }
  context.drawImage(bitmap, sourceX, sourceY, side, side, 0, 0, AVATAR_SIZE, AVATAR_SIZE);
  bitmap.close();
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86));
  if (!blob) throw new Error("頭像轉換失敗，請改用另一張圖片。");
  return blob;
}

export async function getCurrentLeaderboardProfile(): Promise<LeaderboardProfile> {
  if (!supabase) return { displayName: "", avatarUrl: null };
  const { data: userData } = await supabase.auth.getUser();
  const userId = userData.user?.id;
  if (!userId) return { displayName: "", avatarUrl: null };

  const { data, error } = await supabase
    .from("user_leaderboard_profiles")
    .select("display_name, avatar_path, updated_at")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;

  return {
    displayName: String(data?.display_name ?? "").trim() || defaultDisplayName(userId),
    avatarUrl: publicAvatarUrl(data?.avatar_path ? String(data.avatar_path) : null, data?.updated_at ? String(data.updated_at) : null),
  };
}

export async function updateLeaderboardDisplayName(name: string): Promise<void> {
  if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。");
  const displayName = sanitizeName(name);
  if (displayName.length < 2) throw new Error("排行榜名稱至少需要 2 個字。");
  const { error } = await supabase.rpc("update_leaderboard_display_name", { p_display_name: displayName });
  if (error) throw error;
}

export async function updateLeaderboardAvatar(source: Blob): Promise<void> {
  if (!supabase) throw new Error("尚未設定 Supabase。");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("請先登入後再上傳頭像。");

  const blob = source instanceof File ? await imageToAvatarBlob(source) : source;
  if (!blob.type.startsWith("image/")) throw new Error("頭像格式不正確。");
  if (blob.size > MAX_AVATAR_BYTES) throw new Error("處理後的頭像不可超過 5 MB。");
  const path = `${userId}/avatar.webp`;
  const { error: uploadError } = await supabase.storage.from(AVATAR_BUCKET).upload(path, blob, {
    upsert: true,
    cacheControl: "3600",
    contentType: blob.type || "image/webp",
  });
  if (uploadError) throw uploadError;
  const { error: profileError } = await supabase.rpc("update_leaderboard_avatar_v797", { p_avatar_path: path });
  if (profileError) throw profileError;
}

export async function removeLeaderboardAvatar(): Promise<void> {
  if (!supabase) throw new Error("尚未設定 Supabase。");
  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError) throw userError;
  const userId = userData.user?.id;
  if (!userId) throw new Error("請先登入。");
  const path = `${userId}/avatar.webp`;
  const { error: removeError } = await supabase.storage.from(AVATAR_BUCKET).remove([path]);
  if (removeError && !/not found/i.test(removeError.message || "")) throw removeError;
  const { error: profileError } = await supabase.rpc("update_leaderboard_avatar_v797", { p_avatar_path: null });
  if (profileError) throw profileError;
}

export async function listLeaderboard(limit = 30): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id ?? null;
  const { data: rows, error } = await supabase
    .from("user_leaderboard_stats")
    .select("user_id, best_correct_streak, current_correct_streak, total_answered, total_correct, total_practice_seconds, unique_answered, updated_at")
    .gt("best_correct_streak", 0)
    .order("best_correct_streak", { ascending: false })
    .order("total_correct", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const stats = (rows ?? []) as LeaderboardStatsRow[];
  const profiles = await getPublicProfiles(stats.map((row) => String(row.user_id)));
  return mapLeaderboardRows(stats, profiles, currentUserId);
}

export async function listPracticeTimeLeaderboard(limit = 30): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id ?? null;
  const { data: rows, error } = await supabase
    .from("user_leaderboard_stats")
    .select("user_id, best_correct_streak, current_correct_streak, total_answered, total_correct, total_practice_seconds, unique_answered, updated_at")
    .gt("total_practice_seconds", 0)
    .order("total_practice_seconds", { ascending: false })
    .order("total_answered", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const stats = (rows ?? []) as LeaderboardStatsRow[];
  const profiles = await getPublicProfiles(stats.map((row) => String(row.user_id)));
  return mapLeaderboardRows(stats, profiles, currentUserId);
}

export async function listQuestionMasterLeaderboard(
  limit = 30,
): Promise<LeaderboardEntry[]> {
  if (!supabase) return [];
  const { data: userData } = await supabase.auth.getUser();
  const currentUserId = userData.user?.id ?? null;
  const { data: rows, error } = await supabase
    .from("user_leaderboard_stats")
    .select("user_id, best_correct_streak, current_correct_streak, total_answered, total_correct, total_practice_seconds, unique_answered, updated_at")
    .gt("unique_answered", 0)
    .order("unique_answered", { ascending: false })
    .order("updated_at", { ascending: true })
    .limit(limit);
  if (error) throw error;
  const stats = (rows ?? []) as LeaderboardStatsRow[];
  const profiles = await getPublicProfiles(
    stats.map((row) => String(row.user_id)),
  );
  return mapLeaderboardRows(stats, profiles, currentUserId);
}
