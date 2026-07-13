export type MockExamFeedbackMode = "immediate" | "deferred";
export type MockExamAnswerCardStatus = "correct" | "wrong" | "unanswered";

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
  _answerModeEnabled: boolean,
  deferredFeedbackEnabled: boolean,
): MockExamFeedbackMode {
  return deferredFeedbackEnabled ? "deferred" : "immediate";
}

export function isMockExamSessionSubmitted(
  session: MockExamSessionState,
): boolean {
  return Boolean(session.finishedAt);
}

export function shouldDeferMockExamFeedback(
  feedbackMode: MockExamFeedbackMode | undefined,
  _answerModeEnabled: boolean,
  isSubmitted: boolean,
): boolean {
  // Fail closed: legacy or partially synchronized sessions without a mode must
  // not reveal answers before an explicit submission.
  return !isSubmitted && feedbackMode !== "immediate";
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
  return !isSubmitted && feedbackMode !== "immediate";
}

export function getMockExamAnswerCardStatus(
  answer: { isCorrect: boolean } | undefined,
): MockExamAnswerCardStatus {
  if (!answer) return "unanswered";
  return answer.isCorrect ? "correct" : "wrong";
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
