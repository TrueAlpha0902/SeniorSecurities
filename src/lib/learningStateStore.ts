import type { State } from "ts-fsrs";
import {
  loadReliabilityLearningData,
  mergeReliabilityLearningStates,
  persistReliabilityLearningUpdate,
  replaceReliabilityLearningData,
  type ReliabilityQueueEntry,
} from "./reliabilityStore";

export type AnswerConfidence = "sure" | "unsure" | "guess" | "unknown";
export type LearningStage = "new" | "learning" | "review" | "mastered";

export type LearningAttemptInput = {
  eventId: string;
  questionId: string;
  bankId: string;
  chapterId: string;
  selectedAnswer: string;
  correctAnswer: string;
  isCorrect: boolean;
  confidence: AnswerConfidence;
  answeredAt: string;
  sessionId?: string | null;
  sessionMode?: string | null;
};

export type QuestionLearningState = {
  questionId: string;
  bankId: string;
  chapterId: string;
  box: number;
  stage: LearningStage;
  nextReviewAt: string;
  successCount: number;
  lapseCount: number;
  lastConfidence: AnswerConfidence;
  lastAnsweredAt: string;
  fsrsState: State;
  difficulty: number;
  stability: number;
  elapsedDays: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lastReviewAt: string | null;
  algorithmVersion: 2;
};

export type LearningSummary = {
  total: number;
  newCount: number;
  learningCount: number;
  reviewCount: number;
  masteredCount: number;
  dueCount: number;
};

export type LocalLearningStore = {
  version: 3;
  states: Record<string, QuestionLearningState>;
  attempts: LearningAttemptInput[];
};

const LEGACY_STORE_PREFIX = "senior-securities:learning-engine:v66";
const MAX_LOCAL_ATTEMPTS = 1200;
const storeCache = new Map<string, LocalLearningStore>();
const initializationPromises = new Map<string, Promise<LocalLearningStore>>();

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function scopeKey(userId: string | null): string {
  return userId || "guest";
}

function legacyStorageKey(userId: string | null): string {
  return `${LEGACY_STORE_PREFIX}:${scopeKey(userId)}`;
}

function emptyStore(): LocalLearningStore {
  return { version: 3, states: {}, attempts: [] };
}

function finiteNumber(value: unknown, fallback: number): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function validDateIso(value: unknown, fallback: string): string {
  const date = new Date(
    typeof value === "string" || typeof value === "number" ? value : fallback,
  );
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function inferFsrsState(stage: LearningStage): State {
  if (stage === "new") return 0 as State;
  if (stage === "learning") return 1 as State;
  return 2 as State;
}

export function normalizeStoredLearningState(
  questionId: string,
  raw: unknown,
): QuestionLearningState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const answeredAt = validDateIso(
    value.lastAnsweredAt,
    new Date(0).toISOString(),
  );
  const nextReviewAt = validDateIso(value.nextReviewAt, answeredAt);
  const stageValue = value.stage;
  const stage: LearningStage =
    stageValue === "new" ||
    stageValue === "learning" ||
    stageValue === "review" ||
    stageValue === "mastered"
      ? stageValue
      : "new";
  const confidenceValue = value.lastConfidence;
  const lastConfidence: AnswerConfidence =
    confidenceValue === "sure" ||
    confidenceValue === "unsure" ||
    confidenceValue === "guess" ||
    confidenceValue === "unknown"
      ? confidenceValue
      : "sure";
  const stateNumber = finiteNumber(value.fsrsState, inferFsrsState(stage));
  const fsrsState =
    stateNumber >= 0 && stateNumber <= 3
      ? (stateNumber as State)
      : inferFsrsState(stage);
  const successCount = Math.max(
    0,
    Math.trunc(finiteNumber(value.successCount, 0)),
  );
  const lapseCount = Math.max(0, Math.trunc(finiteNumber(value.lapseCount, 0)));
  const reps = Math.max(
    0,
    Math.trunc(finiteNumber(value.reps, successCount + lapseCount)),
  );
  const scheduledDays = Math.max(
    0,
    Math.trunc(
      finiteNumber(
        value.scheduledDays,
        Math.max(
          0,
          Math.round(
            (new Date(nextReviewAt).getTime() -
              new Date(answeredAt).getTime()) /
              86_400_000,
          ),
        ),
      ),
    ),
  );

  return {
    questionId:
      typeof value.questionId === "string" && value.questionId
        ? value.questionId
        : questionId,
    bankId: typeof value.bankId === "string" ? value.bankId : "",
    chapterId: typeof value.chapterId === "string" ? value.chapterId : "",
    box: Math.min(5, Math.max(0, Math.trunc(finiteNumber(value.box, 0)))),
    stage,
    nextReviewAt,
    successCount,
    lapseCount,
    lastConfidence,
    lastAnsweredAt: answeredAt,
    fsrsState,
    difficulty: Math.max(0, finiteNumber(value.difficulty, 0)),
    stability: Math.max(0, finiteNumber(value.stability, 0)),
    elapsedDays: Math.max(0, Math.trunc(finiteNumber(value.elapsedDays, 0))),
    scheduledDays,
    learningSteps: Math.max(
      0,
      Math.trunc(finiteNumber(value.learningSteps, 0)),
    ),
    reps,
    lastReviewAt:
      value.lastReviewAt == null
        ? answeredAt
        : validDateIso(value.lastReviewAt, answeredAt),
    algorithmVersion: 2,
  };
}

function normalizeAttempt(raw: unknown): LearningAttemptInput | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Partial<LearningAttemptInput>;
  if (!value.eventId || !value.questionId || !value.answeredAt) return null;
  return {
    eventId: String(value.eventId),
    questionId: String(value.questionId),
    bankId: String(value.bankId || ""),
    chapterId: String(value.chapterId || ""),
    selectedAnswer: String(value.selectedAnswer || ""),
    correctAnswer: String(value.correctAnswer || ""),
    isCorrect: Boolean(value.isCorrect),
    confidence:
      value.confidence === "unsure" ||
      value.confidence === "guess" ||
      value.confidence === "unknown"
        ? value.confidence
        : "sure",
    answeredAt: validDateIso(value.answeredAt, new Date(0).toISOString()),
    sessionId: value.sessionId ?? null,
    sessionMode: value.sessionMode ?? null,
  };
}

function readLegacyStore(userId: string | null): LocalLearningStore | null {
  const storage = safeStorage();
  if (!storage) return null;
  try {
    const parsed = JSON.parse(
      storage.getItem(legacyStorageKey(userId)) || "null",
    ) as Record<string, unknown> | null;
    if (
      !parsed ||
      typeof parsed.states !== "object" ||
      parsed.states === null ||
      !Array.isArray(parsed.attempts)
    )
      return null;
    const states: Record<string, QuestionLearningState> = {};
    for (const [questionId, raw] of Object.entries(
      parsed.states as Record<string, unknown>,
    )) {
      const normalized = normalizeStoredLearningState(questionId, raw);
      if (normalized) states[normalized.questionId] = normalized;
    }
    const attempts = parsed.attempts
      .map(normalizeAttempt)
      .filter((attempt): attempt is LearningAttemptInput => Boolean(attempt))
      .slice(-MAX_LOCAL_ATTEMPTS);
    return { version: 3, states, attempts };
  } catch {
    return null;
  }
}

function publishLearningStore(
  userId: string | null,
  store: LocalLearningStore,
): LocalLearningStore {
  storeCache.set(scopeKey(userId), store);
  if (typeof window !== "undefined") {
    window.dispatchEvent(new CustomEvent("learning-state:changed"));
  }
  return store;
}

export async function initializeLearningStore(
  userId: string | null,
): Promise<LocalLearningStore> {
  const key = scopeKey(userId);
  const cached = storeCache.get(key);
  if (cached) return cached;
  const active = initializationPromises.get(key);
  if (active) return active;

  const promise = (async () => {
    const persisted = await loadReliabilityLearningData<
      QuestionLearningState,
      LearningAttemptInput
    >(userId);
    const states: Record<string, QuestionLearningState> = {};
    for (const raw of persisted.states) {
      const normalized = normalizeStoredLearningState(raw.questionId, raw);
      if (normalized) states[normalized.questionId] = normalized;
    }
    const attempts = persisted.attempts
      .map(normalizeAttempt)
      .filter((attempt): attempt is LearningAttemptInput => Boolean(attempt))
      .slice(-MAX_LOCAL_ATTEMPTS);

    if (Object.keys(states).length > 0 || attempts.length > 0) {
      return publishLearningStore(userId, { version: 3, states, attempts });
    }

    const legacy = readLegacyStore(userId);
    if (legacy) {
      await replaceReliabilityLearningData(
        userId,
        Object.values(legacy.states),
        legacy.attempts,
        MAX_LOCAL_ATTEMPTS,
      );
      try {
        safeStorage()?.removeItem(legacyStorageKey(userId));
      } catch {
        // Legacy cleanup is optional after a successful migration.
      }
      return publishLearningStore(userId, legacy);
    }

    return publishLearningStore(userId, emptyStore());
  })().finally(() => initializationPromises.delete(key));

  initializationPromises.set(key, promise);
  return promise;
}

export function readLearningStore(userId: string | null): LocalLearningStore {
  const key = scopeKey(userId);
  const cached = storeCache.get(key);
  if (cached) return cached;
  const legacy = readLegacyStore(userId);
  if (legacy) {
    storeCache.set(key, legacy);
    void initializeLearningStore(userId);
    return legacy;
  }
  void initializeLearningStore(userId);
  const store = emptyStore();
  storeCache.set(key, store);
  return store;
}

export async function recordLearningStoreUpdate<TPayload = unknown>(
  userId: string | null,
  state: QuestionLearningState,
  attempt: LearningAttemptInput,
  queueEntries: ReliabilityQueueEntry<TPayload>[] = [],
): Promise<void> {
  const store = await initializeLearningStore(userId);
  store.states[state.questionId] = state;
  if (!store.attempts.some((row) => row.eventId === attempt.eventId)) {
    store.attempts.push(attempt);
    if (store.attempts.length > MAX_LOCAL_ATTEMPTS) {
      store.attempts.splice(0, store.attempts.length - MAX_LOCAL_ATTEMPTS);
    }
  }
  storeCache.set(scopeKey(userId), store);
  await persistReliabilityLearningUpdate(
    userId,
    state,
    attempt,
    MAX_LOCAL_ATTEMPTS,
    queueEntries,
  );
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("learning-state:changed"));
}

export async function mergeCloudLearningStates(
  userId: string | null,
  cloudStates: QuestionLearningState[],
): Promise<void> {
  if (!cloudStates.length) return;
  const store = await initializeLearningStore(userId);
  const accepted: QuestionLearningState[] = [];
  for (const raw of cloudStates) {
    const normalized = normalizeStoredLearningState(raw.questionId, raw);
    if (!normalized) continue;
    const local = store.states[normalized.questionId];
    if (!local || normalized.lastAnsweredAt >= local.lastAnsweredAt) {
      store.states[normalized.questionId] = normalized;
      accepted.push(normalized);
    }
  }
  if (!accepted.length) return;
  storeCache.set(scopeKey(userId), store);
  await mergeReliabilityLearningStates(userId, accepted);
  if (typeof window !== "undefined")
    window.dispatchEvent(new CustomEvent("learning-state:changed"));
}

export function listLocalLearningStates(
  userId: string | null = null,
): QuestionLearningState[] {
  return Object.values(readLearningStore(userId).states);
}

export function getLocalLearningSummary(
  userId: string | null = null,
  now = new Date(),
): LearningSummary {
  const states = listLocalLearningStates(userId);
  const summary: LearningSummary = {
    total: states.length,
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    masteredCount: 0,
    dueCount: 0,
  };
  const nowTime = now.getTime();
  for (const state of states) {
    if (state.stage === "new") summary.newCount += 1;
    else if (state.stage === "learning") summary.learningCount += 1;
    else if (state.stage === "review") summary.reviewCount += 1;
    else summary.masteredCount += 1;
    if (new Date(state.nextReviewAt).getTime() <= nowTime)
      summary.dueCount += 1;
  }
  return summary;
}

export function clearLearningStoreCache(userId: string | null): void {
  storeCache.delete(scopeKey(userId));
}
