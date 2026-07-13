import assert from "node:assert/strict";
import "fake-indexeddb/auto";
import {
  commitImageQuizSessionLearningAnswers,
  createImageQuizSession,
  deleteImageQuizSessions,
  finishImageQuizSession,
  getImageQuizSession,
  listUserAnswers,
  listWrongQuestions,
  recordImageUserAnswer,
  saveImageQuizSessionAnswer,
  saveImageQuizSessionMarks,
  settleImageQuizSession,
  type ImageQuizSessionRecord,
} from "../src/lib/db";
import type { ImageQuizQuestion, NumericAnswer } from "../src/lib/imageQuiz";
import { initializeLearningStore } from "../src/lib/learningStateStore";
import {
  canChooseImageQuizAnswer,
  getMockExamAnswerCardStatus,
  isMockExamLearningRecorded,
  isMockExamSessionSubmitted,
  resolveMockExamFeedbackMode,
  shouldDeferMockExamFeedback,
  shouldHidePendingMockExamResults,
  shouldPromptMockExamExit,
} from "../src/lib/mockExam";
import { createUuid, isUuid } from "../src/lib/uuid";

assert.equal(resolveMockExamFeedbackMode(false, true), "deferred");
assert.equal(resolveMockExamFeedbackMode(false, false), "immediate");
assert.equal(
  resolveMockExamFeedbackMode(true, true),
  "deferred",
  "The explicit deferred-grading switch must win over stale answer-mode state.",
);

assert.equal(
  isMockExamSessionSubmitted({ answeredCount: 80, totalQuestions: 80 }),
  false,
  "Answering every question must not submit the exam.",
);
assert.equal(
  isMockExamSessionSubmitted({ finishedAt: "2026-07-13T12:00:00.000Z" }),
  true,
);

assert.equal(shouldDeferMockExamFeedback("deferred", false, false), true);
assert.equal(
  shouldDeferMockExamFeedback("deferred", true, false),
  true,
  "A deferred session must never leak answers because a global setting changed.",
);
assert.equal(shouldDeferMockExamFeedback("deferred", false, true), false);
assert.equal(shouldDeferMockExamFeedback("immediate", false, false), false);
assert.equal(
  shouldDeferMockExamFeedback(undefined, false, false),
  true,
  "Legacy sessions without feedbackMode must fail closed until submission.",
);

assert.equal(
  canChooseImageQuizAnswer({
    isMockExam: true,
    isSubmitted: false,
    hasSavedAnswer: true,
    answerModeAllowed: false,
  }),
  true,
  "Mock-exam answers must remain editable before submission.",
);
assert.equal(
  canChooseImageQuizAnswer({
    isMockExam: false,
    isSubmitted: false,
    hasSavedAnswer: true,
    answerModeAllowed: false,
  }),
  false,
);
assert.equal(
  canChooseImageQuizAnswer({
    isMockExam: true,
    isSubmitted: true,
    hasSavedAnswer: true,
    answerModeAllowed: false,
  }),
  false,
);
assert.equal(
  canChooseImageQuizAnswer({
    isMockExam: true,
    isSubmitted: false,
    hasSavedAnswer: false,
    answerModeAllowed: true,
  }),
  false,
);

assert.equal(shouldHidePendingMockExamResults("deferred", false), true);
assert.equal(shouldHidePendingMockExamResults("deferred", true), false);
assert.equal(shouldHidePendingMockExamResults("immediate", false), false);
assert.equal(shouldHidePendingMockExamResults(undefined, false), true);

assert.equal(getMockExamAnswerCardStatus(undefined), "unanswered");
assert.equal(getMockExamAnswerCardStatus({ isCorrect: true }), "correct");
assert.equal(getMockExamAnswerCardStatus({ isCorrect: false }), "wrong");

assert.equal(
  shouldPromptMockExamExit({
    hasSession: true,
    isFinishedView: false,
    isSubmitted: false,
    answeredCount: 80,
  }),
  true,
  "A fully answered but unsubmitted exam must remain resumable on exit.",
);
assert.equal(
  shouldPromptMockExamExit({
    hasSession: true,
    isFinishedView: false,
    isSubmitted: false,
    answeredCount: 0,
  }),
  false,
);
assert.equal(
  shouldPromptMockExamExit({
    hasSession: true,
    isFinishedView: false,
    isSubmitted: true,
    answeredCount: 80,
  }),
  false,
);

assert.equal(
  isMockExamLearningRecorded(undefined),
  true,
  "Legacy answers were recorded by the previous implementation.",
);
assert.equal(isMockExamLearningRecorded(false), false);
assert.equal(isMockExamLearningRecorded(true), true);

const uuidOne = createUuid();
const uuidTwo = createUuid();
assert.equal(isUuid(uuidOne), true);
assert.equal(isUuid(uuidTwo), true);
assert.notEqual(uuidOne, uuidTwo);
assert.equal(isUuid("mock:session:question"), false);

function makeQuestion(id: string, answer: NumericAnswer): ImageQuizQuestion {
  return {
    id,
    bankId: "mock-bank",
    bankTitle: "Mock bank",
    chapterId: "mock-chapter",
    chapterTitle: "Mock chapter",
    number: 1,
    answer,
    sourceFile: "mock.pdf",
    questionSegments: [],
    explanationSegments: [],
    answerMask: null,
  };
}

function makeSession(
  sessionId: string,
  questionIds: string[],
  feedbackMode: "immediate" | "deferred",
  answers: ImageQuizSessionRecord["answers"] = {},
): ImageQuizSessionRecord {
  return {
    sessionId,
    mode: "random80",
    bankId: "mock-bank",
    bankTitle: "Mock bank",
    questionIds,
    answers,
    wrongQuestionIds: [],
    startedAt: "2026-07-13T12:00:00.000Z",
    totalQuestions: questionIds.length,
    correctCount: 0,
    wrongCount: 0,
    accuracy: 0,
    feedbackMode,
  };
}

const immediateQuestion = makeQuestion("mock-immediate-q1", "2");
await createImageQuizSession(
  makeSession("mock-immediate-session", [immediateQuestion.id], "immediate"),
);
await saveImageQuizSessionAnswer(
  "mock-immediate-session",
  immediateQuestion.id,
  {
    selected: "1",
    correct: "2",
    isCorrect: false,
    answeredAt: "2026-07-13T12:01:00.000Z",
    learningRecorded: false,
  },
);
const initialImmediateSession = await getImageQuizSession(
  "mock-immediate-session",
);
const immediateEventId =
  initialImmediateSession?.answers[immediateQuestion.id]?.learningEventId;
assert.equal(isUuid(immediateEventId), true, "A mock answer must persist a UUID.");

await commitImageQuizSessionLearningAnswers("mock-immediate-session", [
  immediateQuestion,
]);
assert.equal(
  (await listUserAnswers()).some(
    (answer) => answer.questionId === immediateQuestion.id,
  ),
  false,
  "Immediate feedback must not commit learning data before explicit submission.",
);

await saveImageQuizSessionAnswer(
  "mock-immediate-session",
  immediateQuestion.id,
  {
    selected: "2",
    correct: "2",
    isCorrect: true,
    answeredAt: "2026-07-13T12:01:30.000Z",
    learningRecorded: false,
  },
);
const revisedImmediateSession = await getImageQuizSession(
  "mock-immediate-session",
);
assert.equal(
  revisedImmediateSession?.answers[immediateQuestion.id]?.learningEventId,
  immediateEventId,
  "A revision must retain the original persisted event UUID.",
);
assert.equal(revisedImmediateSession?.correctCount, 1);

await finishImageQuizSession("mock-immediate-session");
await Promise.all([
  commitImageQuizSessionLearningAnswers("mock-immediate-session", [
    immediateQuestion,
  ]),
  commitImageQuizSessionLearningAnswers("mock-immediate-session", [
    immediateQuestion,
  ]),
]);
const committedImmediateSession = await getImageQuizSession(
  "mock-immediate-session",
);
assert.equal(
  committedImmediateSession?.answers[immediateQuestion.id]?.learningRecorded,
  true,
);
const immediateUserAnswer = (await listUserAnswers()).find(
  (answer) => answer.questionId === immediateQuestion.id,
);
assert.equal(immediateUserAnswer?.selectedAnswer, "B");
assert.equal(immediateUserAnswer?.isCorrect, true);
assert.equal(
  (await listWrongQuestions()).some(
    (record) => record.questionId === immediateQuestion.id,
  ),
  false,
  "Wrong-to-correct revisions must commit only the final answer.",
);
const immediateLearningStore = await initializeLearningStore(null);
assert.equal(
  immediateLearningStore.attempts.filter(
    (attempt) => attempt.questionId === immediateQuestion.id,
  ).length,
  1,
  "Parallel retries must create only one learning attempt.",
);
assert.equal(
  immediateLearningStore.attempts.find(
    (attempt) => attempt.questionId === immediateQuestion.id,
  )?.eventId,
  immediateEventId,
);

const finalWrongQuestion = makeQuestion("mock-final-wrong-q1", "1");
await createImageQuizSession(
  makeSession("mock-final-wrong-session", [finalWrongQuestion.id], "immediate"),
);
await saveImageQuizSessionAnswer(
  "mock-final-wrong-session",
  finalWrongQuestion.id,
  {
    selected: "1",
    correct: "1",
    isCorrect: true,
    answeredAt: "2026-07-13T12:02:00.000Z",
    learningRecorded: false,
  },
);
await saveImageQuizSessionAnswer(
  "mock-final-wrong-session",
  finalWrongQuestion.id,
  {
    selected: "2",
    correct: "1",
    isCorrect: false,
    answeredAt: "2026-07-13T12:02:30.000Z",
    learningRecorded: false,
  },
);
await finishImageQuizSession("mock-final-wrong-session");
await commitImageQuizSessionLearningAnswers("mock-final-wrong-session", [
  finalWrongQuestion,
]);
assert.equal(
  (await listUserAnswers()).find(
    (answer) => answer.questionId === finalWrongQuestion.id,
  )?.selectedAnswer,
  "B",
);
assert.equal(
  (await listWrongQuestions()).find(
    (record) => record.questionId === finalWrongQuestion.id,
  )?.wrongCount,
  1,
  "Correct-to-wrong revisions must count the final wrong answer once.",
);

const deferredQuestion = makeQuestion("mock-deferred-q1", "2");
await createImageQuizSession(
  makeSession("mock-deferred-session", [deferredQuestion.id], "deferred"),
);
await saveImageQuizSessionAnswer(
  "mock-deferred-session",
  deferredQuestion.id,
  {
    selected: "2",
    correct: "2",
    isCorrect: true,
    answeredAt: "2026-07-13T12:03:00.000Z",
    learningRecorded: false,
  },
);
await commitImageQuizSessionLearningAnswers("mock-deferred-session", [
  deferredQuestion,
]);
assert.equal(
  (await listUserAnswers()).some(
    (answer) => answer.questionId === deferredQuestion.id,
  ),
  false,
  "Deferred learning commits must be gated by finishedAt.",
);
await finishImageQuizSession("mock-deferred-session");
await commitImageQuizSessionLearningAnswers("mock-deferred-session", [
  deferredQuestion,
]);
assert.equal(
  (await listUserAnswers()).find(
    (answer) => answer.questionId === deferredQuestion.id,
  )?.selectedAnswer,
  "B",
);

const raceQuestionOne = makeQuestion("mock-race-q1", "1");
const raceQuestionTwo = makeQuestion("mock-race-q2", "2");
await createImageQuizSession(
  makeSession(
    "mock-race-session",
    [raceQuestionOne.id, raceQuestionTwo.id],
    "deferred",
  ),
);
await Promise.all([
  saveImageQuizSessionAnswer("mock-race-session", raceQuestionOne.id, {
    selected: "1",
    correct: "1",
    isCorrect: true,
    answeredAt: "2026-07-13T12:04:00.000Z",
    learningRecorded: false,
  }),
  saveImageQuizSessionAnswer("mock-race-session", raceQuestionTwo.id, {
    selected: "3",
    correct: "2",
    isCorrect: false,
    answeredAt: "2026-07-13T12:04:01.000Z",
    learningRecorded: false,
  }),
]);
const twoAnswerSession = await getImageQuizSession("mock-race-session");
assert.deepEqual(
  Object.keys(twoAnswerSession?.answers ?? {}).sort(),
  [raceQuestionOne.id, raceQuestionTwo.id].sort(),
  "Concurrent answer writes must merge instead of replacing the session.",
);
assert.equal(twoAnswerSession?.correctCount, 1);
assert.equal(twoAnswerSession?.wrongCount, 1);

await Promise.all([
  saveImageQuizSessionAnswer("mock-race-session", raceQuestionOne.id, {
    selected: "2",
    correct: "1",
    isCorrect: false,
    answeredAt: "2026-07-13T12:04:30.000Z",
    learningRecorded: false,
  }),
  saveImageQuizSessionMarks("mock-race-session", [raceQuestionTwo.id]),
]);
const markedRaceSession = await getImageQuizSession("mock-race-session");
assert.equal(markedRaceSession?.answers[raceQuestionOne.id]?.selected, "2");
assert.deepEqual(markedRaceSession?.markedQuestionIds, [raceQuestionTwo.id]);

const finishRaceQuestion = makeQuestion("mock-finish-race-q1", "1");
await createImageQuizSession(
  makeSession("mock-finish-race-session", [finishRaceQuestion.id], "deferred"),
);
await Promise.all([
  saveImageQuizSessionAnswer(
    "mock-finish-race-session",
    finishRaceQuestion.id,
    {
      selected: "1",
      correct: "1",
      isCorrect: true,
      answeredAt: "2026-07-13T12:05:00.000Z",
      learningRecorded: false,
    },
  ),
  finishImageQuizSession("mock-finish-race-session"),
]);
const finishedRaceSession = await getImageQuizSession(
  "mock-finish-race-session",
);
assert.equal(Boolean(finishedRaceSession?.finishedAt), true);
assert.equal(finishedRaceSession?.answers[finishRaceQuestion.id]?.selected, "1");
assert.equal(finishedRaceSession?.correctCount, 1);
assert.equal(
  await saveImageQuizSessionAnswer(
    "mock-finish-race-session",
    finishRaceQuestion.id,
    {
      selected: "2",
      correct: "1",
      isCorrect: false,
      answeredAt: "2026-07-13T12:06:00.000Z",
      learningRecorded: false,
    },
  ),
  undefined,
  "A submitted session must reject later revisions.",
);
assert.equal(
  (await getImageQuizSession("mock-finish-race-session"))?.answers[
    finishRaceQuestion.id
  ]?.selected,
  "1",
);

const settleQuestion = makeQuestion("mock-settle-q1", "4");
await createImageQuizSession(
  makeSession("mock-settle-session", [settleQuestion.id], "deferred"),
);
await Promise.all([
  saveImageQuizSessionAnswer("mock-settle-session", settleQuestion.id, {
    selected: "4",
    correct: "4",
    isCorrect: true,
    answeredAt: "2026-07-13T12:07:00.000Z",
    learningRecorded: false,
  }),
  settleImageQuizSession("mock-settle-session"),
]);
const settledSession = await getImageQuizSession("mock-settle-session");
assert.equal(settledSession?.answers[settleQuestion.id]?.selected, "4");
assert.equal(settledSession?.correctCount, 1);

const deleteRaceQuestion = makeQuestion("mock-delete-race-q1", "3");
await createImageQuizSession(
  makeSession("mock-delete-race-session", [deleteRaceQuestion.id], "deferred"),
);
await saveImageQuizSessionAnswer(
  "mock-delete-race-session",
  deleteRaceQuestion.id,
  {
    selected: "3",
    correct: "3",
    isCorrect: true,
    answeredAt: "2026-07-13T12:08:00.000Z",
    learningRecorded: false,
  },
);
await finishImageQuizSession("mock-delete-race-session");
const [, skippedAfterActiveCommit] = await Promise.all([
  commitImageQuizSessionLearningAnswers("mock-delete-race-session", [
    deleteRaceQuestion,
  ]),
  deleteImageQuizSessions(["mock-delete-race-session"]),
]);
assert.deepEqual(skippedAfterActiveCommit, []);
assert.equal(await getImageQuizSession("mock-delete-race-session"), undefined);
assert.equal(
  (await listUserAnswers()).find(
    (answer) => answer.questionId === deleteRaceQuestion.id,
  )?.selectedAnswer,
  "C",
  "Deleting a completed record must wait for its learning commit.",
);

const guardedDeleteQuestion = makeQuestion("mock-guarded-delete-q1", "4");
await createImageQuizSession(
  makeSession(
    "mock-guarded-delete-session",
    [guardedDeleteQuestion.id],
    "deferred",
  ),
);
await saveImageQuizSessionAnswer(
  "mock-guarded-delete-session",
  guardedDeleteQuestion.id,
  {
    selected: "4",
    correct: "4",
    isCorrect: true,
    answeredAt: "2026-07-13T12:09:00.000Z",
    learningRecorded: false,
  },
);
await finishImageQuizSession("mock-guarded-delete-session");
assert.deepEqual(
  await deleteImageQuizSessions(["mock-guarded-delete-session"]),
  ["mock-guarded-delete-session"],
  "A submitted record with pending learning data must be retained.",
);
assert.equal(
  Boolean(await getImageQuizSession("mock-guarded-delete-session")),
  true,
);
await commitImageQuizSessionLearningAnswers("mock-guarded-delete-session", [
  guardedDeleteQuestion,
]);
assert.deepEqual(
  await deleteImageQuizSessions(["mock-guarded-delete-session"]),
  [],
);

const legacyQuestion = makeQuestion("mock-legacy-q1", "1");
await recordImageUserAnswer(legacyQuestion, "2");
await createImageQuizSession(
  makeSession(
    "mock-legacy-session",
    [legacyQuestion.id],
    "deferred",
    {
      [legacyQuestion.id]: {
        selected: "2",
        correct: "1",
        isCorrect: false,
        answeredAt: "2026-07-13T11:00:00.000Z",
      },
    },
  ),
);
await saveImageQuizSessionAnswer(
  "mock-legacy-session",
  legacyQuestion.id,
  {
    selected: "1",
    correct: "1",
    isCorrect: true,
    answeredAt: "2026-07-13T12:10:00.000Z",
    learningRecorded: false,
  },
);
await finishImageQuizSession("mock-legacy-session");
await commitImageQuizSessionLearningAnswers("mock-legacy-session", [
  legacyQuestion,
]);
assert.equal(
  (await listUserAnswers()).find(
    (answer) => answer.questionId === legacyQuestion.id,
  )?.selectedAnswer,
  "A",
  "A revised legacy session must reconcile its final domain answer.",
);
assert.equal(
  (await listWrongQuestions()).some(
    (record) => record.questionId === legacyQuestion.id,
  ),
  false,
  "A revised legacy session must remove the obsolete wrong record.",
);
assert.equal(
  (await initializeLearningStore(null)).attempts.filter(
    (attempt) => attempt.questionId === legacyQuestion.id,
  ).length,
  1,
  "Legacy reconciliation must not duplicate learning or leaderboard attempts.",
);

console.log(
  "Mock-exam submission, UUID, revision, concurrency, and idempotency tests passed.",
);
