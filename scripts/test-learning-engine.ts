import assert from "node:assert/strict";
import {
  scheduleLearningAttempt,
  type LearningAttemptInput,
  type QuestionLearningState,
} from "../src/lib/learningEngine";

function attempt(overrides: Partial<LearningAttemptInput> = {}): LearningAttemptInput {
  return {
    eventId: "00000000-0000-4000-8000-000000000001",
    questionId: "investment-ch1-q1",
    bankId: "investment",
    chapterId: "chapter-1",
    selectedAnswer: "A",
    correctAnswer: "A",
    isCorrect: true,
    confidence: "sure",
    answeredAt: "2026-07-11T03:00:00.000Z",
    sessionId: "test-session",
    sessionMode: "random80",
    ...overrides,
  };
}

const first = scheduleLearningAttempt(undefined, attempt());
assert.equal(first.questionId, "investment-ch1-q1");
assert.equal(first.successCount, 1);
assert.equal(first.algorithmVersion, 2);
assert.ok(first.reps >= 1);
assert.ok(first.difficulty > 0);
assert.ok(first.stability > 0);
assert.ok(new Date(first.nextReviewAt).getTime() > new Date(first.lastAnsweredAt).getTime());

const second = scheduleLearningAttempt(first, attempt({
  eventId: "00000000-0000-4000-8000-000000000002",
  answeredAt: first.nextReviewAt,
  confidence: "unsure",
}));
assert.equal(second.successCount, 2);
assert.ok(second.reps > first.reps);
assert.ok(second.scheduledDays >= first.scheduledDays);

const wrong = scheduleLearningAttempt(second, attempt({
  eventId: "00000000-0000-4000-8000-000000000003",
  selectedAnswer: "B",
  isCorrect: false,
  confidence: "unknown",
  answeredAt: second.nextReviewAt,
}));
assert.ok(wrong.lapseCount > second.lapseCount);
assert.equal(wrong.stage, "learning");
assert.ok(new Date(wrong.nextReviewAt).getTime() > new Date(wrong.lastAnsweredAt).getTime());

const restoredLikeState: QuestionLearningState = { ...wrong };
const recovered = scheduleLearningAttempt(restoredLikeState, attempt({
  eventId: "00000000-0000-4000-8000-000000000004",
  answeredAt: wrong.nextReviewAt,
}));
assert.ok(Number.isFinite(recovered.stability));
assert.ok(Number.isFinite(recovered.difficulty));

console.log("Learning engine FSRS tests passed.");
