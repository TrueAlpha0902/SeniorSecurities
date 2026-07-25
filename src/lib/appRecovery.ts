const CHUNK_RECOVERY_KEY = "quizpwa:chunk-recovery-at";
const CHUNK_RECOVERY_COOLDOWN_MS = 45_000;
const RECOVERY_QUERY_KEY = "appRecovery";
const RECOVERY_STABLE_DELAY_MS = 10_000;

export const APP_UPDATE_AVAILABLE_EVENT = "app:update-available";

type UpdateHandler = () => Promise<void>;
type UpdateSubscriber = (handler: UpdateHandler | null) => void;

export type AppUpdateAvailableDetail = {
  applyUpdate: UpdateHandler;
};

let currentUpdateHandler: UpdateHandler | null = null;
let recoveryInProgress = false;
const updateSubscribers = new Set<UpdateSubscriber>();

function errorText(value: unknown): string {
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value ?? "");
  } catch {
    return String(value ?? "");
  }
}

export function isChunkLoadError(value: unknown): boolean {
  const text = errorText(value);
  return /ChunkLoadError|Loading chunk .* failed|Failed to fetch dynamically imported module|Importing a module script failed|error loading dynamically imported module|Unable to preload CSS|Failed to load module script|JavaScript-or-Wasm module script|module script.*MIME|MIME type.*(?:text\/html|not executable)|disallowed MIME type/i.test(
    text,
  );
}

function readRecoveryTimestamp(): number {
  try {
    return Number(window.sessionStorage.getItem(CHUNK_RECOVERY_KEY) ?? "0");
  } catch {
    return 0;
  }
}

function writeRecoveryTimestamp(timestamp: number): void {
  try {
    window.sessionStorage.setItem(CHUNK_RECOVERY_KEY, String(timestamp));
  } catch {
    // Storage may be unavailable in hardened/private browsing contexts.
  }
}

function clearRecoveryTimestamp(): void {
  try {
    window.sessionStorage.removeItem(CHUNK_RECOVERY_KEY);
  } catch {
    // Storage may be unavailable in hardened/private browsing contexts.
  }
}

function buildFreshUrl(reason: string): URL {
  const url = new URL(window.location.href);
  url.searchParams.set(RECOVERY_QUERY_KEY, `${reason}-${Date.now()}`);
  return url;
}

async function purgeRuntimeState(): Promise<void> {
  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    const currentBase = new URL(import.meta.env.BASE_URL, window.location.origin).pathname;
    await Promise.all(
      registrations
        .filter((registration) => {
          const scope = new URL(registration.scope);
          return scope.origin === window.location.origin && scope.pathname.startsWith(currentBase);
        })
        .map((registration) => registration.unregister()),
    );
  }

  if ("caches" in window) {
    const cacheNames = await window.caches.keys();
    const appOwnedCacheNames = cacheNames.filter(
      (cacheName) =>
        cacheName.startsWith("question-bank-") ||
        cacheName.startsWith("workbox-precache-"),
    );
    await Promise.all(appOwnedCacheNames.map((cacheName) => window.caches.delete(cacheName)));
  }
}

async function navigateToFreshApp(reason: string, purgeCaches: boolean): Promise<void> {
  if (typeof window === "undefined" || recoveryInProgress) return;
  recoveryInProgress = true;
  const freshUrl = buildFreshUrl(reason);

  try {
    if (purgeCaches) await purgeRuntimeState();
    await fetch(freshUrl, {
      cache: "reload",
      credentials: "same-origin",
      redirect: "follow",
      headers: {
        "Cache-Control": "no-cache",
        Pragma: "no-cache",
      },
    }).catch(() => undefined);
  } finally {
    window.location.replace(freshUrl.toString());
  }
}

export function recoverFromChunkLoadError(value: unknown): boolean {
  if (!isChunkLoadError(value) || typeof window === "undefined") return false;
  if (typeof navigator !== "undefined" && navigator.onLine === false) return false;

  const now = Date.now();
  const previous = readRecoveryTimestamp();
  if (Number.isFinite(previous) && previous > 0 && now - previous < CHUNK_RECOVERY_COOLDOWN_MS) {
    return false;
  }

  writeRecoveryTimestamp(now);
  void navigateToFreshApp("chunk", true);
  return true;
}

export async function clearRuntimeCachesAndReload(): Promise<void> {
  if (typeof window === "undefined") return;
  clearRecoveryTimestamp();
  recoveryInProgress = false;
  await navigateToFreshApp("clear-cache", true);
}

export async function reloadAppWithCacheBust(reason = "reload"): Promise<void> {
  if (typeof window === "undefined") return;
  clearRecoveryTimestamp();
  recoveryInProgress = false;
  await navigateToFreshApp(reason, false);
}

export function settleAppRecoveryAfterLoad(): void {
  if (typeof window === "undefined") return;

  const url = new URL(window.location.href);
  if (url.searchParams.has(RECOVERY_QUERY_KEY)) {
    url.searchParams.delete(RECOVERY_QUERY_KEY);
    window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
  }

  window.setTimeout(() => {
    clearRecoveryTimestamp();
    recoveryInProgress = false;
  }, RECOVERY_STABLE_DELAY_MS);
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
    clearRecoveryTimestamp();
    recoveryInProgress = false;
    await navigateToFreshApp("update", false);
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
