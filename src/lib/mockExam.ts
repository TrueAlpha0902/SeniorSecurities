export type MockExamFeedbackMode = "immediate" | "deferred";

type MockExamSessionState = {
  finishedAt?: string | null;
  answeredCount?: number;
  totalQuestions?: number;
};

type AnswerChoiceState = {
  isMockExam: boolean;
  isSubmitted: boolean;
  hasSavedAnswer: boolean;
  answerModeAllowed: boolean;
};

type MockExamExitState = {
  hasSession: boolean;
  isFinishedView: boolean;
  isSubmitted: boolean;
  answeredCount: number;
};

export function resolveMockExamFeedbackMode(
  answerModeEnabled: boolean,
  deferredFeedbackEnabled: boolean,
): MockExamFeedbackMode {
  return answerModeEnabled || !deferredFeedbackEnabled ? "immediate" : "deferred";
}

export function isMockExamSessionSubmitted(
  session: MockExamSessionState,
): boolean {
  return Boolean(session.finishedAt);
}

export function shouldDeferMockExamFeedback(
  feedbackMode: MockExamFeedbackMode | undefined,
  answerModeEnabled: boolean,
  isSubmitted: boolean,
): boolean {
  return feedbackMode === "deferred" && !answerModeEnabled && !isSubmitted;
}

export function canChooseImageQuizAnswer({
  isMockExam,
  isSubmitted,
  hasSavedAnswer,
  answerModeAllowed,
}: AnswerChoiceState): boolean {
  if (answerModeAllowed || isSubmitted) return false;
  return isMockExam || !hasSavedAnswer;
}

export function shouldHidePendingMockExamResults(
  feedbackMode: MockExamFeedbackMode | undefined,
  isSubmitted: boolean,
): boolean {
  return feedbackMode === "deferred" && !isSubmitted;
}

export function shouldPromptMockExamExit({
  hasSession,
  isFinishedView,
  isSubmitted,
  answeredCount,
}: MockExamExitState): boolean {
  return hasSession && !isFinishedView && !isSubmitted && answeredCount > 0;
}

export function isMockExamLearningRecorded(
  learningRecorded: boolean | undefined,
): boolean {
  return learningRecorded !== false;
}
