import {
  clearScopedStorageByPrefix,
  readScopedStorageItem,
  removeScopedStorageItem,
  writeScopedStorageItem,
} from "./userScopedStorage";

const LEGACY_EXAM_DATE_KEY = "quizpwa:exam-date";
const LEGACY_DAILY_STUDY_MINUTES_KEY = "quizpwa:daily-study-minutes";
const LEGACY_STUDY_INTENSITY_KEY = "quizpwa:study-intensity";
const LEGACY_STUDY_PLAN_V2_KEY_PREFIX = "quizpwa:study-plan:v2:";
const LEGACY_STUDY_PLAN_V3_KEY_PREFIX = "quizpwa:study-plan:v3:";
const STUDY_PLAN_KEY_PREFIX = "quizpwa:study-plan:v4:";
const STUDY_PLAN_MIGRATION_KEY = "quizpwa:study-plan:v4:migrated";
const DAILY_PLAN_KEY_PREFIX = "quizpwa:daily-plan:";

export const STUDY_PLAN_CHANGED = "quizpwa:study-plan-changed";
export const DAILY_PLAN_STORAGE_VERSION = 45;
export const DAY_MS = 24 * 60 * 60 * 1000;

export type StudyIntensity = "steady" | "standard" | "sprint";
export type DailyPlanCategory = "new" | "wrong" | "review" | "mixed";
export type StudyPlanExamId = "senior-securities" | "junior-foreign-exchange";

export const STUDY_PLAN_EXAMS = [
  { id: "senior-securities", title: "證券高業" },
  { id: "junior-foreign-exchange", title: "初階外匯" },
] as const satisfies ReadonlyArray<{ id: StudyPlanExamId; title: string }>;

export const STUDY_PLAN_SCOPES = [
  { id: "investment", examId: "senior-securities", title: "投資學" },
  { id: "financial-analysis", examId: "senior-securities", title: "財務分析" },
  { id: "securities-laws-practice", examId: "senior-securities", title: "證券相關法規與實務" },
  { id: "fx-remittance", examId: "junior-foreign-exchange", title: "國外匯兌業務" },
  { id: "fx-trade", examId: "junior-foreign-exchange", title: "進出口外匯業務" },
] as const;

export type StudyPlanScopeId = (typeof STUDY_PLAN_SCOPES)[number]["id"];
export type StudyPlanScope = (typeof STUDY_PLAN_SCOPES)[number];

export type StudyPlanConfig = {
  examDate: string | null;
  dailyStudyMinutes: number;
  intensity: StudyIntensity;
};

export type StudyPlanChangeDetail = {
  examId: StudyPlanExamId;
  config: StudyPlanConfig;
  /** Legacy compatibility for listeners created before plans became exam-scoped. */
  scopeId?: StudyPlanScopeId;
};

export const DEFAULT_STUDY_PLAN_CONFIG: StudyPlanConfig = {
  examDate: null,
  dailyStudyMinutes: 60,
  intensity: "standard",
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

export function isStudyPlanScopeId(value: unknown): value is StudyPlanScopeId {
  return STUDY_PLAN_SCOPES.some((scope) => scope.id === value);
}

export function getStudyPlanScope(scopeId: StudyPlanScopeId): StudyPlanScope {
  return STUDY_PLAN_SCOPES.find((scope) => scope.id === scopeId) ?? STUDY_PLAN_SCOPES[0];
}

export function getStudyPlanScopesForExam(examId: StudyPlanExamId): StudyPlanScope[] {
  return STUDY_PLAN_SCOPES.filter((scope) => scope.examId === examId);
}

export function getDefaultStudyPlanScopeForExam(examId: StudyPlanExamId): StudyPlanScopeId {
  return examId === "junior-foreign-exchange" ? "fx-remittance" : "investment";
}

export function getStudyPlanExamTitle(examId: StudyPlanExamId): string {
  return examId === "junior-foreign-exchange" ? "初階外匯" : "證券高業";
}

export function getStudyPlanExamId(scopeId: StudyPlanScopeId): StudyPlanExamId {
  return getStudyPlanScope(scopeId).examId;
}

export function isSecuritiesStudyPlanScopeId(
  scopeId: StudyPlanScopeId,
): boolean {
  return getStudyPlanScope(scopeId).examId === "senior-securities";
}

export function isForeignExchangeStudyPlanScopeId(
  scopeId: StudyPlanScopeId,
): boolean {
  return getStudyPlanScope(scopeId).examId === "junior-foreign-exchange";
}

export function studyPlanScopeMatchesBankId(
  scopeId: StudyPlanScopeId,
  bankId: string,
): boolean {
  if (scopeId === "securities-laws-practice") {
    return bankId === "securities-trading-regulations" ||
      bankId === "securities-trading-practice" ||
      bankId === "securities-laws-practice";
  }
  return scopeId === bankId;
}

export function getStudyPlanConfig(scopeId: StudyPlanScopeId = "investment"): StudyPlanConfig {
  return getStudyPlanConfigForExam(getStudyPlanExamId(scopeId));
}

export function getStudyPlanConfigForExam(examId: StudyPlanExamId): StudyPlanConfig {
  migrateLegacyStudyPlan();
  const raw = readScopedStorageItem(studyPlanExamStorageKey(examId), false);
  if (!raw) return { ...DEFAULT_STUDY_PLAN_CONFIG };
  try {
    return sanitizeStudyPlanConfig(JSON.parse(raw));
  } catch {
    return { ...DEFAULT_STUDY_PLAN_CONFIG };
  }
}

export function getStudyPlanConfigs(): Record<StudyPlanScopeId, StudyPlanConfig> {
  const securities = getStudyPlanConfigForExam("senior-securities");
  const foreignExchange = getStudyPlanConfigForExam("junior-foreign-exchange");
  return Object.fromEntries(
    STUDY_PLAN_SCOPES.map((scope) => [
      scope.id,
      { ...(scope.examId === "senior-securities" ? securities : foreignExchange) },
    ]),
  ) as Record<StudyPlanScopeId, StudyPlanConfig>;
}

export function getStudyPlanConfigsByExam(): Record<StudyPlanExamId, StudyPlanConfig> {
  return {
    "senior-securities": getStudyPlanConfigForExam("senior-securities"),
    "junior-foreign-exchange": getStudyPlanConfigForExam("junior-foreign-exchange"),
  };
}

export function setStudyPlanConfig(config: StudyPlanConfig): void;
export function setStudyPlanConfig(scopeId: StudyPlanScopeId, config: StudyPlanConfig): void;
export function setStudyPlanConfig(
  scopeOrConfig: StudyPlanScopeId | StudyPlanConfig,
  maybeConfig?: StudyPlanConfig,
): void {
  if (typeof window === "undefined") return;
  if (typeof scopeOrConfig === "string") {
    writeStudyPlanConfig(scopeOrConfig, maybeConfig ?? DEFAULT_STUDY_PLAN_CONFIG);
    return;
  }
  writeStudyPlanConfig("investment", scopeOrConfig);
}

export function setStudyPlanConfigForExam(
  examId: StudyPlanExamId,
  config: StudyPlanConfig,
): void {
  if (typeof window === "undefined") return;
  writeExamStudyPlanConfig(examId, config);
}

export function clearStudyPlanConfig(scopeId: StudyPlanScopeId): void {
  if (typeof window === "undefined") return;
  const examId = getStudyPlanExamId(scopeId);
  removeScopedStorageItem(studyPlanExamStorageKey(examId));
  clearStoredDailyPlansForExam(examId);
  window.dispatchEvent(new CustomEvent<StudyPlanChangeDetail>(STUDY_PLAN_CHANGED, {
    detail: {
      scopeId: getDefaultStudyPlanScopeForExam(examId),
      examId,
      config: { ...DEFAULT_STUDY_PLAN_CONFIG },
    },
  }));
}

export function clearStudyPlanConfigForExam(examId: StudyPlanExamId): void {
  if (typeof window === "undefined") return;
  removeScopedStorageItem(studyPlanExamStorageKey(examId));
  clearStoredDailyPlansForExam(examId);
  window.dispatchEvent(new CustomEvent<StudyPlanChangeDetail>(STUDY_PLAN_CHANGED, {
    detail: { examId, scopeId: getDefaultStudyPlanScopeForExam(examId), config: { ...DEFAULT_STUDY_PLAN_CONFIG } },
  }));
}

export function isStudyPlanConfigured(config: StudyPlanConfig): boolean {
  return Boolean(config.examDate);
}

export function getStudyPlanSignature(config: StudyPlanConfig = getStudyPlanConfig()): string {
  return [config.examDate ?? "unset", clampMinutes(config.dailyStudyMinutes), config.intensity].join("|");
}

export function clearStoredDailyPlans(scopeId?: string): void {
  clearScopedStorageByPrefix(scopeId ? `${DAILY_PLAN_KEY_PREFIX}${scopeId}:` : DAILY_PLAN_KEY_PREFIX);
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
  // Preserve a small review buffer before the exam, while keeping at least
  // one day available for first-pass progress.
  const reserveDays = daysLeft === null || daysLeft <= 1
    ? 0
    : Math.min(
        daysLeft - 1,
        profile.maxReserveDays,
        Math.max(profile.minReserveDays, Math.round(daysLeft * profile.reserveRate)),
      );
  const progressDays = Math.max(1, (daysLeft ?? 7) - reserveDays);
  const remainingQuestions = Math.max(0, args.unattemptedQuestions);
  const requiredNewPerDay = remainingQuestions === 0 ? 0 : Math.ceil(remainingQuestions / progressDays);
  const availability: Record<DailyPlanCategory, number> = {
    new: remainingQuestions,
    wrong: Math.max(0, args.wrongDueQuestions),
    review: Math.max(0, args.reviewDueQuestions),
    mixed: Math.max(0, args.mixedPoolQuestions),
  };
  const executableAvailability: Record<DailyPlanCategory, number> = {
    ...availability,
    new: Math.min(remainingQuestions, requiredNewPerDay),
    mixed: 0,
  };
  const counts = allocateByTime(executableAvailability, effectivePracticeMinutes, profile);
  const suggestedDailyCount = Object.values(counts).reduce((sum, count) => sum + count, 0);
  const timeCapacityCount = suggestedDailyCount;
  const estimatedMinutes = Math.round(
    (Object.keys(counts) as DailyPlanCategory[]).reduce(
      (sum, category) => sum + counts[category] * profile.categories[category].minutesPerQuestion,
      0,
    ),
  );
  const theoreticalCounts: Record<DailyPlanCategory, number> = {
    new: Math.min(remainingQuestions, requiredNewPerDay),
    wrong: availability.wrong,
    review: availability.review,
    mixed: 0,
  };
  const theoreticalDailyCount = Object.values(theoreticalCounts).reduce((sum, count) => sum + count, 0);
  const requiredMinutes = Math.round(
    (Object.keys(theoreticalCounts) as DailyPlanCategory[]).reduce(
      (sum, category) => sum + theoreticalCounts[category] * profile.categories[category].minutesPerQuestion,
      0,
    ),
  );
  const overloadGap = Math.max(0, theoreticalDailyCount - suggestedDailyCount);
  const isOverloaded = requiredMinutes > effectivePracticeMinutes || overloadGap > 0;
  const suggestedMinutes = Math.ceil(requiredMinutes / profile.focusRate);
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
      ? `完整覆蓋速度需要每天 ${requiredNewPerDay} 題新題，另有 ${availability.wrong} 題錯題與 ${availability.review} 題到期複習；依目前 ${dailyStudyMinutes} 分鐘，今天安排可實際完成的 ${suggestedDailyCount} 題。建議增加讀書時間或採高分優先策略。`
      : `已保留 ${reserveDays} 天總複習緩衝；依目前時間，今日完成 ${suggestedDailyCount} 題即可維持進度。`,
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

function studyPlanExamStorageKey(examId: StudyPlanExamId): string {
  return `${STUDY_PLAN_KEY_PREFIX}${examId}`;
}

function legacyStudyPlanV3StorageKey(scopeId: StudyPlanScopeId): string {
  return `${LEGACY_STUDY_PLAN_V3_KEY_PREFIX}${scopeId}`;
}

function sanitizeStudyPlanConfig(value: unknown): StudyPlanConfig {
  if (!value || typeof value !== "object") return { ...DEFAULT_STUDY_PLAN_CONFIG };
  const source = value as Partial<StudyPlanConfig>;
  const examDate = typeof source.examDate === "string" && /^\d{4}-\d{2}-\d{2}$/.test(source.examDate)
    ? source.examDate
    : null;
  const intensity = source.intensity === "steady" || source.intensity === "sprint"
    ? source.intensity
    : "standard";
  return {
    examDate,
    dailyStudyMinutes: clampMinutes(Number(source.dailyStudyMinutes ?? 60)),
    intensity,
  };
}

function writeStudyPlanConfig(
  scopeId: StudyPlanScopeId,
  config: StudyPlanConfig,
  dispatch = true,
): void {
  writeExamStudyPlanConfig(getStudyPlanExamId(scopeId), config, dispatch);
}

function writeExamStudyPlanConfig(
  examId: StudyPlanExamId,
  config: StudyPlanConfig,
  dispatch = true,
): void {
  const sanitized = sanitizeStudyPlanConfig(config);
  writeScopedStorageItem(studyPlanExamStorageKey(examId), JSON.stringify(sanitized));
  clearStoredDailyPlansForExam(examId);
  if (dispatch) {
    window.dispatchEvent(new CustomEvent<StudyPlanChangeDetail>(STUDY_PLAN_CHANGED, {
      detail: {
        examId,
        scopeId: getDefaultStudyPlanScopeForExam(examId),
        config: sanitized,
      },
    }));
  }
}

function clearStoredDailyPlansForExam(examId: StudyPlanExamId): void {
  for (const scope of getStudyPlanScopesForExam(examId)) {
    clearStoredDailyPlans(scope.id);
  }
  clearStoredDailyPlans(examId);
}

function migrateLegacyStudyPlan(): void {
  if (typeof window === "undefined") return;
  if (readScopedStorageItem(STUDY_PLAN_MIGRATION_KEY, false) === "true") return;

  migrateExamPlan("senior-securities", [
    readLegacyV3Config("investment"),
    readLegacyV3Config("financial-analysis"),
    readLegacyV3Config("securities-laws-practice"),
    readLegacyV2Config("investment"),
    readLegacyV2Config("financial-analysis"),
    chooseCombinedLawsPracticeConfig(
      readLegacyV2Config("securities-trading-regulations"),
      readLegacyV2Config("securities-trading-practice"),
      null,
    ),
    readLegacyExamScopedConfig("senior-securities"),
    readLegacyGlobalConfig(),
  ]);

  migrateExamPlan("junior-foreign-exchange", [
    readLegacyV3Config("fx-remittance"),
    readLegacyV3Config("fx-trade"),
    readLegacyV2Config("fx-remittance"),
    readLegacyV2Config("fx-trade"),
    readLegacyExamScopedConfig("junior-foreign-exchange"),
  ]);

  clearStoredDailyPlans();
  writeScopedStorageItem(STUDY_PLAN_MIGRATION_KEY, "true");
}

function migrateExamPlan(
  examId: StudyPlanExamId,
  candidates: Array<StudyPlanConfig | null>,
): void {
  if (readScopedStorageItem(studyPlanExamStorageKey(examId), false) !== null) return;
  const available = candidates.filter((candidate): candidate is StudyPlanConfig => Boolean(candidate));
  if (available.length === 0) return;
  const configured = available.find((candidate) => Boolean(candidate.examDate));
  const selected = configured ?? available[0];
  if (!selected) return;
  writeScopedStorageItem(studyPlanExamStorageKey(examId), JSON.stringify(selected));
}

function chooseCombinedLawsPracticeConfig(
  regulations: StudyPlanConfig | null,
  practice: StudyPlanConfig | null,
  fallback: StudyPlanConfig | null,
): StudyPlanConfig | null {
  const configured = [regulations, practice].find((config) => Boolean(config?.examDate));
  return configured ?? regulations ?? practice ?? fallback;
}

function readLegacyV3Config(scopeId: StudyPlanScopeId): StudyPlanConfig | null {
  const raw = readScopedStorageItem(legacyStudyPlanV3StorageKey(scopeId), false);
  if (!raw) return null;
  try {
    return sanitizeStudyPlanConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readLegacyV2Config(scopeId: string): StudyPlanConfig | null {
  const raw = readScopedStorageItem(`${LEGACY_STUDY_PLAN_V2_KEY_PREFIX}${scopeId}`, false);
  if (!raw) return null;
  try {
    return sanitizeStudyPlanConfig(JSON.parse(raw));
  } catch {
    return null;
  }
}

function readLegacyGlobalConfig(): StudyPlanConfig | null {
  const examDate = readScopedStorageItem(LEGACY_EXAM_DATE_KEY);
  const minutes = readScopedStorageItem(LEGACY_DAILY_STUDY_MINUTES_KEY);
  const intensity = readScopedStorageItem(LEGACY_STUDY_INTENSITY_KEY);
  if (examDate === null && minutes === null && intensity === null) return null;
  return sanitizeStudyPlanConfig({
    examDate,
    dailyStudyMinutes: Number(minutes ?? 60),
    intensity,
  });
}

function readLegacyExamScopedConfig(examId: StudyPlanExamId): StudyPlanConfig | null {
  const examDate = readScopedStorageItem(`quizpwa:study-plan:${examId}:exam-date`, false);
  const minutes = readScopedStorageItem(`quizpwa:study-plan:${examId}:daily-study-minutes`, false);
  const intensity = readScopedStorageItem(`quizpwa:study-plan:${examId}:study-intensity`, false);
  if (examDate === null && minutes === null && intensity === null) return null;
  return sanitizeStudyPlanConfig({
    examDate,
    dailyStudyMinutes: Number(minutes ?? 60),
    intensity,
  });
}

function clampMinutes(value: number): number {
  return Math.min(720, Math.max(15, Math.round(Number.isFinite(value) ? value : 60)));
}
