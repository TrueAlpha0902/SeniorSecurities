import type { ImageQuizQuestion } from "./imageQuiz";
import {
  listLocalLearningStates,
  type QuestionLearningState,
} from "./learningEngine";
import {
  calculateSmartStudyPlanStats,
  DAILY_PLAN_STORAGE_VERSION,
  getStudyPlanConfig,
  getStudyPlanSignature,
  isReviewDue,
  localTodayKey,
  type DailyPlanAllocation,
  type DailyPlanCategory,
  type SmartStudyPlanStats,
  type StudyIntensity,
  type StudyPlanConfig,
} from "./studyPlan";
import {
  readScopedStorageItem,
  writeScopedStorageItem,
} from "./userScopedStorage";
import type { UserAnswer, WrongQuestionRecord } from "../types";

const DAILY_PLAN_KEY_PREFIX = "quizpwa:daily-plan:";
const DAILY_PLAN_CATEGORIES: DailyPlanCategory[] = [
  "new",
  "wrong",
  "review",
  "mixed",
];

type StoredDailyPlan = {
  version: number;
  date: string;
  createdAt: string;
  planSignature: string;
  questionUniverseSignature: string;
  questionIds: string[];
  plannedCount: number;
  categoryCounts: Record<DailyPlanCategory, number>;
  categoryQuestionIds: Record<DailyPlanCategory, string[]>;
  planSnapshot: SmartStudyPlanStats;
};

export type DailyPlanResult = {
  questions: ImageQuizQuestion[];
  planQuestionIds: string[];
  categoryCounts: Record<DailyPlanCategory, number>;
  categoryQuestionIds: Record<DailyPlanCategory, string[]>;
  remainingAllocations: Record<DailyPlanCategory, DailyPlanAllocation>;
  remainingCount: number;
  plannedCount: number;
  completedBeforePlanCount: number;
  initialCompletedQuestionIds: string[];
  plan: SmartStudyPlanStats;
  summary: string;
  generatedFromCache: boolean;
};

export type BuildDailyPlanArgs = {
  allQuestions: ImageQuizQuestion[];
  storedAnswers: UserAnswer[];
  wrongRecords: WrongQuestionRecord[];
  userId: string | null;
  config?: StudyPlanConfig;
  now?: Date;
  learningStates?: QuestionLearningState[];
  useStoredPlan?: boolean;
};

/**
 * Single source of truth for both the Home page and the Daily Practice page.
 * The first caller creates today's immutable queue; all later callers read the
 * same question ids and only subtract questions completed today.
 */
export function buildOrReadDailyPlan({
  allQuestions,
  storedAnswers,
  wrongRecords,
  userId,
  config = getStudyPlanConfig(),
  now = new Date(),
  learningStates = listLocalLearningStates(userId),
  useStoredPlan = true,
}: BuildDailyPlanArgs): DailyPlanResult {
  const dateKey = localTodayKey(now);
  const allQuestionIds = new Set(allQuestions.map((question) => question.id));
  const todayAnsweredIds = getTodayAnsweredIds(
    storedAnswers,
    allQuestionIds,
    dateKey,
  );
  const planningAnswers = storedAnswers.filter(
    (answer) => !todayAnsweredIds.has(answer.questionId),
  );
  const byQuestionId = new Map(
    allQuestions.map((question) => [question.id, question]),
  );
  const answersById = new Map(
    planningAnswers.map((answer) => [answer.questionId, answer]),
  );
  const wrongDueRecords = wrongRecords.filter(
    (record) =>
      allQuestionIds.has(record.questionId) &&
      answersById.get(record.questionId)?.isCorrect !== true,
  );
  const wrongIds = new Set(
    wrongDueRecords.map((record) => record.questionId),
  );
  const unattemptedQuestions = allQuestions.filter(
    (question) => !answersById.has(question.id),
  );
  const wrongDueQuestions = wrongDueRecords
    .slice()
    .sort(
      (left, right) =>
        right.wrongCount - left.wrongCount ||
        right.lastWrongAt.localeCompare(left.lastWrongAt),
    )
    .map((record) => byQuestionId.get(record.questionId))
    .filter((question): question is ImageQuizQuestion => Boolean(question));
  const learningStateById = new Map(
    learningStates.map((state) => [state.questionId, state]),
  );
  const nowTime = now.getTime();
  const reviewDueQuestions = planningAnswers
    .filter((answer) => {
      if (!answer.isCorrect || wrongIds.has(answer.questionId)) return false;
      const learningState = learningStateById.get(answer.questionId);
      return learningState
        ? new Date(learningState.nextReviewAt).getTime() <= nowTime
        : isReviewDue(answer.answeredAt, now);
    })
    .sort((left, right) => {
      const leftDue =
        learningStateById.get(left.questionId)?.nextReviewAt ?? left.answeredAt;
      const rightDue =
        learningStateById.get(right.questionId)?.nextReviewAt ??
        right.answeredAt;
      return leftDue.localeCompare(rightDue);
    })
    .map((answer) => byQuestionId.get(answer.questionId))
    .filter((question): question is ImageQuizQuestion => Boolean(question));
  const reviewDueIds = new Set(
    reviewDueQuestions.map((question) => question.id),
  );
  const mixedPoolQuestions = allQuestions.filter(
    (question) =>
      answersById.has(question.id) &&
      !wrongIds.has(question.id) &&
      !reviewDueIds.has(question.id),
  );
  const plan = calculateSmartStudyPlanStats({
    totalQuestions: allQuestions.length,
    unattemptedQuestions: unattemptedQuestions.length,
    wrongDueQuestions: wrongDueQuestions.length,
    reviewDueQuestions: reviewDueQuestions.length,
    mixedPoolQuestions: mixedPoolQuestions.length,
    examDate: config.examDate,
    dailyStudyMinutes: config.dailyStudyMinutes,
    intensity: config.intensity,
    now,
  });
  const questionUniverseSignature = buildQuestionUniverseSignature(allQuestions);

  if (useStoredPlan) {
    const storedResult = readStoredDailyPlan({
      allQuestions,
      storedAnswers,
      dateKey,
      expectedPlanSignature: getStudyPlanSignature(config),
      expectedQuestionUniverseSignature: questionUniverseSignature,
      fallbackPlan: plan,
    });
    if (storedResult) return storedResult;
  }

  const selectedIds = new Set<string>();
  const wrongQuestions = takeBalancedByExamSubject(
    wrongDueQuestions,
    plan.allocations.wrong.count,
    selectedIds,
  );
  const reviewQuestions = takeBalancedByExamSubject(
    reviewDueQuestions,
    plan.allocations.review.count,
    selectedIds,
  );
  const newQuestions = takeBalancedByExamSubject(
    unattemptedQuestions,
    plan.allocations.new.count,
    selectedIds,
  );
  // Mixed questions were removed from the daily plan. Keep the field so old
  // UI/data contracts remain forward compatible.
  const mixedQuestions: ImageQuizQuestion[] = [];
  const categoryQuestionIds: Record<DailyPlanCategory, string[]> = {
    new: newQuestions.map((question) => question.id),
    wrong: wrongQuestions.map((question) => question.id),
    review: reviewQuestions.map((question) => question.id),
    mixed: [],
  };
  const selectedQuestions = interleaveDailyQuestions(
    {
      new: newQuestions,
      wrong: wrongQuestions,
      review: reviewQuestions,
      mixed: mixedQuestions,
    },
    config.intensity,
  );
  const result = materializeDailyPlan({
    allQuestions,
    storedAnswers,
    dateKey,
    questionIds: selectedQuestions.map((question) => question.id),
    categoryQuestionIds,
    plan,
    generatedFromCache: false,
  });
  writeStoredDailyPlan({
    result,
    dateKey,
    config,
    questionUniverseSignature,
    now,
  });
  return result;
}

export function buildDailySummary(
  categoryCounts: Record<DailyPlanCategory, number>,
): string {
  return [
    `錯題 ${categoryCounts.wrong}`,
    `複習 ${categoryCounts.review}`,
    `新題 ${categoryCounts.new}`,
  ].join(" / ");
}

function materializeDailyPlan(args: {
  allQuestions: ImageQuizQuestion[];
  storedAnswers: UserAnswer[];
  dateKey: string;
  questionIds: string[];
  categoryQuestionIds: Record<DailyPlanCategory, string[]>;
  plan: SmartStudyPlanStats;
  generatedFromCache: boolean;
}): DailyPlanResult {
  const byId = new Map(
    args.allQuestions.map((question) => [question.id, question]),
  );
  const allQuestionIds = new Set(byId.keys());
  const validPlanQuestions = args.questionIds
    .map((questionId) => byId.get(questionId))
    .filter((question): question is ImageQuizQuestion => Boolean(question));
  const todayAnsweredIds = getTodayAnsweredIds(
    args.storedAnswers,
    allQuestionIds,
    args.dateKey,
  );
  const categoryQuestionIds = normalizeCategoryQuestionIds(
    args.categoryQuestionIds,
    allQuestionIds,
  );
  const categoryCounts = countRemainingCategoryQuestions(
    categoryQuestionIds,
    todayAnsweredIds,
  );
  const remainingQuestions = validPlanQuestions.filter(
    (question) => !todayAnsweredIds.has(question.id),
  );
  const plannedCount = validPlanQuestions.length;
  const remainingCount = remainingQuestions.length;
  const initialCompletedQuestionIds = validPlanQuestions
    .map((question) => question.id)
    .filter((questionId) => todayAnsweredIds.has(questionId));
  const stablePlan = {
    ...args.plan,
    suggestedDailyCount: plannedCount,
  };

  return {
    questions: remainingQuestions,
    planQuestionIds: validPlanQuestions.map((question) => question.id),
    categoryCounts,
    categoryQuestionIds,
    remainingAllocations: buildRemainingAllocations(
      stablePlan,
      categoryCounts,
    ),
    remainingCount,
    plannedCount,
    completedBeforePlanCount: Math.max(0, plannedCount - remainingCount),
    initialCompletedQuestionIds,
    plan: stablePlan,
    summary: buildDailySummary(categoryCounts),
    generatedFromCache: args.generatedFromCache,
  };
}

function readStoredDailyPlan(args: {
  allQuestions: ImageQuizQuestion[];
  storedAnswers: UserAnswer[];
  dateKey: string;
  expectedPlanSignature: string;
  expectedQuestionUniverseSignature: string;
  fallbackPlan: SmartStudyPlanStats;
}): DailyPlanResult | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = readScopedStorageItem(dailyPlanStorageKey(args.dateKey));
  if (!raw) return undefined;

  try {
    const stored = JSON.parse(raw) as Partial<StoredDailyPlan>;
    if (
      stored.date !== args.dateKey ||
      stored.version !== DAILY_PLAN_STORAGE_VERSION ||
      stored.planSignature !== args.expectedPlanSignature ||
      stored.questionUniverseSignature !==
        args.expectedQuestionUniverseSignature ||
      !Array.isArray(stored.questionIds) ||
      stored.questionIds.length === 0 ||
      !stored.categoryQuestionIds
    ) {
      return undefined;
    }
    const plan = stored.planSnapshot ?? args.fallbackPlan;
    return materializeDailyPlan({
      allQuestions: args.allQuestions,
      storedAnswers: args.storedAnswers,
      dateKey: args.dateKey,
      questionIds: stored.questionIds,
      categoryQuestionIds: stored.categoryQuestionIds,
      plan,
      generatedFromCache: true,
    });
  } catch {
    return undefined;
  }
}

function writeStoredDailyPlan(args: {
  result: DailyPlanResult;
  dateKey: string;
  config: StudyPlanConfig;
  questionUniverseSignature: string;
  now: Date;
}): void {
  if (
    typeof window === "undefined" ||
    args.result.planQuestionIds.length === 0
  ) {
    return;
  }
  const stored: StoredDailyPlan = {
    version: DAILY_PLAN_STORAGE_VERSION,
    date: args.dateKey,
    createdAt: args.now.toISOString(),
    planSignature: getStudyPlanSignature(args.config),
    questionUniverseSignature: args.questionUniverseSignature,
    questionIds: args.result.planQuestionIds,
    plannedCount: args.result.plannedCount,
    categoryCounts: args.result.categoryCounts,
    categoryQuestionIds: args.result.categoryQuestionIds,
    planSnapshot: args.result.plan,
  };
  writeScopedStorageItem(
    dailyPlanStorageKey(args.dateKey),
    JSON.stringify(stored),
  );
}

function dailyPlanStorageKey(dateKey: string): string {
  return `${DAILY_PLAN_KEY_PREFIX}${dateKey}`;
}

function getTodayAnsweredIds(
  answers: UserAnswer[],
  allQuestionIds: Set<string>,
  dateKey: string,
): Set<string> {
  return new Set(
    answers
      .filter(
        (answer) =>
          allQuestionIds.has(answer.questionId) &&
          localTodayKey(new Date(answer.answeredAt)) === dateKey,
      )
      .map((answer) => answer.questionId),
  );
}

function normalizeCategoryQuestionIds(
  source: Partial<Record<DailyPlanCategory, string[]>>,
  validQuestionIds: Set<string>,
): Record<DailyPlanCategory, string[]> {
  const valid = (values: string[] | undefined) =>
    (values ?? []).filter((questionId) => validQuestionIds.has(questionId));
  return {
    new: valid(source.new),
    wrong: valid(source.wrong),
    review: valid(source.review),
    mixed: valid(source.mixed),
  };
}

function countRemainingCategoryQuestions(
  categoryQuestionIds: Record<DailyPlanCategory, string[]>,
  answeredIds: Set<string>,
): Record<DailyPlanCategory, number> {
  return {
    new: categoryQuestionIds.new.filter(
      (questionId) => !answeredIds.has(questionId),
    ).length,
    wrong: categoryQuestionIds.wrong.filter(
      (questionId) => !answeredIds.has(questionId),
    ).length,
    review: categoryQuestionIds.review.filter(
      (questionId) => !answeredIds.has(questionId),
    ).length,
    mixed: categoryQuestionIds.mixed.filter(
      (questionId) => !answeredIds.has(questionId),
    ).length,
  };
}

function buildRemainingAllocations(
  plan: SmartStudyPlanStats,
  counts: Record<DailyPlanCategory, number>,
): Record<DailyPlanCategory, DailyPlanAllocation> {
  return Object.fromEntries(
    DAILY_PLAN_CATEGORIES.map((category) => {
      const original = plan.allocations[category];
      const minutesPerQuestion =
        original.count > 0
          ? original.estimatedMinutes / original.count
          : category === "wrong"
            ? 4
            : category === "review"
              ? 1.8
              : 2.5;
      return [
        category,
        {
          ...original,
          count: counts[category],
          estimatedMinutes: Math.round(counts[category] * minutesPerQuestion),
        },
      ];
    }),
  ) as Record<DailyPlanCategory, DailyPlanAllocation>;
}

function interleaveDailyQuestions(
  categories: Record<DailyPlanCategory, ImageQuizQuestion[]>,
  intensity: StudyIntensity,
): ImageQuizQuestion[] {
  const queues = Object.fromEntries(
    DAILY_PLAN_CATEGORIES.map((category) => [
      category,
      [...categories[category]],
    ]),
  ) as Record<DailyPlanCategory, ImageQuizQuestion[]>;
  const patternByIntensity: Record<
    StudyIntensity,
    DailyPlanCategory[]
  > = {
    steady: ["wrong", "review", "review", "new", "mixed"],
    standard: ["wrong", "review", "new", "new", "mixed"],
    sprint: ["wrong", "review", "new", "new", "new", "mixed"],
  };
  const pattern = patternByIntensity[intensity];
  const result: ImageQuizQuestion[] = [];

  while (Object.values(queues).some((queue) => queue.length > 0)) {
    let added = false;
    for (const category of pattern) {
      const question = queues[category].shift();
      if (!question) continue;
      result.push(question);
      added = true;
    }
    if (!added) break;
  }
  return result;
}

function takeBalancedByExamSubject(
  source: ImageQuizQuestion[],
  count: number,
  selectedIds: Set<string>,
): ImageQuizQuestion[] {
  if (count <= 0 || source.length === 0) return [];
  const available = source.filter(
    (question) => !selectedIds.has(question.id),
  );
  const buckets = {
    investment: available.filter(
      (question) => examSubjectKey(question) === "investment",
    ),
    financial: available.filter(
      (question) => examSubjectKey(question) === "financial",
    ),
    trading: available.filter(
      (question) => examSubjectKey(question) === "trading",
    ),
  };
  const targetBySubject = distributeCount(count, [
    { key: "investment", available: buckets.investment.length, weight: 1 },
    { key: "financial", available: buckets.financial.length, weight: 1 },
    { key: "trading", available: buckets.trading.length, weight: 1 },
  ]);
  const selected: ImageQuizQuestion[] = [];
  selected.push(
    ...takeFromBucket(
      buckets.investment,
      targetBySubject.investment,
      selectedIds,
    ),
  );
  selected.push(
    ...takeFromBucket(
      buckets.financial,
      targetBySubject.financial,
      selectedIds,
    ),
  );
  selected.push(
    ...takeTradingQuestions(
      buckets.trading,
      targetBySubject.trading,
      selectedIds,
    ),
  );
  if (selected.length < count) {
    selected.push(
      ...takeFromBucket(available, count - selected.length, selectedIds),
    );
  }
  return selected;
}

function takeTradingQuestions(
  source: ImageQuizQuestion[],
  count: number,
  selectedIds: Set<string>,
): ImageQuizQuestion[] {
  if (count <= 0) return [];
  const regulations = source.filter(
    (question) => question.bankId === "securities-trading-regulations",
  );
  const practice = source.filter(
    (question) => question.bankId === "securities-trading-practice",
  );
  const targets = distributeCount(count, [
    {
      key: "regulations",
      available: regulations.length,
      weight: Math.max(1, regulations.length),
    },
    {
      key: "practice",
      available: practice.length,
      weight: Math.max(1, practice.length),
    },
  ]);
  const selected = [
    ...takeFromBucket(regulations, targets.regulations, selectedIds),
    ...takeFromBucket(practice, targets.practice, selectedIds),
  ];
  if (selected.length < count) {
    selected.push(
      ...takeFromBucket(source, count - selected.length, selectedIds),
    );
  }
  return selected;
}

function takeFromBucket(
  source: ImageQuizQuestion[],
  count: number,
  selectedIds: Set<string>,
): ImageQuizQuestion[] {
  const selected: ImageQuizQuestion[] = [];
  for (const question of source) {
    if (selected.length >= count) break;
    if (selectedIds.has(question.id)) continue;
    selected.push(question);
    selectedIds.add(question.id);
  }
  return selected;
}

function distributeCount<K extends string>(
  count: number,
  inputs: { key: K; available: number; weight: number }[],
): Record<K, number> {
  const result = Object.fromEntries(
    inputs.map((input) => [input.key, 0]),
  ) as Record<K, number>;
  const remaining = Math.min(
    count,
    inputs.reduce((sum, input) => sum + input.available, 0),
  );
  const active = inputs.filter((input) => input.available > 0);
  if (remaining <= 0 || active.length === 0) return result;
  const totalWeight = active.reduce((sum, input) => sum + input.weight, 0);

  for (const input of active) {
    const target = Math.floor((remaining * input.weight) / totalWeight);
    result[input.key] = Math.min(input.available, target);
  }
  let assigned = (Object.values(result) as number[]).reduce(
    (sum, value) => sum + value,
    0,
  );
  while (assigned < remaining) {
    const next = active
      .filter((input) => result[input.key] < input.available)
      .sort((left, right) => {
        const leftRatio = result[left.key] / left.weight;
        const rightRatio = result[right.key] / right.weight;
        return leftRatio - rightRatio;
      })[0];
    if (!next) break;
    result[next.key] += 1;
    assigned += 1;
  }
  return result;
}

function examSubjectKey(
  question: ImageQuizQuestion,
): "investment" | "financial" | "trading" {
  if (question.bankId === "investment") return "investment";
  if (question.bankId === "financial-analysis") return "financial";
  return "trading";
}

function buildQuestionUniverseSignature(
  questions: ImageQuizQuestion[],
): string {
  let hash = 2166136261;
  for (const question of questions) {
    for (let index = 0; index < question.id.length; index += 1) {
      hash ^= question.id.charCodeAt(index);
      hash = Math.imul(hash, 16777619);
    }
  }
  return `${questions.length}:${(hash >>> 0).toString(16)}`;
}
