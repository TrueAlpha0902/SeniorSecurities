const CHUNK_RECOVERY_KEY = "quizpwa:chunk-recovery-at";
const CHUNK_RECOVERY_COOLDOWN_MS = 60_000;
const APP_CACHE_PREFIXES = ["question-bank-", "workbox-precache-"];

export const APP_UPDATE_AVAILABLE_EVENT = "app:update-available";

type UpdateHandler = () => Promise<void>;
type UpdateSubscriber = (handler: UpdateHandler | null) => void;

export type AppUpdateAvailableDetail = {
  applyUpdate: UpdateHandler;
};

let currentUpdateHandler: UpdateHandler | null = null;
const updateSubscribers = new Set<UpdateSubscriber>();

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

function isAppCache(cacheName: string): boolean {
  return APP_CACHE_PREFIXES.some((prefix) => cacheName.startsWith(prefix));
}

export async function clearRuntimeCachesAndReload(): Promise<void> {
  if (typeof window === "undefined") return;

  try {
    if ("serviceWorker" in navigator) {
      const registrations = await navigator.serviceWorker.getRegistrations();
      const currentBase = new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
      await Promise.all(
        registrations
          .filter((registration) => new URL(registration.scope).pathname.startsWith(currentBase))
          .map((registration) => registration.unregister()),
      );
    }

    if ("caches" in window) {
      const cacheNames = await window.caches.keys();
      await Promise.all(cacheNames.filter(isAppCache).map((cacheName) => window.caches.delete(cacheName)));
    }
  } finally {
    window.location.reload();
  }
}


function wait(milliseconds: number): Promise<void> {
  return new Promise((resolve) => window.setTimeout(resolve, milliseconds));
}

export async function applyAppUpdateAndReload(applyUpdate: UpdateHandler): Promise<void> {
  if (typeof window === "undefined") {
    await applyUpdate();
    return;
  }

  let removeControllerListener: () => void = () => {};
  let controllerChanged: Promise<void> = Promise.resolve();
  if ("serviceWorker" in navigator) {
    controllerChanged = new Promise((resolve) => {
      let settled = false;
      const finish = () => {
        if (settled) return;
        settled = true;
        navigator.serviceWorker.removeEventListener("controllerchange", finish);
        resolve();
      };
      removeControllerListener = () => navigator.serviceWorker.removeEventListener("controllerchange", finish);
      navigator.serviceWorker.addEventListener("controllerchange", finish);
      window.setTimeout(finish, 1_500);
    });
  }

  try {
    await Promise.race([
      (async () => {
        await applyUpdate();
        await controllerChanged;
      })(),
      wait(3_000),
    ]);
  } finally {
    removeControllerListener();
    window.location.reload();
  }
}

export function getPendingAppUpdate(): UpdateHandler | null {
  return currentUpdateHandler;
}

export function subscribeToAppUpdate(subscriber: UpdateSubscriber): () => void {
  updateSubscribers.add(subscriber);
  subscriber(currentUpdateHandler);
  return () => updateSubscribers.delete(subscriber);
}

export function dismissPendingAppUpdate(): void {
  currentUpdateHandler = null;
  for (const subscriber of updateSubscribers) subscriber(null);
}

export function announceAppUpdate(applyUpdate: UpdateHandler): void {
  currentUpdateHandler = applyUpdate;
  for (const subscriber of updateSubscribers) subscriber(applyUpdate);
  window.dispatchEvent(
    new CustomEvent<AppUpdateAvailableDetail>(APP_UPDATE_AVAILABLE_EVENT, {
      detail: { applyUpdate },
    }),
  );
}
