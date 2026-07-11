import type { State } from "ts-fsrs";

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
  version: 2;
  states: Record<string, QuestionLearningState>;
  attempts: LearningAttemptInput[];
};

const STORE_PREFIX = "senior-securities:learning-engine:v66";
const storeCache = new Map<string, LocalLearningStore>();

function safeStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function storageKey(userId: string | null): string {
  return `${STORE_PREFIX}:${userId || "guest"}`;
}

function emptyStore(): LocalLearningStore {
  return { version: 2, states: {}, attempts: [] };
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

function normalizeStoredState(
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
  const lapseCount = Math.max(
    0,
    Math.trunc(finiteNumber(value.lapseCount, 0)),
  );
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
    elapsedDays: Math.max(
      0,
      Math.trunc(finiteNumber(value.elapsedDays, 0)),
    ),
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

export function readLearningStore(userId: string | null): LocalLearningStore {
  const key = storageKey(userId);
  const cached = storeCache.get(key);
  if (cached) return cached;

  const storage = safeStorage();
  if (!storage) return emptyStore();
  try {
    const parsed = JSON.parse(storage.getItem(key) || "null") as Record<
      string,
      unknown
    > | null;
    if (
      !parsed ||
      typeof parsed.states !== "object" ||
      parsed.states === null ||
      !Array.isArray(parsed.attempts)
    ) {
      const store = emptyStore();
      storeCache.set(key, store);
      return store;
    }
    const states: Record<string, QuestionLearningState> = {};
    for (const [questionId, raw] of Object.entries(
      parsed.states as Record<string, unknown>,
    )) {
      const normalized = normalizeStoredState(questionId, raw);
      if (normalized) states[questionId] = normalized;
    }
    const store: LocalLearningStore = {
      version: 2,
      states,
      attempts: (parsed.attempts as LearningAttemptInput[]).filter(
        (attempt) => Boolean(attempt?.eventId && attempt?.questionId),
      ),
    };
    storeCache.set(key, store);
    return store;
  } catch {
    const store = emptyStore();
    storeCache.set(key, store);
    return store;
  }
}

export function writeLearningStore(
  userId: string | null,
  store: LocalLearningStore,
): void {
  const key = storageKey(userId);
  storeCache.set(key, store);
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(key, JSON.stringify(store));
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
    if (new Date(state.nextReviewAt).getTime() <= nowTime) {
      summary.dueCount += 1;
    }
  }
  return summary;
}

if (typeof window !== "undefined") {
  window.addEventListener("storage", (event) => {
    if (event.key?.startsWith(`${STORE_PREFIX}:`)) {
      storeCache.delete(event.key);
    }
  });
}
