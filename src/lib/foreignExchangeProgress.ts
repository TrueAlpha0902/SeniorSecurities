import type { ForeignExchangeAnswerKey } from "./foreignExchange";
import { readScopedStorageItem, writeScopedStorageItem } from "./userScopedStorage";

const STORAGE_KEY = "foreign-exchange:progress:v1";
export const FOREIGN_EXCHANGE_PROGRESS_CHANGED = "foreign-exchange:progress-changed";

type StoredAnswer = {
  selectedAnswer: ForeignExchangeAnswerKey;
  correctAnswer: ForeignExchangeAnswerKey;
  isCorrect: boolean;
  answeredAt: string;
};

export type ForeignExchangeProgress = {
  version: 1;
  answers: Record<string, StoredAnswer>;
  favorites: string[];
};

const EMPTY_PROGRESS: ForeignExchangeProgress = { version: 1, answers: {}, favorites: [] };

function sanitize(value: unknown): ForeignExchangeProgress {
  if (!value || typeof value !== "object") return { ...EMPTY_PROGRESS, answers: {}, favorites: [] };
  const source = value as Partial<ForeignExchangeProgress>;
  const answers: Record<string, StoredAnswer> = {};
  if (source.answers && typeof source.answers === "object") {
    for (const [id, record] of Object.entries(source.answers)) {
      if (!/^fx-(45|46|47)-(remittance|trade)-\d{3}$/.test(id) || !record || typeof record !== "object") continue;
      const candidate = record as Partial<StoredAnswer>;
      if (!["A", "B", "C", "D"].includes(String(candidate.selectedAnswer))) continue;
      if (!["A", "B", "C", "D"].includes(String(candidate.correctAnswer))) continue;
      answers[id] = {
        selectedAnswer: candidate.selectedAnswer as ForeignExchangeAnswerKey,
        correctAnswer: candidate.correctAnswer as ForeignExchangeAnswerKey,
        isCorrect: Boolean(candidate.isCorrect),
        answeredAt: typeof candidate.answeredAt === "string" ? candidate.answeredAt : new Date(0).toISOString(),
      };
    }
  }
  const favorites = Array.from(new Set((Array.isArray(source.favorites) ? source.favorites : [])
    .filter((id): id is string => typeof id === "string" && /^fx-(45|46|47)-(remittance|trade)-\d{3}$/.test(id))));
  return { version: 1, answers, favorites };
}

export function readForeignExchangeProgress(): ForeignExchangeProgress {
  const raw = readScopedStorageItem(STORAGE_KEY, false);
  if (!raw) return { ...EMPTY_PROGRESS, answers: {}, favorites: [] };
  try {
    return sanitize(JSON.parse(raw));
  } catch {
    return { ...EMPTY_PROGRESS, answers: {}, favorites: [] };
  }
}

function writeProgress(progress: ForeignExchangeProgress): void {
  writeScopedStorageItem(STORAGE_KEY, JSON.stringify(progress));
  window.dispatchEvent(new CustomEvent(FOREIGN_EXCHANGE_PROGRESS_CHANGED));
}

export function recordForeignExchangeAnswer(args: {
  questionId: string;
  selectedAnswer: ForeignExchangeAnswerKey;
  correctAnswer: ForeignExchangeAnswerKey;
}): void {
  const progress = readForeignExchangeProgress();
  progress.answers[args.questionId] = {
    selectedAnswer: args.selectedAnswer,
    correctAnswer: args.correctAnswer,
    isCorrect: args.selectedAnswer === args.correctAnswer,
    answeredAt: new Date().toISOString(),
  };
  writeProgress(progress);
}

export function recordForeignExchangeAnswers(records: Array<{
  questionId: string;
  selectedAnswer: ForeignExchangeAnswerKey;
  correctAnswer: ForeignExchangeAnswerKey;
}>): void {
  const progress = readForeignExchangeProgress();
  const answeredAt = new Date().toISOString();
  for (const record of records) {
    progress.answers[record.questionId] = {
      selectedAnswer: record.selectedAnswer,
      correctAnswer: record.correctAnswer,
      isCorrect: record.selectedAnswer === record.correctAnswer,
      answeredAt,
    };
  }
  writeProgress(progress);
}

export function toggleForeignExchangeFavorite(questionId: string): boolean {
  const progress = readForeignExchangeProgress();
  const favorites = new Set(progress.favorites);
  const nextFavorite = !favorites.has(questionId);
  if (nextFavorite) favorites.add(questionId);
  else favorites.delete(questionId);
  progress.favorites = [...favorites];
  writeProgress(progress);
  return nextFavorite;
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
    wrong: answered - correct,
    favorites: progress.favorites.length,
    accuracy: answered ? Math.round((correct / answered) * 100) : 0,
  };
}

export function foreignExchangeWrongIds(): string[] {
  const progress = readForeignExchangeProgress();
  return Object.entries(progress.answers)
    .filter(([, record]) => !record.isCorrect)
    .map(([questionId]) => questionId);
}

export function foreignExchangeFavoriteIds(): string[] {
  return readForeignExchangeProgress().favorites;
}
