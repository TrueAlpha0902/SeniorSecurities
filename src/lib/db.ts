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

export type StoredImageAnswer = {
  selected: NumericAnswer;
  correct: NumericAnswer;
  isCorrect: boolean;
  answeredAt: string;
};

export type ImageQuizSessionRecord = {
  sessionId: string;
  mode: "random80";
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

const DB_NAME = "ipad-quiz-pwa";
const DB_VERSION = 3;
const SYNC_READY_PREFIX = "quizpwa:cloud-sync-initialized";
const LAST_SYNC_PREFIX = "quizpwa:last-cloud-sync";

export type QuizProgressRecord = {
  scopeId: string;
  currentIndex: number;
  totalQuestions: number;
  updatedAt: string;
};

let dbPromise: Promise<IDBPDatabase<QuizPwaDatabase>> | undefined;

const numericToAnswerKey: Record<NumericAnswer, AnswerKey> = {
  "1": "A",
  "2": "B",
  "3": "C",
  "4": "D"
};

function getDb(): Promise<IDBPDatabase<QuizPwaDatabase>> {
  dbPromise ??= openDB<QuizPwaDatabase>(DB_NAME, DB_VERSION, {
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
  return dbPromise;
}

function syncKey(prefix: string, userId: string): string {
  return `${prefix}:${userId}`;
}

async function getCurrentUserId(): Promise<string | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.auth.getUser();
  if (error || !data.user) return null;
  return data.user.id;
}

function isCloudSyncTableMissing(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String((error as any)?.message || error || "");
  return [
    "user_answer_records",
    "user_wrong_records",
    "user_favorite_records",
    "user_quiz_progress",
    "user_quiz_sessions",
  ].some((table) => message.includes(table));
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String((error as any)?.message || error || "未知錯誤");
}

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

function fromAnswerRow(row: any): UserAnswer {
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

function fromWrongRow(row: any): WrongQuestionRecord {
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

function fromFavoriteRow(row: any): FavoriteQuestionRecord {
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

function fromProgressRow(row: any): QuizProgressRecord {
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

function fromSessionRow(row: any): QuizSession {
  return {
    sessionId: String(row.session_id),
    mode: row.mode,
    startedAt: String(row.started_at),
    finishedAt: String(row.finished_at),
    totalQuestions: Number(row.total_questions ?? 0),
    correctCount: Number(row.correct_count ?? 0),
    wrongCount: Number(row.wrong_count ?? 0),
    accuracy: Number(row.accuracy ?? 0),
  } as QuizSession;
}

async function replaceLocalStore<T extends keyof QuizPwaDatabase>(storeName: T, records: QuizPwaDatabase[T]["value"][]): Promise<void> {
  const db = await getDb();
  const tx = db.transaction(storeName as any, "readwrite");
  await tx.store.clear();
  await Promise.all(records.map((record) => tx.store.put(record as any)));
  await tx.done;
}

async function uploadLocalRecordsToCloud(userId: string): Promise<void> {
  if (!supabase) return;
  const db = await getDb();
  const [answers, wrongQuestions, favoriteQuestions, progressRecords, sessions] = await Promise.all([
    db.getAll("userAnswers"),
    db.getAll("wrongQuestions"),
    db.getAll("favoriteQuestions"),
    db.getAll("quizProgress"),
    db.getAll("quizSessions"),
  ]);

  if (answers.length > 0) {
    const { error } = await supabase.from("user_answer_records").upsert(answers.map((answer) => toAnswerRow(userId, answer)), { onConflict: "user_id,question_id" });
    if (error) throw error;
  }
  if (wrongQuestions.length > 0) {
    const { error } = await supabase.from("user_wrong_records").upsert(wrongQuestions.map((record) => toWrongRow(userId, record)), { onConflict: "user_id,question_id" });
    if (error) throw error;
  }
  if (favoriteQuestions.length > 0) {
    const { error } = await supabase.from("user_favorite_records").upsert(favoriteQuestions.map((record) => toFavoriteRow(userId, record)), { onConflict: "user_id,question_id" });
    if (error) throw error;
  }
  if (progressRecords.length > 0) {
    const { error } = await supabase.from("user_quiz_progress").upsert(progressRecords.map((record) => toProgressRow(userId, record)), { onConflict: "user_id,scope_id" });
    if (error) throw error;
  }
  if (sessions.length > 0) {
    const { error } = await supabase.from("user_quiz_sessions").upsert(sessions.map((session) => toSessionRow(userId, session)), { onConflict: "user_id,session_id" });
    if (error) throw error;
  }
}

async function importCloudRecordsToLocal(userId: string): Promise<void> {
  if (!supabase) return;

  const [answers, wrongQuestions, favoriteQuestions, progressRecords, sessions] = await Promise.all([
    supabase.from("user_answer_records").select("question_id, selected_answer, correct_answer, is_correct, answered_at, bank_id, chapter").eq("user_id", userId),
    supabase.from("user_wrong_records").select("question_id, bank_id, chapter, last_wrong_at, wrong_count").eq("user_id", userId),
    supabase.from("user_favorite_records").select("question_id, bank_id, chapter, created_at").eq("user_id", userId),
    supabase.from("user_quiz_progress").select("scope_id, current_index, total_questions, updated_at").eq("user_id", userId),
    supabase.from("user_quiz_sessions").select("session_id, mode, started_at, finished_at, total_questions, correct_count, wrong_count, accuracy").eq("user_id", userId),
  ]);

  const firstError = answers.error || wrongQuestions.error || favoriteQuestions.error || progressRecords.error || sessions.error;
  if (firstError) throw firstError;

  await Promise.all([
    replaceLocalStore("userAnswers", (answers.data || []).map(fromAnswerRow)),
    replaceLocalStore("wrongQuestions", (wrongQuestions.data || []).map(fromWrongRow)),
    replaceLocalStore("favoriteQuestions", (favoriteQuestions.data || []).map(fromFavoriteRow)),
    replaceLocalStore("quizProgress", (progressRecords.data || []).map(fromProgressRow)),
    replaceLocalStore("quizSessions", (sessions.data || []).map(fromSessionRow)),
  ]);
}

async function tryImportCloudRecordsToLocal(): Promise<void> {
  const userId = await getCurrentUserId();
  if (!userId) return;
  try {
    await importCloudRecordsToLocal(userId);
  } catch (error) {
    if (!isCloudSyncTableMissing(error)) {
      console.warn("Cloud record import failed", error);
    }
  }
}

async function upsertCloudAnswer(userAnswer: UserAnswer): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from("user_answer_records").upsert(toAnswerRow(userId, userAnswer), { onConflict: "user_id,question_id" });
  if (error) throw error;
}

async function upsertCloudWrong(record: WrongQuestionRecord): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from("user_wrong_records").upsert(toWrongRow(userId, record), { onConflict: "user_id,question_id" });
  if (error) throw error;
}

async function deleteCloudWrong(questionId: string): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from("user_wrong_records").delete().eq("user_id", userId).eq("question_id", questionId);
  if (error) throw error;
}

async function getCloudFavorite(questionId: string): Promise<FavoriteQuestionRecord | undefined> {
  if (!supabase) return undefined;
  const userId = await getCurrentUserId();
  if (!userId) return undefined;
  const { data, error } = await supabase
    .from("user_favorite_records")
    .select("question_id, bank_id, chapter, created_at")
    .eq("user_id", userId)
    .eq("question_id", questionId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromFavoriteRow(data) : undefined;
}

async function upsertCloudFavorite(record: FavoriteQuestionRecord): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from("user_favorite_records").upsert(toFavoriteRow(userId, record), { onConflict: "user_id,question_id" });
  if (error) throw error;
}

async function deleteCloudFavorite(questionId: string): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from("user_favorite_records").delete().eq("user_id", userId).eq("question_id", questionId);
  if (error) throw error;
}

async function upsertCloudProgress(record: QuizProgressRecord): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from("user_quiz_progress").upsert(toProgressRow(userId, record), { onConflict: "user_id,scope_id" });
  if (error) throw error;
}

async function getCloudProgress(scopeId: string): Promise<QuizProgressRecord | undefined> {
  if (!supabase) return undefined;
  const userId = await getCurrentUserId();
  if (!userId) return undefined;
  const { data, error } = await supabase
    .from("user_quiz_progress")
    .select("scope_id, current_index, total_questions, updated_at")
    .eq("user_id", userId)
    .eq("scope_id", scopeId)
    .maybeSingle();
  if (error) throw error;
  return data ? fromProgressRow(data) : undefined;
}

async function deleteCloudProgress(scopeId: string): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from("user_quiz_progress").delete().eq("user_id", userId).eq("scope_id", scopeId);
  if (error) throw error;
}

async function upsertCloudSession(session: QuizSession): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from("user_quiz_sessions").upsert(toSessionRow(userId, session), { onConflict: "user_id,session_id" });
  if (error) throw error;
}

async function deleteCloudRecords(tableName: string, columnName: string, values: string[]): Promise<void> {
  if (!supabase || values.length === 0) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from(tableName).delete().eq("user_id", userId).in(columnName, values);
  if (error) throw error;
}

async function clearCloudTable(tableName: string): Promise<void> {
  if (!supabase) return;
  const userId = await getCurrentUserId();
  if (!userId) return;
  const { error } = await supabase.from(tableName).delete().eq("user_id", userId);
  if (error) throw error;
}

async function safeCloudWrite(operation: () => Promise<void>): Promise<void> {
  try {
    await operation();
  } catch (error) {
    if (!isCloudSyncTableMissing(error)) {
      console.warn("Cloud record sync failed", error);
    }
  }
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
  const db = await getDb();
  const [answers, wrong, favorites, progress, sessions] = await Promise.all([
    db.count("userAnswers"),
    db.count("wrongQuestions"),
    db.count("favoriteQuestions"),
    db.count("quizProgress"),
    db.count("quizSessions"),
  ]);

  const base: CloudSyncSummary = {
    local: { answers, wrong, favorites, progress, sessions },
    cloud: { answers: 0, wrong: 0, favorites: 0, progress: 0, sessions: 0 },
    cloudAvailable: false,
    syncedAt: null,
    error: null,
  };

  const userId = await getCurrentUserId();
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
      syncedAt: window.localStorage.getItem(syncKey(LAST_SYNC_PREFIX, userId)),
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
  const userId = await getCurrentUserId();
  if (!userId) {
    return getSyncedRecordSummary();
  }

  const initializedKey = syncKey(SYNC_READY_PREFIX, userId);
  const shouldUpload = options.forceUpload || window.localStorage.getItem(initializedKey) !== "true";

  if (shouldUpload) {
    await uploadLocalRecordsToCloud(userId);
  }

  await importCloudRecordsToLocal(userId);
  const syncedAt = new Date().toISOString();
  window.localStorage.setItem(initializedKey, "true");
  window.localStorage.setItem(syncKey(LAST_SYNC_PREFIX, userId), syncedAt);
  return getSyncedRecordSummary();
}


async function updateLeaderboardAfterAnswer(isCorrect: boolean): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("record_leaderboard_answer", { p_is_correct: isCorrect });
  if (error) throw error;
}

export async function recordUserAnswer(question: Question, selectedAnswer: AnswerKey): Promise<UserAnswer> {
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

  const db = await getDb();
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

  await tx.done;
  await safeCloudWrite(async () => {
    await upsertCloudAnswer(userAnswer);
    if (wrongRecord) {
      await upsertCloudWrong(wrongRecord);
    } else {
      await deleteCloudWrong(question.id);
    }
    await updateLeaderboardAfterAnswer(isCorrect);
  });
  return userAnswer;
}

export async function recordImageUserAnswer(
  question: ImageQuizQuestion,
  selectedAnswer: NumericAnswer
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

  const db = await getDb();
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

  await tx.done;
  await safeCloudWrite(async () => {
    await upsertCloudAnswer(userAnswer);
    if (wrongRecord) {
      await upsertCloudWrong(wrongRecord);
    } else {
      await deleteCloudWrong(question.id);
    }
    await updateLeaderboardAfterAnswer(isCorrect);
  });
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
  const db = await getDb();
  await db.clear("wrongQuestions");
  await safeCloudWrite(() => clearCloudTable("user_wrong_records"));
}

export async function removeWrongQuestion(questionId: string): Promise<void> {
  const db = await getDb();
  await db.delete("wrongQuestions", questionId);
  await safeCloudWrite(() => deleteCloudWrong(questionId));
}

export async function listFavoriteQuestions(): Promise<FavoriteQuestionRecord[]> {
  await tryImportCloudRecordsToLocal();
  const db = await getDb();
  const records = await db.getAll("favoriteQuestions");
  return records.sort((left, right) => right.createdAt.localeCompare(left.createdAt));
}

export async function getFavoriteQuestion(questionId: string): Promise<FavoriteQuestionRecord | undefined> {
  const db = await getDb();
  try {
    const cloudFavorite = await getCloudFavorite(questionId);
    if (cloudFavorite) {
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
  const db = await getDb();
  const existing = await getFavoriteQuestion(ref.questionId);
  if (existing) {
    await db.delete("favoriteQuestions", ref.questionId);
    await safeCloudWrite(() => deleteCloudFavorite(ref.questionId));
    return false;
  }

  const favorite: FavoriteQuestionRecord = {
    questionId: ref.questionId,
    bankId: ref.bankId,
    chapter: ref.chapter,
    createdAt: new Date().toISOString()
  };
  await db.put("favoriteQuestions", favorite);
  await safeCloudWrite(() => upsertCloudFavorite(favorite));
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
  const db = await getDb();
  await db.delete("favoriteQuestions", questionId);
  await safeCloudWrite(() => deleteCloudFavorite(questionId));
}

export async function saveQuizSession(session: QuizSession): Promise<void> {
  const db = await getDb();
  await db.put("quizSessions", session);
  await safeCloudWrite(() => upsertCloudSession(session));
}

export async function getQuizProgress(scopeId: string): Promise<QuizProgressRecord | undefined> {
  const db = await getDb();
  try {
    const cloudProgress = await getCloudProgress(scopeId);
    if (cloudProgress) {
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
  const db = await getDb();
  await db.put("quizProgress", record);
  await safeCloudWrite(() => upsertCloudProgress(record));
}

export async function clearQuizProgress(scopeId: string): Promise<void> {
  const db = await getDb();
  await db.delete("quizProgress", scopeId);
  await safeCloudWrite(() => deleteCloudProgress(scopeId));
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
  const db = await getDb();
  const [answers, wrongQuestions] = await Promise.all([db.getAll("userAnswers"), db.getAll("wrongQuestions")]);
  const answerIds = answers
    .filter((answer) => answer.bankId === ref.bankId && answer.chapter === ref.chapter)
    .map((answer) => answer.questionId);
  const wrongIds = wrongQuestions
    .filter((wrongQuestion) => wrongQuestion.bankId === ref.bankId && wrongQuestion.chapter === ref.chapter)
    .map((wrongQuestion) => wrongQuestion.questionId);
  await Promise.all([
    ...answerIds.map((questionId) => db.delete("userAnswers", questionId)),
    ...wrongIds.map((questionId) => db.delete("wrongQuestions", questionId)),
    ref.progressScopeId ? db.delete("quizProgress", ref.progressScopeId) : Promise.resolve(),
  ]);
  await safeCloudWrite(async () => {
    await deleteCloudRecords("user_answer_records", "question_id", answerIds);
    await deleteCloudRecords("user_wrong_records", "question_id", wrongIds);
    if (ref.progressScopeId) await deleteCloudProgress(ref.progressScopeId);
  });
}

export async function clearSelectedUserRecords(options: ClearSelectedUserRecordsOptions): Promise<void> {
  const parts = new Set(options.parts);
  const questionIds = new Set(options.questionIds);
  const progressScopeIds = new Set(options.progressScopeIds);
  const sessionBankIds = new Set(options.sessionBankIds);
  if (parts.size === 0 || (questionIds.size === 0 && progressScopeIds.size === 0 && sessionBankIds.size === 0)) {
    return;
  }

  const db = await getDb();

  if (parts.has("answers")) {
    const answers = await db.getAll("userAnswers");
    const ids = answers.filter((answer) => questionIds.has(answer.questionId)).map((answer) => answer.questionId);
    await Promise.all(ids.map((questionId) => db.delete("userAnswers", questionId)));
    await safeCloudWrite(() => deleteCloudRecords("user_answer_records", "question_id", ids));
  }

  if (parts.has("wrong")) {
    const wrongQuestions = await db.getAll("wrongQuestions");
    const ids = wrongQuestions.filter((wrongQuestion) => questionIds.has(wrongQuestion.questionId)).map((wrongQuestion) => wrongQuestion.questionId);
    await Promise.all(ids.map((questionId) => db.delete("wrongQuestions", questionId)));
    await safeCloudWrite(() => deleteCloudRecords("user_wrong_records", "question_id", ids));
  }

  if (parts.has("favorites")) {
    const favoriteQuestions = await db.getAll("favoriteQuestions");
    const ids = favoriteQuestions.filter((favoriteQuestion) => questionIds.has(favoriteQuestion.questionId)).map((favoriteQuestion) => favoriteQuestion.questionId);
    await Promise.all(ids.map((questionId) => db.delete("favoriteQuestions", questionId)));
    await safeCloudWrite(() => deleteCloudRecords("user_favorite_records", "question_id", ids));
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
    await Promise.all(progressIds.map((scopeId) => db.delete("quizProgress", scopeId)));
    await safeCloudWrite(() => deleteCloudRecords("user_quiz_progress", "scope_id", progressIds));
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
      await db.clear("quizSessions");
      await safeCloudWrite(() => clearCloudTable("user_quiz_sessions"));
    }
  }
}

export async function clearAllUserRecords(): Promise<void> {
  const db = await getDb();
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
  await safeCloudWrite(async () => {
    await clearCloudTable("user_answer_records");
    await clearCloudTable("user_wrong_records");
    await clearCloudTable("user_favorite_records");
    await clearCloudTable("user_quiz_progress");
    await clearCloudTable("user_quiz_sessions");
  });
}
