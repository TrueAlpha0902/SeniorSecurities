import {
  BarChart3,
  BookOpen,
  ClipboardX,
  Heart,
  PenLine,
  Shuffle,
  TimerReset,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAuth } from "../auth/AuthContext";
import {
  ExamHomeHero,
  ExamLearningSummary,
  ExamQuickActions,
  ExamSubjectPath,
  type SubjectPathItem,
} from "../components/ExamHomeSections";
import { ExamStudyPlanDialog } from "../components/ExamStudyPlanDialog";
import { ErrorState } from "../components/ErrorState";
import { GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { useAsync } from "../hooks/useAsync";
import {
  listFavoriteQuestions,
  listUserAnswers,
  listWrongQuestions,
} from "../lib/db";
import {
  buildOrReadDailyPlan,
  type DailyPlanResult,
} from "../lib/dailyPlanService";
import {
  isSecuritiesQuestionId,
  loadImageQuizBankSummaries,
  resetImageQuizCaches,
  loadImageQuizPlanningIndex,
  type ImageQuizBank,
  type ImageQuizPlanningQuestion,
} from "../lib/imageQuiz";
import {
  formatTotalPracticeTime,
  getTotalPracticeSeconds,
  PRACTICE_TIME_CHANGED,
} from "../lib/practiceTime";
import {
  getStudyPlanConfigForExam,
  isStudyPlanConfigured,
  STUDY_PLAN_CHANGED,
  type StudyPlanScopeId,
  type StudyPlanExamId,
} from "../lib/studyPlan";
import { USER_STORAGE_SCOPE_CHANGED } from "../lib/userScopedStorage";
import type {
  FavoriteQuestionRecord,
  UserAnswer,
  WrongQuestionRecord,
} from "../types";

const SUBJECT_ORDER: StudyPlanScopeId[] = [
  "investment",
  "financial-analysis",
  "securities-laws-practice",
];

const EMPTY_BANKS: ImageQuizBank[] = [];
const EMPTY_ANSWERS: UserAnswer[] = [];

type HomeData = {
  banks: ImageQuizBank[];
  answers: UserAnswer[];
  wrongRecords: WrongQuestionRecord[];
  favorites: FavoriteQuestionRecord[];
  examDailyPlan?: DailyPlanResult<ImageQuizPlanningQuestion>;
};

async function loadHomeData(
  includePrivateData: boolean,
  userId: string | null,
): Promise<HomeData> {
  const [rawBanks, planningQuestions, answers, wrongRecords, favorites] =
    await Promise.all([
      loadImageQuizBankSummaries(),
      includePrivateData
        ? loadImageQuizPlanningIndex()
        : Promise.resolve([] as ImageQuizPlanningQuestion[]),
      includePrivateData ? listUserAnswers() : Promise.resolve([]),
      includePrivateData ? listWrongQuestions() : Promise.resolve([]),
      includePrivateData ? listFavoriteQuestions() : Promise.resolve([]),
    ]);

  const banks = sortSecuritiesBanks(rawBanks);
  const securitiesAnswers = answers.filter((record) =>
    isSecuritiesQuestionId(record.questionId),
  );
  const securitiesWrongRecords = wrongRecords.filter((record) =>
    isSecuritiesQuestionId(record.questionId),
  );
  const securitiesFavorites = favorites.filter((record) =>
    isSecuritiesQuestionId(record.questionId),
  );

  const examDailyPlan = includePrivateData
    ? buildOrReadDailyPlan({
        allQuestions: planningQuestions,
        storedAnswers: securitiesAnswers,
        wrongRecords: securitiesWrongRecords,
        userId,
        config: getStudyPlanConfigForExam("senior-securities"),
        planScopeId: "senior-securities",
      })
    : undefined;

  return {
    banks,
    answers: securitiesAnswers,
    wrongRecords: securitiesWrongRecords,
    favorites: securitiesFavorites,
    examDailyPlan,
  };
}

export function HomePage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const [planRevision, setPlanRevision] = useState(0);
  const [practiceSeconds, setPracticeSeconds] = useState(() => getTotalPracticeSeconds());
  const [editingPlanExamId, setEditingPlanExamId] =
    useState<StudyPlanExamId | null>(null);
  const { isActivated, user } = useAuth();
  const { data, error, loading, retry } = useAsync(
    () => loadHomeData(isActivated, user?.id ?? null),
    [refreshKey, planRevision, isActivated, user?.id],
  );

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener("records:changed", refresh);
    return () => window.removeEventListener("records:changed", refresh);
  }, []);

  useEffect(() => {
    const refreshPlans = () => setPlanRevision((value) => value + 1);
    window.addEventListener(STUDY_PLAN_CHANGED, refreshPlans);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refreshPlans);
    window.addEventListener("storage", refreshPlans);
    return () => {
      window.removeEventListener(STUDY_PLAN_CHANGED, refreshPlans);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refreshPlans);
      window.removeEventListener("storage", refreshPlans);
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

  const banks = data?.banks ?? EMPTY_BANKS;
  const answers = data?.answers ?? EMPTY_ANSWERS;
  const questionCount = useMemo(
    () =>
      banks.reduce(
        (sum, bank) =>
          sum +
          bank.chapters.reduce(
            (chapterSum, chapter) => chapterSum + chapter.questionCount,
            0,
          ),
        0,
      ),
    [banks],
  );
  const answeredCount = useMemo(
    () => new Set(answers.map((answer) => answer.questionId)).size,
    [answers],
  );
  const planConfig = getStudyPlanConfigForExam("senior-securities");
  const dailyCount = data?.examDailyPlan?.remainingCount ?? 0;
  const weeklyValues = useMemo(() => buildWeeklyAnswerSeries(answers), [answers]);
  const weeklyAnswered = weeklyValues.reduce((sum, value) => sum + value, 0);
  const completion = questionCount > 0 ? (answeredCount / questionCount) * 100 : 0;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent("exam-home:daily-target", {
      detail: {
        examId: "senior-securities",
        count: dailyCount,
        completed: data?.examDailyPlan?.completedBeforePlanCount ?? 0,
        planned: data?.examDailyPlan?.plannedCount ?? dailyCount,
      },
    }));
  }, [dailyCount, data?.examDailyPlan?.completedBeforePlanCount, data?.examDailyPlan?.plannedCount]);

  if (loading) return <LoadingState label="載入證券高業" />;
  if (error) {
    return (
      <ErrorState
        title="無法載入證券高業題庫"
        message={error}
        onRetry={() => {
          resetImageQuizCaches();
          retry();
        }}
      />
    );
  }

  const subjectItems: SubjectPathItem[] = banks.map((bank) => {
    const total = bank.chapters.reduce(
      (sum, chapter) => sum + chapter.questionCount,
      0,
    );
    const answered = countBankAnswers(bank, answers);
    const progress = total > 0
      ? Math.round((answered / total) * 1000) / 10
      : 0;
    const wrong = countBankRecords(bank, data?.wrongRecords ?? []);
    return {
      id: bank.bankId,
      title: bank.bankTitle,
      progress,
      answered,
      total,
      to: `/banks/${bank.bankId}`,
      meta: wrong > 0 ? `待訂正 ${wrong} 題` : "目前沒有待訂正題目",
    };
  });

  return (
    <div className="page-stack premium-exam-home securities-dashboard-v87">
      <ExamHomeHero
        tone="securities"
        eyebrow="測驗題庫"
        title="證券高業"
        subtitle="穩紮穩打，累積實力！"
        answered={answeredCount}
        total={questionCount}
        wrong={data?.wrongRecords.length ?? 0}
        favorites={data?.favorites.length ?? 0}
        examDate={planConfig.examDate}
        dailyCount={dailyCount}
        dailyActionLabel={dailyCount > 0 ? "開始練習" : "開始練習"}
        dailyActionTo={dailyCount > 0 ? "/image-quiz/daily?scope=all" : "/image-quiz/all"}
        onEditPlan={() => setEditingPlanExamId("senior-securities")}
        planConfigured={isStudyPlanConfigured(planConfig)}
      />

      {isActivated ? (
        <>
          <ExamQuickActions
            actions={[
              {
                label: "隨機練習",
                description: "不指定範圍",
                to: "/image-quiz/all",
                icon: Shuffle,
              },
              {
                label: "章節練習",
                description: "依章節學習",
                to: "/securities#learning-path",
                icon: PenLine,
              },
              {
                label: "模擬考",
                description: "全真模擬",
                to: "/random",
                icon: TimerReset,
              },
              {
                label: "錯題練習",
                description: "強化弱點",
                to: "/image-quiz/wrong",
                icon: ClipboardX,
              },
              {
                label: "收藏練習",
                description: "重點題目",
                to: "/image-quiz/favorites",
                icon: Heart,
              },
              {
                label: "弱點分析",
                description: "精準提升",
                to: "/similar",
                icon: BarChart3,
              },
            ]}
          />

          <ExamSubjectPath items={subjectItems} />

          <ExamLearningSummary
            tone="securities"
            weeklyValues={weeklyValues}
            weeklyAnswered={weeklyAnswered}
            completion={completion}
            studyTimeLabel={formatTotalPracticeTime(practiceSeconds)}
            examDate={planConfig.examDate}
            subjectCount={3}
            totalQuestions={questionCount}
            mockTimeLabel="依題數限時"
            onEditPlan={() => setEditingPlanExamId("senior-securities")}
          />
        </>
      ) : (
        <GlassCard className="premium-trial-card" as="section">
          <div>
            <span>尚未開通</span>
            <h2>先試用 10 題</h2>
            <p>開通後可使用完整題庫、共同考試計畫、錯題與模擬考。</p>
          </div>
          <GlassLinkButton to="/trial" variant="primary">
            <BookOpen aria-hidden="true" size={18} />開始試用
          </GlassLinkButton>
        </GlassCard>
      )}

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

function sortSecuritiesBanks(banks: ImageQuizBank[]): ImageQuizBank[] {
  const order = new Map(SUBJECT_ORDER.map((scopeId, index) => [scopeId, index]));
  return banks
    .filter((bank) => order.has(bank.bankId as StudyPlanScopeId))
    .slice()
    .sort(
      (left, right) =>
        (order.get(left.bankId as StudyPlanScopeId) ?? 99) -
        (order.get(right.bankId as StudyPlanScopeId) ?? 99),
    );
}

function getBankSourceIds(bank: ImageQuizBank): Set<string> {
  return new Set(
    bank.chapters.map(
      (chapter) => chapter.sourceBankId ?? chapter.bankId ?? bank.bankId,
    ),
  );
}

function countBankAnswers(bank: ImageQuizBank, answers: UserAnswer[]): number {
  const sourceIds = getBankSourceIds(bank);
  return new Set(
    answers
      .filter((answer) => sourceIds.has(answer.bankId))
      .map((answer) => answer.questionId),
  ).size;
}

function countBankRecords(
  bank: ImageQuizBank,
  records: Array<{ bankId: string }>,
): number {
  const sourceIds = getBankSourceIds(bank);
  return records.filter((record) => sourceIds.has(record.bankId)).length;
}

function buildWeeklyAnswerSeries(answers: UserAnswer[]): number[] {
  const series = Array.from({ length: 7 }, () => 0);
  const today = new Date();
  today.setHours(23, 59, 59, 999);
  for (const answer of answers) {
    const timestamp = new Date(answer.answeredAt).getTime();
    if (!Number.isFinite(timestamp)) continue;
    const daysAgo = Math.floor((today.getTime() - timestamp) / (24 * 60 * 60 * 1000));
    if (daysAgo < 0 || daysAgo > 6) continue;
    const bucketIndex = 6 - daysAgo;
    series[bucketIndex] = (series[bucketIndex] ?? 0) + 1;
  }
  return series;
}
