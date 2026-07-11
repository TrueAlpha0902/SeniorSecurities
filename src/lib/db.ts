import { openDB, type DBSchema, type IDBPDatabase } from "idb";
import type {
  AnswerKey,
  FavoriteQuestionRecord,
  Question,
  QuizSession,
  UserAnswer,
  WrongQuestionRecord
} from "../types";
import type { ImageQuizQuestion, NumericAnswer } from "./imageQuiz";
import { supabase } from "./supabase";
import {
  mergeCloudLearningStates,
  type AnswerConfidence,
  type LearningAttemptInput,
  type QuestionLearningState,
} from "./learningStateStore";
import {
  countReliabilityDeadLetters,
  countReliabilityQueue,
  deleteReliabilityQueueEntries,
  enqueueReliabilityMutation,
  getReliabilityMetadata,
  listDueReliabilityQueue,
  listReliabilityQueue,
  moveReliabilityQueueEntryToDeadLetter,
  replaceReliabilityQueue,
  setReliabilityMetadata,
  updateReliabilityQueueEntry,
  type ReliabilityQueueEntry,
} from "./reliabilityStore";

export type StoredImageAnswer = {
  selected: NumericAnswer;
  correct: NumericAnswer;
  isCorrect: boolean;
  answeredAt: string;
};

export type ImageQuizSessionRecord = {
  sessionId: string;
  mode: "random80" | "fullMock";
  bankId: string;
  bankTitle: string;
  questionIds: string[];
  answers: Record<string, StoredImageAnswer>;
  wrongQuestionIds: string[];
  startedAt: string;
  lastSettledAt?: string;
  finishedAt?: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
  durationMinutes?: number;
  feedbackMode?: "immediate" | "deferred";
  markedQuestionIds?: string[];
};

export type ClearRecordPart = "answers" | "wrong" | "favorites" | "progress" | "sessions";

export type ClearSelectedUserRecordsOptions = {
  parts: ClearRecordPart[];
  questionIds: string[];
  progressScopeIds: string[];
  sessionBankIds: string[];
  clearLegacyQuizSessions?: boolean;
};

export type CloudSyncSummary = {
  local: {
    answers: number;
    wrong: number;
    favorites: number;
    progress: number;
    sessions: number;
  };
  cloud: {
    answers: number;
    wrong: number;
    favorites: number;
    progress: number;
    sessions: number;
  };
  cloudAvailable: boolean;
  syncedAt: string | null;
  pendingMutations: number;
  deadLetters: number;
  error: string | null;
};

interface QuizPwaDatabase extends DBSchema {
  userAnswers: {
    key: string;
    value: UserAnswer;
    indexes: {
      "by-bank": string;
      "by-chapter": string;
      "by-answeredAt": string;
    };
  };
  wrongQuestions: {
    key: string;
    value: WrongQuestionRecord;
    indexes: {
      "by-bank": string;
      "by-chapter": string;
      "by-lastWrongAt": string;
    };
  };
  favoriteQuestions: {
    key: string;
    value: FavoriteQuestionRecord;
    indexes: {
      "by-bank": string;
      "by-chapter": string;
      "by-createdAt": string;
    };
  };
  quizSessions: {
    key: string;
    value: QuizSession;
    indexes: {
      "by-startedAt": string;
      "by-finishedAt": string;
    };
  };
  quizProgress: {
    key: string;
    value: QuizProgressRecord;
    indexes: {
      "by-updatedAt": string;
    };
  };
  imageQuizSessions: {
    key: string;
    value: ImageQuizSessionRecord;
    indexes: {
      "by-bank": string;
      "by-startedAt": string;
      "by-finishedAt": string;
    };
  };
}

const LEGACY_DB_NAME = "ipad-quiz-pwa";
const SCOPED_DB_PREFIX = "ipad-quiz-pwa-v2";
const DB_VERSION = 3;
const SYNC_READY_PREFIX = "quizpwa:cloud-sync-initialized";
const LAST_SYNC_PREFIX = "quizpwa:last-cloud-sync";
const LEGACY_MIGRATION_KEY = "quizpwa:legacy-db-migration:v2";
const LEGACY_CLOUD_QUEUE_PREFIX = "quizpwa:cloud-write-queue:v2";
const CLOUD_SYNC_CHECKPOINT_KEY = "cloud-records:last-successful-sync";

export type QuizProgressRecord = {
  scopeId: string;
  currentIndex: number;
  totalQuestions: number;
  updatedAt: string;
};

type LocalDbContext = {
  db: IDBPDatabase<QuizPwaDatabase>;
  userId: string | null;
};

const dbPromises = new Map<string, Promise<IDBPDatabase<QuizPwaDatabase>>>();
let legacyMigrationPromise: Promise<void> | undefined;

const numericToAnswerKey: Record<NumericAnswer, AnswerKey> = {
  "1": "A",
  "2": "B",
  "3": "C",
  "4": "D"
};

function scopedDbName(userId: string | null): string {
  return userId ? `${SCOPED_DB_PREFIX}:user:${userId}` : `${SCOPED_DB_PREFIX}:guest`;
}

function openQuizDatabase(dbName: string): Promise<IDBPDatabase<QuizPwaDatabase>> {
  const existing = dbPromises.get(dbName);
  if (existing) return existing;

  const promise = openDB<QuizPwaDatabase>(dbName, DB_VERSION, {
    upgrade(db) {
      if (!db.objectStoreNames.contains("userAnswers")) {
        const store = db.createObjectStore("userAnswers", { keyPath: "questionId" });
        store.createIndex("by-bank", "bankId");
        store.createIndex("by-chapter", "chapter");
        store.createIndex("by-answeredAt", "answeredAt");
      }
      if (!db.objectStoreNames.contains("wrongQuestions")) {
        const store = db.createObjectStore("wrongQuestions", { keyPath: "questionId" });
        store.createIndex("by-bank", "bankId");
        store.createIndex("by-chapter", "chapter");
        store.createIndex("by-lastWrongAt", "lastWrongAt");
      }
      if (!db.objectStoreNames.contains("favoriteQuestions")) {
        const store = db.createObjectStore("favoriteQuestions", { keyPath: "questionId" });
        store.createIndex("by-bank", "bankId");
        store.createIndex("by-chapter", "chapter");
        store.createIndex("by-createdAt", "createdAt");
      }
      if (!db.objectStoreNames.contains("quizSessions")) {
        const store = db.createObjectStore("quizSessions", { keyPath: "sessionId" });
        store.createIndex("by-startedAt", "startedAt");
        store.createIndex("by-finishedAt", "finishedAt");
      }
      if (!db.objectStoreNames.contains("quizProgress")) {
        const store = db.createObjectStore("quizProgress", { keyPath: "scopeId" });
        store.createIndex("by-updatedAt", "updatedAt");
      }
      if (!db.objectStoreNames.contains("imageQuizSessions")) {
        const store = db.createObjectStore("imageQuizSessions", { keyPath: "sessionId" });
        store.createIndex("by-bank", "bankId");
        store.createIndex("by-startedAt", "startedAt");
        store.createIndex("by-finishedAt", "finishedAt");
      }
    }
  });
  dbPromises.set(dbName, promise);
  return promise;
}

function getLocalStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function knownLegacyUserIds(storage: Storage): string[] {
  const userIds = new Set<string>();
  const prefixes = [`${SYNC_READY_PREFIX}:`, `${LAST_SYNC_PREFIX}:`];
  for (let index = 0; index < storage.length; index += 1) {
    const key = storage.key(index);
    if (!key) continue;
    for (const prefix of prefixes) {
      if (key.startsWith(prefix) && key.length > prefix.length) {
        userIds.add(key.slice(prefix.length));
      }
    }
  }
  return [...userIds];
}

async function legacyDatabaseExists(): Promise<boolean> {
  if (typeof indexedDB === "undefined") return false;
  if (typeof indexedDB.databases !== "function") return true;
  const databases = await indexedDB.databases();
  return databases.some((database) => database.name === LEGACY_DB_NAME);
}

async function copyLegacyRecords(targetDbName: string): Promise<void> {
  if (!(await legacyDatabaseExists())) return;

  const legacy = await openQuizDatabase(LEGACY_DB_NAME);
  const target = await openQuizDatabase(targetDbName);
  const [answers, wrong, favorites, sessions, progress, imageSessions] = await Promise.all([
    legacy.getAll("userAnswers"),
    legacy.getAll("wrongQuestions"),
    legacy.getAll("favoriteQuestions"),
    legacy.getAll("quizSessions"),
    legacy.getAll("quizProgress"),
    legacy.getAll("imageQuizSessions"),
  ]);

  const answerTx = target.transaction("userAnswers", "readwrite");
  for (const record of answers) {
    if (!(await answerTx.store.getKey(record.questionId))) await answerTx.store.put(record);
  }
  await answerTx.done;

  const wrongTx = target.transaction("wrongQuestions", "readwrite");
  for (const record of wrong) {
    if (!(await wrongTx.store.getKey(record.questionId))) await wrongTx.store.put(record);
  }
  await wrongTx.done;

  const favoriteTx = target.transaction("favoriteQuestions", "readwrite");
  for (const record of favorites) {
    if (!(await favoriteTx.store.getKey(record.questionId))) await favoriteTx.store.put(record);
  }
  await favoriteTx.done;

  const sessionTx = target.transaction("quizSessions", "readwrite");
  for (const record of sessions) {
    if (!(await sessionTx.store.getKey(record.sessionId))) await sessionTx.store.put(record);
  }
  await sessionTx.done;

  const progressTx = target.transaction("quizProgress", "readwrite");
  for (const record of progress) {
    if (!(await progressTx.store.getKey(record.scopeId))) await progressTx.store.put(record);
  }
  await progressTx.done;

  const imageSessionTx = target.transaction("imageQuizSessions", "readwrite");
  for (const record of imageSessions) {
    if (!(await imageSessionTx.store.getKey(record.sessionId))) await imageSessionTx.store.put(record);
  }
  await imageSessionTx.done;
}

async function ensureLegacyMigration(preferredUserId: string | null = null): Promise<void> {
  if (legacyMigrationPromise) return legacyMigrationPromise;

  legacyMigrationPromise = (async () => {
    const storage = getLocalStorage();
    if (!storage || storage.getItem(LEGACY_MIGRATION_KEY)) return;

    const knownUsers = knownLegacyUserIds(storage);
    if (knownUsers.length > 1) {
      storage.setItem(LEGACY_MIGRATION_KEY, JSON.stringify({
        status: "quarantined",
        reason: "multiple-known-users",
        migratedAt: new Date().toISOString(),
      }));
      return;
    }

    const ownerId = knownUsers[0] ?? preferredUserId;
    const targetDbName = scopedDbName(ownerId);
    await copyLegacyRecords(targetDbName);
    storage.setItem(LEGACY_MIGRATION_KEY, JSON.stringify({
      status: "migrated",
      target: ownerId ? `user:${ownerId}` : "guest",
      migratedAt: new Date().toISOString(),
    }));
  })().catch((error: unknown) => {
    legacyMigrationPromise = undefined;
    console.warn("Legacy local record migration failed", error);
  });

  return legacyMigrationPromise;
}

async function getDbContext(): Promise<LocalDbContext> {
  const userId = await getCurrentUserId();
  await ensureLegacyMigration(userId);
  return {
    db: await openQuizDatabase(scopedDbName(userId)),
    userId,
  };
}

async function getDbForUser(userId: string): Promise<IDBPDatabase<QuizPwaDatabase>> {
  await ensureLegacyMigration(userId);
  return openQuizDatabase(scopedDbName(userId));
}

async function getDb(): Promise<IDBPDatabase<QuizPwaDatabase>> {
  return (await getDbContext()).db;
}

function syncKey(prefix: string, userId: string): string {
  return `${prefix}:${userId}`;
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getSession();
  if (error || !data.session?.user) return null;
  return data.session.user.id;
}

function isCloudSyncTableMissing(error: unknown): boolean {
  const message = toErrorMessage(error);
  return [
    "user_answer_records",
    "user_wrong_records",
    "user_favorite_records",
    "user_quiz_progress",
    "user_quiz_sessions",
  ].some((table) => message.includes(table));
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (typeof error === "object" && error !== null && "message" in error) {
    return String((error as { message?: unknown }).message ?? "未知錯誤");
  }
  return String(error || "未知錯誤");
}

type DatabaseRow = Record<string, unknown>;

function toAnswerRow(userId: string, answer: UserAnswer) {
  return {
    user_id: userId,
    question_id: answer.questionId,
    selected_answer: answer.selectedAnswer,
    correct_answer: answer.correctAnswer,
    is_correct: answer.isCorrect,
    answered_at: answer.answeredAt,
    bank_id: answer.bankId,
    chapter: answer.chapter,
    updated_at: new Date().toISOString(),
  };
}

function fromAnswerRow(row: DatabaseRow): UserAnswer {
  return {
    questionId: String(row.question_id),
    selectedAnswer: String(row.selected_answer) as AnswerKey,
    correctAnswer: String(row.correct_answer) as AnswerKey,
    isCorrect: Boolean(row.is_correct),
    answeredAt: String(row.answered_at),
    bankId: String(row.bank_id),
    chapter: String(row.chapter),
  };
}

function toWrongRow(userId: string, record: WrongQuestionRecord) {
  return {
    user_id: userId,
    question_id: record.questionId,
    bank_id: record.bankId,
    chapter: record.chapter,
    last_wrong_at: record.lastWrongAt,
    wrong_count: record.wrongCount,
    updated_at: new Date().toISOString(),
  };
}

function fromWrongRow(row: DatabaseRow): WrongQuestionRecord {
  return {
    questionId: String(row.question_id),
    bankId: String(row.bank_id),
    chapter: String(row.chapter),
    lastWrongAt: String(row.last_wrong_at),
    wrongCount: Number(row.wrong_count ?? 1),
  };
}

function toFavoriteRow(userId: string, record: FavoriteQuestionRecord) {
  return {
    user_id: userId,
    question_id: record.questionId,
    bank_id: record.bankId,
    chapter: record.chapter,
    created_at: record.createdAt,
    updated_at: new Date().toISOString(),
  };
}

function fromFavoriteRow(row: DatabaseRow): FavoriteQuestionRecord {
  return {
    questionId: String(row.question_id),
    bankId: String(row.bank_id),
    chapter: String(row.chapter),
    createdAt: String(row.created_at),
  };
}

function toProgressRow(userId: string, record: QuizProgressRecord) {
  return {
    user_id: userId,
    scope_id: record.scopeId,
    current_index: record.currentIndex,
    total_questions: record.totalQuestions,
    updated_at: record.updatedAt,
  };
}

function fromProgressRow(row: DatabaseRow): QuizProgressRecord {
  return {
    scopeId: String(row.scope_id),
    currentIndex: Number(row.current_index ?? 0),
    totalQuestions: Number(row.total_questions ?? 0),
    updatedAt: String(row.updated_at),
  };
}

function toSessionRow(userId: string, session: QuizSession) {
  return {
    user_id: userId,
    session_id: session.sessionId,
    mode: session.mode,
    started_at: session.startedAt,
    finished_at: session.finishedAt,
    total_questions: session.totalQuestions,
    correct_count: session.correctCount,
    wrong_count: session.wrongCount,
    accuracy: session.accuracy,
    updated_at: new Date().toISOString(),
  };
}

function fromSessionRow(row: DatabaseRow): QuizSession {
  return {
    sessionId: String(row.session_id),
    mode: String(row.mode) as QuizSession["mode"],
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    totalQuestions: Number(row.total_questions ?? 0),
    correctCount: Number(row.correct_count ?? 0),
    wrongCount: Number(row.wrong_count ?? 0),
    accuracy: Number(row.accuracy ?? 0),
  };
}

function latestIso(left?: string, right?: string): string {
  if (!left) return right ?? "";
  if (!right) return left;
  return left >= right ? left : right;
}

function chooseLatestAnswer(left: UserAnswer, right: UserAnswer): UserAnswer {
  return left.answeredAt >= right.answeredAt ? left : right;
}

function chooseLatestProgress(left: QuizProgressRecord, right: QuizProgressRecord): QuizProgressRecord {
  return left.updatedAt >= right.updatedAt ? left : right;
}

function chooseLatestSession(left: QuizSession, right: QuizSession): QuizSession {
  return latestIso(left.finishedAt ?? left.startedAt, right.finishedAt ?? right.startedAt) === (left.finishedAt ?? left.startedAt) ? left : right;
}

const CLOUD_PAGE_SIZE = 500;
const CLOUD_UPLOAD_BATCH_SIZE = 250;
const CLOUD_QUEUE_BATCH_SIZE = 50;
const CLOUD_QUEUE_MAX_ATTEMPTS = 8;
const CLOUD_QUEUE_BASE_RETRY_MS = 15_000;
const CLOUD_QUEUE_MAX_RETRY_MS = 6 * 60 * 60_000;
const CLOUD_QUEUE_OVERLAP_MS = 5 * 60_000;

type CloudTombstone = {
  record_type: string;
  record_key: string;
  deleted_at: string;
  updated_at: string;
};

function subtractSyncOverlap(value: string | null): string | null {
  if (!value) return null;
  const timestamp = new Date(value).getTime();
  if (!Number.isFinite(timestamp)) return null;
  return new Date(Math.max(0, timestamp - CLOUD_QUEUE_OVERLAP_MS)).toISOString();
}

async function fetchPagedCloudRows(
  tableName: string,
  columns: string,
  userId: string,
  options: { since?: string | null; updatedColumn?: string; tieBreakers?: string[] } = {},
): Promise<DatabaseRow[]> {
  if (!supabase) return [];
  const results: DatabaseRow[] = [];
  const updatedColumn = options.updatedColumn ?? "updated_at";
  let offset = 0;
  while (true) {
    let query = supabase
      .from(tableName)
      .select(columns)
      .eq("user_id", userId)
      .order(updatedColumn, { ascending: true });
    for (const tieBreaker of options.tieBreakers ?? []) {
      query = query.order(tieBreaker, { ascending: true });
    }
    query = query.range(offset, offset + CLOUD_PAGE_SIZE - 1);
    if (options.since) query = query.gte(updatedColumn, options.since);
    const { data, error } = await query;
    if (error) throw error;
    const rows = (data || []) as unknown as DatabaseRow[];
    results.push(...rows);
    if (rows.length < CLOUD_PAGE_SIZE) break;
    offset += CLOUD_PAGE_SIZE;
  }
  return results;
}

function fromLearningStateRow(row: DatabaseRow): QuestionLearningState {
  const lastAnsweredAt = String(row.last_answered_at || row.updated_at || new Date(0).toISOString());
  return {
    questionId: String(row.question_id),
    bankId: String(row.bank_id || ""),
    chapterId: String(row.chapter_id || ""),
    box: Number(row.leitner_box ?? 0),
    stage: String(row.stage || "new") as QuestionLearningState["stage"],
    nextReviewAt: String(row.next_review_at || lastAnsweredAt),
    successCount: Number(row.success_count ?? 0),
    lapseCount: Number(row.lapse_count ?? 0),
    lastConfidence: String(row.last_confidence || "sure") as AnswerConfidence,
    lastAnsweredAt,
    fsrsState: Number(row.fsrs_state ?? 0) as QuestionLearningState["fsrsState"],
    difficulty: Number(row.difficulty ?? 0),
    stability: Number(row.stability ?? 0),
    elapsedDays: Number(row.elapsed_days ?? 0),
    scheduledDays: Number(row.scheduled_days ?? 0),
    learningSteps: Number(row.learning_steps ?? 0),
    reps: Number(row.reps ?? 0),
    lastReviewAt: row.last_review_at ? String(row.last_review_at) : lastAnsweredAt,
    algorithmVersion: 2,
  };
}

async function applyCloudTombstones(
  db: IDBPDatabase<QuizPwaDatabase>,
  tombstones: CloudTombstone[],
): Promise<void> {
  const grouped = new Map<string, string[]>();
  for (const tombstone of tombstones) {
    const values = grouped.get(tombstone.record_type) ?? [];
    values.push(tombstone.record_key);
    grouped.set(tombstone.record_type, values);
  }
  type LocalCloudStoreName = "userAnswers" | "wrongQuestions" | "favoriteQuestions" | "quizProgress" | "quizSessions";
  const deleteKeys = async (storeName: LocalCloudStoreName, keys: string[]) => {
    if (!keys.length) return;
    const tx = db.transaction(storeName, "readwrite");
    for (const key of keys) await tx.store.delete(key);
    await tx.done;
  };
  await Promise.all([
    deleteKeys("userAnswers", grouped.get("answer") ?? []),
    deleteKeys("wrongQuestions", grouped.get("wrong") ?? []),
    deleteKeys("favoriteQuestions", grouped.get("favorite") ?? []),
    deleteKeys("quizProgress", grouped.get("progress") ?? []),
    deleteKeys("quizSessions", grouped.get("session") ?? []),
  ]);
}

async function mergeCloudRecordsToLocal(userId: string, since: string | null = null): Promise<boolean> {
  if (!supabase || (await getCurrentUserId()) !== userId) return false;
  const db = await getDbForUser(userId);
  const effectiveSince = subtractSyncOverlap(since);
  const [answerRows, wrongRows, favoriteRows, progressRows, sessionRows, learningRows, tombstoneRows] = await Promise.all([
    fetchPagedCloudRows("user_answer_records", "question_id, selected_answer, correct_answer, is_correct, answered_at, bank_id, chapter, updated_at", userId, { since: effectiveSince, tieBreakers: ["question_id"] }),
    fetchPagedCloudRows("user_wrong_records", "question_id, bank_id, chapter, last_wrong_at, wrong_count, updated_at", userId, { since: effectiveSince, tieBreakers: ["question_id"] }),
    fetchPagedCloudRows("user_favorite_records", "question_id, bank_id, chapter, created_at, updated_at", userId, { since: effectiveSince, tieBreakers: ["question_id"] }),
    fetchPagedCloudRows("user_quiz_progress", "scope_id, current_index, total_questions, updated_at", userId, { since: effectiveSince, tieBreakers: ["scope_id"] }),
    fetchPagedCloudRows("user_quiz_sessions", "session_id, mode, started_at, finished_at, total_questions, correct_count, wrong_count, accuracy, updated_at", userId, { since: effectiveSince, tieBreakers: ["session_id"] }),
    fetchPagedCloudRows("question_learning_states", "question_id, bank_id, chapter_id, leitner_box, stage, next_review_at, success_count, lapse_count, last_confidence, last_answered_at, fsrs_state, difficulty, stability, scheduled_days, elapsed_days, learning_steps, reps, last_review_at, algorithm_version, updated_at", userId, { since: effectiveSince, tieBreakers: ["question_id"] }),
    fetchPagedCloudRows("user_record_tombstones", "record_type, record_key, deleted_at, updated_at", userId, { since: effectiveSince, tieBreakers: ["record_type", "record_key"] }),
  ]);

  if ((await getCurrentUserId()) !== userId || await hasPendingCloudMutations(userId)) return false;

  const cloudAnswers = answerRows.map(fromAnswerRow);
  const answerTx = db.transaction("userAnswers", "readwrite");
  for (const cloudRecord of cloudAnswers) {
    const localRecord = await answerTx.store.get(cloudRecord.questionId);
    await answerTx.store.put(localRecord ? chooseLatestAnswer(localRecord, cloudRecord) : cloudRecord);
  }
  await answerTx.done;

  const cloudWrong = wrongRows.map(fromWrongRow);
  const wrongTx = db.transaction(["userAnswers", "wrongQuestions"], "readwrite");
  const answerStore = wrongTx.objectStore("userAnswers");
  const wrongStore = wrongTx.objectStore("wrongQuestions");
  for (const cloudRecord of cloudWrong) {
    const [localRecord, latestAnswer] = await Promise.all([
      wrongStore.get(cloudRecord.questionId),
      answerStore.get(cloudRecord.questionId),
    ]);
    const mergedRecord = localRecord ? {
      ...((localRecord.lastWrongAt >= cloudRecord.lastWrongAt) ? localRecord : cloudRecord),
      wrongCount: Math.max(localRecord.wrongCount ?? 1, cloudRecord.wrongCount ?? 1),
      lastWrongAt: latestIso(localRecord.lastWrongAt, cloudRecord.lastWrongAt),
    } : cloudRecord;
    if (latestAnswer?.isCorrect && latestAnswer.answeredAt >= mergedRecord.lastWrongAt) {
      await wrongStore.delete(cloudRecord.questionId);
    } else {
      await wrongStore.put(mergedRecord);
    }
  }
  await wrongTx.done;

  const favoriteTx = db.transaction("favoriteQuestions", "readwrite");
  for (const cloudRecord of favoriteRows.map(fromFavoriteRow)) {
    const localRecord = await favoriteTx.store.get(cloudRecord.questionId);
    await favoriteTx.store.put(localRecord && localRecord.createdAt >= cloudRecord.createdAt ? localRecord : cloudRecord);
  }
  await favoriteTx.done;

  const progressTx = db.transaction("quizProgress", "readwrite");
  for (const cloudRecord of progressRows.map(fromProgressRow)) {
    const localRecord = await progressTx.store.get(cloudRecord.scopeId);
    await progressTx.store.put(localRecord ? chooseLatestProgress(localRecord, cloudRecord) : cloudRecord);
  }
  await progressTx.done;

  const sessionTx = db.transaction("quizSessions", "readwrite");
  for (const cloudRecord of sessionRows.map(fromSessionRow)) {
    const localRecord = await sessionTx.store.get(cloudRecord.sessionId);
    await sessionTx.store.put(localRecord ? chooseLatestSession(localRecord, cloudRecord) : cloudRecord);
  }
  await sessionTx.done;

  await mergeCloudLearningStates(userId, learningRows.map(fromLearningStateRow));

  // A row can be recreated after an older deletion. Incremental overlap can return
  // both records, so only apply a tombstone when it is at least as new as the
  // corresponding live row observed in the same snapshot.
  const liveUpdatedAt = new Map<string, string>();
  const registerLiveRows = (recordType: string, rows: DatabaseRow[], keyColumn: string) => {
    for (const row of rows) {
      const key = String(row[keyColumn] ?? "");
      const updatedAt = String(row.updated_at ?? "");
      if (!key || !updatedAt) continue;
      const compositeKey = `${recordType}:${key}`;
      const current = liveUpdatedAt.get(compositeKey);
      if (!current || updatedAt > current) liveUpdatedAt.set(compositeKey, updatedAt);
    }
  };
  registerLiveRows("answer", answerRows, "question_id");
  registerLiveRows("wrong", wrongRows, "question_id");
  registerLiveRows("favorite", favoriteRows, "question_id");
  registerLiveRows("progress", progressRows, "scope_id");
  registerLiveRows("session", sessionRows, "session_id");

  const effectiveTombstones = (tombstoneRows as unknown as CloudTombstone[]).filter((tombstone) => {
    const liveTimestamp = liveUpdatedAt.get(`${tombstone.record_type}:${tombstone.record_key}`);
    return !liveTimestamp || tombstone.deleted_at >= liveTimestamp;
  });
  await applyCloudTombstones(db, effectiveTombstones);
  return true;
}

function notifyRecordChange(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event("records:changed"));
}

function chunkRows<T>(rows: T[], size = CLOUD_UPLOAD_BATCH_SIZE): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += size) chunks.push(rows.slice(index, index + size));
  return chunks;
}

async function deleteCloudTombstones(userId: string, recordType: string, keys: string[]): Promise<void> {
  if (!supabase || !keys.length) return;
  for (const chunk of chunkRows(keys)) {
    const { error } = await supabase
      .from("user_record_tombstones")
      .delete()
      .eq("user_id", userId)
      .eq("record_type", recordType)
      .in("record_key", chunk);
    if (error) throw error;
  }
}

async function upsertRowsBatched(table: string, rows: DatabaseRow[], onConflict: string): Promise<void> {
  if (!supabase) return;
  for (const chunk of chunkRows(rows)) {
    const { error } = await supabase.from(table).upsert(chunk, { onConflict });
    if (error) throw error;
  }
}

async function uploadLocalRecordsToCloud(userId: string): Promise<void> {
  if (!supabase || (await getCurrentUserId()) !== userId) return;
  const db = await getDbForUser(userId);
  const [answers, wrongQuestions, favoriteQuestions, progressRecords, sessions] = await Promise.all([
    db.getAll("userAnswers"),
    db.getAll("wrongQuestions"),
    db.getAll("favoriteQuestions"),
    db.getAll("quizProgress"),
    db.getAll("quizSessions"),
  ]);
  await upsertRowsBatched("user_answer_records", answers.map((answer) => toAnswerRow(userId, answer)), "user_id,question_id");
  await upsertRowsBatched("user_wrong_records", wrongQuestions.map((record) => toWrongRow(userId, record)), "user_id,question_id");
  await upsertRowsBatched("user_favorite_records", favoriteQuestions.map((record) => toFavoriteRow(userId, record)), "user_id,question_id");
  await upsertRowsBatched("user_quiz_progress", progressRecords.map((record) => toProgressRow(userId, record)), "user_id,scope_id");
  await upsertRowsBatched("user_quiz_sessions", sessions.map((session) => toSessionRow(userId, session)), "user_id,session_id");
  await Promise.all([
    deleteCloudTombstones(userId, "answer", answers.map((record) => record.questionId)),
    deleteCloudTombstones(userId, "wrong", wrongQuestions.map((record) => record.questionId)),
    deleteCloudTombstones(userId, "favorite", favoriteQuestions.map((record) => record.questionId)),
    deleteCloudTombstones(userId, "progress", progressRecords.map((record) => record.scopeId)),
    deleteCloudTombstones(userId, "session", sessions.map((record) => record.sessionId)),
  ]);
}

async function importCloudRecordsToLocal(userId: string): Promise<void> {
  const checkpoint = await getReliabilityMetadata<string>(userId, CLOUD_SYNC_CHECKPOINT_KEY);
  const syncStartedAt = new Date().toISOString();
  const merged = await mergeCloudRecordsToLocal(userId, checkpoint);
  if (merged) await setReliabilityMetadata(userId, CLOUD_SYNC_CHECKPOINT_KEY, syncStartedAt);
}

const cloudImportPromises = new Map<string, Promise<void>>();
const lastCloudImportAt = new Map<string, number>();

async function tryImportCloudRecordsToLocal(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  await flushQueuedCloudWritesForUser(userId);
  if (await hasPendingCloudMutations(userId)) return;
  const activeImport = cloudImportPromises.get(userId);
  if (activeImport) return activeImport;
  if (Date.now() - (lastCloudImportAt.get(userId) ?? 0) < 30_000) return;

  const importPromise = importCloudRecordsToLocal(userId)
    .then(() => { lastCloudImportAt.set(userId, Date.now()); })
    .catch((error: unknown) => {
      if (!isCloudSyncTableMissing(error)) console.warn("Cloud record import failed", error);
    })
    .finally(() => cloudImportPromises.delete(userId));
  cloudImportPromises.set(userId, importPromise);
  return importPromise;
}

async function upsertCloudAnswer(userId: string, userAnswer: UserAnswer): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_answer_records").upsert(toAnswerRow(userId, userAnswer), { onConflict: "user_id,question_id" });
  if (error) throw error;
  await deleteCloudTombstones(userId, "answer", [userAnswer.questionId]);
}

async function upsertCloudWrong(userId: string, record: WrongQuestionRecord): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_wrong_records").upsert(toWrongRow(userId, record), { onConflict: "user_id,question_id" });
  if (error) throw error;
  await deleteCloudTombstones(userId, "wrong", [record.questionId]);
}

async function writeCloudTombstones(userId: string, tableName: CloudTableName, keys: string[]): Promise<void> {
  if (!supabase || !keys.length) return;
  const recordType = recordTypeForTable(tableName);
  const now = new Date().toISOString();
  await upsertRowsBatched(
    "user_record_tombstones",
    keys.map((recordKey) => ({ user_id: userId, record_type: recordType, record_key: recordKey, deleted_at: now, updated_at: now })),
    "user_id,record_type,record_key",
  );
}

async function deleteCloudWrong(userId: string, questionId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_wrong_records").delete().eq("user_id", userId).eq("question_id", questionId);
  if (error) throw error;
  await writeCloudTombstones(userId, "user_wrong_records", [questionId]);
}

async function getCloudFavorite(userId: string, questionId: string): Promise<FavoriteQuestionRecord | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from("user_favorite_records")
    .select("question_id, bank_id, chapter, created_at")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromFavoriteRow(data) : undefined;
}

async function upsertCloudFavorite(userId: string, record: FavoriteQuestionRecord): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_favorite_records").upsert(toFavoriteRow(userId, record), { onConflict: "user_id,question_id" });
  if (error) throw error;
  await deleteCloudTombstones(userId, "favorite", [record.questionId]);
}

async function deleteCloudFavorite(userId: string, questionId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_favorite_records").delete().eq("user_id", userId).eq("question_id", questionId);
  if (error) throw error;
  await writeCloudTombstones(userId, "user_favorite_records", [questionId]);
}

async function upsertCloudProgress(userId: string, record: QuizProgressRecord): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_quiz_progress").upsert(toProgressRow(userId, record), { onConflict: "user_id,scope_id" });
  if (error) throw error;
  await deleteCloudTombstones(userId, "progress", [record.scopeId]);
}

async function getCloudProgress(userId: string, scopeId: string): Promise<QuizProgressRecord | undefined> {
  if (!supabase) return undefined;
  const { data, error } = await supabase
    .from("user_quiz_progress")
    .select("scope_id, current_index, total_questions, updated_at")
    .eq("user_id", userId)
    .eq("scope_id", scopeId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromProgressRow(data) : undefined;
}

async function deleteCloudProgress(userId: string, scopeId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_quiz_progress").delete().eq("user_id", userId).eq("scope_id", scopeId);
  if (error) throw error;
  await writeCloudTombstones(userId, "user_quiz_progress", [scopeId]);
}

async function upsertCloudSession(userId: string, session: QuizSession): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.from("user_quiz_sessions").upsert(toSessionRow(userId, session), { onConflict: "user_id,session_id" });
  if (error) throw error;
  await deleteCloudTombstones(userId, "session", [session.sessionId]);
}

async function deleteCloudRecords(userId: string, tableName: CloudTableName, columnName: string, values: string[]): Promise<void> {
  if (!supabase || values.length === 0) return;
  for (const chunk of chunkRows(values)) {
    const { error } = await supabase.from(tableName).delete().eq("user_id", userId).in(columnName, chunk);
    if (error) throw error;
  }
  await writeCloudTombstones(userId, tableName, values);
}

async function fetchCloudKeys(userId: string, tableName: CloudTableName): Promise<string[]> {
  const keyColumn = keyColumnForTable(tableName);
  return (await fetchPagedCloudRows(tableName, `${keyColumn}, updated_at`, userId, { tieBreakers: [keyColumn] })).map((row) => String(row[keyColumn]));
}

async function clearCloudTable(userId: string, tableName: CloudTableName): Promise<void> {
  if (!supabase) return;
  const keys = await fetchCloudKeys(userId, tableName);
  const { error } = await supabase.from(tableName).delete().eq("user_id", userId);
  if (error) throw error;
  await writeCloudTombstones(userId, tableName, keys);
}

type CloudTableName =
  | "user_answer_records"
  | "user_wrong_records"
  | "user_favorite_records"
  | "user_quiz_progress"
  | "user_quiz_sessions";

type CloudMutation =
  | { kind: "upsert-answer"; record: UserAnswer }
  | { kind: "upsert-wrong"; record: WrongQuestionRecord }
  | { kind: "delete-wrong"; questionId: string }
  | { kind: "upsert-favorite"; record: FavoriteQuestionRecord }
  | { kind: "delete-favorite"; questionId: string }
  | { kind: "upsert-progress"; record: QuizProgressRecord }
  | { kind: "delete-progress"; scopeId: string }
  | { kind: "upsert-session"; record: QuizSession }
  | { kind: "sync-learning-attempt"; attempt: LearningAttemptInput; state: QuestionLearningState }
  | { kind: "record-leaderboard-answer"; eventId: string; isCorrect: boolean }
  | { kind: "delete-many"; table: CloudTableName; column: string; values: string[] }
  | { kind: "clear-table"; table: CloudTableName };

type QueuedCloudMutation = ReliabilityQueueEntry<CloudMutation>;

const CLOUD_WRITE_DEBOUNCE_MS = 650;
const cloudWriteTimers = new Map<string, ReturnType<typeof setTimeout>>();
const activeCloudWriteFlushes = new Map<string, Promise<void>>();
const legacyQueueMigrationPromises = new Map<string, Promise<void>>();

function recordTypeForTable(table: CloudTableName): "answer" | "wrong" | "favorite" | "progress" | "session" {
  switch (table) {
    case "user_answer_records": return "answer";
    case "user_wrong_records": return "wrong";
    case "user_favorite_records": return "favorite";
    case "user_quiz_progress": return "progress";
    case "user_quiz_sessions": return "session";
  }
}

function keyColumnForTable(table: CloudTableName): string {
  switch (table) {
    case "user_answer_records":
    case "user_wrong_records":
    case "user_favorite_records": return "question_id";
    case "user_quiz_progress": return "scope_id";
    case "user_quiz_sessions": return "session_id";
  }
}

function mutationTable(mutation: CloudMutation): CloudTableName | null {
  switch (mutation.kind) {
    case "upsert-answer": return "user_answer_records";
    case "upsert-wrong":
    case "delete-wrong": return "user_wrong_records";
    case "upsert-favorite":
    case "delete-favorite": return "user_favorite_records";
    case "upsert-progress":
    case "delete-progress": return "user_quiz_progress";
    case "upsert-session": return "user_quiz_sessions";
    case "sync-learning-attempt":
    case "record-leaderboard-answer": return null;
    case "delete-many":
    case "clear-table": return mutation.table;
  }
}

function mutationCoalesceKey(mutation: CloudMutation): string | null {
  switch (mutation.kind) {
    case "upsert-answer": return `answer:${mutation.record.questionId}`;
    case "upsert-wrong": return `wrong:${mutation.record.questionId}`;
    case "delete-wrong": return `wrong:${mutation.questionId}`;
    case "upsert-favorite": return `favorite:${mutation.record.questionId}`;
    case "delete-favorite": return `favorite:${mutation.questionId}`;
    case "upsert-progress": return `progress:${mutation.record.scopeId}`;
    case "delete-progress": return `progress:${mutation.scopeId}`;
    case "upsert-session": return `session:${mutation.record.sessionId}`;
    case "sync-learning-attempt": return `learning:${mutation.attempt.eventId}`;
    case "record-leaderboard-answer": return `leaderboard:${mutation.eventId}`;
    case "delete-many":
    case "clear-table": return null;
  }
}

function createMutationId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

async function migrateLegacyCloudQueue(userId: string): Promise<void> {
  const active = legacyQueueMigrationPromises.get(userId);
  if (active) return active;
  const migration = (async () => {
    if ((await countReliabilityQueue(userId)) > 0) return;
    const storage = getLocalStorage();
    const key = `${LEGACY_CLOUD_QUEUE_PREFIX}:${userId}`;
    if (!storage) return;
    try {
      const parsed = JSON.parse(storage.getItem(key) ?? "[]") as Array<{ id?: string; userId?: string; createdAt?: string; mutation?: CloudMutation }>;
      if (!Array.isArray(parsed) || !parsed.length) return;
      const now = new Date().toISOString();
      const entries: QueuedCloudMutation[] = parsed
        .filter((entry) => entry?.userId === userId && entry.mutation)
        .map((entry) => ({
          id: entry.id || createMutationId(),
          userId,
          createdAt: entry.createdAt || now,
          updatedAt: now,
          coalesceKey: mutationCoalesceKey(entry.mutation as CloudMutation),
          attemptCount: 0,
          nextAttemptAt: now,
          lastError: null,
          payload: entry.mutation as CloudMutation,
        }));
      await replaceReliabilityQueue(userId, entries);
      storage.removeItem(key);
    } catch (error) {
      console.warn("Unable to migrate legacy cloud queue", error);
    }
  })().finally(() => legacyQueueMigrationPromises.delete(userId));
  legacyQueueMigrationPromises.set(userId, migration);
  return migration;
}

async function hasPendingCloudMutations(userId: string): Promise<boolean> {
  await migrateLegacyCloudQueue(userId);
  return (await countReliabilityQueue(userId)) > 0;
}

async function enqueueCloudMutation(userId: string | null, mutation: CloudMutation): Promise<void> {
  if (!userId) return;
  await migrateLegacyCloudQueue(userId);
  const now = new Date().toISOString();
  if (mutation.kind === "clear-table") {
    const existing = await listReliabilityQueue<CloudMutation>(userId, 10_000);
    const retained = existing.filter((entry) => mutationTable(entry.payload) !== mutation.table);
    await replaceReliabilityQueue(userId, retained);
  }
  await enqueueReliabilityMutation(userId, {
    id: createMutationId(),
    userId,
    createdAt: now,
    updatedAt: now,
    coalesceKey: mutationCoalesceKey(mutation),
    attemptCount: 0,
    nextAttemptAt: now,
    lastError: null,
    payload: mutation,
  });
  scheduleCloudWriteFlush(userId);
}

async function syncLearningAttemptsBatch(entries: QueuedCloudMutation[]): Promise<void> {
  if (!supabase || !entries.length) return;
  const items = entries.map((entry) => {
    const mutation = entry.payload;
    if (mutation.kind !== "sync-learning-attempt") throw new Error("Invalid learning batch entry");
    return { ...mutation.attempt, state: mutation.state };
  });
  const { error } = await supabase.rpc("record_learning_attempts_batch_v75", { p_items: items });
  if (!error) return;
  if (!isMissingRpc(error, "record_learning_attempts_batch_v75")) throw error;
  for (const entry of entries) {
    const mutation = entry.payload;
    if (mutation.kind === "sync-learning-attempt") {
      const { syncLearningAttempt } = await import("./learningEngine");
      await syncLearningAttempt(mutation.attempt, mutation.state);
    }
  }
}

async function syncLeaderboardBatch(entries: QueuedCloudMutation[]): Promise<void> {
  if (!supabase || !entries.length) return;
  const items = entries.map((entry) => {
    const mutation = entry.payload;
    if (mutation.kind !== "record-leaderboard-answer") throw new Error("Invalid leaderboard batch entry");
    return { event_id: mutation.eventId, is_correct: mutation.isCorrect };
  });
  const { error } = await supabase.rpc("record_leaderboard_answer_events_batch_v75", { p_items: items });
  if (!error) return;
  if (!isMissingRpc(error, "record_leaderboard_answer_events_batch_v75")) throw error;
  for (const entry of entries) {
    const mutation = entry.payload;
    if (mutation.kind === "record-leaderboard-answer") await updateLeaderboardAfterAnswer(mutation.isCorrect, mutation.eventId);
  }
}

async function executeCloudMutationGroup(userId: string, entries: QueuedCloudMutation[]): Promise<void> {
  if (!entries.length) return;
  const first = entries[0]!.payload;
  if (first.kind === "sync-learning-attempt") return syncLearningAttemptsBatch(entries);
  if (first.kind === "record-leaderboard-answer") return syncLeaderboardBatch(entries);
  if (first.kind === "upsert-answer") {
    const records = entries.map((entry) => (entry.payload as Extract<CloudMutation, { kind: "upsert-answer" }>).record);
    await upsertRowsBatched("user_answer_records", records.map((record) => toAnswerRow(userId, record)), "user_id,question_id");
    return deleteCloudTombstones(userId, "answer", records.map((record) => record.questionId));
  }
  if (first.kind === "upsert-wrong") {
    const records = entries.map((entry) => (entry.payload as Extract<CloudMutation, { kind: "upsert-wrong" }>).record);
    await upsertRowsBatched("user_wrong_records", records.map((record) => toWrongRow(userId, record)), "user_id,question_id");
    return deleteCloudTombstones(userId, "wrong", records.map((record) => record.questionId));
  }
  if (first.kind === "upsert-favorite") {
    const records = entries.map((entry) => (entry.payload as Extract<CloudMutation, { kind: "upsert-favorite" }>).record);
    await upsertRowsBatched("user_favorite_records", records.map((record) => toFavoriteRow(userId, record)), "user_id,question_id");
    return deleteCloudTombstones(userId, "favorite", records.map((record) => record.questionId));
  }
  if (first.kind === "upsert-progress") {
    const records = entries.map((entry) => (entry.payload as Extract<CloudMutation, { kind: "upsert-progress" }>).record);
    await upsertRowsBatched("user_quiz_progress", records.map((record) => toProgressRow(userId, record)), "user_id,scope_id");
    return deleteCloudTombstones(userId, "progress", records.map((record) => record.scopeId));
  }
  if (first.kind === "upsert-session") {
    const records = entries.map((entry) => (entry.payload as Extract<CloudMutation, { kind: "upsert-session" }>).record);
    await upsertRowsBatched("user_quiz_sessions", records.map((record) => toSessionRow(userId, record)), "user_id,session_id");
    return deleteCloudTombstones(userId, "session", records.map((record) => record.sessionId));
  }
  for (const entry of entries) {
    const mutation = entry.payload;
    switch (mutation.kind) {
      case "delete-wrong": await deleteCloudWrong(userId, mutation.questionId); break;
      case "delete-favorite": await deleteCloudFavorite(userId, mutation.questionId); break;
      case "delete-progress": await deleteCloudProgress(userId, mutation.scopeId); break;
      case "delete-many": await deleteCloudRecords(userId, mutation.table, mutation.column, mutation.values); break;
      case "clear-table": await clearCloudTable(userId, mutation.table); break;
      case "upsert-answer": await upsertCloudAnswer(userId, mutation.record); break;
      case "upsert-wrong": await upsertCloudWrong(userId, mutation.record); break;
      case "upsert-favorite": await upsertCloudFavorite(userId, mutation.record); break;
      case "upsert-progress": await upsertCloudProgress(userId, mutation.record); break;
      case "upsert-session": await upsertCloudSession(userId, mutation.record); break;
      case "sync-learning-attempt":
      case "record-leaderboard-answer": break;
    }
  }
}

function retryDelayMs(attemptCount: number): number {
  const exponential = Math.min(CLOUD_QUEUE_MAX_RETRY_MS, CLOUD_QUEUE_BASE_RETRY_MS * 2 ** Math.max(0, attemptCount - 1));
  return Math.round(exponential * (0.8 + Math.random() * 0.4));
}

function scheduleCloudWriteFlush(userId: string, delayMs = CLOUD_WRITE_DEBOUNCE_MS): void {
  const current = cloudWriteTimers.get(userId);
  if (current) clearTimeout(current);
  if (activeCloudWriteFlushes.has(userId)) return;
  const timer = setTimeout(() => {
    cloudWriteTimers.delete(userId);
    void flushQueuedCloudWritesForUser(userId);
  }, Math.max(0, delayMs));
  cloudWriteTimers.set(userId, timer);
}

async function scheduleNextCloudFlush(userId: string): Promise<void> {
  const queue = await listReliabilityQueue<CloudMutation>(userId, 1);
  if (!queue.length) return;
  const delay = Math.max(250, new Date(queue[0]!.nextAttemptAt).getTime() - Date.now());
  scheduleCloudWriteFlush(userId, Math.min(delay, CLOUD_QUEUE_MAX_RETRY_MS));
}

async function flushQueuedCloudWritesForUser(userId: string): Promise<void> {
  const active = activeCloudWriteFlushes.get(userId);
  if (active) return active;
  const timer = cloudWriteTimers.get(userId);
  if (timer) {
    clearTimeout(timer);
    cloudWriteTimers.delete(userId);
  }
  if (!supabase || (typeof navigator !== "undefined" && !navigator.onLine)) return;
  if ((await getCurrentUserId()) !== userId) return;
  await migrateLegacyCloudQueue(userId);

  const flush = (async () => {
    const due = await listDueReliabilityQueue<CloudMutation>(userId, new Date().toISOString(), CLOUD_QUEUE_BATCH_SIZE);
    if (!due.length) return;
    const groups = new Map<string, QueuedCloudMutation[]>();
    for (const entry of due) {
      const key = entry.payload.kind;
      const group = groups.get(key) ?? [];
      group.push(entry);
      groups.set(key, group);
    }
    for (const entries of groups.values()) {
      if ((await getCurrentUserId()) !== userId) return;
      try {
        await executeCloudMutationGroup(userId, entries);
        await deleteReliabilityQueueEntries(userId, entries.map((entry) => entry.id));
      } catch (error) {
        const message = toErrorMessage(error).slice(0, 800);
        for (const entry of entries) {
          const attemptCount = entry.attemptCount + 1;
          const updated: QueuedCloudMutation = {
            ...entry,
            attemptCount,
            updatedAt: new Date().toISOString(),
            lastError: message,
            nextAttemptAt: new Date(Date.now() + retryDelayMs(attemptCount)).toISOString(),
          };
          if (attemptCount >= CLOUD_QUEUE_MAX_ATTEMPTS) {
            await moveReliabilityQueueEntryToDeadLetter(userId, updated);
          } else {
            await updateReliabilityQueueEntry(userId, updated);
          }
        }
        if (!isCloudSyncTableMissing(error)) console.warn("Cloud record sync failed", error);
      }
    }
  })().finally(async () => {
    activeCloudWriteFlushes.delete(userId);
    await scheduleNextCloudFlush(userId);
  });
  activeCloudWriteFlushes.set(userId, flush);
  return flush;
}

async function flushQueuedCloudWrites(): Promise<void> {
  const userId = await getCurrentUserId();
  if (userId) await flushQueuedCloudWritesForUser(userId);
}

if (typeof window !== "undefined") {
  window.addEventListener("online", () => void flushQueuedCloudWrites());
}


async function getCloudCount(tableName: string, userId: string): Promise<number> {
  if (!supabase) return 0;
  const { count, error } = await supabase
    .from(tableName)
    .select("user_id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

export async function getSyncedRecordSummary(): Promise<CloudSyncSummary> {
  const { db, userId } = await getDbContext();
  const [answers, wrong, favorites, progress, sessions] = await Promise.all([
    db.count("userAnswers"),
    db.count("wrongQuestions"),
    db.count("favoriteQuestions"),
    db.count("quizProgress"),
    db.count("quizSessions"),
  ]);

  const [pendingMutations, deadLetters] = userId
    ? await Promise.all([countReliabilityQueue(userId), countReliabilityDeadLetters(userId)])
    : [0, 0];
  const base: CloudSyncSummary = {
    local: { answers, wrong, favorites, progress, sessions },
    cloud: { answers: 0, wrong: 0, favorites: 0, progress: 0, sessions: 0 },
    cloudAvailable: false,
    syncedAt: null,
    pendingMutations,
    deadLetters,
    error: null,
  };

  if (!userId) return base;

  try {
    const [cloudAnswers, cloudWrong, cloudFavorites, cloudProgress, cloudSessions] = await Promise.all([
      getCloudCount("user_answer_records", userId),
      getCloudCount("user_wrong_records", userId),
      getCloudCount("user_favorite_records", userId),
      getCloudCount("user_quiz_progress", userId),
      getCloudCount("user_quiz_sessions", userId),
    ]);
    return {
      local: base.local,
      cloud: { answers: cloudAnswers, wrong: cloudWrong, favorites: cloudFavorites, progress: cloudProgress, sessions: cloudSessions },
      cloudAvailable: true,
      syncedAt: await getReliabilityMetadata<string>(userId, CLOUD_SYNC_CHECKPOINT_KEY),
      pendingMutations,
      deadLetters,
      error: null,
    };
  } catch (error) {
    return {
      ...base,
      error: isCloudSyncTableMissing(error)
        ? "尚未建立雲端紀錄資料表。請先執行 supabase/user-record-sync-v16.sql。"
        : toErrorMessage(error),
    };
  }
}

export async function syncLocalRecordsToCloud(options: { forceUpload?: boolean } = {}): Promise<CloudSyncSummary> {
  const { userId } = await getDbContext();
  if (!userId) {
    return getSyncedRecordSummary();
  }

  const initializedKey = syncKey(SYNC_READY_PREFIX, userId);
  const storage = getLocalStorage();
  const shouldUpload = options.forceUpload || storage?.getItem(initializedKey) !== "true";

  await flushQueuedCloudWritesForUser(userId);
  if (await hasPendingCloudMutations(userId)) return getSyncedRecordSummary();
  if (shouldUpload) {
    await uploadLocalRecordsToCloud(userId);
  }
  await importCloudRecordsToLocal(userId);

  notifyRecordChange();
  const syncedAt = new Date().toISOString();
  storage?.setItem(initializedKey, "true");
  storage?.setItem(syncKey(LAST_SYNC_PREFIX, userId), syncedAt);
  await setReliabilityMetadata(userId, CLOUD_SYNC_CHECKPOINT_KEY, syncedAt);
  return getSyncedRecordSummary();
}


function isMissingRpc(error: { code?: string; message?: string }, functionName: string): boolean {
  return error.code === "PGRST202" || error.code === "42883" || String(error.message || "").includes(functionName);
}

async function updateLeaderboardAfterAnswer(isCorrect: boolean, eventId: string): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("record_leaderboard_answer_event_v66", {
    p_event_id: eventId,
    p_is_correct: isCorrect,
  });
  if (!error) return;
  if (!isMissingRpc(error, "record_leaderboard_answer_event_v66")) throw error;
  const { error: legacyError } = await supabase.rpc("record_leaderboard_answer", { p_is_correct: isCorrect });
  if (legacyError) throw legacyError;
}

export type RecordAnswerOptions = {
  confidence?: AnswerConfidence;
  sessionId?: string | null;
  sessionMode?: string | null;
  eventId?: string;
};

async function recordLearningAndLeaderboard(args: {
  userId: string | null;
  questionId: string;
  bankId: string;
  chapterId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  answeredAt: string;
  options?: RecordAnswerOptions;
}): Promise<void> {
  const { createAttemptId, recordLocalLearningAttempt } = await import("./learningEngine");
  const eventId = args.options?.eventId || createAttemptId();
  const attempt: LearningAttemptInput = {
    eventId,
    questionId: args.questionId,
    bankId: args.bankId,
    chapterId: args.chapterId,
    selectedAnswer: args.selectedAnswer,
    correctAnswer: args.correctAnswer,
    isCorrect: args.isCorrect,
    confidence: args.options?.confidence ?? "sure",
    answeredAt: args.answeredAt,
    sessionId: args.options?.sessionId ?? null,
    sessionMode: args.options?.sessionMode ?? null,
  };
  const learningState = await recordLocalLearningAttempt(args.userId, attempt);
  if (!args.userId) return;
  await enqueueCloudMutation(args.userId, {
    kind: "sync-learning-attempt",
    attempt,
    state: learningState,
  });
  await enqueueCloudMutation(args.userId, {
    kind: "record-leaderboard-answer",
    eventId,
    isCorrect: args.isCorrect,
  });
}

export async function recordUserAnswer(
  question: Question,
  selectedAnswer: AnswerKey,
  options: RecordAnswerOptions = {},
): Promise<UserAnswer> {
  const answeredAt = new Date().toISOString();
  const isCorrect = selectedAnswer === question.answer;
  const userAnswer: UserAnswer = {
    questionId: question.id,
    selectedAnswer,
    correctAnswer: question.answer,
    isCorrect,
    answeredAt,
    bankId: question.bankId,
    chapter: question.chapter
  };

  const { db, userId } = await getDbContext();
  const tx = db.transaction(["userAnswers", "wrongQuestions"], "readwrite");
  await tx.objectStore("userAnswers").put(userAnswer);

  const wrongStore = tx.objectStore("wrongQuestions");
  let wrongRecord: WrongQuestionRecord | null = null;
  if (!isCorrect) {
    const existing = await wrongStore.get(question.id);
    wrongRecord = {
      questionId: question.id,
      bankId: question.bankId,
      chapter: question.chapter,
      lastWrongAt: answeredAt,
      wrongCount: (existing?.wrongCount ?? 0) + 1
    };
    await wrongStore.put(wrongRecord);
  } else {
    await wrongStore.delete(question.id);
  }

  await enqueueCloudMutation(userId, { kind: "upsert-answer", record: userAnswer });
  await enqueueCloudMutation(userId, wrongRecord
    ? { kind: "upsert-wrong", record: wrongRecord }
    : { kind: "delete-wrong", questionId: question.id });
  await tx.done;
  await recordLearningAndLeaderboard({
    userId,
    questionId: question.id,
    bankId: question.bankId,
    chapterId: question.chapter,
    selectedAnswer,
    correctAnswer: question.answer,
    isCorrect,
    answeredAt,
    options,
  });
  notifyRecordChange();
  return userAnswer;
}

export async function recordImageUserAnswer(
  question: ImageQuizQuestion,
  selectedAnswer: NumericAnswer,
  options: RecordAnswerOptions = {},
): Promise<UserAnswer> {
  const answeredAt = new Date().toISOString();
  const selectedAnswerKey = numericToAnswerKey[selectedAnswer];
  const correctAnswerKey = numericToAnswerKey[question.answer];
  const isCorrect = selectedAnswer === question.answer;
  const userAnswer: UserAnswer = {
    questionId: question.id,
    selectedAnswer: selectedAnswerKey,
    correctAnswer: correctAnswerKey,
    isCorrect,
    answeredAt,
    bankId: question.bankId,
    chapter: question.chapterId
  };

  const { db, userId } = await getDbContext();
  const tx = db.transaction(["userAnswers", "wrongQuestions"], "readwrite");
  await tx.objectStore("userAnswers").put(userAnswer);

  const wrongStore = tx.objectStore("wrongQuestions");
  let wrongRecord: WrongQuestionRecord | null = null;
  if (!isCorrect) {
    const existing = await wrongStore.get(question.id);
    wrongRecord = {
      questionId: question.id,
      bankId: question.bankId,
      chapter: question.chapterId,
      lastWrongAt: answeredAt,
      wrongCount: (existing?.wrongCount ?? 0) + 1
    };
    await wrongStore.put(wrongRecord);
  } else {
    await wrongStore.delete(question.id);
  }

  await enqueueCloudMutation(userId, { kind: "upsert-answer", record: userAnswer });
  await enqueueCloudMutation(userId, wrongRecord
    ? { kind: "upsert-wrong", record: wrongRecord }
    : { kind: "delete-wrong", questionId: question.id });
  await tx.done;
  await recordLearningAndLeaderboard({
    userId,
    questionId: question.id,
    bankId: question.bankId,
    chapterId: question.chapterId,
    selectedAnswer,
    correctAnswer: question.answer,
    isCorrect,
    answeredAt,
    options,
  });
  notifyRecordChange();
  return userAnswer;
}

export async function listUserAnswers(): Promise<UserAnswer[]> {
  await tryImportCloudRecordsToLocal();
  const db = await getDb();
  return db.getAll("userAnswers");
}

export async function listWrongQuestions(): Promise<WrongQuestionRecord[]> {
  await tryImportCloudRecordsToLocal();
  const db = await getDb();
  const records = await db.getAll("wrongQuestions");
  return records.sort((left, right) => right.lastWrongAt.localeCompare(left.lastWrongAt));
}

export async function clearWrongQuestions(): Promise<void> {
  const { db, userId } = await getDbContext();
  await enqueueCloudMutation(userId, { kind: "clear-table", table: "user_wrong_records" });
  await db.clear("wrongQuestions");
}

export async function removeWrongQuestion(questionId: string): Promise<void> {
  const { db, userId } = await getDbContext();
  await enqueueCloudMutation(userId, { kind: "delete-wrong", questionId });
  await db.delete("wrongQuestions", questionId);
}

export async function listFavoriteQuestions(): Promise<FavoriteQuestionRecord[]> {
  await tryImportCloudRecordsToLocal();
  const db = await getDb();
  const records = await db.getAll("favoriteQuestions");
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getFavoriteQuestion(questionId: string): Promise<FavoriteQuestionRecord | undefined> {
  const { db, userId } = await getDbContext();
  const localFavorite = await db.get("favoriteQuestions", questionId);
  if (localFavorite) return localFavorite;
  if (!userId || await hasPendingCloudMutations(userId)) return undefined;
  try {
    const cloudFavorite = await getCloudFavorite(userId, questionId);
    if (cloudFavorite) {
      if (await hasPendingCloudMutations(userId) || (await getCurrentUserId()) !== userId) return undefined;
      await db.put("favoriteQuestions", cloudFavorite);
      return cloudFavorite;
    }
  } catch (error) {
    if (!isCloudSyncTableMissing(error)) {
      console.warn("Cloud favorite lookup failed", error);
    }
  }
  return db.get("favoriteQuestions", questionId);
}

export async function toggleFavoriteRef(ref: {
  questionId: string;
  bankId: string;
  chapter: string;
}): Promise<boolean> {
  const { db, userId } = await getDbContext();
  const existing = await db.get("favoriteQuestions", ref.questionId);
  if (existing) {
    await enqueueCloudMutation(userId, { kind: "delete-favorite", questionId: ref.questionId });
    await db.delete("favoriteQuestions", ref.questionId);
    return false;
  }

  const favorite: FavoriteQuestionRecord = {
    questionId: ref.questionId,
    bankId: ref.bankId,
    chapter: ref.chapter,
    createdAt: new Date().toISOString()
  };
  await enqueueCloudMutation(userId, { kind: "upsert-favorite", record: favorite });
  await db.put("favoriteQuestions", favorite);
  return true;
}

export async function toggleFavoriteQuestion(question: Question): Promise<boolean> {
  return toggleFavoriteRef({
    questionId: question.id,
    bankId: question.bankId,
    chapter: question.chapter,
  });
}

export async function removeFavoriteQuestion(questionId: string): Promise<void> {
  const { db, userId } = await getDbContext();
  await enqueueCloudMutation(userId, { kind: "delete-favorite", questionId });
  await db.delete("favoriteQuestions", questionId);
}

export async function saveQuizSession(session: QuizSession): Promise<void> {
  const { db, userId } = await getDbContext();
  await enqueueCloudMutation(userId, { kind: "upsert-session", record: session });
  await db.put("quizSessions", session);
}

export async function getQuizProgress(scopeId: string): Promise<QuizProgressRecord | undefined> {
  const { db, userId } = await getDbContext();
  const localProgress = await db.get("quizProgress", scopeId);
  if (localProgress) return localProgress;
  if (!userId || await hasPendingCloudMutations(userId)) return undefined;
  try {
    const cloudProgress = await getCloudProgress(userId, scopeId);
    if (cloudProgress) {
      if (await hasPendingCloudMutations(userId) || (await getCurrentUserId()) !== userId) return undefined;
      await db.put("quizProgress", cloudProgress);
      return cloudProgress;
    }
  } catch (error) {
    if (!isCloudSyncTableMissing(error)) {
      console.warn("Cloud progress lookup failed", error);
    }
  }
  return db.get("quizProgress", scopeId);
}

export async function saveQuizProgress(scopeId: string, currentIndex: number, totalQuestions: number): Promise<void> {
  const record: QuizProgressRecord = {
    scopeId,
    currentIndex,
    totalQuestions,
    updatedAt: new Date().toISOString()
  };
  const { db, userId } = await getDbContext();
  await enqueueCloudMutation(userId, { kind: "upsert-progress", record });
  await db.put("quizProgress", record);
}

export async function clearQuizProgress(scopeId: string): Promise<void> {
  const { db, userId } = await getDbContext();
  await enqueueCloudMutation(userId, { kind: "delete-progress", scopeId });
  await db.delete("quizProgress", scopeId);
}

export async function createImageQuizSession(session: ImageQuizSessionRecord): Promise<void> {
  const db = await getDb();
  await db.put("imageQuizSessions", session);
}

export async function getImageQuizSession(sessionId: string): Promise<ImageQuizSessionRecord | undefined> {
  const db = await getDb();
  return db.get("imageQuizSessions", sessionId);
}

export async function listImageQuizSessions(): Promise<ImageQuizSessionRecord[]> {
  const db = await getDb();
  const records = await db.getAll("imageQuizSessions");
  return records.sort((left, right) => {
    const leftDate = left.finishedAt ?? left.startedAt;
    const rightDate = right.finishedAt ?? right.startedAt;
    return rightDate.localeCompare(leftDate);
  });
}

function summarizeImageAnswers(
  answers: Record<string, StoredImageAnswer>
): Pick<ImageQuizSessionRecord, "correctCount" | "wrongCount" | "accuracy" | "wrongQuestionIds"> {
  const entries = Object.entries(answers);
  const correctCount = entries.filter(([, answer]) => answer.isCorrect).length;
  const wrongQuestionIds = entries.filter(([, answer]) => !answer.isCorrect).map(([questionId]) => questionId);
  const answeredCount = entries.length;
  return {
    correctCount,
    wrongCount: answeredCount - correctCount,
    accuracy: answeredCount ? Math.round((correctCount / answeredCount) * 1000) / 10 : 0,
    wrongQuestionIds,
  };
}

export async function saveImageQuizSessionMarks(sessionId: string, markedQuestionIds: string[]): Promise<void> {
  const db = await getDb();
  const session = await db.get("imageQuizSessions", sessionId);
  if (!session) return;
  await db.put("imageQuizSessions", {
    ...session,
    markedQuestionIds: Array.from(new Set(markedQuestionIds)),
  });
}

export async function saveImageQuizSessionAnswer(
  sessionId: string,
  questionId: string,
  answer: StoredImageAnswer,
): Promise<void> {
  const db = await getDb();
  const session = await db.get("imageQuizSessions", sessionId);
  if (!session) {
    return;
  }
  const answers = {
    ...session.answers,
    [questionId]: answer,
  };
  await db.put("imageQuizSessions", {
    ...session,
    ...summarizeImageAnswers(answers),
    answers,
  });
}

export async function finishImageQuizSession(
  sessionId: string,
  result: Pick<ImageQuizSessionRecord, "correctCount" | "wrongCount" | "accuracy" | "wrongQuestionIds">,
): Promise<void> {
  const db = await getDb();
  const session = await db.get("imageQuizSessions", sessionId);
  if (!session) {
    return;
  }
  await db.put("imageQuizSessions", {
    ...session,
    ...result,
    finishedAt: new Date().toISOString(),
  });
}

export async function settleImageQuizSession(sessionId: string): Promise<ImageQuizSessionRecord | undefined> {
  const db = await getDb();
  const session = await db.get("imageQuizSessions", sessionId);
  if (!session) {
    return undefined;
  }

  const settledSession: ImageQuizSessionRecord = {
    ...session,
    ...summarizeImageAnswers(session.answers),
    lastSettledAt: new Date().toISOString(),
  };
  await db.put("imageQuizSessions", settledSession);
  return settledSession;
}

export async function deleteImageQuizSessions(sessionIds: string[]): Promise<void> {
  if (sessionIds.length === 0) {
    return;
  }

  const db = await getDb();
  const tx = db.transaction("imageQuizSessions", "readwrite");
  await Promise.all(sessionIds.map((sessionId) => tx.store.delete(sessionId)));
  await tx.done;
}

export async function clearChapterMemory(ref: {
  bankId: string;
  chapter: string;
  progressScopeId?: string;
}): Promise<void> {
  const { db, userId } = await getDbContext();
  const [answers, wrongQuestions] = await Promise.all([db.getAll("userAnswers"), db.getAll("wrongQuestions")]);
  const answerIds = answers
    .filter((answer) => answer.bankId === ref.bankId && answer.chapter === ref.chapter)
    .map((answer) => answer.questionId);
  const wrongIds = wrongQuestions
    .filter((wrongQuestion) => wrongQuestion.bankId === ref.bankId && wrongQuestion.chapter === ref.chapter)
    .map((wrongQuestion) => wrongQuestion.questionId);
  if (answerIds.length > 0) {
    await enqueueCloudMutation(userId, { kind: "delete-many", table: "user_answer_records", column: "question_id", values: answerIds });
  }
  if (wrongIds.length > 0) {
    await enqueueCloudMutation(userId, { kind: "delete-many", table: "user_wrong_records", column: "question_id", values: wrongIds });
  }
  if (ref.progressScopeId) {
    await enqueueCloudMutation(userId, { kind: "delete-progress", scopeId: ref.progressScopeId });
  }
  await Promise.all([
    ...answerIds.map((questionId) => db.delete("userAnswers", questionId)),
    ...wrongIds.map((questionId) => db.delete("wrongQuestions", questionId)),
    ref.progressScopeId ? db.delete("quizProgress", ref.progressScopeId) : Promise.resolve(),
  ]);
}

export async function clearSelectedUserRecords(options: ClearSelectedUserRecordsOptions): Promise<void> {
  const parts = new Set(options.parts);
  const questionIds = new Set(options.questionIds);
  const progressScopeIds = new Set(options.progressScopeIds);
  const sessionBankIds = new Set(options.sessionBankIds);
  if (parts.size === 0 || (questionIds.size === 0 && progressScopeIds.size === 0 && sessionBankIds.size === 0)) {
    return;
  }

  const { db, userId } = await getDbContext();

  if (parts.has("answers")) {
    const answers = await db.getAll("userAnswers");
    const ids = answers.filter((answer) => questionIds.has(answer.questionId)).map((answer) => answer.questionId);
    if (ids.length > 0) {
      await enqueueCloudMutation(userId, { kind: "delete-many", table: "user_answer_records", column: "question_id", values: ids });
    }
    await Promise.all(ids.map((questionId) => db.delete("userAnswers", questionId)));
  }

  if (parts.has("wrong")) {
    const wrongQuestions = await db.getAll("wrongQuestions");
    const ids = wrongQuestions.filter((wrongQuestion) => questionIds.has(wrongQuestion.questionId)).map((wrongQuestion) => wrongQuestion.questionId);
    if (ids.length > 0) {
      await enqueueCloudMutation(userId, { kind: "delete-many", table: "user_wrong_records", column: "question_id", values: ids });
    }
    await Promise.all(ids.map((questionId) => db.delete("wrongQuestions", questionId)));
  }

  if (parts.has("favorites")) {
    const favoriteQuestions = await db.getAll("favoriteQuestions");
    const ids = favoriteQuestions.filter((favoriteQuestion) => questionIds.has(favoriteQuestion.questionId)).map((favoriteQuestion) => favoriteQuestion.questionId);
    if (ids.length > 0) {
      await enqueueCloudMutation(userId, { kind: "delete-many", table: "user_favorite_records", column: "question_id", values: ids });
    }
    await Promise.all(ids.map((questionId) => db.delete("favoriteQuestions", questionId)));
  }

  if (parts.has("progress")) {
    const progressRecords = await db.getAll("quizProgress");
    const progressIds = progressRecords
      .filter(
        (progress) =>
          progressScopeIds.has(progress.scopeId) ||
          Array.from(sessionBankIds).some((bankId) => progress.scopeId.startsWith(`image:random:${bankId}:`)),
      )
      .map((progress) => progress.scopeId);
    if (progressIds.length > 0) {
      await enqueueCloudMutation(userId, { kind: "delete-many", table: "user_quiz_progress", column: "scope_id", values: progressIds });
    }
    await Promise.all(progressIds.map((scopeId) => db.delete("quizProgress", scopeId)));
  }

  if (parts.has("sessions")) {
    const imageSessions = await db.getAll("imageQuizSessions");
    await Promise.all(
      imageSessions
        .filter(
          (session) =>
            sessionBankIds.has(session.bankId) || session.questionIds.some((questionId) => questionIds.has(questionId)),
        )
        .map((session) => db.delete("imageQuizSessions", session.sessionId)),
    );

    if (options.clearLegacyQuizSessions) {
      await enqueueCloudMutation(userId, { kind: "clear-table", table: "user_quiz_sessions" });
      await db.clear("quizSessions");
    }
  }
}

export async function clearAllUserRecords(): Promise<void> {
  const { db, userId } = await getDbContext();
  await enqueueCloudMutation(userId, { kind: "clear-table", table: "user_answer_records" });
  await enqueueCloudMutation(userId, { kind: "clear-table", table: "user_wrong_records" });
  await enqueueCloudMutation(userId, { kind: "clear-table", table: "user_favorite_records" });
  await enqueueCloudMutation(userId, { kind: "clear-table", table: "user_quiz_progress" });
  await enqueueCloudMutation(userId, { kind: "clear-table", table: "user_quiz_sessions" });
  const tx = db.transaction(
    ["userAnswers", "wrongQuestions", "favoriteQuestions", "quizSessions", "quizProgress", "imageQuizSessions"],
    "readwrite"
  );
  await Promise.all([
    tx.objectStore("userAnswers").clear(),
    tx.objectStore("wrongQuestions").clear(),
    tx.objectStore("favoriteQuestions").clear(),
    tx.objectStore("quizSessions").clear(),
    tx.objectStore("quizProgress").clear(),
    tx.objectStore("imageQuizSessions").clear()
  ]);
  await tx.done;
}
