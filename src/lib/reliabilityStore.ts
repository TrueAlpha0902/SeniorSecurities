import { openDB, type DBSchema, type IDBPDatabase } from "idb";

export type ReliabilityQueueEntry<TPayload = unknown> = {
  id: string;
  userId: string;
  createdAt: string;
  updatedAt: string;
  coalesceKey: string | null;
  attemptCount: number;
  nextAttemptAt: string;
  lastError: string | null;
  payload: TPayload;
};

export type ReliabilityDeadLetter<TPayload = unknown> = ReliabilityQueueEntry<TPayload> & {
  failedAt: string;
};

type LearningStateRecord = { questionId: string; [key: string]: unknown };
type LearningAttemptRecord = { eventId: string; answeredAt: string; [key: string]: unknown };
type SyncMetadataRecord = { key: string; value: unknown; updatedAt: string };

interface ReliabilityDatabase extends DBSchema {
  learningStates: {
    key: string;
    value: LearningStateRecord;
  };
  learningAttempts: {
    key: string;
    value: LearningAttemptRecord;
    indexes: { "by-answeredAt": string };
  };
  cloudQueue: {
    key: string;
    value: ReliabilityQueueEntry;
    indexes: {
      "by-coalesceKey": string;
      "by-nextAttemptAt": string;
      "by-createdAt": string;
    };
  };
  deadLetters: {
    key: string;
    value: ReliabilityDeadLetter;
    indexes: { "by-failedAt": string };
  };
  syncMetadata: {
    key: string;
    value: SyncMetadataRecord;
  };
}

const DB_PREFIX = "senior-securities-reliability-v1";
const DB_VERSION = 1;
const dbPromises = new Map<string, Promise<IDBPDatabase<ReliabilityDatabase>>>();

function databaseName(userId: string | null): string {
  return `${DB_PREFIX}:${userId || "guest"}`;
}

async function openReliabilityDatabase(userId: string | null): Promise<IDBPDatabase<ReliabilityDatabase>> {
  const name = databaseName(userId);
  const existing = dbPromises.get(name);
  if (existing) return existing;

  const promise = openDB<ReliabilityDatabase>(name, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("learningStates")) {
        db.createObjectStore("learningStates", { keyPath: "questionId" });
      }
      if (!db.objectStoreNames.contains("learningAttempts")) {
        const store = db.createObjectStore("learningAttempts", { keyPath: "eventId" });
        store.createIndex("by-answeredAt", "answeredAt");
      }
      if (!db.objectStoreNames.contains("cloudQueue")) {
        const store = db.createObjectStore("cloudQueue", { keyPath: "id" });
        store.createIndex("by-coalesceKey", "coalesceKey");
        store.createIndex("by-nextAttemptAt", "nextAttemptAt");
        store.createIndex("by-createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("deadLetters")) {
        const store = db.createObjectStore("deadLetters", { keyPath: "id" });
        store.createIndex("by-failedAt", "failedAt");
      }
      if (!db.objectStoreNames.contains("syncMetadata")) {
        db.createObjectStore("syncMetadata", { keyPath: "key" });
      }
    },
  });
  dbPromises.set(name, promise);
  return promise;
}

export async function loadReliabilityLearningData<TState, TAttempt>(userId: string | null): Promise<{
  states: TState[];
  attempts: TAttempt[];
}> {
  const db = await openReliabilityDatabase(userId);
  const [states, attempts] = await Promise.all([
    db.getAll("learningStates"),
    db.getAllFromIndex("learningAttempts", "by-answeredAt"),
  ]);
  return { states: states as TState[], attempts: attempts as TAttempt[] };
}

export async function persistReliabilityLearningUpdate<TState extends { questionId: string }, TAttempt extends { eventId: string; answeredAt: string }>(
  userId: string | null,
  state: TState,
  attempt: TAttempt,
  maxAttempts: number,
): Promise<void> {
  const db = await openReliabilityDatabase(userId);
  const tx = db.transaction(["learningStates", "learningAttempts"], "readwrite");
  await Promise.all([
    tx.objectStore("learningStates").put(state as LearningStateRecord),
    tx.objectStore("learningAttempts").put(attempt as LearningAttemptRecord),
  ]);

  const attemptsStore = tx.objectStore("learningAttempts");
  let excess = Math.max(0, (await attemptsStore.count()) - maxAttempts);
  if (excess > 0) {
    let cursor = await attemptsStore.index("by-answeredAt").openCursor();
    while (cursor && excess > 0) {
      await cursor.delete();
      excess -= 1;
      cursor = await cursor.continue();
    }
  }
  await tx.done;
}

export async function replaceReliabilityLearningData<TState extends { questionId: string }, TAttempt extends { eventId: string; answeredAt: string }>(
  userId: string | null,
  states: TState[],
  attempts: TAttempt[],
  maxAttempts: number,
): Promise<void> {
  const db = await openReliabilityDatabase(userId);
  const tx = db.transaction(["learningStates", "learningAttempts"], "readwrite");
  await Promise.all([
    tx.objectStore("learningStates").clear(),
    tx.objectStore("learningAttempts").clear(),
  ]);
  for (const state of states) await tx.objectStore("learningStates").put(state as LearningStateRecord);
  for (const attempt of attempts.slice(-maxAttempts)) {
    await tx.objectStore("learningAttempts").put(attempt as LearningAttemptRecord);
  }
  await tx.done;
}

export async function mergeReliabilityLearningStates<TState extends { questionId: string }>(
  userId: string | null,
  states: TState[],
): Promise<void> {
  if (!states.length) return;
  const db = await openReliabilityDatabase(userId);
  const tx = db.transaction("learningStates", "readwrite");
  for (const state of states) await tx.store.put(state as LearningStateRecord);
  await tx.done;
}

export async function enqueueReliabilityMutation<TPayload>(
  userId: string,
  entry: ReliabilityQueueEntry<TPayload>,
): Promise<void> {
  const db = await openReliabilityDatabase(userId);
  const tx = db.transaction("cloudQueue", "readwrite");
  if (entry.coalesceKey) {
    let cursor = await tx.store.index("by-coalesceKey").openCursor(entry.coalesceKey);
    while (cursor) {
      await cursor.delete();
      cursor = await cursor.continue();
    }
  }
  await tx.store.put(entry as ReliabilityQueueEntry);
  await tx.done;
}

export async function replaceReliabilityQueue<TPayload>(
  userId: string,
  entries: ReliabilityQueueEntry<TPayload>[],
): Promise<void> {
  const db = await openReliabilityDatabase(userId);
  const tx = db.transaction("cloudQueue", "readwrite");
  await tx.store.clear();
  for (const entry of entries) await tx.store.put(entry as ReliabilityQueueEntry);
  await tx.done;
}

export async function listReliabilityQueue<TPayload>(
  userId: string,
  limit = 100,
): Promise<ReliabilityQueueEntry<TPayload>[]> {
  const db = await openReliabilityDatabase(userId);
  const results: ReliabilityQueueEntry<TPayload>[] = [];
  let cursor = await db.transaction("cloudQueue").store.index("by-createdAt").openCursor();
  while (cursor && results.length < limit) {
    results.push(cursor.value as ReliabilityQueueEntry<TPayload>);
    cursor = await cursor.continue();
  }
  return results;
}

export async function listDueReliabilityQueue<TPayload>(
  userId: string,
  nowIso: string,
  limit = 50,
): Promise<ReliabilityQueueEntry<TPayload>[]> {
  const db = await openReliabilityDatabase(userId);
  const results: ReliabilityQueueEntry<TPayload>[] = [];
  const range = IDBKeyRange.upperBound(nowIso);
  let cursor = await db.transaction("cloudQueue").store.index("by-nextAttemptAt").openCursor(range);
  while (cursor && results.length < limit) {
    results.push(cursor.value as ReliabilityQueueEntry<TPayload>);
    cursor = await cursor.continue();
  }
  return results.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export async function countReliabilityQueue(userId: string): Promise<number> {
  return (await openReliabilityDatabase(userId)).count("cloudQueue");
}

export async function deleteReliabilityQueueEntries(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  const db = await openReliabilityDatabase(userId);
  const tx = db.transaction("cloudQueue", "readwrite");
  for (const id of ids) await tx.store.delete(id);
  await tx.done;
}

export async function updateReliabilityQueueEntry<TPayload>(
  userId: string,
  entry: ReliabilityQueueEntry<TPayload>,
): Promise<void> {
  const db = await openReliabilityDatabase(userId);
  await db.put("cloudQueue", entry as ReliabilityQueueEntry);
}

export async function moveReliabilityQueueEntryToDeadLetter<TPayload>(
  userId: string,
  entry: ReliabilityQueueEntry<TPayload>,
): Promise<void> {
  const db = await openReliabilityDatabase(userId);
  const tx = db.transaction(["cloudQueue", "deadLetters"], "readwrite");
  await tx.objectStore("deadLetters").put({ ...entry, failedAt: new Date().toISOString() } as ReliabilityDeadLetter);
  await tx.objectStore("cloudQueue").delete(entry.id);
  await tx.done;
}

export async function countReliabilityDeadLetters(userId: string): Promise<number> {
  return (await openReliabilityDatabase(userId)).count("deadLetters");
}

export async function getReliabilityMetadata<T>(userId: string | null, key: string): Promise<T | null> {
  const row = await (await openReliabilityDatabase(userId)).get("syncMetadata", key);
  return row ? row.value as T : null;
}

export async function setReliabilityMetadata(userId: string | null, key: string, value: unknown): Promise<void> {
  await (await openReliabilityDatabase(userId)).put("syncMetadata", {
    key,
    value,
    updatedAt: new Date().toISOString(),
  });
}
