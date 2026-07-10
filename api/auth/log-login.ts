import { createClient } from "@supabase/supabase-js";
import type { ApiRequest, ApiResponse } from "../_adminClient.js";

type JsonObject = Record<string, unknown>;

function getEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

function sendJson(res: ApiResponse, statusCode: number, payload: unknown): void {
  res.statusCode = statusCode;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(payload));
}

function getAdminClient() {
  const supabaseUrl = getEnv("SUPABASE_URL") || getEnv("VITE_SUPABASE_URL");
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY") || getEnv("SUPABASE_SECRET_KEY");
  if (!supabaseUrl || !serviceRoleKey) throw new Error("Missing Supabase server env for login audit.");
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

function getClientIp(req: ApiRequest): string {
  const forwarded = String(req.headers?.["x-forwarded-for"] || "");
  if (forwarded) return forwarded.split(",")[0]?.trim() || "";
  return String(req.headers?.["x-real-ip"] || req.socket?.remoteAddress || "").trim();
}

function getBearerToken(req: ApiRequest): string | null {
  const header = String(req.headers?.authorization || req.headers?.Authorization || "");
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match ? match[1] : null;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const token = getBearerToken(req);
    if (!token) {
      sendJson(res, 401, { error: "Missing bearer token" });
      return;
    }

    const supabase = getAdminClient();
    const { data, error } = await supabase.auth.getUser(token);
    if (error || !data.user) {
      sendJson(res, 401, { error: "Invalid session" });
      return;
    }

    const parsedBody: unknown = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
    const body: JsonObject = typeof parsedBody === "object" && parsedBody !== null && !Array.isArray(parsedBody)
      ? parsedBody as JsonObject
      : {};
    const eventType = String(body.event_type || "session_seen").slice(0, 40);

    const { error: insertError } = await supabase.from("login_audit_events").insert({
      user_id: data.user.id,
      email: data.user.email || null,
      event_type: eventType,
      ip_address: getClientIp(req) || null,
      user_agent: String(req.headers?.["user-agent"] || "").slice(0, 1000) || null,
    });

    // Do not break user login if the audit table has not been created yet.
    if (insertError) {
      console.error("Login audit insert failed:", insertError.message || insertError);
      sendJson(res, 200, { ok: true, warning: insertError.message || "audit insert failed" });
      return;
    }

    sendJson(res, 200, { ok: true });
  } catch (error) {
    console.error("/api/auth/log-login failed:", error);
    sendJson(res, 200, { ok: true, warning: error instanceof Error ? error.message : "login audit failed" });
  }
}
