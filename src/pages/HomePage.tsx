import {
  AlertTriangle,
  BookOpen,
  CalendarDays,
  Heart,
  Info,
  ListChecks,
  PlayCircle,
  Shuffle,
  Target,
  Trophy,
  X,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ErrorState } from "../components/ErrorState";
import { FrierenAnimation } from "../components/FrierenAnimation";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../auth/AuthContext";
import { listUserAnswers, listWrongQuestions } from "../lib/db";
import {
  loadImageQuizBankSummaries,
  type ImageQuizBank,
} from "../lib/imageQuiz";
import { calculateAccuracy } from "../lib/quiz";
import {
  formatTotalPracticeTime,
  getTotalPracticeSeconds,
  PRACTICE_TIME_CHANGED,
} from "../lib/practiceTime";
import {
  calculateSmartStudyPlanStats,
  DAILY_PLAN_STORAGE_VERSION,
  formatExamDate,
  getStudyPlanConfig,
  getStudyPlanSignature,
  isReviewDue,
  localTodayKey,
  setStudyPlanConfig,
  STUDY_PLAN_CHANGED,
  type DailyPlanCategory,
  type StudyIntensity,
  type StudyPlanConfig,
} from "../lib/studyPlan";
import type { UserAnswer, WrongQuestionRecord } from "../types";

const T = {
  loading: "載入題庫",
  title: "證券高業",
  tools: "複習與測驗",
  subject: "科目",
  question: "題",
  mixed: "全題庫練習",
  random80: "模擬考測驗",
  weakFirst: "弱點練習",
  similar: "相似題辨識訓練",
  favorites: "收藏題目",
  leaderboard: "排行榜",
  bankList: "題庫科目",
  chapters: "章",
  enter: "進入題庫",
  progress: "首輪覆蓋",
  setupTitle: "建立每日智能練習",
  setupDescription:
    "請設定考試日期、每天讀書時間與備考強度；App 會同時檢查期限壓力，不會只把總題庫平均除以天數。",
  examDate: "考試日期",
  dailyStudyTime: "每天讀書時間",
  intensity: "備考強度",
  save: "開始規劃",
  skip: "稍後設定",
  required: "請選擇考試日期。",
  countdown: "考試倒數",
  days: "天",
  examToday: "就是今天",
  smartPractice: "每日練習",
  startDaily: "開始今日練習",
  todayWrongReview: "今日錯題複習",
  wrongCorrection: "錯題訂正",
};

const STUDY_TIME_OPTIONS = [30, 60, 90, 120, 240] as const;
const INTENSITY_OPTIONS: {
  id: StudyIntensity;
  label: string;
  description: string;
}[] = [
  { id: "steady", label: "穩定型", description: "壓力小，複習比重較高。" },
  { id: "standard", label: "標準型", description: "新題、錯題、複習均衡。" },
  {
    id: "sprint",
    label: "衝刺型",
    description: "期限優先，首輪覆蓋與錯題訂正比重較高。",
  },
];

const EMPTY_BANKS: ImageQuizBank[] = [];
const EMPTY_ANSWERS: UserAnswer[] = [];
const EMPTY_WRONGS: WrongQuestionRecord[] = [];

type HomeData = {
  banks: ImageQuizBank[];
  answers: UserAnswer[];
  wrongRecords: WrongQuestionRecord[];
};

async function loadHomeData(includePrivateData: boolean): Promise<HomeData> {
  const [banks, answers, wrongRecords] = await Promise.all([
    loadImageQuizBankSummaries(),
    includePrivateData ? listUserAnswers() : Promise.resolve([]),
    includePrivateData ? listWrongQuestions() : Promise.resolve([]),
  ]);
  return { banks, answers, wrongRecords };
}

export function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [studyConfig, setStudyConfigState] = useState<StudyPlanConfig>(() =>
    getStudyPlanConfig(),
  );
  const [draftExamDate, setDraftExamDate] = useState(
    () => getStudyPlanConfig().examDate ?? "",
  );
  const [draftStudyMinutes, setDraftStudyMinutes] = useState(
    () => getStudyPlanConfig().dailyStudyMinutes,
  );
  const [draftIntensity, setDraftIntensity] = useState<StudyIntensity>(
    () => getStudyPlanConfig().intensity,
  );
  const [totalPracticeSeconds, setTotalPracticeSeconds] = useState(() =>
    getTotalPracticeSeconds(),
  );
  const [setupDismissed, setSetupDismissed] = useState(false);
  const [dailyDetailsOpen, setDailyDetailsOpen] = useState(false);
  const { isActivated } = useAuth();
  const { data, error, loading } = useAsync(
    () => loadHomeData(isActivated),
    [refreshKey, isActivated],
  );

  const banks = data?.banks ?? EMPTY_BANKS;
  const answers = data?.answers ?? EMPTY_ANSWERS;
  const wrongRecords = data?.wrongRecords ?? EMPTY_WRONGS;

  useEffect(() => {
    const refreshRecords = () => setRefreshKey((key) => key + 1);
    window.addEventListener("records:changed", refreshRecords);
    return () => window.removeEventListener("records:changed", refreshRecords);
  }, []);

  useEffect(() => {
    const refreshPracticeTime = () =>
      setTotalPracticeSeconds(getTotalPracticeSeconds());
    window.addEventListener(PRACTICE_TIME_CHANGED, refreshPracticeTime);
    window.addEventListener("storage", refreshPracticeTime);
    return () => {
      window.removeEventListener(PRACTICE_TIME_CHANGED, refreshPracticeTime);
      window.removeEventListener("storage", refreshPracticeTime);
    };
  }, []);

  useEffect(() => {
    const refreshStudyPlan = () => {
      const config = getStudyPlanConfig();
      setStudyConfigState(config);
      setDraftExamDate(config.examDate ?? "");
      setDraftStudyMinutes(config.dailyStudyMinutes);
      setDraftIntensity(config.intensity);
    };
    window.addEventListener(STUDY_PLAN_CHANGED, refreshStudyPlan);
    window.addEventListener("storage", refreshStudyPlan);
    return () => {
      window.removeEventListener(STUDY_PLAN_CHANGED, refreshStudyPlan);
      window.removeEventListener("storage", refreshStudyPlan);
    };
  }, []);

  const sourceBankIds = useMemo(
    () => new Set(banks.flatMap((bank) => Array.from(getBankSourceIds(bank)))),
    [banks],
  );
  const questionCount = useMemo(
    () =>
      banks.reduce(
        (bankSum, bank) =>
          bankSum +
          bank.chapters.reduce(
            (chapterSum, chapter) => chapterSum + chapter.questionCount,
            0,
          ),
        0,
      ),
    [banks],
  );
  const overallProgress = calculateOverallProgress(
    questionCount,
    answers,
    sourceBankIds,
  );
  const planningAnswers = useMemo(
    () => excludeTodayAnswers(answers, sourceBankIds),
    [answers, sourceBankIds],
  );
  const smartInputs = useMemo(
    () =>
      calculateSmartInputs(
        questionCount,
        sourceBankIds,
        planningAnswers,
        wrongRecords,
      ),
    [planningAnswers, questionCount, sourceBankIds, wrongRecords],
  );
  const studyPlan = useMemo(
    () =>
      calculateSmartStudyPlanStats({
        totalQuestions: questionCount,
        unattemptedQuestions: smartInputs.unattemptedCount,
        wrongDueQuestions: smartInputs.wrongDueCount,
        reviewDueQuestions: smartInputs.reviewDueCount,
        mixedPoolQuestions: smartInputs.mixedPoolCount,
        examDate: studyConfig.examDate,
        dailyStudyMinutes: studyConfig.dailyStudyMinutes,
        intensity: studyConfig.intensity,
      }),
    [questionCount, smartInputs, studyConfig],
  );
  const dailyDisplayPlan = useMemo(
    () =>
      calculateDailyDisplayPlan(
        studyPlan,
        answers,
        sourceBankIds,
        questionCount,
      ),
    [answers, questionCount, sourceBankIds, studyPlan],
  );
  const homeDailyAllocations = useMemo(
    () =>
      (["wrong", "review", "new"] as DailyPlanCategory[]).map(
        (category) => dailyDisplayPlan.allocations[category],
      ),
    [dailyDisplayPlan.allocations],
  );

  async function handlePlanSubmit(
    event: FormEvent<HTMLFormElement>,
  ): Promise<void> {
    event.preventDefault();
    if (!draftExamDate) {
      window.alert(T.required);
      return;
    }
    setStudyPlanConfig({
      examDate: draftExamDate,
      dailyStudyMinutes: draftStudyMinutes,
      intensity: draftIntensity,
    });
    setStudyConfigState(getStudyPlanConfig());
  }

  return (
    <div className="page-stack">
      {loading ? (
        <LoadingState label={T.loading} />
      ) : error ? (
        <ErrorState message={error} />
      ) : (
        <>
          {isActivated && !studyConfig.examDate && !setupDismissed ? (
            <ExamSetupDialog
              draftExamDate={draftExamDate}
              draftStudyMinutes={draftStudyMinutes}
              draftIntensity={draftIntensity}
              onDateChange={setDraftExamDate}
              onStudyMinutesChange={setDraftStudyMinutes}
              onIntensityChange={setDraftIntensity}
              onDismiss={() => setSetupDismissed(true)}
              onSubmit={(event) => void handlePlanSubmit(event)}
            />
          ) : null}

          <section className="home-overview">
            <GlassCard className="overview-panel">
              <div>
                <h1>{T.title}</h1>
              </div>
              <div className="metric-row">
                <span className="glass-badge">
                  {banks.length} {T.subject}
                </span>
                <span className="glass-badge">
                  {questionCount} {T.question}
                </span>
                <span className="glass-badge">
                  {T.progress} {overallProgress}%
                </span>
                {isActivated ? (
                  <span className="glass-badge">
                    累積 {formatTotalPracticeTime(totalPracticeSeconds)}
                  </span>
                ) : null}
              </div>
            </GlassCard>
          </section>

          {isActivated ? (
            <>
              <section
                className="daily-plan-section"
                aria-label={T.smartPractice}
              >
                <GlassCard className="daily-compact-card">
                  <div className="daily-compact-copy">
                    <p className="eyebrow">Daily Practice</p>
                    <div className="daily-compact-title-row">
                      <h2>
                        今日應做 <strong>{dailyDisplayPlan.count}</strong>{" "}
                        {T.question}
                      </h2>
                      <button
                        type="button"
                        className="daily-info-button"
                        aria-label="查看今日練習安排說明"
                        title="查看今日練習安排"
                        aria-expanded={dailyDetailsOpen}
                        onClick={() => setDailyDetailsOpen(true)}
                      >
                        <Info aria-hidden="true" size={18} />
                      </button>
                      {studyPlan.daysLeft !== null ? (
                        <span className="daily-countdown-pill">
                          <CalendarDays aria-hidden="true" size={16} />
                          {studyPlan.daysLeft === 0
                            ? T.examToday
                            : `${T.countdown} ${studyPlan.daysLeft} ${T.days}`}
                        </span>
                      ) : null}
                    </div>
                  </div>
                  <GlassLinkButton
                    to="/image-quiz/daily"
                    variant="primary"
                    className="daily-primary-action"
                  >
                    <PlayCircle aria-hidden="true" size={19} />
                    <span>{T.startDaily}</span>
                  </GlassLinkButton>
                </GlassCard>
              </section>

              {dailyDetailsOpen ? (
                <div
                  className="daily-details-overlay"
                  role="presentation"
                  onMouseDown={(event) => {
                    if (event.target === event.currentTarget)
                      setDailyDetailsOpen(false);
                  }}
                >
                  <GlassCard
                    className="daily-details-dialog"
                    as="section"
                    role="dialog"
                    aria-modal="true"
                    aria-labelledby="daily-details-title"
                  >
                    <div className="daily-details-header">
                      <div>
                        <p className="eyebrow">Today Plan</p>
                        <h2 id="daily-details-title">今日練習安排</h2>
                      </div>
                      <button
                        type="button"
                        className="daily-details-close"
                        onClick={() => setDailyDetailsOpen(false)}
                        aria-label="關閉說明"
                      >
                        <X aria-hidden="true" size={20} />
                      </button>
                    </div>
                    <div className="daily-detail-summary">
                      <div>
                        <CalendarDays aria-hidden="true" size={18} />
                        <span>{T.examDate}</span>
                        <strong>{formatExamDate(studyConfig.examDate)}</strong>
                      </div>
                      <div>
                        <Target aria-hidden="true" size={18} />
                        <span>今日應做</span>
                        <strong>{dailyDisplayPlan.count} 題</strong>
                      </div>
                      <div>
                        <span>每日時間</span>
                        <strong>{studyPlan.dailyStudyMinutes} 分鐘</strong>
                      </div>
                      <div>
                        <span>理論新題需求</span>
                        <strong>{studyPlan.requiredNewPerDay} 題／天</strong>
                      </div>
                    </div>
                    <div
                      className={`daily-detail-warning${studyPlan.isOverloaded ? " warning" : ""}`}
                    >
                      {studyPlan.isOverloaded ? (
                        <AlertTriangle aria-hidden="true" size={20} />
                      ) : (
                        <Target aria-hidden="true" size={20} />
                      )}
                      <div>
                        <strong>{studyPlan.warningTitle}</strong>
                        <p>{studyPlan.warningMessage}</p>
                      </div>
                    </div>
                    <div
                      className="daily-detail-allocation"
                      aria-label="今日題目分配"
                    >
                      {homeDailyAllocations.map((allocation) => (
                        <div key={allocation.id}>
                          <span>{allocation.label}</span>
                          <strong>{allocation.count} 題</strong>
                        </div>
                      ))}
                    </div>
                    <div className="daily-details-actions">
                      <GlassLinkButton
                        to="/image-quiz/today-wrong"
                        variant="secondary"
                        onClick={() => setDailyDetailsOpen(false)}
                      >
                        <Target aria-hidden="true" size={18} />
                        <span>{T.todayWrongReview}</span>
                      </GlassLinkButton>
                      <GlassLinkButton
                        to="/image-quiz/daily"
                        variant="primary"
                        onClick={() => setDailyDetailsOpen(false)}
                      >
                        <PlayCircle aria-hidden="true" size={18} />
                        <span>{T.startDaily}</span>
                      </GlassLinkButton>
                    </div>
                  </GlassCard>
                </div>
              ) : null}
            </>
          ) : (
            <GlassCard className="daily-simple-card auth-banner" as="section">
              <div>
                <p className="eyebrow">Preview</p>
                <h2>
                  完整開通後會解鎖每日智能練習、錯題訂正、模擬考測驗與收藏複習。
                </h2>
                <p>目前可以先使用 10 題試用模式。</p>
              </div>
              <GlassLinkButton to="/trial" variant="primary">
                試用 10 題
              </GlassLinkButton>
            </GlassCard>
          )}

          <section className="priority-bank-grid" aria-label={T.bankList}>
            {banks.map((bank) => {
              const total = bank.chapters.reduce(
                (sum, chapter) => sum + chapter.questionCount,
                0,
              );
              const progress = calculateBankProgress(bank, answers, total);
              return (
                <GlassCard
                  key={bank.bankId}
                  interactive
                  as="article"
                  className="bank-card"
                >
                  <div className="card-title-row">
                    <div className="title-icon" aria-hidden="true">
                      <BookOpen size={22} />
                    </div>
                    <div>
                      <h2>{bank.bankTitle}</h2>
                      <p>
                        {bank.chapters.length} {T.chapters} / {total}{" "}
                        {T.question}
                      </p>
                      <div className="metric-row">
                        <span className="glass-badge">
                          {T.progress} {progress}%
                        </span>
                      </div>
                    </div>
                  </div>
                  <GlassLinkButton
                    to={`/banks/${bank.bankId}`}
                    variant="primary"
                  >
                    {T.enter}
                  </GlassLinkButton>
                </GlassCard>
              );
            })}
          </section>

          <section className="home-tools" aria-label={T.tools}>
            <div className="section-heading home-tools-heading">
              <h2>{T.tools}</h2>
            </div>
            <div className="tool-strip">
              <GlassLinkButton to="/image-quiz/all" variant="secondary">
                <ListChecks aria-hidden="true" size={19} />
                <span>{T.mixed}</span>
              </GlassLinkButton>
              <GlassLinkButton to="/random" variant="secondary">
                <Shuffle aria-hidden="true" size={19} />
                <span>{T.random80}</span>
              </GlassLinkButton>
              <GlassLinkButton to="/image-quiz/wrong" variant="secondary">
                <Target aria-hidden="true" size={19} />
                <span>{T.weakFirst}</span>
              </GlassLinkButton>
              <GlassLinkButton to="/similar" variant="secondary">
                <ListChecks aria-hidden="true" size={19} />
                <span>{T.similar}</span>
              </GlassLinkButton>
              <GlassLinkButton to="/image-quiz/favorites" variant="secondary">
                <Heart aria-hidden="true" size={19} />
                <span>{T.favorites}</span>
              </GlassLinkButton>
              <GlassLinkButton to="/leaderboard" variant="secondary">
                <Trophy aria-hidden="true" size={19} />
                <span>{T.leaderboard}</span>
              </GlassLinkButton>
            </div>
          </section>

          <section
            className="cat-playground"
            aria-label="芙莉蓮的讀書與晚安動畫"
          >
            <FrierenAnimation />
          </section>
        </>
      )}
    </div>
  );
}

function ExamSetupDialog({
  draftExamDate,
  draftStudyMinutes,
  draftIntensity,
  onDateChange,
  onStudyMinutesChange,
  onIntensityChange,
  onDismiss,
  onSubmit,
}: {
  draftExamDate: string;
  draftStudyMinutes: number;
  draftIntensity: StudyIntensity;
  onDateChange: (date: string) => void;
  onStudyMinutesChange: (minutes: number) => void;
  onIntensityChange: (intensity: StudyIntensity) => void;
  onDismiss: () => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="clear-record-overlay exam-date-overlay" role="presentation">
      <GlassCard
        className="exam-setup-dialog"
        as="div"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-setup-title"
      >
        <form className="exam-setup-form" onSubmit={onSubmit}>
          <p className="eyebrow">Smart Plan</p>
          <h2 id="exam-setup-title">{T.setupTitle}</h2>
          <p>{T.setupDescription}</p>
          <label className="exam-date-field">
            <span>{T.examDate}</span>
            <input
              type="date"
              min={localTodayKey()}
              value={draftExamDate}
              onChange={(event) => onDateChange(event.currentTarget.value)}
            />
          </label>
          <div className="smart-setup-section">
            <span>{T.dailyStudyTime}</span>
            <div className="setup-choice-grid setup-time-grid">
              {STUDY_TIME_OPTIONS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  aria-pressed={draftStudyMinutes === minutes}
                  className={`setup-choice-button ${draftStudyMinutes === minutes ? "is-selected" : ""}`}
                  onClick={() => onStudyMinutesChange(minutes)}
                >
                  {minutes} 分鐘
                </button>
              ))}
            </div>
            <label className="custom-minutes-field">
              <span>自訂</span>
              <input
                type="number"
                min={15}
                max={720}
                step={5}
                value={draftStudyMinutes}
                onChange={(event) =>
                  onStudyMinutesChange(Number(event.currentTarget.value))
                }
              />
            </label>
          </div>
          <div className="smart-setup-section">
            <span>{T.intensity}</span>
            <div className="setup-choice-grid setup-intensity-grid">
              {INTENSITY_OPTIONS.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  aria-pressed={draftIntensity === option.id}
                  className={`setup-choice-button setup-intensity-button ${draftIntensity === option.id ? "is-selected" : ""}`}
                  onClick={() => onIntensityChange(option.id)}
                >
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </button>
              ))}
            </div>
          </div>
          <div className="setup-action-row">
            <GlassButton type="button" variant="secondary" onClick={onDismiss}>
              {T.skip}
            </GlassButton>
            <GlassButton type="submit" variant="primary">
              {T.save}
            </GlassButton>
          </div>
        </form>
      </GlassCard>
    </div>
  );
}

function getBankSourceIds(bank: ImageQuizBank): Set<string> {
  return new Set(
    bank.chapters.map(
      (chapter) => chapter.sourceBankId ?? chapter.bankId ?? bank.bankId,
    ),
  );
}

function calculateBankProgress(
  bank: ImageQuizBank,
  answers: UserAnswer[],
  questionCount: number,
): number {
  const sourceIds = getBankSourceIds(bank);
  const answeredIds = new Set(
    answers
      .filter((answer) => sourceIds.has(answer.bankId))
      .map((answer) => answer.questionId),
  );
  return calculateAccuracy(answeredIds.size, questionCount);
}

function calculateOverallProgress(
  questionCount: number,
  answers: UserAnswer[],
  sourceBankIds: Set<string>,
): number {
  const answeredIds = new Set(
    answers
      .filter((answer) => sourceBankIds.has(answer.bankId))
      .map((answer) => answer.questionId),
  );
  return calculateAccuracy(answeredIds.size, questionCount);
}

function excludeTodayAnswers(
  answers: UserAnswer[],
  sourceBankIds: Set<string>,
): UserAnswer[] {
  const today = localTodayKey();
  return answers.filter(
    (answer) =>
      sourceBankIds.has(answer.bankId) &&
      localTodayKey(new Date(answer.answeredAt)) !== today,
  );
}

function calculateSmartInputs(
  questionCount: number,
  sourceBankIds: Set<string>,
  answers: UserAnswer[],
  wrongRecords: WrongQuestionRecord[],
) {
  const answerById = new Map(
    answers
      .filter((answer) => sourceBankIds.has(answer.bankId))
      .map((answer) => [answer.questionId, answer]),
  );
  const answeredIds = new Set(answerById.keys());
  const wrongIds = new Set(
    wrongRecords
      .filter(
        (record) =>
          sourceBankIds.has(record.bankId) &&
          answerById.get(record.questionId)?.isCorrect !== true,
      )
      .map((record) => record.questionId),
  );
  const reviewDueIds = new Set(
    answers
      .filter(
        (answer) =>
          sourceBankIds.has(answer.bankId) &&
          answer.isCorrect &&
          !wrongIds.has(answer.questionId) &&
          isReviewDue(answer.answeredAt),
      )
      .map((answer) => answer.questionId),
  );
  return {
    unattemptedCount: Math.max(0, questionCount - answeredIds.size),
    wrongDueCount: wrongIds.size,
    reviewDueCount: reviewDueIds.size,
    mixedPoolCount: Math.max(
      0,
      answeredIds.size - wrongIds.size - reviewDueIds.size,
    ),
  };
}

type StoredDailyPlan = {
  date: string;
  version?: number;
  planSignature?: string;
  questionIds: string[];
  plannedCount?: number;
  categoryCounts?: Partial<Record<DailyPlanCategory, number>>;
  categoryQuestionIds?: Partial<Record<DailyPlanCategory, string[]>>;
};

type DailyDisplayPlan = {
  hasTodayPlan: boolean;
  count: number;
  targetCount: number;
  allocations: ReturnType<typeof calculateSmartStudyPlanStats>["allocations"];
};

const DAILY_PLAN_CATEGORIES: DailyPlanCategory[] = [
  "new",
  "wrong",
  "review",
  "mixed",
];

function calculateDailyDisplayPlan(
  studyPlan: ReturnType<typeof calculateSmartStudyPlanStats>,
  answers: UserAnswer[],
  sourceBankIds: Set<string>,
  totalQuestionCount: number,
): DailyDisplayPlan {
  const todayAnsweredIds = getTodayAnsweredIds(answers, sourceBankIds);
  const stored = readTodayDailyPlan(getStudyPlanSignature(studyPlan));
  if (!stored) {
    return {
      hasTodayPlan: false,
      count: studyPlan.suggestedDailyCount,
      targetCount: studyPlan.suggestedDailyCount,
      allocations: studyPlan.allocations,
    };
  }

  const categoryIds = normalizeStoredCategoryIds(stored);
  const remainingCounts = countRemainingByCategory(
    categoryIds,
    todayAnsweredIds,
  );
  const remainingTotal = Object.values(remainingCounts).reduce(
    (sum, count) => sum + count,
    0,
  );
  const allocations = Object.fromEntries(
    DAILY_PLAN_CATEGORIES.map((category) => [
      category,
      {
        ...studyPlan.allocations[category],
        count: remainingCounts[category],
        estimatedMinutes: remainingCounts[category],
      },
    ]),
  ) as ReturnType<typeof calculateSmartStudyPlanStats>["allocations"];

  return {
    hasTodayPlan: true,
    count: Math.min(remainingTotal, totalQuestionCount),
    targetCount: Math.min(
      stored.plannedCount ?? stored.questionIds.length,
      totalQuestionCount,
    ),
    allocations,
  };
}

function readTodayDailyPlan(
  expectedPlanSignature: string,
): StoredDailyPlan | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(
    `quizpwa:daily-plan:${localTodayKey()}`,
  );
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw) as StoredDailyPlan;
    if (
      stored.date !== localTodayKey() ||
      stored.version !== DAILY_PLAN_STORAGE_VERSION ||
      stored.planSignature !== expectedPlanSignature ||
      !Array.isArray(stored.questionIds)
    )
      return undefined;
    const questionIds = stored.questionIds.filter(
      (questionId): questionId is string =>
        typeof questionId === "string" && questionId.length > 0,
    );
    if (questionIds.length === 0) return undefined;
    return { ...stored, questionIds };
  } catch {
    return undefined;
  }
}

function normalizeStoredCategoryIds(
  stored: StoredDailyPlan,
): Record<DailyPlanCategory, string[]> {
  const validIds = (values: string[] | undefined) =>
    (values ?? []).filter(
      (questionId) => typeof questionId === "string" && questionId.length > 0,
    );
  if (stored.categoryQuestionIds) {
    return {
      new: validIds(stored.categoryQuestionIds.new),
      wrong: validIds(stored.categoryQuestionIds.wrong),
      review: validIds(stored.categoryQuestionIds.review),
      mixed: validIds(stored.categoryQuestionIds.mixed),
    };
  }

  const result: Record<DailyPlanCategory, string[]> = {
    new: [],
    wrong: [],
    review: [],
    mixed: [],
  };
  let cursor = 0;
  for (const category of DAILY_PLAN_CATEGORIES) {
    const count = Math.max(0, stored.categoryCounts?.[category] ?? 0);
    result[category] = validIds(
      stored.questionIds.slice(cursor, cursor + count),
    );
    cursor += count;
  }
  return result;
}

function countRemainingByCategory(
  categoryIds: Record<DailyPlanCategory, string[]>,
  answeredIds: Set<string>,
): Record<DailyPlanCategory, number> {
  return {
    new: categoryIds.new.filter((questionId) => !answeredIds.has(questionId))
      .length,
    wrong: categoryIds.wrong.filter(
      (questionId) => !answeredIds.has(questionId),
    ).length,
    review: categoryIds.review.filter(
      (questionId) => !answeredIds.has(questionId),
    ).length,
    mixed: categoryIds.mixed.filter(
      (questionId) => !answeredIds.has(questionId),
    ).length,
  };
}

function getTodayAnsweredIds(
  answers: UserAnswer[],
  sourceBankIds: Set<string>,
): Set<string> {
  const today = localTodayKey();
  return new Set(
    answers
      .filter(
        (answer) =>
          sourceBankIds.has(answer.bankId) &&
          localTodayKey(new Date(answer.answeredAt)) === today,
      )
      .map((answer) => answer.questionId),
  );
}
