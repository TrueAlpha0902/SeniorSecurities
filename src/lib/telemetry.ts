import { isChunkLoadError } from "./appRecovery";

const TELEMETRY_COOLDOWN_MS = 30_000;
const sentAtByFingerprint = new Map<string, number>();

function scrub(value: string): string {
  return value
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, "[email]")
    .replace(/eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}/g, "[token]")
    .replace(/Bearer\s+[A-Za-z0-9._~-]+/gi, "Bearer [token]")
    .slice(0, 500);
}

function hashText(value: string): string {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0).toString(16);
}

export function reportClientError(error: unknown): void {
  if (typeof window === "undefined") return;
  const normalized = error instanceof Error ? error : new Error(String(error || "Unknown error"));
  const message = scrub(normalized.message);
  const fingerprint = hashText(`${normalized.name}:${message}`);
  const previous = sentAtByFingerprint.get(fingerprint) ?? 0;
  if (Date.now() - previous < TELEMETRY_COOLDOWN_MS) return;
  sentAtByFingerprint.set(fingerprint, Date.now());

  const payload = JSON.stringify({
    releaseId: import.meta.env.VITE_VERCEL_GIT_COMMIT_SHA || import.meta.env.VITE_APP_RELEASE || "local",
    route: `${window.location.pathname}${window.location.search}`.slice(0, 180),
    name: normalized.name,
    message,
    context: {
      online: navigator.onLine,
      standalone: window.matchMedia?.("(display-mode: standalone)").matches ?? false,
      serviceWorker: navigator.serviceWorker?.controller ? "controlled" : "uncontrolled",
      chunkError: isChunkLoadError(normalized),
    },
  });

  void fetch(`${import.meta.env.BASE_URL || "/"}api/client-error`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: payload,
    keepalive: true,
  }).catch(() => undefined);
}
