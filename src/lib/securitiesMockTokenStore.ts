import { readScopedStorageItem, writeScopedStorageItem } from "./userScopedStorage";

const PREFIX = "quizpwa:securities-mock-token:v1:";

function key(sessionId: string): string {
  return `${PREFIX}${sessionId}`;
}

export function readSecuritiesMockToken(sessionId: string): string | null {
  return readScopedStorageItem(key(sessionId), false);
}

export function writeSecuritiesMockToken(sessionId: string, token: string): void {
  writeScopedStorageItem(key(sessionId), token);
}

export function clearSecuritiesMockToken(sessionId: string): void {
  writeScopedStorageItem(key(sessionId), "");
}
