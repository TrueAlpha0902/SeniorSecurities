const CHUNK_RECOVERY_KEY = "quizpwa:chunk-recovery-at";
const CHUNK_RECOVERY_COOLDOWN_MS = 60_000;

export const APP_UPDATE_AVAILABLE_EVENT = "app:update-available";

type UpdateHandler = () => Promise<void>;

export type AppUpdateAvailableDetail = {
  applyUpdate: UpdateHandler;
};

export function isChunkLoadError(value: unknown): boolean {
  let text = "";
  if (value instanceof Error) {
    text = `${value.name}: ${value.message}`;
  } else if (typeof value === "string") {
    text = value;
  } else {
    try {
      text = JSON.stringify(value ?? "");
    } catch {
      text = String(value ?? "");
    }
  }

  return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS/i.test(text);
}

export function recoverFromChunkLoadError(value: unknown): boolean {
  if (!isChunkLoadError(value) || typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  const now = Date.now();
  const previous = Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) ?? "0");
  if (Number.isFinite(previous) && now - previous < CHUNK_RECOVERY_COOLDOWN_MS) {
    return false;
  }

  window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(now));
  window.location.reload();
  return true;
}

export async function clearRuntimeCachesAndReload(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }

    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.map((cacheName) => window.caches.delete(cacheName)));
    }
  } finally {
    window.location.reload();
  }
}

export function announceAppUpdate(applyUpdate: UpdateHandler): void {
  window.dispatchEvent(
    new CustomEvent<AppUpdateAvailableDetail>(APP_UPDATE_AVAILABLE_EVENT, {
      detail: { applyUpdate },
    }),
  );
}
