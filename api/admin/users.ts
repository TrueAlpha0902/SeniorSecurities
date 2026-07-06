import { createClient } from "@supabase/supabase-js";

type AnyRecord = Record<string, any>;

const DEFAULT_ADMIN_EMAILS = "true.alpha0902@gmail.com";

function getEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

function getConfiguredAdminEmails(): string[] {
  return (getEnv("ADMIN_EMAILS") || DEFAULT_ADMIN_EMAILS)
    .split(",")
    .map((email) => email.trim().toLowerCase())
    .filter(Boolean);
}

function sendJson(res: any, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function sendError(res: any, error: unknown): void {
  const statusCode = typeof (error as any)?.statusCode === "number" ? (error as any).statusCode : 500;
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
    const error: any = new Error("缺少 Vercel 環境變數：VITE_SUPABASE_URL 或 SUPABASE_URL。");
    error.statusCode = 500;
    throw error;
  }

  if (!serviceRoleKey) {
    const error: any = new Error("缺少 Vercel 環境變數：SUPABASE_SERVICE_ROLE_KEY。管理後台需要這個 server-only key。");
    error.statusCode = 500;
    throw error;
  }

  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
    },
  });
}

function extractBearerToken(req: any): string | null {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

async function requireAdminUser(req: any) {
  const token = extractBearerToken(req);
  if (!token) {
    const error: any = new Error("尚未登入，或登入狀態已過期。");
    error.statusCode = 401;
    throw error;
  }

  const supabase = getAdminClient();
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) {
    const authError: any = new Error("無法驗證目前登入帳號，請重新登入管理員帳號。");
    authError.statusCode = 401;
    throw authError;
  }

  const email = data.user.email?.toLowerCase() || "";
  if (!getConfiguredAdminEmails().includes(email)) {
    const adminError: any = new Error(`這個帳號沒有管理員權限：${email}。請確認 Vercel 環境變數 ADMIN_EMAILS。`);
    adminError.statusCode = 403;
    throw adminError;
  }

  return { supabase, user: data.user };
}

function toMapByUserId(rows: AnyRecord[] | null | undefined): Map<string, AnyRecord> {
  const map = new Map<string, AnyRecord>();
  for (const row of rows || []) {
    if (row.user_id && !map.has(row.user_id)) map.set(row.user_id, row);
  }
  return map;
}

function normalizeDate(value: unknown): string | null {
  return typeof value === "string" && value ? value : null;
}

async function safeSelect<T>(promise: PromiseLike<{ data: T | null; error: any }>, fallback: T): Promise<T> {
  const { data, error } = await promise;
  if (error) {
    console.error("Admin optional query failed:", error.message || error);
    return fallback;
  }
  return data ?? fallback;
}

export default async function handler(req: any, res: any) {
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
    const userIds = users.map((user: AnyRecord) => user.id).filter(Boolean);

    if (userIds.length === 0) {
      sendJson(res, 200, { users: [] });
      return;
    }

    const [entitlements, devices, logs, answerRows] = await Promise.all([
      safeSelect(
        supabase.from("user_entitlements").select("user_id, plan, status, granted_at, expires_at").in("user_id", userIds),
        [] as AnyRecord[],
      ),
      safeSelect(
        supabase
          .from("user_devices")
          .select("id, user_id, device_label, first_seen, last_seen, revoked_at")
          .in("user_id", userIds)
          .order("last_seen", { ascending: false }),
        [] as AnyRecord[],
      ),
      safeSelect(
        supabase
          .from("login_audit_events")
          .select("user_id, email, event_type, ip_address, user_agent, created_at")
          .in("user_id", userIds)
          .order("created_at", { ascending: false })
          .limit(1000),
        [] as AnyRecord[],
      ),
      safeSelect(
        supabase
          .from("user_answer_records")
          .select("user_id, question_id")
          .in("user_id", userIds)
          .limit(50000),
        [] as AnyRecord[],
      ),
    ]);

    const entitlementByUser = toMapByUserId(entitlements as AnyRecord[]);
    const lastLogByUser = toMapByUserId(logs as AnyRecord[]);
    const deviceRows = (devices || []) as AnyRecord[];
    const logRows = (logs || []) as AnyRecord[];
    const practicedByUser = new Map<string, Set<string>>();
    for (const answer of (answerRows || []) as AnyRecord[]) {
      if (!answer.user_id) continue;
      if (!practicedByUser.has(answer.user_id)) practicedByUser.set(answer.user_id, new Set<string>());
      practicedByUser.get(answer.user_id)?.add(String(answer.question_id || ""));
    }

    const result = users.map((user: AnyRecord) => {
      const entitlement = entitlementByUser.get(user.id);
      const userDevices = deviceRows.filter((row) => row.user_id === user.id);
      const activeDevices = userDevices.filter((row) => !row.revoked_at);
      const lastDeviceSeen = activeDevices
        .map((row) => row.last_seen)
        .filter(Boolean)
        .sort()
        .slice(-1)[0] || null;
      const userLogs = logRows.filter((row) => row.user_id === user.id);
      const lastLog = lastLogByUser.get(user.id);

      return {
        id: user.id,
        email: user.email || "",
        createdAt: normalizeDate(user.created_at),
        lastSignInAt: normalizeDate(user.last_sign_in_at),
        entitlementStatus: entitlement?.status || "none",
        plan: entitlement?.plan || null,
        grantedAt: normalizeDate(entitlement?.granted_at),
        expiresAt: normalizeDate(entitlement?.expires_at),
        activeDeviceCount: activeDevices.length,
        devices: userDevices.map((device) => ({
          id: device.id,
          deviceLabel: device.device_label || null,
          firstSeen: normalizeDate(device.first_seen),
          lastSeen: normalizeDate(device.last_seen),
          revokedAt: normalizeDate(device.revoked_at),
        })),
        lastDeviceSeen: normalizeDate(lastDeviceSeen),
        lastEventAt: normalizeDate(lastLog?.created_at),
        lastEventType: lastLog?.event_type || null,
        lastIp: lastLog?.ip_address || null,
        lastUserAgent: lastLog?.user_agent || null,
        loginEventCount: userLogs.length,
        practicedQuestionCount: practicedByUser.get(user.id)?.size || 0,
      };
    });

    sendJson(res, 200, { users: result });
  } catch (error) {
    console.error("/api/admin/users failed:", error);
    sendError(res, error);
  }
}
