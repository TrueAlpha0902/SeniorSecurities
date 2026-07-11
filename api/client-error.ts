import { createHash } from "node:crypto";
import { getAdminClient, sendJson, type ApiRequest, type ApiResponse } from "./_adminClient.js";

type ClientErrorPayload = {
  releaseId?: unknown;
  route?: unknown;
  name?: unknown;
  message?: unknown;
  context?: unknown;
};

function cleanText(value: unknown, maxLength: number): string {
  return String(value || "")
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[token]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [token]")
    .slice(0, maxLength);
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

export default async function handler(req: ApiRequest, res: ApiResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = (typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body || {}) as ClientErrorPayload;
    const releaseId = cleanText(body.releaseId, 80) || "unknown";
    const route = cleanText(body.route, 180) || "/";
    const errorName = cleanText(body.name, 80) || "Error";
    const message = cleanText(body.message, 500) || "unknown";
    const fingerprint = createHash("sha256").update(`${errorName}:${message}`).digest("hex").slice(0, 24);
    const supabase = getAdminClient();
    const { error } = await supabase.from("app_client_errors").insert({
      release_id: releaseId,
      route,
      error_name: errorName,
      error_fingerprint: fingerprint,
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
