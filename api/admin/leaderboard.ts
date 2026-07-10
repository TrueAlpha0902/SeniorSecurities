import { createClient, type User } from "@supabase/supabase-js";
import { getErrorStatusCode, HttpError, type ApiRequest, type ApiResponse } from "../_adminClient.js";

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

const DEFAULT_ADMIN_EMAILS = "true.alpha0902@gmail.com";
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
  const message = error instanceof Error ? error.message : String(error || "未知錯誤。");
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

async function listAllAuthUsers(supabase: AdminClient): Promise<User[]> {
  const users: User[] = [];
  let page = 1;
  const perPage = 200;

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;
    const pageUsers = data.users || [];
    users.push(...pageUsers);
    if (pageUsers.length < perPage) break;
    page += 1;
  }

  return users;
}

function defaultDisplayName(userId: string): string {
  const shortId = userId.replace(/-/g, "").slice(0, 6).toUpperCase();
  return `考生-${shortId || "000000"}`;
}

function normalizeDate(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase } = await requireAdminUser(req);

    const [{ data: statsRows, error: statsError }, { data: profileRows, error: profileError }, authUsers] = await Promise.all([
      supabase
        .from("user_leaderboard_stats")
        .select("user_id, current_correct_streak, best_correct_streak, total_answered, total_correct, total_practice_seconds, updated_at")
        .order("best_correct_streak", { ascending: false })
        .order("total_correct", { ascending: false })
        .order("updated_at", { ascending: true })
        .limit(500),
      supabase
        .from("user_leaderboard_profiles")
        .select("user_id, display_name, updated_at"),
      listAllAuthUsers(supabase),
    ]);

    if (statsError) {
      if (String(statsError.message || "").includes("user_leaderboard_stats")) {
        throw new Error("缺少排行榜資料表。請先到 Supabase SQL Editor 執行 supabase/leaderboard-v37.sql。");
      }
      throw statsError;
    }
    if (profileError) throw profileError;

    const emailByUser = new Map<string, string>();
    for (const user of authUsers) emailByUser.set(user.id, user.email || "");

    const profileByUser = new Map<string, LeaderboardProfileRow>();
    for (const profile of (profileRows || []) as LeaderboardProfileRow[]) profileByUser.set(profile.user_id, profile);

    const entries = ((statsRows || []) as LeaderboardStatsRow[]).map((stat, index) => {
      const profile = profileByUser.get(stat.user_id);
      return {
        rank: index + 1,
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

    sendJson(res, 200, { entries });
  } catch (error) {
    console.error("/api/admin/leaderboard failed:", error);
    sendError(res, error);
  }
}
