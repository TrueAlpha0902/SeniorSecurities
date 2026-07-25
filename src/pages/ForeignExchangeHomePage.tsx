import {
  BarChart3,
  BookOpen,
  ClipboardX,
  Heart,
  PenLine,
  TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import {
  ExamHomeHero,
  ExamLearningSummary,
  ExamQuickActions,
  ExamSubjectPath,
  type SubjectPathItem,
} from "../components/ExamHomeSections";
import { ExamStudyPlanDialog } from "../components/ExamStudyPlanDialog";
import { GlassLinkButton } from "../components/GlassButton";
import {
  FOREIGN_EXCHANGE_SESSIONS,
  type ForeignExchangeSubjectId,
} from "../lib/foreignExchange";
import {
  FOREIGN_EXCHANGE_PROGRESS_CHANGED,
  foreignExchangeProgressSummary,
  foreignExchangeSubjectProgress,
  readForeignExchangeProgress,
} from "../lib/foreignExchangeProgress";
import {
  formatTotalPracticeTime,
  getTotalPracticeSeconds,
  PRACTICE_TIME_CHANGED,
} from "../lib/practiceTime";
import {
  calculateSmartStudyPlanStats,
  getStudyPlanConfigForExam,
  isStudyPlanConfigured,
  STUDY_PLAN_CHANGED,
  type StudyPlanScopeId,
  type StudyPlanExamId,
} from "../lib/studyPlan";
import { USER_STORAGE_SCOPE_CHANGED } from "../lib/userScopedStorage";

const MIN_RANDOM_COUNT = 5;
const MAX_RANDOM_COUNT = 100;

const SUBJECTS: Array<{
  id: ForeignExchangeSubjectId;
  scopeId: StudyPlanScopeId;
  title: string;
  total: number;
}> = [
  {
    id: "remittance",
    scopeId: "fx-remittance",
    title: "國外匯兌業務",
    total: 25 * 50,
  },
  {
    id: "trade",
    scopeId: "fx-trade",
    title: "進出口外匯業務",
    total: 25 * 80,
  },
];

export function ForeignExchangeHomePage() {
  const [summary, setSummary] = useState(() => foreignExchangeProgressSummary());
  const [randomCount, setRandomCount] = useState(20);
  const [planRevision, setPlanRevision] = useState(0);
  const [practiceSeconds, setPracticeSeconds] = useState(() => getTotalPracticeSeconds());
  const [selectedSession, setSelectedSession] = useState(47);
  const [editingPlanExamId, setEditingPlanExamId] =
    useState<StudyPlanExamId | null>(null);

  useEffect(() => {
    const refresh = () => setSummary(foreignExchangeProgressSummary());
    window.addEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const refresh = () => setPlanRevision((value) => value + 1);
    window.addEventListener(STUDY_PLAN_CHANGED, refresh);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(STUDY_PLAN_CHANGED, refresh);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  useEffect(() => {
    const refreshPracticeTime = () => setPracticeSeconds(getTotalPracticeSeconds());
    window.addEventListener(PRACTICE_TIME_CHANGED, refreshPracticeTime);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refreshPracticeTime);
    return () => {
      window.removeEventListener(PRACTICE_TIME_CHANGED, refreshPracticeTime);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refreshPracticeTime);
    };
  }, []);

  const safeRandomCount = Math.min(
    MAX_RANDOM_COUNT,
    Math.max(MIN_RANDOM_COUNT, Math.trunc(randomCount || MIN_RANDOM_COUNT)),
  );
  const totalQuestions = SUBJECTS.reduce((sum, subject) => sum + subject.total, 0);
  const planConfig = getStudyPlanConfigForExam("junior-foreign-exchange");
  const examPlan = calculateSmartStudyPlanStats({
    totalQuestions,
    unattemptedQuestions: Math.max(0, totalQuestions - summary.answered),
    wrongDueQuestions: summary.wrong,
    reviewDueQuestions: 0,
    mixedPoolQuestions: 0,
    examDate: planConfig.examDate,
    dailyStudyMinutes: planConfig.dailyStudyMinutes,
    intensity: planConfig.intensity,
  });
  const dailyCount = Math.min(
    MAX_RANDOM_COUNT,
    Math.max(MIN_RANDOM_COUNT, examPlan.suggestedDailyCount || safeRandomCount),
  );
  const progressState = readForeignExchangeProgress();
  const weeklyValues = useMemo(
    () => buildWeeklyAnswerSeries(Object.values(progressState.answers).map((answer) => answer.answeredAt)),
    [summary.answered, summary.wrong, planRevision],
  );
  const weeklyAnswered = weeklyValues.reduce((sum, value) => sum + value, 0);
  const completion = totalQuestions > 0 ? (summary.answered / totalQuestions) * 100 : 0;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("exam-home:daily-target", {
      detail: {
        examId: "junior-foreign-exchange",
        count: dailyCount,
        completed: 0,
        planned: dailyCount,
      },
    }));
  }, [dailyCount]);

  const subjectItems = useMemo<SubjectPathItem[]>(
    () => SUBJECTS.map((subject) => {
      const progress = foreignExchangeSubjectProgress(subject.id);
      const percent = subject.total > 0
        ? Math.round((progress.answered / subject.total) * 1000) / 10
        : 0;
      return {
        id: subject.id,
        title: subject.title,
        progress: percent,
        answered: progress.answered,
        total: subject.total,
        to: `/foreign-exchange/practice?mode=random&subject=${subject.id}&count=${dailyCount}`,
        meta: progress.wrong > 0
          ? `待訂正 ${progress.wrong} 題`
          : "目前沒有待訂正題目",
      };
    }),
    [dailyCount, planRevision, summary.answered, summary.favorites, summary.wrong],
  );

  const selectedSessionData = FOREIGN_EXCHANGE_SESSIONS.find(
    (session) => session.session === selectedSession,
  ) ?? FOREIGN_EXCHANGE_SESSIONS[0];

  return (
    <div className="page-stack premium-exam-home fx-dashboard-v87">
      <ExamHomeHero
        tone="foreign-exchange"
        eyebrow="測驗題庫"
        title="初階外匯"
        subtitle="掌握外匯知識，開啟國際金融視野！"
        answered={summary.answered}
        total={totalQuestions}
        wrong={summary.wrong}
        favorites={summary.favorites}
        examDate={planConfig.examDate}
        dailyCount={dailyCount}
        dailyActionTo={`/foreign-exchange/practice?mode=random&count=${dailyCount}`}
        onEditPlan={() => setEditingPlanExamId("junior-foreign-exchange")}
        planConfigured={isStudyPlanConfigured(planConfig)}
      />

      <ExamQuickActions
        actions={[
          {
            label: "隨機練習",
            description: `跨屆抽取 ${safeRandomCount} 題`,
            to: `/foreign-exchange/practice?mode=random&count=${safeRandomCount}`,
            icon: PenLine,
          },
          {
            label: "歷屆練習",
            description: "依屆次學習",
            to: "/foreign-exchange#fx-history",
            icon: BookOpen,
          },
          {
            label: "模擬考",
            description: "完整限時測驗",
            to: "/foreign-exchange#fx-history",
            icon: TimerReset,
          },
          {
            label: "錯題練習",
            description: "強化弱點",
            to: "/foreign-exchange/practice?mode=wrong",
            icon: ClipboardX,
          },
          {
            label: "收藏練習",
            description: "重點題目",
            to: "/foreign-exchange/practice?mode=favorites",
            icon: Heart,
          },
          {
            label: "弱點分析",
            description: "精準提升",
            to: "/foreign-exchange#learning-summary",
            icon: BarChart3,
          },
        ]}
      />

      <div className="premium-random-count-control v90-random-count-control">
        <label htmlFor="fx-random-count-v90">隨機題數</label>
        <input
          id="fx-random-count-v90"
          type="number"
          inputMode="numeric"
          min={MIN_RANDOM_COUNT}
          max={MAX_RANDOM_COUNT}
          value={randomCount}
          onChange={(event) => setRandomCount(Number(event.currentTarget.value))}
          onBlur={() => setRandomCount(safeRandomCount)}
        />
        <span>可設定 {MIN_RANDOM_COUNT}～{MAX_RANDOM_COUNT} 題</span>
      </div>

      <ExamSubjectPath items={subjectItems} />

      <section
        id="fx-history"
        className="premium-home-section premium-history-section v90-history-section"
        aria-labelledby="fx-history-title"
      >
        <div className="premium-section-heading is-split v90-section-heading is-split">
          <div>
            <h2 id="fx-history-title">歷屆試題</h2>
            <p>第23至47屆・共3,250題</p>
          </div>
          <span>目前：第{selectedSession}屆</span>
        </div>

        <div className="premium-session-grid v90-session-grid" aria-label="選擇歷屆試題屆次">
          {FOREIGN_EXCHANGE_SESSIONS.map((session) => (
            <button
              key={session.session}
              type="button"
              className={session.session === selectedSession ? "is-active" : ""}
              aria-pressed={session.session === selectedSession}
              onClick={() => setSelectedSession(session.session)}
            >
              {session.session}屆
            </button>
          ))}
        </div>

        {selectedSessionData ? (
          <div className="premium-session-panel v90-session-panel">
            <div className="premium-session-panel-title">
              <BookOpen aria-hidden="true" size={21} />
              <div>
                <strong>第{selectedSessionData.session}屆</strong>
                <span>選擇國外匯兌或進出口外匯</span>
              </div>
            </div>
            <div className="premium-session-subjects">
              {selectedSessionData.subjects.map((subject) => (
                <article key={subject.id}>
                  <div>
                    <strong>{subject.title}</strong>
                    <span>{subject.questionCount}題・{subject.durationMinutes}分鐘</span>
                  </div>
                  <div>
                    <GlassLinkButton
                      to={`/foreign-exchange/practice?mode=practice&session=${selectedSessionData.session}&subject=${subject.id}`}
                      variant="secondary"
                    >
                      逐題練習
                    </GlassLinkButton>
                    <GlassLinkButton
                      to={`/foreign-exchange/practice?mode=mock&session=${selectedSessionData.session}&subject=${subject.id}`}
                      variant="primary"
                    >
                      模擬考
                    </GlassLinkButton>
                  </div>
                </article>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <ExamLearningSummary
        tone="foreign-exchange"
        weeklyValues={weeklyValues}
        weeklyAnswered={weeklyAnswered}
        completion={completion}
        studyTimeLabel={formatTotalPracticeTime(practiceSeconds)}
        examDate={planConfig.examDate}
        subjectCount={2}
        totalQuestions={totalQuestions}
        mockTimeLabel="60／90 分鐘"
        onEditPlan={() => setEditingPlanExamId("junior-foreign-exchange")}
      />

      {editingPlanExamId ? (
        <ExamStudyPlanDialog
          examId={editingPlanExamId}
          onClose={() => setEditingPlanExamId(null)}
          onSaved={() => setPlanRevision((value) => value + 1)}
        />
      ) : null}
    </div>
  );
}

function buildWeeklyAnswerSeries(answeredAtValues: string[]): number[] {
  const series = Array.from({ length: 7 }, () => 0);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  for (const answeredAt of answeredAtValues) {
    const timestamp = new Date(answeredAt).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const daysAgo = Math.floor((today.getTime() - timestamp) / (24 * 60 * 60 * 1000));
    if (daysAgo < 0 || daysAgo > 6) continue;
    const bucketIndex = 6 - daysAgo;
    series[bucketIndex] = (series[bucketIndex] ?? 0) + 1;
  }
  return series;
}
