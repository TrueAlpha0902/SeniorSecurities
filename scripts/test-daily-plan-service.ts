import assert from "node:assert/strict";
import { buildOrReadDailyPlan, type DailyPlanQuestion } from "../src/lib/dailyPlanService";
import type { QuestionLearningState } from "../src/lib/learningStateStore";
import { setActiveUserStorageScope } from "../src/lib/userScopedStorage";
import type { UserAnswer, WrongQuestionRecord } from "../src/types";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

Object.defineProperty(globalThis, "window", {
  configurable: true,
  value: {
    localStorage: new MemoryStorage(),
    dispatchEvent: () => true,
  },
});
setActiveUserStorageScope("daily-plan-test-user");

const now = new Date("2026-07-11T08:00:00+08:00");
const config = {
  examDate: "2026-07-15",
  dailyStudyMinutes: 120,
  intensity: "standard" as const,
};

type FullQuestion = DailyPlanQuestion & { number: number; payload: string };

function question(
  id: string,
  bankId: string,
  number: number,
): FullQuestion {
  return { id, bankId, number, payload: `${bankId}:${number}` };
}

const questions: FullQuestion[] = [
  question("q1", "investment", 1),
  question("q2", "financial-analysis", 2),
  question("q3", "securities-trading-regulations", 3),
  question("q4", "investment", 4),
  question("q5", "financial-analysis", 5),
  question("q6", "securities-trading-practice", 6),
  question("q7", "investment", 7),
  question("q8", "financial-analysis", 8),
  question("q9", "securities-trading-regulations", 9),
];

const answers = [
  {
    questionId: "q1",
    bankId: "investment",
    answeredAt: "2026-07-08T08:00:00.000Z",
    isCorrect: false,
    selectedAnswer: "B",
  },
  {
    questionId: "q2",
    bankId: "financial-analysis",
    answeredAt: "2026-07-01T08:00:00.000Z",
    isCorrect: true,
    selectedAnswer: "A",
  },
  {
    questionId: "q3",
    bankId: "securities-trading-regulations",
    answeredAt: "2026-07-10T08:00:00.000Z",
    isCorrect: true,
    selectedAnswer: "A",
  },
] as UserAnswer[];

const wrongRecords = [
  {
    questionId: "q1",
    bankId: "investment",
    wrongCount: 3,
    lastWrongAt: "2026-07-08T08:00:00.000Z",
  },
] as WrongQuestionRecord[];

const learningStates = [
  {
    questionId: "q2",
    nextReviewAt: "2026-07-10T00:00:00.000Z",
  },
  {
    questionId: "q3",
    nextReviewAt: "2026-07-20T00:00:00.000Z",
  },
] as QuestionLearningState[];

const homepagePlan = buildOrReadDailyPlan({
  allQuestions: questions,
  storedAnswers: answers,
  wrongRecords,
  userId: "daily-plan-test-user",
  config,
  now,
  learningStates,
});

assert.equal(homepagePlan.generatedFromCache, false);
assert.equal(homepagePlan.categoryCounts.wrong, 1);
assert.equal(homepagePlan.categoryCounts.review, 1);
assert.equal(homepagePlan.categoryCounts.new, 2);
assert.equal(homepagePlan.plannedCount, 4);
assert.equal(homepagePlan.remainingCount, 4);
assert.equal(homepagePlan.summary, "錯題 1 / 複習 1 / 新題 2");

const practicePagePlan = buildOrReadDailyPlan({
  allQuestions: questions,
  storedAnswers: answers,
  wrongRecords,
  userId: "daily-plan-test-user",
  config,
  now,
  learningStates,
});

assert.equal(practicePagePlan.generatedFromCache, true);
assert.deepEqual(
  practicePagePlan.planQuestionIds,
  homepagePlan.planQuestionIds,
  "Home and Daily Practice must use the identical immutable queue",
);
assert.deepEqual(practicePagePlan.categoryQuestionIds, homepagePlan.categoryQuestionIds);

const completedQuestionId = homepagePlan.planQuestionIds[0];
assert.ok(completedQuestionId);
const answersAfterOneCompletion = [
  ...answers,
  {
    questionId: completedQuestionId,
    bankId:
      questions.find((item) => item.id === completedQuestionId)?.bankId ??
      "investment",
    answeredAt: now.toISOString(),
    isCorrect: true,
    selectedAnswer: "A",
  },
] as UserAnswer[];

const progressedPlan = buildOrReadDailyPlan({
  allQuestions: questions,
  storedAnswers: answersAfterOneCompletion,
  wrongRecords,
  userId: "daily-plan-test-user",
  config,
  now,
  learningStates,
});

assert.equal(progressedPlan.generatedFromCache, true);
assert.deepEqual(progressedPlan.planQuestionIds, homepagePlan.planQuestionIds);
assert.equal(progressedPlan.remainingCount, 3);
assert.equal(progressedPlan.completedBeforePlanCount, 1);
assert.ok(progressedPlan.initialCompletedQuestionIds.includes(completedQuestionId));
assert.equal(
  Object.values(progressedPlan.categoryCounts).reduce(
    (sum, count) => sum + count,
    0,
  ),
  3,
);

const changedConfigPlan = buildOrReadDailyPlan({
  allQuestions: questions,
  storedAnswers: answers,
  wrongRecords,
  userId: "daily-plan-test-user",
  config: { ...config, intensity: "sprint" },
  now,
  learningStates,
});
assert.equal(
  changedConfigPlan.generatedFromCache,
  false,
  "Changing the study-plan signature must invalidate today's cached queue",
);

const lightweightPlan = buildOrReadDailyPlan({
  allQuestions: questions.map(({ id, bankId }) => ({ id, bankId })),
  storedAnswers: answers,
  wrongRecords,
  userId: "daily-plan-test-user",
  config,
  now,
  learningStates,
  useStoredPlan: false,
});
assert.deepEqual(
  lightweightPlan.planQuestionIds,
  homepagePlan.planQuestionIds,
  "The compact home-page index must produce the same queue as full question objects",
);

console.log("DailyPlanService single-source, compact-index, and cache consistency tests passed.");
