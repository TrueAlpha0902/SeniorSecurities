import {
  Rating,
  State,
  createEmptyCard,
  fsrs,
  type Card,
  type Grade,
} from "ts-fsrs";
import { supabase } from "./supabase";
import type { ReliabilityQueueEntry } from "./reliabilityStore";
import {
  initializeLearningStore,
  recordLearningStoreUpdate,
  type LearningAttemptInput,
  type LearningStage,
  type LearningSummary,
  type QuestionLearningState,
} from "./learningStateStore";

export type {
  AnswerConfidence,
  LearningAttemptInput,
  LearningStage,
  LearningSummary,
  QuestionLearningState,
} from "./learningStateStore";
export {
  getLocalLearningSummary,
  listLocalLearningStates,
} from "./learningStateStore";

const MAX_LOCAL_ATTEMPTS = 1200;
const scheduler = fsrs({
  request_retention: 0.9,
  maximum_interval: 3650,
  enable_fuzz: false,
});

function gradeForAttempt(attempt: LearningAttemptInput): Grade {
  if (!attempt.isCorrect || attempt.confidence === "unknown") {
    return Rating.Again;
  }
  if (attempt.confidence === "guess" || attempt.confidence === "unsure") {
    return Rating.Hard;
  }
  return Rating.Good;
}

function cardFromState(
  previous: QuestionLearningState | undefined,
  reviewDate: Date,
): Card {
  if (!previous) return createEmptyCard(reviewDate);
  const lastReview = previous.lastReviewAt
    ? new Date(previous.lastReviewAt)
    : new Date(previous.lastAnsweredAt);
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
    last_review: Number.isFinite(lastReview.getTime())
      ? lastReview
      : reviewDate,
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
  if (card.state === State.Learning || card.state === State.Relearning) {
    return "learning";
  }
  if (card.scheduled_days >= 21 && card.reps >= 3) return "mastered";
  return "review";
}

export function scheduleLearningAttempt(
  previous: QuestionLearningState | undefined,
  attempt: LearningAttemptInput,
): QuestionLearningState {
  const reviewDate = new Date(attempt.answeredAt);
  const safeReviewDate = Number.isFinite(reviewDate.getTime())
    ? reviewDate
    : new Date();
  const result = scheduler.next(
    cardFromState(previous, safeReviewDate),
    safeReviewDate,
    gradeForAttempt(attempt),
  );
  const card = result.card;
  const successCount =
    (previous?.successCount ?? 0) + (attempt.isCorrect ? 1 : 0);
  return {
    questionId: attempt.questionId,
    bankId: attempt.bankId,
    chapterId: attempt.chapterId,
    box: boxForScheduledDays(card.scheduled_days, card.state),
    stage: stageForCard(card),
    nextReviewAt: card.due.toISOString(),
    successCount,
    lapseCount: Math.max(
      card.lapses,
      (previous?.lapseCount ?? 0) + (attempt.isCorrect ? 0 : 1),
    ),
    lastConfidence: attempt.confidence,
    lastAnsweredAt: safeReviewDate.toISOString(),
    fsrsState: card.state,
    difficulty: card.difficulty,
    stability: card.stability,
    elapsedDays: card.elapsed_days,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lastReviewAt:
      card.last_review?.toISOString() ?? safeReviewDate.toISOString(),
    algorithmVersion: 2,
  };
}

export function createAttemptId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `attempt-${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export async function recordLocalLearningAttempt<TPayload = unknown>(
  userId: string | null,
  attempt: LearningAttemptInput,
  queueEntriesForState?: (
    state: QuestionLearningState,
  ) => ReliabilityQueueEntry<TPayload>[],
): Promise<QuestionLearningState> {
  const store = await initializeLearningStore(userId);
  if (store.attempts.some((row) => row.eventId === attempt.eventId)) {
    return (
      store.states[attempt.questionId] ??
      scheduleLearningAttempt(undefined, attempt)
    );
  }
  const state = scheduleLearningAttempt(
    store.states[attempt.questionId],
    attempt,
  );
  store.states[attempt.questionId] = state;
  store.attempts.push(attempt);
  if (store.attempts.length > MAX_LOCAL_ATTEMPTS) {
    store.attempts.splice(0, store.attempts.length - MAX_LOCAL_ATTEMPTS);
  }
  await recordLearningStoreUpdate(
    userId,
    state,
    attempt,
    queueEntriesForState?.(state) ?? [],
  );
  return state;
}

function isMissingLearningRpc(error: {
  code?: string;
  message?: string;
}): boolean {
  return (
    error.code === "PGRST202" ||
    error.code === "42883" ||
    String(error.message || "").includes("record_learning_attempt_v66")
  );
}

export async function syncLearningAttempt(
  attempt: LearningAttemptInput,
  state: QuestionLearningState,
): Promise<void> {
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
