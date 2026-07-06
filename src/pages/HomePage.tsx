import { BookOpen, CalendarDays, Heart, ListChecks, PlayCircle, Shuffle, Target, Trophy } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ErrorState } from "../components/ErrorState";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { useAsync } from "../hooks/useAsync";
import { useAuth } from "../auth/AuthContext";
import { listUserAnswers, listWrongQuestions } from "../lib/db";
import { assetUrl, loadImageQuizBankSummaries, loadImageQuizBanks, type ImageQuizBank } from "../lib/imageQuiz";
import { calculateAccuracy } from "../lib/quiz";
import {
  calculateSmartStudyPlanStats,
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
  random80: "模擬考",
  weakFirst: "弱點練習",
  similar: "相似題比較",
  favorites: "收藏題目",
  leaderboard: "排行榜",
  bankList: "題庫科目",
  chapters: "章",
  enter: "進入題庫",
  progress: "進度",
  setupTitle: "建立每日智能練習",
  setupDescription: "請設定考試日期、每天讀書時間與備考強度；App 會同時檢查期限壓力，不會只把總題庫平均除以天數。",
  examDate: "考試日期",
  dailyStudyTime: "每天讀書時間",
  intensity: "備考強度",
  save: "開始規劃",
  required: "請選擇考試日期。",
  countdown: "考試倒數",
  days: "天",
  examToday: "就是今天",
  smartPractice: "每日練習",
  startDaily: "開始今日練習",
  wrongCorrection: "錯題訂正",
};

const STUDY_TIME_OPTIONS = [30, 60, 90, 120, 240] as const;
const INTENSITY_OPTIONS: { id: StudyIntensity; label: string; description: string }[] = [
  { id: "steady", label: "穩定型", description: "壓力小，複習比重較高。" },
  { id: "standard", label: "標準型", description: "新題、錯題、複習均衡。" },
  { id: "sprint", label: "衝刺型", description: "期限優先，首輪覆蓋與錯題訂正比重較高。" },
];

const FRIEREN_FRAME_COUNT = 29;
const FRIEREN_FRAME_DURATION_SECONDS = 12.18;
const FRIEREN_FRAME_STEP_SECONDS = FRIEREN_FRAME_DURATION_SECONDS / FRIEREN_FRAME_COUNT;
const FRIEREN_FRAMES = Array.from({ length: FRIEREN_FRAME_COUNT }, (_, index) => {
  const frameNumber = String(index + 1).padStart(3, "0");
  return {
    key: frameNumber,
    src: assetUrl(`animation/frieren-sequence/frame-${frameNumber}.png`),
    delay: `${(index * FRIEREN_FRAME_STEP_SECONDS).toFixed(3)}s`,
  };
});

const EMPTY_BANKS: ImageQuizBank[] = [];
const EMPTY_ANSWERS: UserAnswer[] = [];
const EMPTY_WRONGS: WrongQuestionRecord[] = [];

type HomeData = {
  banks: ImageQuizBank[];
  answers: UserAnswer[];
  wrongRecords: WrongQuestionRecord[];
};

async function loadHomeData(includePrivateData: boolean): Promise<HomeData> {
  if (!includePrivateData) {
    const banks = await loadImageQuizBankSummaries();
    return { banks, answers: [], wrongRecords: [] };
  }

  const [banks, answers, wrongRecords] = await Promise.all([loadImageQuizBanks(), listUserAnswers(), listWrongQuestions()]);
  return { banks, answers, wrongRecords };
}

export function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [studyConfig, setStudyConfigState] = useState<StudyPlanConfig>(() => getStudyPlanConfig());
  const [draftExamDate, setDraftExamDate] = useState(() => getStudyPlanConfig().examDate ?? localTodayKey());
  const [draftStudyMinutes, setDraftStudyMinutes] = useState(() => getStudyPlanConfig().dailyStudyMinutes);
  const [draftIntensity, setDraftIntensity] = useState<StudyIntensity>(() => getStudyPlanConfig().intensity);
  const { isActivated } = useAuth();
  const { data, error, loading } = useAsync(() => loadHomeData(isActivated), [refreshKey, isActivated]);

  const banks = data?.banks ?? EMPTY_BANKS;
  const answers = data?.answers ?? EMPTY_ANSWERS;
  const wrongRecords = data?.wrongRecords ?? EMPTY_WRONGS;

  useEffect(() => {
    const refreshRecords = () => setRefreshKey((key) => key + 1);
    window.addEventListener("records:changed", refreshRecords);
    return () => window.removeEventListener("records:changed", refreshRecords);
  }, []);

  useEffect(() => {
    const refreshStudyPlan = () => {
      const config = getStudyPlanConfig();
      setStudyConfigState(config);
      setDraftExamDate(config.examDate ?? localTodayKey());
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

  const allQuestionIds = useMemo(
    () => new Set(banks.flatMap((bank) => bank.chapters.flatMap((chapter) => chapter.questions.map((question) => question.id)))),
    [banks],
  );
  const questionCount = useMemo(
    () => banks.reduce((bankSum, bank) => bankSum + bank.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questionCount, 0), 0),
    [banks],
  );
  const overallProgress = calculateOverallProgress(banks, answers);
  const planningAnswers = useMemo(() => excludeTodayAnswers(answers, allQuestionIds), [allQuestionIds, answers]);
  const smartInputs = useMemo(() => calculateSmartInputs(allQuestionIds, planningAnswers, wrongRecords), [allQuestionIds, planningAnswers, wrongRecords]);
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
    () => calculateDailyDisplayPlan(studyPlan, allQuestionIds, answers),
    [allQuestionIds, answers, studyPlan],
  );

  async function handlePlanSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    if (!draftExamDate) {
      window.alert(T.required);
      return;
    }
    setStudyPlanConfig({ examDate: draftExamDate, dailyStudyMinutes: draftStudyMinutes, intensity: draftIntensity });
    setStudyConfigState(getStudyPlanConfig());
  }

  if (loading) return <LoadingState label={T.loading} />;
  if (error) return <ErrorState message={error} />;

  return (
    <div className="page-stack">
      {isActivated && !studyConfig.examDate ? (
        <ExamSetupDialog
          draftExamDate={draftExamDate}
          draftStudyMinutes={draftStudyMinutes}
          draftIntensity={draftIntensity}
          onDateChange={setDraftExamDate}
          onStudyMinutesChange={setDraftStudyMinutes}
          onIntensityChange={setDraftIntensity}
          onSubmit={(event) => void handlePlanSubmit(event)}
        />
      ) : null}

      <section className="home-overview">
        <GlassCard className="overview-panel">
          <div><h1>{T.title}</h1></div>
          <div className="metric-row">
            <span className="glass-badge">{banks.length} {T.subject}</span>
            <span className="glass-badge">{questionCount} {T.question}</span>
            <span className="glass-badge">{T.progress} {overallProgress}%</span>
          </div>
        </GlassCard>
      </section>

      {isActivated ? (
        <section className="daily-plan-section" aria-label={T.smartPractice}>
          <GlassCard className="daily-simple-card">
            <div className="daily-simple-countdown">
              <p className="eyebrow">Countdown</p>
              <div className="smart-countdown-number">
                <CalendarDays aria-hidden="true" size={30} />
                <strong>{studyPlan.daysLeft === 0 ? T.examToday : studyPlan.daysLeft ?? "--"}</strong>
                {studyPlan.daysLeft && studyPlan.daysLeft > 0 ? <span>{T.days}</span> : null}
              </div>
              <p>{T.examDate}：{formatExamDate(studyConfig.examDate)}</p>
            </div>
            <div className="daily-simple-practice daily-original-practice">
              <p className="eyebrow">Daily Smart Practice</p>
              <h2>{T.smartPractice} {dailyDisplayPlan.count} {T.question}</h2>
              <div className="daily-allocation-grid daily-home-allocation" aria-label="今日練習摘要">
                {Object.values(dailyDisplayPlan.allocations)
                  .filter((allocation) => allocation.id !== "mixed")
                  .map((allocation) => (
                    <div key={allocation.id} className={`daily-allocation-card daily-allocation-${allocation.id}`}>
                      <span>{allocation.label}</span>
                      <strong>{allocation.count}</strong>
                    </div>
                  ))}
              </div>
              <GlassLinkButton to="/image-quiz/daily" variant="primary">
                <PlayCircle aria-hidden="true" size={19} />
                <span>{T.startDaily}</span>
              </GlassLinkButton>
            </div>
          </GlassCard>
        </section>
      ) : (
        <GlassCard className="daily-simple-card auth-banner" as="section">
          <div>
            <p className="eyebrow">Preview</p>
            <h2>完整開通後會解鎖每日智能練習、錯題訂正、模擬考與收藏複習。</h2>
            <p>目前可以先使用 10 題試用模式。</p>
          </div>
          <GlassLinkButton to="/trial" variant="primary">試用 10 題</GlassLinkButton>
        </GlassCard>
      )}

      <section className="priority-bank-grid" aria-label={T.bankList}>
        {banks.map((bank) => {
          const total = bank.chapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);
          const progress = calculateBankProgress(bank, answers);
          return (
            <GlassCard key={bank.bankId} interactive as="article" className="bank-card">
              <div className="card-title-row">
                <div className="title-icon" aria-hidden="true"><BookOpen size={22} /></div>
                <div>
                  <h2>{bank.bankTitle}</h2>
                  <p>{bank.chapters.length} {T.chapters} / {total} {T.question}</p>
                  <div className="metric-row"><span className="glass-badge">{T.progress} {progress}%</span></div>
                </div>
              </div>
              <GlassLinkButton to={`/banks/${bank.bankId}`} variant="primary">{T.enter}</GlassLinkButton>
            </GlassCard>
          );
        })}
      </section>

      <section className="home-tools" aria-label={T.tools}>
        <div className="section-heading home-tools-heading"><h2>{T.tools}</h2></div>
        <div className="tool-strip">
          <GlassLinkButton to="/image-quiz/all" variant="secondary"><ListChecks aria-hidden="true" size={19} /><span>{T.mixed}</span></GlassLinkButton>
          <GlassLinkButton to="/random" variant="secondary"><Shuffle aria-hidden="true" size={19} /><span>{T.random80}</span></GlassLinkButton>
          <GlassLinkButton to="/image-quiz/wrong" variant="secondary"><Target aria-hidden="true" size={19} /><span>{T.weakFirst}</span></GlassLinkButton>
          <GlassLinkButton to="/similar" variant="secondary"><ListChecks aria-hidden="true" size={19} /><span>{T.similar}</span></GlassLinkButton>
          <GlassLinkButton to="/image-quiz/favorites" variant="secondary"><Heart aria-hidden="true" size={19} /><span>{T.favorites}</span></GlassLinkButton>
          <GlassLinkButton to="/leaderboard" variant="secondary"><Trophy aria-hidden="true" size={19} /><span>{T.leaderboard}</span></GlassLinkButton>
        </div>
      </section>

      <section className="cat-playground" aria-hidden="true">
        <div className="frieren-walker"><span className="frieren-shadow" /><div className="frieren-sprite">{FRIEREN_FRAMES.map((frame) => <img key={frame.key} className="frieren-frame" src={frame.src} alt="" style={{ animationDelay: frame.delay }} />)}</div></div>
      </section>
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
  onSubmit,
}: {
  draftExamDate: string;
  draftStudyMinutes: number;
  draftIntensity: StudyIntensity;
  onDateChange: (date: string) => void;
  onStudyMinutesChange: (minutes: number) => void;
  onIntensityChange: (intensity: StudyIntensity) => void;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
}) {
  return (
    <div className="clear-record-overlay exam-date-overlay" role="presentation">
      <GlassCard className="exam-setup-dialog" as="div" role="dialog" aria-modal="true" aria-labelledby="exam-setup-title">
        <form className="exam-setup-form" onSubmit={onSubmit}>
          <p className="eyebrow">Smart Plan</p>
          <h2 id="exam-setup-title">{T.setupTitle}</h2>
          <p>{T.setupDescription}</p>
          <label className="exam-date-field"><span>{T.examDate}</span><input type="date" min={localTodayKey()} value={draftExamDate} onChange={(event) => onDateChange(event.currentTarget.value)} /></label>
          <div className="smart-setup-section">
            <span>{T.dailyStudyTime}</span>
            <div className="setup-choice-grid setup-time-grid">{STUDY_TIME_OPTIONS.map((minutes) => <button key={minutes} type="button" className={`setup-choice-button ${draftStudyMinutes === minutes ? "is-selected" : ""}`} onClick={() => onStudyMinutesChange(minutes)}>{minutes} 分鐘</button>)}</div>
            <label className="custom-minutes-field"><span>自訂</span><input type="number" min={15} max={720} step={5} value={draftStudyMinutes} onChange={(event) => onStudyMinutesChange(Number(event.currentTarget.value))} /></label>
          </div>
          <div className="smart-setup-section">
            <span>{T.intensity}</span>
            <div className="setup-choice-grid setup-intensity-grid">{INTENSITY_OPTIONS.map((option) => <button key={option.id} type="button" className={`setup-choice-button setup-intensity-button ${draftIntensity === option.id ? "is-selected" : ""}`} onClick={() => onIntensityChange(option.id)}><strong>{option.label}</strong><small>{option.description}</small></button>)}</div>
          </div>
          <GlassButton type="submit" variant="primary">{T.save}</GlassButton>
        </form>
      </GlassCard>
    </div>
  );
}

function calculateBankProgress(bank: ImageQuizBank, answers: UserAnswer[]): number {
  const questionIds = new Set(bank.chapters.flatMap((chapter) => chapter.questions.map((question) => question.id)));
  const answeredIds = new Set(answers.filter((answer) => questionIds.has(answer.questionId)).map((answer) => answer.questionId));
  return calculateAccuracy(answeredIds.size, questionIds.size);
}

function calculateOverallProgress(banks: ImageQuizBank[], answers: UserAnswer[]): number {
  const questionIds = new Set(banks.flatMap((bank) => bank.chapters.flatMap((chapter) => chapter.questions.map((question) => question.id))));
  const answeredIds = new Set(answers.filter((answer) => questionIds.has(answer.questionId)).map((answer) => answer.questionId));
  return calculateAccuracy(answeredIds.size, questionIds.size);
}
function excludeTodayAnswers(answers: UserAnswer[], allQuestionIds: Set<string>): UserAnswer[] {
  const today = localTodayKey();
  return answers.filter((answer) => !allQuestionIds.has(answer.questionId) || localTodayKey(new Date(answer.answeredAt)) !== today);
}

function calculateSmartInputs(allQuestionIds: Set<string>, answers: UserAnswer[], wrongRecords: WrongQuestionRecord[]) {
  const answerById = new Map(answers.filter((answer) => allQuestionIds.has(answer.questionId)).map((answer) => [answer.questionId, answer]));
  const answeredIds = new Set(answerById.keys());
  const wrongIds = new Set(
    wrongRecords
      .filter((record) => allQuestionIds.has(record.questionId) && answerById.get(record.questionId)?.isCorrect !== true)
      .map((record) => record.questionId),
  );
  const reviewDueIds = new Set(answers.filter((answer) => allQuestionIds.has(answer.questionId) && answer.isCorrect && !wrongIds.has(answer.questionId) && isReviewDue(answer.answeredAt)).map((answer) => answer.questionId));
  return {
    unattemptedCount: Math.max(0, allQuestionIds.size - answeredIds.size),
    wrongDueCount: wrongIds.size,
    reviewDueCount: reviewDueIds.size,
    mixedPoolCount: Math.max(0, answeredIds.size - wrongIds.size - reviewDueIds.size),
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
  allocations: ReturnType<typeof calculateSmartStudyPlanStats>["allocations"];
};

const DAILY_PLAN_CATEGORIES: DailyPlanCategory[] = ["new", "wrong", "review", "mixed"];

function calculateDailyDisplayPlan(
  studyPlan: ReturnType<typeof calculateSmartStudyPlanStats>,
  allQuestionIds: Set<string>,
  answers: UserAnswer[],
): DailyDisplayPlan {
  const todayAnsweredIds = getTodayAnsweredIds(answers, allQuestionIds);
  const stored = readTodayDailyPlan(allQuestionIds, getStudyPlanSignature(studyPlan));
  if (!stored) {
    return { hasTodayPlan: false, count: studyPlan.allocations.new.count, allocations: studyPlan.allocations };
  }

  const categoryIds = normalizeStoredCategoryIds(stored, allQuestionIds);
  const remainingCounts = countRemainingByCategory(categoryIds, todayAnsweredIds);
  const plannedQuestionIds = new Set(stored.questionIds.filter((questionId) => allQuestionIds.has(questionId)));
  const plannedNewTotal = getStoredPlannedNewCount(stored, categoryIds, allQuestionIds, plannedQuestionIds);
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

  return { hasTodayPlan: true, count: plannedNewTotal, allocations };
}

function readTodayDailyPlan(allQuestionIds: Set<string>, expectedPlanSignature: string): StoredDailyPlan | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = window.localStorage.getItem(`quizpwa:daily-plan:${localTodayKey()}`);
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw) as StoredDailyPlan;
    if (stored.date !== localTodayKey() || stored.version !== 28 || stored.planSignature !== expectedPlanSignature || !Array.isArray(stored.questionIds)) return undefined;
    const questionIds = stored.questionIds.filter((questionId) => allQuestionIds.has(questionId));
    if (questionIds.length === 0) return undefined;
    return { ...stored, questionIds };
  } catch {
    return undefined;
  }
}


function getStoredPlannedNewCount(
  stored: StoredDailyPlan,
  categoryIds: Record<DailyPlanCategory, string[]>,
  allQuestionIds: Set<string>,
  plannedQuestionIds: Set<string>,
): number {
  if (stored.categoryQuestionIds?.new) {
    return categoryIds.new.length;
  }

  if (typeof stored.categoryCounts?.new === "number") {
    return Math.max(0, Math.min(stored.categoryCounts.new, plannedQuestionIds.size || allQuestionIds.size));
  }

  return plannedQuestionIds.size;
}

function normalizeStoredCategoryIds(
  stored: StoredDailyPlan,
  allQuestionIds: Set<string>,
): Record<DailyPlanCategory, string[]> {
  if (stored.categoryQuestionIds) {
    return {
      new: (stored.categoryQuestionIds.new ?? []).filter((questionId) => allQuestionIds.has(questionId)),
      wrong: (stored.categoryQuestionIds.wrong ?? []).filter((questionId) => allQuestionIds.has(questionId)),
      review: (stored.categoryQuestionIds.review ?? []).filter((questionId) => allQuestionIds.has(questionId)),
      mixed: (stored.categoryQuestionIds.mixed ?? []).filter((questionId) => allQuestionIds.has(questionId)),
    };
  }

  const result: Record<DailyPlanCategory, string[]> = { new: [], wrong: [], review: [], mixed: [] };
  let cursor = 0;
  for (const category of DAILY_PLAN_CATEGORIES) {
    const count = Math.max(0, stored.categoryCounts?.[category] ?? 0);
    result[category] = stored.questionIds.slice(cursor, cursor + count).filter((questionId) => allQuestionIds.has(questionId));
    cursor += count;
  }
  return result;
}

function countRemainingByCategory(
  categoryIds: Record<DailyPlanCategory, string[]>,
  answeredIds: Set<string>,
): Record<DailyPlanCategory, number> {
  return {
    new: categoryIds.new.filter((questionId) => !answeredIds.has(questionId)).length,
    wrong: categoryIds.wrong.filter((questionId) => !answeredIds.has(questionId)).length,
    review: categoryIds.review.filter((questionId) => !answeredIds.has(questionId)).length,
    mixed: categoryIds.mixed.filter((questionId) => !answeredIds.has(questionId)).length,
  };
}

function getTodayAnsweredIds(answers: UserAnswer[], allQuestionIds: Set<string>): Set<string> {
  const today = localTodayKey();
  return new Set(
    answers
      .filter((answer) => allQuestionIds.has(answer.questionId) && localTodayKey(new Date(answer.answeredAt)) === today)
      .map((answer) => answer.questionId),
  );
}
