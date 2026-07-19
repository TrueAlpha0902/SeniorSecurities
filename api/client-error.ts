import { createHash } from "node:crypto";
import {
  extractBearerToken,
  getAdminClient,
  requestIpAddress,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "./_adminClient.js";

type ClientErrorPayload = {
  releaseId?: unknown;
  route?: unknown;
  name?: unknown;
  message?: unknown;
  context?: unknown;
};

type JsonObject = Record<string, unknown>;

const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX_EVENTS = 12;
const MAX_BODY_CHARS = 8_192;
const rateWindows = new Map<string, { startedAt: number; count: number }>();

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function cleanText(value: unknown, maxLength: number): string {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[token]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [token]")
    .replace(/([?&](?:code|token|access_token|refresh_token|invite|recovery|otp|state)=)[^&#\s]+/gi, "$1[redacted]")
    .slice(0, maxLength);
}

function safePath(value: unknown): string {
  const candidate = cleanText(value, 180).split(/[?#]/, 1)[0] || "/";
  return candidate.startsWith("/") ? candidate : "/";
}

function safeContext(value: unknown): Record<string, unknown> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return {};
  const source = value as Record<string, unknown>;
  return {
    online: Boolean(source.online),
    standalone: Boolean(source.standalone),
    serviceWorker: cleanText(source.serviceWorker, 40),
    chunkError: Boolean(source.chunkError),
  };
}

function sourceHash(req: ApiRequest): string {
  const ip = requestIpAddress(req) || "unknown";
  const userAgent = cleanText(req.headers?.["user-agent"], 180);
  const salt = process.env.CLIENT_ERROR_HASH_SALT || process.env.SUPABASE_SERVICE_ROLE_KEY || "local";
  return createHash("sha256").update(`${salt}:${ip}:${userAgent}`).digest("hex").slice(0, 32);
}

function rateLimited(key: string): boolean {
  const now = Date.now();
  const current = rateWindows.get(key);
  if (!current || now - current.startedAt >= RATE_LIMIT_WINDOW_MS) {
    rateWindows.set(key, { startedAt: now, count: 1 });
    return false;
  }
  current.count += 1;
  return current.count > RATE_LIMIT_MAX_EVENTS;
}

async function handleClientError(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const raw = typeof req.body === "string" ? req.body : JSON.stringify(req.body || {});
    if (raw.length > MAX_BODY_CHARS) {
      sendJson(res, 202, { ok: false });
      return;
    }
    const source = sourceHash(req);
    if (rateLimited(source)) {
      sendJson(res, 202, { ok: false });
      return;
    }
    const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) as ClientErrorPayload;
    const releaseId = cleanText(body.releaseId, 80) || "unknown";
    const route = safePath(body.route);
    const errorName = cleanText(body.name, 80) || "Error";
    const message = cleanText(body.message, 500) || "unknown";
    const fingerprint = createHash("sha256").update(`${errorName}:${message}`).digest("hex").slice(0, 24);
    const supabase = getAdminClient();
    const { error } = await supabase.from("app_client_errors").insert({
      release_id: releaseId,
      route,
      error_name: errorName,
      error_fingerprint: fingerprint,
      source_hash: source,
      context: safeContext(body.context),
      user_agent: cleanText(req.headers?.["user-agent"], 300) || null,
    });
    if (error) throw error;
    sendJson(res, 202, { ok: true });
  } catch (error) {
    console.warn("Client error telemetry rejected", error);
    sendJson(res, 202, { ok: false });
  }
}

async function handleLoginAudit(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const token = extractBearerToken(req);
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
      ip_address: requestIpAddress(req),
      user_agent: String(req.headers?.["user-agent"] || "").slice(0, 1000) || null,
    });

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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  const event = queryValue(req.query?.event);
  if (event === "login-audit") {
    await handleLoginAudit(req, res);
    return;
  }

  await handleClientError(req, res);
}
