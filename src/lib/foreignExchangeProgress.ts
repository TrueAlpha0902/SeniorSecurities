import {
  FOREIGN_EXCHANGE_QUESTION_ID_PATTERN,
  type ForeignExchangeAnswerKey,
} from "./foreignExchange";
import {
  clearSelectedUserRecords,
  listFavoriteQuestions,
  listUserAnswers,
  listWrongQuestions,
  recordExternalUserAnswers,
  setFavoriteRef,
} from "./db";
import type { UserAnswer } from "../types";
import { readScopedStorageItem, writeScopedStorageItem } from "./userScopedStorage";

const STORAGE_KEY = "foreign-exchange:progress:v1";
const CLOUD_MIGRATION_KEY = "foreign-exchange:cloud-migrated:v1";
export const FOREIGN_EXCHANGE_PROGRESS_CHANGED = "foreign-exchange:progress-changed";

type StoredAnswer = {
  selectedAnswer: ForeignExchangeAnswerKey;
  correctAnswer: ForeignExchangeAnswerKey;
  isCorrect: boolean;
  answeredAt: string;
};

export type ForeignExchangeProgress = {
  version: 2;
  answers: Record<string, StoredAnswer>;
  favorites: string[];
  wrongReviewIds: string[];
};

type AnswerRecordInput = {
  questionId: string;
  selectedAnswer: ForeignExchangeAnswerKey;
  correctAnswer: ForeignExchangeAnswerKey;
  isCorrect?: boolean;
};

const EMPTY_PROGRESS: ForeignExchangeProgress = {
  version: 2,
  answers: {},
  favorites: [],
  wrongReviewIds: [],
};
const ANSWER_KEYS = ["A", "B", "C", "D"] as const;

function sanitize(value: unknown): ForeignExchangeProgress {
  if (!value || typeof value !== "object") return { ...EMPTY_PROGRESS, answers: {}, favorites: [], wrongReviewIds: [] };
  const source = value as Partial<ForeignExchangeProgress>;
  const answers: Record<string, StoredAnswer> = {};
  if (source.answers && typeof source.answers === "object") {
    for (const [id, record] of Object.entries(source.answers)) {
      if (!FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(id) || !record || typeof record !== "object") continue;
      const candidate = record as Partial<StoredAnswer>;
      if (!ANSWER_KEYS.includes(candidate.selectedAnswer as ForeignExchangeAnswerKey)) continue;
      if (!ANSWER_KEYS.includes(candidate.correctAnswer as ForeignExchangeAnswerKey)) continue;
      answers[id] = {
        selectedAnswer: candidate.selectedAnswer as ForeignExchangeAnswerKey,
        correctAnswer: candidate.correctAnswer as ForeignExchangeAnswerKey,
        isCorrect: Boolean(candidate.isCorrect),
        answeredAt: typeof candidate.answeredAt === "string" ? candidate.answeredAt : new Date(0).toISOString(),
      };
    }
  }
  const favorites = Array.from(new Set((Array.isArray(source.favorites) ? source.favorites : [])
    .filter((id): id is string => typeof id === "string" && FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(id))));
  const explicitWrongIds = Array.isArray((source as Partial<ForeignExchangeProgress>).wrongReviewIds)
    ? (source as Partial<ForeignExchangeProgress>).wrongReviewIds ?? []
    : Object.entries(answers)
        .filter(([, answer]) => !answer.isCorrect)
        .map(([questionId]) => questionId);
  const wrongReviewIds = Array.from(new Set(explicitWrongIds
    .filter((id): id is string => typeof id === "string" && FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(id))));
  return { version: 2, answers, favorites, wrongReviewIds };
}

export function readForeignExchangeProgress(): ForeignExchangeProgress {
  const raw = readScopedStorageItem(STORAGE_KEY, false);
  if (!raw) return { ...EMPTY_PROGRESS, answers: {}, favorites: [], wrongReviewIds: [] };
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...EMPTY_PROGRESS, answers: {}, favorites: [], wrongReviewIds: [] };
  }
}

function questionRef(questionId: string): { bankId: string; chapter: string } | null {
  const match = questionId.match(FOREIGN_EXCHANGE_QUESTION_ID_PATTERN);
  if (!match) return null;
  const session = match[1];
  const subject = match[2];
  return { bankId: `fx-${subject}`, chapter: `session-${session}` };
}

function toCloudAnswer(
  record: AnswerRecordInput,
  answeredAt: string,
): UserAnswer | null {
  const ref = questionRef(record.questionId);
  if (!ref) return null;
  return {
    questionId: record.questionId,
    selectedAnswer: record.selectedAnswer,
    correctAnswer: record.correctAnswer,
    isCorrect: record.isCorrect ?? record.selectedAnswer === record.correctAnswer,
    answeredAt,
    bankId: ref.bankId,
    chapter: ref.chapter,
  };
}

function mirrorAnswersToSyncedStore(records: readonly AnswerRecordInput[], answeredAt: string): void {
  const cloudRecords = records
    .map((record) => toCloudAnswer(record, answeredAt))
    .filter((record): record is UserAnswer => Boolean(record));
  if (!cloudRecords.length) return;
  void recordExternalUserAnswers(cloudRecords).catch((error) => {
    console.warn("Foreign-exchange answers remain local until cloud sync retries", error);
  });
}

function mirrorFavoriteToSyncedStore(questionId: string, favorite: boolean): void {
  const ref = questionRef(questionId);
  if (!ref) return;
  void setFavoriteRef({ questionId, ...ref }, favorite).catch((error) => {
    console.warn("Foreign-exchange favorite remains local until cloud sync retries", error);
  });
}

function writeProgress(progress: ForeignExchangeProgress): void {
  writeScopedStorageItem(STORAGE_KEY, JSON.stringify(progress));
  window.dispatchEvent(new CustomEvent(FOREIGN_EXCHANGE_PROGRESS_CHANGED));
}

function updateWrongReviewIds(
  progress: ForeignExchangeProgress,
  questionId: string,
  isCorrect: boolean,
): void {
  const wrongIds = new Set(progress.wrongReviewIds);
  if (isCorrect) wrongIds.delete(questionId);
  else wrongIds.add(questionId);
  progress.wrongReviewIds = [...wrongIds];
}

function toStoredAnswer(record: AnswerRecordInput, answeredAt: string): StoredAnswer {
  return {
    selectedAnswer: record.selectedAnswer,
    correctAnswer: record.correctAnswer,
    isCorrect: record.isCorrect ?? record.selectedAnswer === record.correctAnswer,
    answeredAt,
  };
}

export function recordForeignExchangeAnswer(record: AnswerRecordInput): void {
  const progress = readForeignExchangeProgress();
  const answeredAt = new Date().toISOString();
  const stored = toStoredAnswer(record, answeredAt);
  progress.answers[record.questionId] = stored;
  updateWrongReviewIds(progress, record.questionId, stored.isCorrect);
  writeProgress(progress);
  mirrorAnswersToSyncedStore([record], answeredAt);
}

export function recordForeignExchangeAnswers(records: AnswerRecordInput[]): void {
  const progress = readForeignExchangeProgress();
  const answeredAt = new Date().toISOString();
  for (const record of records) {
    const stored = toStoredAnswer(record, answeredAt);
    progress.answers[record.questionId] = stored;
    updateWrongReviewIds(progress, record.questionId, stored.isCorrect);
  }
  writeProgress(progress);
  mirrorAnswersToSyncedStore(records, answeredAt);
}

export function toggleForeignExchangeFavorite(questionId: string): boolean {
  if (!FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(questionId)) return false;
  const progress = readForeignExchangeProgress();
  const favorites = new Set(progress.favorites);
  const nextFavorite = !favorites.has(questionId);
  if (nextFavorite) favorites.add(questionId);
  else favorites.delete(questionId);
  progress.favorites = [...favorites];
  writeProgress(progress);
  mirrorFavoriteToSyncedStore(questionId, nextFavorite);
  return nextFavorite;
}


export type ForeignExchangeClearMode = "wrong" | "restart" | "complete";

export function resetForeignExchangeProgressState(
  progress: ForeignExchangeProgress,
  mode: ForeignExchangeClearMode,
): ForeignExchangeProgress {
  if (mode === "wrong") {
    return {
      version: 2,
      answers: { ...progress.answers },
      favorites: [...progress.favorites],
      wrongReviewIds: [],
    };
  }
  return {
    version: 2,
    answers: {},
    favorites: mode === "complete" ? [] : [...progress.favorites],
    wrongReviewIds: [],
  };
}

export async function clearForeignExchangeProgress(
  mode: ForeignExchangeClearMode = "complete",
  options: { localOnly?: boolean } = {},
): Promise<void> {
  const current = readForeignExchangeProgress();
  const localWrongIds = [...current.wrongReviewIds];

  if (options.localOnly) {
    writeProgress(resetForeignExchangeProgressState(current, mode));
    if (mode !== "wrong") {
      for (const key of Object.keys(localStorage)) {
        if (
          key.includes("quizpwa:fx-mock:v2:") ||
          key.includes("foreign-exchange:mock:")
        ) {
          localStorage.removeItem(key);
        }
      }
    }
    writeScopedStorageItem(CLOUD_MIGRATION_KEY, "true");
    return;
  }

  const [answers, wrongQuestions, favorites] = await Promise.all([
    listUserAnswers().catch(() => []),
    listWrongQuestions().catch(() => []),
    listFavoriteQuestions().catch(() => []),
  ]);

  const cloudWrongIds = wrongQuestions
    .map((record) => record.questionId)
    .filter((questionId) => FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(questionId));
  const wrongIds = Array.from(new Set([...localWrongIds, ...cloudWrongIds]));

  if (mode === "wrong") {
    writeProgress(resetForeignExchangeProgressState(current, mode));
    if (wrongIds.length) {
      await clearSelectedUserRecords({
        parts: ["wrong"],
        questionIds: wrongIds,
        progressScopeIds: [],
        sessionBankIds: ["fx-remittance", "fx-trade"],
        clearLegacyQuizSessions: false,
      });
    }
    writeScopedStorageItem(CLOUD_MIGRATION_KEY, "true");
    return;
  }

  writeProgress(resetForeignExchangeProgressState(current, mode));
  for (const key of Object.keys(localStorage)) {
    if (
      key.includes("quizpwa:fx-mock:v2:") ||
      key.includes("foreign-exchange:mock:")
    ) {
      localStorage.removeItem(key);
    }
  }

  const allForeignExchangeIds = Array.from(new Set([
    ...answers.map((record) => record.questionId),
    ...wrongQuestions.map((record) => record.questionId),
    ...favorites.map((record) => record.questionId),
  ].filter((questionId) => FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(questionId))));
  const parts = mode === "restart"
    ? ["answers", "wrong", "progress", "sessions"] as const
    : ["answers", "wrong", "favorites", "progress", "sessions"] as const;

  if (allForeignExchangeIds.length) {
    await clearSelectedUserRecords({
      parts: [...parts],
      questionIds: allForeignExchangeIds,
      progressScopeIds: [],
      sessionBankIds: ["fx-remittance", "fx-trade"],
      clearLegacyQuizSessions: false,
    });
  }
  writeScopedStorageItem(CLOUD_MIGRATION_KEY, "true");
}

export async function prepareForeignExchangeCloudSync(): Promise<void> {
  if (readScopedStorageItem(CLOUD_MIGRATION_KEY, false) === "true") return;
  const progress = readForeignExchangeProgress();
  const answerRecords: UserAnswer[] = Object.entries(progress.answers)
    .map(([questionId, answer]) => {
      const ref = questionRef(questionId);
      if (!ref) return null;
      return {
        questionId,
        selectedAnswer: answer.selectedAnswer,
        correctAnswer: answer.correctAnswer,
        isCorrect: answer.isCorrect,
        answeredAt: answer.answeredAt,
        bankId: ref.bankId,
        chapter: ref.chapter,
      } satisfies UserAnswer;
    })
    .filter((record): record is UserAnswer => Boolean(record));
  await recordExternalUserAnswers(answerRecords);
  const activeWrongIds = new Set(progress.wrongReviewIds);
  const dismissedWrongIds = answerRecords
    .filter((record) => !record.isCorrect && !activeWrongIds.has(record.questionId))
    .map((record) => record.questionId);
  if (dismissedWrongIds.length) {
    await clearSelectedUserRecords({
      parts: ["wrong"],
      questionIds: dismissedWrongIds,
      progressScopeIds: [],
      sessionBankIds: [],
      clearLegacyQuizSessions: false,
    });
  }
  for (const questionId of progress.favorites) {
    const ref = questionRef(questionId);
    if (ref) await setFavoriteRef({ questionId, ...ref }, true);
  }
  writeScopedStorageItem(CLOUD_MIGRATION_KEY, "true");
}

export async function hydrateForeignExchangeProgressFromSyncedRecords(): Promise<void> {
  const [answers, wrongQuestions, favorites] = await Promise.all([
    listUserAnswers(),
    listWrongQuestions(),
    listFavoriteQuestions(),
  ]);
  const hydratedAnswers: Record<string, StoredAnswer> = {};
  for (const answer of answers) {
    if (!FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(answer.questionId)) continue;
    if (!ANSWER_KEYS.includes(answer.selectedAnswer as ForeignExchangeAnswerKey)) continue;
    if (!ANSWER_KEYS.includes(answer.correctAnswer as ForeignExchangeAnswerKey)) continue;
    hydratedAnswers[answer.questionId] = {
      selectedAnswer: answer.selectedAnswer as ForeignExchangeAnswerKey,
      correctAnswer: answer.correctAnswer as ForeignExchangeAnswerKey,
      isCorrect: answer.isCorrect,
      answeredAt: answer.answeredAt,
    };
  }
  const hydratedFavorites = favorites
    .map((favorite) => favorite.questionId)
    .filter((questionId) => FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(questionId));
  const hydratedWrongIds = wrongQuestions
    .map((record) => record.questionId)
    .filter((questionId) => FOREIGN_EXCHANGE_QUESTION_ID_PATTERN.test(questionId));
  writeProgress({
    version: 2,
    answers: hydratedAnswers,
    favorites: Array.from(new Set(hydratedFavorites)),
    wrongReviewIds: Array.from(new Set(hydratedWrongIds)),
  });
}


export type ForeignExchangeSubjectId = "remittance" | "trade";

export type ForeignExchangeSubjectProgressSummary = {
  answered: number;
  correct: number;
  wrong: number;
  favorites: number;
};

export function foreignExchangeSubjectProgress(
  subject: ForeignExchangeSubjectId,
): ForeignExchangeSubjectProgressSummary {
  const progress = readForeignExchangeProgress();
  const marker = `-${subject}-`;
  const answerEntries = Object.entries(progress.answers).filter(([questionId]) =>
    questionId.includes(marker),
  );
  return {
    answered: answerEntries.length,
    correct: answerEntries.filter(([, answer]) => answer.isCorrect).length,
    wrong: progress.wrongReviewIds.filter((questionId) => questionId.includes(marker)).length,
    favorites: progress.favorites.filter((questionId) => questionId.includes(marker)).length,
  };
}

export function foreignExchangeProgressSummary(): {
  answered: number;
  correct: number;
  wrong: number;
  favorites: number;
  accuracy: number;
} {
  const progress = readForeignExchangeProgress();
  const records = Object.values(progress.answers);
  const correct = records.filter((record) => record.isCorrect).length;
  const answered = records.length;
  return {
    answered,
    correct,
    wrong: progress.wrongReviewIds.length,
    favorites: progress.favorites.length,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
  };
}

export function foreignExchangeWrongIds(): string[] {
  const progress = readForeignExchangeProgress();
  return [...progress.wrongReviewIds];
}

export function foreignExchangeFavoriteIds(): string[] {
  return readForeignExchangeProgress().favorites;
}
