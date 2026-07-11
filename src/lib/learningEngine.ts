import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type Grade,
} from "ts-fsrs";
import { supabase } from "./supabase";

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

type LocalLearningStore = {
  version: 2;
  states: Record<string, QuestionLearningState>;
  attempts: LearningAttemptInput[];
};

const STORE_PREFIX = "senior-securities:learning-engine:v66";
const MAX_LOCAL_ATTEMPTS = 1200;
const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 3650,
  enable_fuzz: false,
});

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
  const date = new Date(typeof value === "string" || typeof value === "number" ? value : fallback);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function inferFsrsState(stage: LearningStage): State {
  if (stage === "new") return State.New;
  if (stage === "learning") return State.Learning;
  return State.Review;
}

function normalizeStoredState(questionId: string, raw: unknown): QuestionLearningState | null {
  if (!raw || typeof raw !== "object") return null;
  const value = raw as Record<string, unknown>;
  const answeredAt = validDateIso(value.lastAnsweredAt, new Date(0).toISOString());
  const nextReviewAt = validDateIso(value.nextReviewAt, answeredAt);
  const stageValue = value.stage;
  const stage: LearningStage = stageValue === "new" || stageValue === "learning" || stageValue === "review" || stageValue === "mastered"
    ? stageValue
    : "new";
  const confidenceValue = value.lastConfidence;
  const lastConfidence: AnswerConfidence = confidenceValue === "sure" || confidenceValue === "unsure" || confidenceValue === "guess" || confidenceValue === "unknown"
    ? confidenceValue
    : "sure";
  const stateNumber = finiteNumber(value.fsrsState, inferFsrsState(stage));
  const fsrsState = stateNumber >= State.New && stateNumber <= State.Relearning
    ? stateNumber as State
    : inferFsrsState(stage);
  const successCount = Math.max(0, Math.trunc(finiteNumber(value.successCount, 0)));
  const lapseCount = Math.max(0, Math.trunc(finiteNumber(value.lapseCount, 0)));
  const reps = Math.max(0, Math.trunc(finiteNumber(value.reps, successCount + lapseCount)));
  const scheduledDays = Math.max(0, Math.trunc(finiteNumber(value.scheduledDays, Math.max(0, Math.round((new Date(nextReviewAt).getTime() - new Date(answeredAt).getTime()) / 86_400_000)))));
  return {
    questionId: typeof value.questionId === "string" && value.questionId ? value.questionId : questionId,
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
    learningSteps: Math.max(0, Math.trunc(finiteNumber(value.learningSteps, 0))),
    reps,
    lastReviewAt: value.lastReviewAt == null ? answeredAt : validDateIso(value.lastReviewAt, answeredAt),
    algorithmVersion: 2,
  };
}

function readStore(userId: string | null): LocalLearningStore {
  const storage = safeStorage();
  if (!storage) return emptyStore();
  try {
    const parsed = JSON.parse(storage.getItem(storageKey(userId)) || "null") as Record<string, unknown> | null;
    if (!parsed || typeof parsed.states !== "object" || parsed.states === null || !Array.isArray(parsed.attempts)) return emptyStore();
    const states: Record<string, QuestionLearningState> = {};
    for (const [questionId, raw] of Object.entries(parsed.states as Record<string, unknown>)) {
      const normalized = normalizeStoredState(questionId, raw);
      if (normalized) states[questionId] = normalized;
    }
    return {
      version: 2,
      states,
      attempts: (parsed.attempts as LearningAttemptInput[]).filter((attempt) => Boolean(attempt?.eventId && attempt?.questionId)),
    };
  } catch {
    return emptyStore();
  }
}

function writeStore(userId: string | null, store: LocalLearningStore): void {
  const storage = safeStorage();
  if (!storage) return;
  storage.setItem(storageKey(userId), JSON.stringify(store));
  window.dispatchEvent(new CustomEvent("learning-state:changed"));
}

function gradeForAttempt(attempt: LearningAttemptInput): Grade {
  if (!attempt.isCorrect || attempt.confidence === "unknown") return Rating.Again;
  if (attempt.confidence === "guess" || attempt.confidence === "unsure") return Rating.Hard;
  return Rating.Good;
}

function cardFromState(previous: QuestionLearningState | undefined, reviewDate: Date): Card {
  if (!previous) return createEmptyCard(reviewDate);
  const lastReview = previous.lastReviewAt ? new Date(previous.lastReviewAt) : new Date(previous.lastAnsweredAt);
  return {
    due: new Date(previous.nextReviewAt),
    stability: previous.stability,
    difficulty: previous.difficulty,
    elapsed_days: previous.elapsedDays,
    scheduled_days: previous.scheduledDays,
    learning_steps: previous.learningSteps,
    reps: previous.reps,
    lapses: previous.lapseCount,
    state: previous.fsrsState,
    last_review: Number.isFinite(lastReview.getTime()) ? lastReview : reviewDate,
  };
}

function boxForScheduledDays(days: number, state: State): number {
  if (state === State.New) return 0;
  if (days <= 1) return 1;
  if (days <= 3) return 2;
  if (days <= 7) return 3;
  if (days <= 21) return 4;
  return 5;
}

function stageForCard(card: Card): LearningStage {
  if (card.state === State.New) return "new";
  if (card.state === State.Learning || card.state === State.Relearning) return "learning";
  if (card.scheduled_days >= 21 && card.reps >= 3) return "mastered";
  return "review";
}

export function scheduleLearningAttempt(previous: QuestionLearningState | undefined, attempt: LearningAttemptInput): QuestionLearningState {
  const reviewDate = new Date(attempt.answeredAt);
  const safeReviewDate = Number.isFinite(reviewDate.getTime()) ? reviewDate : new Date();
  const result = scheduler.next(cardFromState(previous, safeReviewDate), safeReviewDate, gradeForAttempt(attempt));
  const card = result.card;
  const successCount = (previous?.successCount ?? 0) + (attempt.isCorrect ? 1 : 0);
  return {
    questionId: attempt.questionId,
    bankId: attempt.bankId,
    chapterId: attempt.chapterId,
    box: boxForScheduledDays(card.scheduled_days, card.state),
    stage: stageForCard(card),
    nextReviewAt: card.due.toISOString(),
    successCount,
    lapseCount: Math.max(card.lapses, (previous?.lapseCount ?? 0) + (attempt.isCorrect ? 0 : 1)),
    lastConfidence: attempt.confidence,
    lastAnsweredAt: safeReviewDate.toISOString(),
    fsrsState: card.state,
    difficulty: card.difficulty,
    stability: card.stability,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lastReviewAt: card.last_review?.toISOString() ?? safeReviewDate.toISOString(),
    algorithmVersion: 2,
  };
}

export function createAttemptId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function recordLocalLearningAttempt(userId: string | null, attempt: LearningAttemptInput): QuestionLearningState {
  const store = readStore(userId);
  if (store.attempts.some((row) => row.eventId === attempt.eventId)) {
    return store.states[attempt.questionId] ?? scheduleLearningAttempt(undefined, attempt);
  }
  const state = scheduleLearningAttempt(store.states[attempt.questionId], attempt);
  store.states[attempt.questionId] = state;
  store.attempts.push(attempt);
  if (store.attempts.length > MAX_LOCAL_ATTEMPTS) store.attempts.splice(0, store.attempts.length - MAX_LOCAL_ATTEMPTS);
  writeStore(userId, store);
  return state;
}

export function listLocalLearningStates(userId: string | null = null): QuestionLearningState[] {
  return Object.values(readStore(userId).states);
}

export function getLocalLearningSummary(userId: string | null = null, now = new Date()): LearningSummary {
  const states = listLocalLearningStates(userId);
  const summary: LearningSummary = {
    total: states.length,
    newCount: 0,
    learningCount: 0,
    reviewCount: 0,
    masteredCount: 0,
    dueCount: 0,
  };
  for (const state of states) {
    if (state.stage === "new") summary.newCount += 1;
    else if (state.stage === "learning") summary.learningCount += 1;
    else if (state.stage === "review") summary.reviewCount += 1;
    else summary.masteredCount += 1;
    if (new Date(state.nextReviewAt).getTime() <= now.getTime()) summary.dueCount += 1;
  }
  return summary;
}

function isMissingLearningRpc(error: { code?: string; message?: string }): boolean {
  return error.code === "PGRST202" || error.code === "42883" || String(error.message || "").includes("record_learning_attempt_v66");
}

export async function syncLearningAttempt(attempt: LearningAttemptInput, state: QuestionLearningState): Promise<void> {
  if (!supabase) return;
  const { error } = await supabase.rpc("record_learning_attempt_v66", {
    p_event_id: attempt.eventId,
    p_question_id: attempt.questionId,
    p_bank_id: attempt.bankId,
    p_chapter_id: attempt.chapterId,
    p_selected_answer: attempt.selectedAnswer,
    p_correct_answer: attempt.correctAnswer,
    p_is_correct: attempt.isCorrect,
    p_confidence: attempt.confidence,
    p_answered_at: attempt.answeredAt,
    p_session_id: attempt.sessionId ?? null,
    p_session_mode: attempt.sessionMode ?? null,
    p_fsrs_state: state.fsrsState,
    p_difficulty: state.difficulty,
    p_stability: state.stability,
    p_scheduled_days: state.scheduledDays,
    p_elapsed_days: state.elapsedDays,
    p_learning_steps: state.learningSteps,
    p_reps: state.reps,
    p_lapses: state.lapseCount,
    p_next_review_at: state.nextReviewAt,
    p_last_review_at: state.lastReviewAt,
    p_algorithm_version: state.algorithmVersion,
  });
  if (error && !isMissingLearningRpc(error)) throw error;
}

export async function loadCloudLearningSummary(): Promise<LearningSummary | null> {
  if (!supabase) return null;
  const { data, error } = await supabase.rpc("get_learning_summary_v66");
  if (error) {
    if (isMissingLearningRpc(error)) return null;
    throw error;
  }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  return {
    total: Number(value.total_count ?? 0),
    newCount: Number(value.new_count ?? 0),
    learningCount: Number(value.learning_count ?? 0),
    reviewCount: Number(value.review_count ?? 0),
    masteredCount: Number(value.mastered_count ?? 0),
    dueCount: Number(value.due_count ?? 0),
  };
}
