import {
  clearScopedStorageByPrefix,
  readScopedStorageItem,
  removeScopedStorageItem,
  writeScopedStorageItem,
} from "./userScopedStorage";

const EXAM_DATE_KEY = "quizpwa:exam-date";
const DAILY_STUDY_MINUTES_KEY = "quizpwa:daily-study-minutes";
const STUDY_INTENSITY_KEY = "quizpwa:study-intensity";
const DAILY_PLAN_KEY_PREFIX = "quizpwa:daily-plan:";

export const STUDY_PLAN_CHANGED = "quizpwa:study-plan-changed";
export const DAILY_PLAN_STORAGE_VERSION = 42;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type StudyIntensity = "steady" | "standard" | "sprint";
export type DailyPlanCategory = "new" | "wrong" | "review" | "mixed";

export type StudyPlanConfig = {
  examDate: string | null;
  dailyStudyMinutes: number;
  intensity: StudyIntensity;
};

export type DailyPlanAllocation = {
  id: DailyPlanCategory;
  label: string;
  count: number;
  estimatedMinutes: number;
  description: string;
};

export type SmartStudyPlanStats = {
  examDate: string | null;
  daysLeft: number | null;
  reserveDays: number;
  progressDays: number;
  remainingQuestions: number;
  dailyStudyMinutes: number;
  intensity: StudyIntensity;
  effectivePracticeMinutes: number;
  timeCapacityCount: number;
  requiredNewPerDay: number;
  suggestedDailyCount: number;
  estimatedMinutes: number;
  requiredMinutes: number;
  overloadGap: number;
  suggestedMinutes: number;
  isOverloaded: boolean;
  modeLabel: string;
  warningTitle: string;
  warningMessage: string;
  allocations: Record<DailyPlanCategory, DailyPlanAllocation>;
  wrongDueQuestions: number;
  reviewDueQuestions: number;
  mixedPoolQuestions: number;
};

type CategoryProfile = {
  ratio: number;
  minutesPerQuestion: number;
};

type IntensityProfile = {
  label: string;
  focusRate: number;
  reserveRate: number;
  minReserveDays: number;
  maxReserveDays: number;
  categories: Record<DailyPlanCategory, CategoryProfile>;
  spareOrder: DailyPlanCategory[];
};

const INTENSITY_PROFILES: Record<StudyIntensity, IntensityProfile> = {
  steady: {
    label: "穩定型",
    focusRate: 0.78,
    reserveRate: 0.2,
    minReserveDays: 3,
    maxReserveDays: 10,
    categories: {
      new: { ratio: 0.42, minutesPerQuestion: 2.5 },
      wrong: { ratio: 0.26, minutesPerQuestion: 4 },
      review: { ratio: 0.32, minutesPerQuestion: 1.8 },
      mixed: { ratio: 0, minutesPerQuestion: 2 },
    },
    spareOrder: ["review", "wrong", "new"],
  },
  standard: {
    label: "標準型",
    focusRate: 0.85,
    reserveRate: 0.16,
    minReserveDays: 2,
    maxReserveDays: 8,
    categories: {
      new: { ratio: 0.48, minutesPerQuestion: 2.5 },
      wrong: { ratio: 0.32, minutesPerQuestion: 4 },
      review: { ratio: 0.20, minutesPerQuestion: 1.8 },
      mixed: { ratio: 0, minutesPerQuestion: 2 },
    },
    spareOrder: ["wrong", "review", "new"],
  },
  sprint: {
    label: "衝刺型",
    focusRate: 0.9,
    reserveRate: 0.12,
    minReserveDays: 2,
    maxReserveDays: 5,
    categories: {
      new: { ratio: 0.58, minutesPerQuestion: 2.5 },
      wrong: { ratio: 0.28, minutesPerQuestion: 4 },
      review: { ratio: 0.14, minutesPerQuestion: 1.8 },
      mixed: { ratio: 0, minutesPerQuestion: 2 },
    },
    spareOrder: ["new", "wrong", "review"],
  },
};

const CATEGORY_LABELS: Record<DailyPlanCategory, string> = {
  new: "新題練習",
  wrong: "錯題訂正",
  review: "間隔複習",
  mixed: "混合小測",
};

const CATEGORY_DESCRIPTIONS: Record<DailyPlanCategory, string> = {
  new: "依題庫原順序推進，確保首輪覆蓋率。",
  wrong: "優先回收錯題，避免錯題只是躺在錯題本裡睡覺。",
  review: "複習已做過的題目，讓記憶不要準時下班。",
  mixed: "跨章混合測試穩定度，避免只會章節內順風局。",
};

export function getStudyPlanConfig(): StudyPlanConfig {
  return {
    examDate: getStoredDate(EXAM_DATE_KEY),
    dailyStudyMinutes: getStoredNumber(DAILY_STUDY_MINUTES_KEY, 60),
    intensity: getStoredIntensity(),
  };
}

export function setStudyPlanConfig(config: StudyPlanConfig): void {
  if (typeof window === "undefined") return;
  if (config.examDate) writeScopedStorageItem(EXAM_DATE_KEY, config.examDate);
  else removeScopedStorageItem(EXAM_DATE_KEY);
  writeScopedStorageItem(DAILY_STUDY_MINUTES_KEY, clampMinutes(config.dailyStudyMinutes).toString());
  writeScopedStorageItem(STUDY_INTENSITY_KEY, config.intensity);
  clearStoredDailyPlans();
  window.dispatchEvent(new CustomEvent<StudyPlanConfig>(STUDY_PLAN_CHANGED, { detail: getStudyPlanConfig() }));
}

export function getStudyPlanSignature(config: StudyPlanConfig = getStudyPlanConfig()): string {
  return [config.examDate ?? "unset", clampMinutes(config.dailyStudyMinutes), config.intensity].join("|");
}

export function clearStoredDailyPlans(): void {
  clearScopedStorageByPrefix(DAILY_PLAN_KEY_PREFIX);
}

export function localTodayKey(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function calculateDaysLeft(examDate: string | null, now = new Date()): number | null {
  if (!examDate) return null;
  const [year, month, day] = examDate.split("-").map(Number);
  if (!year || !month || !day) return null;
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const exam = new Date(year, month - 1, day).getTime();
  return Math.max(0, Math.ceil((exam - today) / DAY_MS));
}

export function calculateSmartStudyPlanStats(args: {
  totalQuestions: number;
  unattemptedQuestions: number;
  wrongDueQuestions: number;
  reviewDueQuestions: number;
  mixedPoolQuestions: number;
  examDate: string | null;
  dailyStudyMinutes?: number;
  intensity?: StudyIntensity;
  now?: Date;
}): SmartStudyPlanStats {
  const intensity = args.intensity ?? "standard";
  const profile = INTENSITY_PROFILES[intensity];
  const dailyStudyMinutes = clampMinutes(args.dailyStudyMinutes ?? 60);
  const effectivePracticeMinutes = Math.max(1, Math.round(dailyStudyMinutes * profile.focusRate));
  const daysLeft = calculateDaysLeft(args.examDate, args.now ?? new Date());
  // The number shown as "今日應做" must represent the pace required to
  // finish the untouched bank before the exam.  A time-budget-only cap made a
  // near exam date display an unrealistically small target (for example 82
  // questions while more than 3,000 were still untouched).
  const reserveDays = 0;
  const progressDays = Math.max(1, daysLeft ?? 7);
  const remainingQuestions = Math.max(0, args.unattemptedQuestions);
  const requiredNewPerDay = remainingQuestions === 0 ? 0 : Math.ceil(remainingQuestions / progressDays);
  const availability: Record<DailyPlanCategory, number> = {
    new: remainingQuestions,
    wrong: Math.max(0, args.wrongDueQuestions),
    review: Math.max(0, args.reviewDueQuestions),
    mixed: Math.max(0, args.mixedPoolQuestions),
  };
  const timeCounts = allocateByTime(availability, effectivePracticeMinutes, profile);
  const timeCapacityCount = Object.values(timeCounts).reduce((sum, count) => sum + count, 0);
  const counts: Record<DailyPlanCategory, number> = {
    new: Math.min(remainingQuestions, requiredNewPerDay),
    wrong: availability.wrong,
    review: availability.review,
    mixed: 0,
  };

  const suggestedDailyCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const estimatedMinutes = Math.round(
    (Object.keys(counts) as DailyPlanCategory[]).reduce(
      (sum, category) => sum + counts[category] * profile.categories[category].minutesPerQuestion,
      0,
    ),
  );
  const requiredMinutes = estimatedMinutes;
  const overloadGap = Math.max(0, suggestedDailyCount - timeCapacityCount);
  const isOverloaded = estimatedMinutes > effectivePracticeMinutes || overloadGap > 0;
  const suggestedMinutes = Math.ceil(estimatedMinutes / profile.focusRate);
  const allocations = Object.fromEntries(
    (Object.keys(counts) as DailyPlanCategory[]).map((category) => [
      category,
      {
        id: category,
        label: CATEGORY_LABELS[category],
        count: counts[category],
        estimatedMinutes: Math.round(counts[category] * profile.categories[category].minutesPerQuestion),
        description: CATEGORY_DESCRIPTIONS[category],
      },
    ]),
  ) as Record<DailyPlanCategory, DailyPlanAllocation>;
  const pressureMode = daysLeft !== null && daysLeft <= 14 ? "極限衝刺模式" : daysLeft !== null && daysLeft <= 30 ? "期限壓力模式" : profile.label;

  return {
    examDate: args.examDate,
    daysLeft,
    reserveDays,
    progressDays,
    remainingQuestions,
    dailyStudyMinutes,
    intensity,
    effectivePracticeMinutes,
    timeCapacityCount,
    requiredNewPerDay,
    suggestedDailyCount,
    estimatedMinutes,
    requiredMinutes,
    overloadGap,
    suggestedMinutes,
    isOverloaded,
    modeLabel: isOverloaded ? pressureMode : profile.label,
    warningTitle: isOverloaded ? "目前計畫時間不足" : "目前節奏可執行",
    warningMessage: isOverloaded
      ? `距考試前共有 ${progressDays} 個完整練習日，尚未作答 ${remainingQuestions} 題，因此每天至少需完成 ${requiredNewPerDay} 題新題；今日另有 ${availability.wrong} 題錯題與 ${availability.review} 題到期複習，共 ${suggestedDailyCount} 題。依目前設定的 ${dailyStudyMinutes} 分鐘，時間可能不足。`
      : `依距離考試的剩餘天數計算，今日完成 ${suggestedDailyCount} 題即可維持全題庫覆蓋進度。`,
    allocations,
    wrongDueQuestions: availability.wrong,
    reviewDueQuestions: availability.review,
    mixedPoolQuestions: availability.mixed,
  };
}

export function isReviewDue(answeredAt: string, now = new Date()): boolean {
  const time = new Date(answeredAt).getTime();
  if (!Number.isFinite(time)) return false;
  return Math.floor((now.getTime() - time) / DAY_MS) >= 3;
}

export function formatExamDate(examDate: string | null): string {
  if (!examDate) return "尚未設定";
  const [year, month, day] = examDate.split("-").map(Number);
  if (!year || !month || !day) return examDate;
  return `${year}/${String(month).padStart(2, "0")}/${String(day).padStart(2, "0")}`;
}

function allocateByTime(
  availability: Record<DailyPlanCategory, number>,
  effectivePracticeMinutes: number,
  profile: IntensityProfile,
): Record<DailyPlanCategory, number> {
  const counts: Record<DailyPlanCategory, number> = { new: 0, wrong: 0, review: 0, mixed: 0 };
  let used = 0;
  for (const category of Object.keys(counts) as DailyPlanCategory[]) {
    const target = Math.floor((effectivePracticeMinutes * profile.categories[category].ratio) / profile.categories[category].minutesPerQuestion);
    counts[category] = Math.min(availability[category], Math.max(0, target));
    used += counts[category] * profile.categories[category].minutesPerQuestion;
  }
  let added = true;
  while (added) {
    added = false;
    for (const category of profile.spareOrder) {
      const minutes = profile.categories[category].minutesPerQuestion;
      if (counts[category] < availability[category] && used + minutes <= effectivePracticeMinutes) {
        counts[category] += 1;
        used += minutes;
        added = true;
      }
    }
  }
  return counts;
}

function getStoredDate(key: string): string | null {
  if (typeof window === "undefined") return null;
  const value = readScopedStorageItem(key);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function getStoredNumber(key: string, fallback: number): number {
  if (typeof window === "undefined") return fallback;
  return clampMinutes(Number(readScopedStorageItem(key)) || fallback);
}

function getStoredIntensity(): StudyIntensity {
  if (typeof window === "undefined") return "standard";
  const value = readScopedStorageItem(STUDY_INTENSITY_KEY);
  return value === "steady" || value === "standard" || value === "sprint" ? value : "standard";
}

function clampMinutes(value: number): number {
  return Math.min(720, Math.max(15, Math.round(Number.isFinite(value) ? value : 60)));
}
