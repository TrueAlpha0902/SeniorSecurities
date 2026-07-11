const ACTIVE_SCOPE_KEY = "quizpwa:active-storage-scope:v1";
const LEGACY_OWNER_KEY = "quizpwa:legacy-storage-owner:v1";
const SCOPED_PREFIX = "quizpwa:scoped:v1";

export const USER_STORAGE_SCOPE_CHANGED = "quizpwa:user-storage-scope-changed";

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function scopeForUser(userId: string | null): string {
  return userId ? `user:${userId}` : "guest";
}

export function getActiveUserStorageScope(): string {
  const storage = safeStorage();
  return storage?.getItem(ACTIVE_SCOPE_KEY) || "guest";
}

export function setActiveUserStorageScope(userId: string | null): void {
  const storage = safeStorage();
  if (!storage) return;

  const nextScope = scopeForUser(userId);
  const previousScope = storage.getItem(ACTIVE_SCOPE_KEY) || "guest";
  storage.setItem(ACTIVE_SCOPE_KEY, nextScope);

  if (previousScope !== nextScope) {
    window.dispatchEvent(new CustomEvent(USER_STORAGE_SCOPE_CHANGED, {
      detail: { previousScope, scope: nextScope },
    }));
  }
}

export function scopedStorageKey(baseKey: string): string {
  return `${SCOPED_PREFIX}:${getActiveUserStorageScope()}:${baseKey}`;
}

function canClaimLegacyStorage(storage: Storage): boolean {
  const scope = getActiveUserStorageScope();
  if (!scope.startsWith("user:")) return false;

  const owner = storage.getItem(LEGACY_OWNER_KEY);
  if (!owner) {
    storage.setItem(LEGACY_OWNER_KEY, scope);
    return true;
  }
  return owner === scope;
}

export function readScopedStorageItem(baseKey: string, migrateLegacy = true): string | null {
  const storage = safeStorage();
  if (!storage) return null;

  const scopedKey = scopedStorageKey(baseKey);
  const scopedValue = storage.getItem(scopedKey);
  if (scopedValue !== null) return scopedValue;

  if (!migrateLegacy || !canClaimLegacyStorage(storage)) return null;
  const legacyValue = storage.getItem(baseKey);
  if (legacyValue === null) return null;

  storage.setItem(scopedKey, legacyValue);
  storage.removeItem(baseKey);
  return legacyValue;
}

export function writeScopedStorageItem(baseKey: string, value: string): void {
  const storage = safeStorage();
  if (!storage) return;

  storage.setItem(scopedStorageKey(baseKey), value);
  if (canClaimLegacyStorage(storage)) storage.removeItem(baseKey);
}

export function removeScopedStorageItem(baseKey: string): void {
  const storage = safeStorage();
  if (!storage) return;

  storage.removeItem(scopedStorageKey(baseKey));
  if (canClaimLegacyStorage(storage)) storage.removeItem(baseKey);
}

export function clearScopedStorageByPrefix(basePrefix: string): void {
  const storage = safeStorage();
  if (!storage) return;

  const scopedPrefix = scopedStorageKey(basePrefix);
  const removeLegacy = canClaimLegacyStorage(storage);
  const keysToRemove: string[] = [];

  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    if (key.startsWith(scopedPrefix) || (removeLegacy && key.startsWith(basePrefix))) {
      keysToRemove.push(key);
    }
  }

  for (const key of keysToRemove) storage.removeItem(key);
}
