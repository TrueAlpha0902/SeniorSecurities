import { ArrowLeft, ArrowRight, Clock3, Flag, Heart, Home, ListChecks, Pause, Play, RotateCcw } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { EncouragementNote } from "../components/EncouragementNote";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { PdfSegmentStack } from "../components/PdfSegmentStack";
import { ProgressBar } from "../components/ProgressBar";
import { useAsync } from "../hooks/useAsync";
import {
  clearQuizProgress,
  finishImageQuizSession,
  getImageQuizSession,
  getQuizProgress,
  listUserAnswers,
  listFavoriteQuestions,
  listWrongQuestions,
  recordImageUserAnswer,
  saveImageQuizSessionAnswer,
  saveImageQuizSessionMarks,
  saveQuizProgress,
  settleImageQuizSession,
  toggleFavoriteRef,
  type ImageQuizSessionRecord,
} from "../lib/db";
import {
  assetUrl,
  formatImageQuizQuestionSource,
  loadAllImageQuestions,
  loadImageBankQuestions,
  loadImageChapterQuestions,
  loadImageQuizBank,
  loadImageQuizChapter,
  loadTrialImageQuestions,
  type ImageQuizQuestion,
  type NumericAnswer,
} from "../lib/imageQuiz";
import { calculateAccuracy } from "../lib/quiz";
import { addPracticeSeconds } from "../lib/practiceTime";
import {
  calculateSmartStudyPlanStats,
  DAILY_PLAN_STORAGE_VERSION,
  getStudyPlanConfig,
  getStudyPlanSignature,
  isReviewDue,
  localTodayKey,
  type DailyPlanCategory,
  type StudyIntensity,
} from "../lib/studyPlan";
import { readScopedStorageItem, writeScopedStorageItem } from "../lib/userScopedStorage";
import {
  ANSWER_MODE_SETTING_CHANGED,
  AUTO_NEXT_CORRECT_SETTING_CHANGED,
  getAnswerModeEnabled,
  getAutoNextCorrectEnabled,
} from "../lib/appSettings";
import { listLocalLearningStates, type AnswerConfidence } from "../lib/learningEngine";
import type { UserAnswer, WrongQuestionRecord } from "../types";

const ANSWERS: NumericAnswer[] = ["1", "2", "3", "4"];
const answerKeyToNumeric = {
  A: "1",
  B: "2",
  C: "3",
  D: "4",
} as const;

const T = {
  wrongTitle: "\u5f31\u9ede\u7df4\u7fd2",
  wrongSubtitle: "\u91cd\u65b0\u7df4\u7fd2\u66fe\u7d93\u7b54\u932f\u7684\u984c\u76ee",
  wrongEmpty: "\u76ee\u524d\u6c92\u6709\u932f\u984c",
  favoriteTitle: "\u6536\u85cf\u984c\u76ee",
  favoriteSubtitle: "\u7df4\u7fd2\u4f60\u52a0\u5165\u6536\u85cf\u7684\u984c\u76ee",
  favoriteEmpty: "\u76ee\u524d\u6c92\u6709\u6536\u85cf\u984c\u76ee",
  chapterTitle: "\u7ae0\u7bc0\u7df4\u7fd2",
  chapterSubtitle: "\u4f9d\u539f PDF \u984c\u865f\u9806\u5e8f\u7df4\u7fd2",
  chapterEmpty: "\u9019\u500b\u7ae0\u7bc0\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  bankTitle: "\u79d1\u76ee\u7df4\u7fd2",
  bankSubtitle: "\u4f9d\u7ae0\u7bc0\u8207\u539f PDF \u984c\u865f\u9806\u5e8f\u7df4\u7fd2",
  bankEmpty: "\u9019\u500b\u79d1\u76ee\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  allTitle: "\u5168\u90e8\u984c\u76ee\u6df7\u5408\u7df4\u7fd2",
  allSubtitle: "\u6240\u6709 PDF \u984c\u5eab\u4f9d\u8cc7\u6599\u9806\u5e8f\u7df4\u7fd2",
  allEmpty: "\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  dailyTitle: "每日練習",
  dailyEmpty: "今天的智能練習已完成",
  todayWrongTitle: "今日錯題複習",
  todayWrongSubtitle: "只複習今天答錯且尚未訂正成功的題目",
  todayWrongEmpty: "今天目前沒有待複習的錯題",
  timer: "計時",
  pauseTimer: "暫停",
  resumeTimer: "繼續",
  loading: "\u8f09\u5165 PDF \u984c\u5eab",
  loadError: "\u7121\u6cd5\u8f09\u5165\u984c\u5eab",
  emptyMessage: "\u8acb\u5148\u56de\u9996\u9801\u9078\u64c7\u5176\u4ed6\u984c\u5eab\uff0c\u6216\u91cd\u65b0\u532f\u5165 PDF \u984c\u5eab\u3002",
  home: "\u56de\u9996\u9801",
  questionError: "\u7121\u6cd5\u8f09\u5165\u984c\u76ee",
  questionErrorMessage: "\u76ee\u524d\u984c\u865f\u8d85\u51fa\u984c\u5eab\u7bc4\u570d\uff0c\u8acb\u56de\u9996\u9801\u91cd\u65b0\u9078\u64c7\u984c\u5eab\u3002",
  finished: "\u7df4\u7fd2\u5b8c\u6210",
  total: "\u7e3d\u984c\u6578",
  correctCount: "\u672c\u6b21\u7b54\u5c0d",
  wrongCount: "\u672c\u6b21\u7b54\u932f",
  accuracy: "\u6b63\u78ba\u7387",
  restart: "\u91cd\u65b0\u7df4\u7fd2",
  reviewWrong: "\u8907\u7fd2\u932f\u984c",
  addFavorite: "\u52a0\u5165\u6536\u85cf",
  removeFavorite: "\u53d6\u6d88\u6536\u85cf",
  answerOptions: "\u7b54\u6848\u9078\u9805",
  choose: "\u9078\u64c7",
  correct: "\u6b63\u89e3",
  selected: "\u4f60\u7684\u7b54\u6848",
  selectedCorrect: "\u4f60\u7684\u7b54\u6848 / \u6b63\u89e3",
  yourAnswer: "\u4f60\u7684\u7b54\u6848",
  correctAnswer: "\u6b63\u89e3",
  explanation: "\u89e3\u6790",
  navigation: "\u984c\u76ee\u5c0e\u89bd",
  jumpLabel: "跳到題號",
  jumpPlaceholder: "題號",
  jumpAction: "跳轉",
  jumpError: "請輸入 1 到 {total} 之間的題號。",
  previous: "\u4e0a\u4e00\u984c",
  next: "\u4e0b\u4e00\u984c",
  finish: "\u5b8c\u6210",
  settleConfirm: "\u8981\u5148\u7d50\u7b97\u9019\u6b21\u6a21\u64ec\u8003\u518d\u96e2\u958b\u55ce\uff1f\u78ba\u5b9a\u5f8c\u6703\u4fdd\u7559\u76ee\u524d\u7b54\u5c0d\u7387\uff0c\u4e4b\u5f8c\u4ecd\u53ef\u7e7c\u7e8c\u672a\u4f5c\u7b54\u984c\u76ee\u3002",
  settleSummaryTitle: "\u6a21\u64ec\u8003\u7d50\u7b97",
  answerRate: "\u7b54\u5c0d\u7387",
  answered: "\u5df2\u4f5c\u7b54",
  randomTitle: "模擬考測驗",
  randomSubtitle: "\u5f9e\u672c\u79d1\u6240\u6709\u7ae0\u7bc0\u96a8\u6a5f\u62bd\u984c",
  randomEmpty: "\u627e\u4e0d\u5230\u9019\u6b21\u6a21\u64ec\u8003",
  sessionWrongTitle: "\u6e2c\u9a57\u932f\u984c\u8907\u7fd2",
  sessionWrongSubtitle: "\u91cd\u65b0\u7df4\u7fd2\u9019\u6b21\u6a21\u64ec\u8003\u7b54\u932f\u7684\u984c\u76ee",
  sessionWrongEmpty: "\u9019\u6b21\u6e2c\u9a57\u6c92\u6709\u932f\u984c",
  trialTitle: "試用 10 題",
  trialSubtitle: "免費試用前 10 題；完整題庫需登入並輸入啟用碼。",
  trialEmpty: "目前沒有可試用的題目",
  wrongTimes: "\u932f\u8aa4\u6b21\u6578",
};

type AnswerRecord = {
  selected: NumericAnswer;
  correct: NumericAnswer;
  isCorrect: boolean;
};

type ImageQuizMode = "all" | "bank" | "chapter" | "wrong" | "todayWrong" | "favorites" | "random" | "sessionWrong" | "daily" | "trial";

type ImageQuizData = {
  title: string;
  subtitle: string;
  emptyTitle: string;
  questions: ImageQuizQuestion[];
  answerRecords?: Record<string, AnswerRecord>;
  wrongCounts?: Record<string, number>;
  dailyCategoryCounts?: Record<DailyPlanCategory, number>;
  dailyCategoryQuestionIds?: Record<DailyPlanCategory, string[]>;
  dailyInitialCompletedQuestionIds?: string[];
  remainingCount?: number;
  dailyPlannedCount?: number;
  dailyCompletedBeforePlanCount?: number;
  session?: ImageQuizSessionRecord;
};

export function ImageQuizPage() {
  const { user } = useAuth();
  const { bankId = "", chapterId = "", sessionId = "" } = useParams();
  const location = useLocation();
  const mode: ImageQuizMode = location.pathname.includes("/trial")
    ? "trial"
    : location.pathname.includes("/session-wrong")
    ? "sessionWrong"
    : location.pathname.includes("/today-wrong")
      ? "todayWrong"
    : location.pathname.includes("/daily")
      ? "daily"
    : location.pathname.includes("/wrong")
      ? "wrong"
      : location.pathname.includes("/favorites")
      ? "favorites"
      : location.pathname.includes("/random")
          ? "random"
          : location.pathname.includes("/all")
            ? "all"
            : chapterId
              ? "chapter"
              : "bank";
  const progressKey = mode === "daily"
    ? `image:daily:${localTodayKey()}:all`
    : mode === "todayWrong"
      ? `image:today-wrong:${localTodayKey()}:all`
    : mode === "trial"
      ? "image:trial:free"
      : `image:${mode}:${bankId || "all"}:${chapterId || sessionId || "all"}`;

  const { data, error, loading } = useAsync<ImageQuizData>(async () => {
    if (mode === "trial") {
      const questions = await loadTrialImageQuestions();
      return {
        title: T.trialTitle,
        subtitle: T.trialSubtitle,
        emptyTitle: T.trialEmpty,
        questions,
      };
    }

    if (mode === "daily") {
      const [allQuestions, storedAnswers, wrongRecords] = await Promise.all([
        loadAllImageQuestions(),
        listUserAnswers(),
        listWrongQuestions(),
      ]);
      const dailyTraining = buildDailyTrainingQuestions(allQuestions, storedAnswers, wrongRecords, user?.id ?? null);
      const today = localTodayKey();
      const todayAnswers = storedAnswers.filter(
        (answer) => localTodayKey(new Date(answer.answeredAt)) === today,
      );
      return {
        title: T.dailyTitle,
        subtitle: dailyTraining.summary,
        emptyTitle: T.dailyEmpty,
        questions: dailyTraining.questions,
        answerRecords: storedAnswersToRecords(todayAnswers, dailyTraining.questions),
        dailyPlannedCount: dailyTraining.plannedCount,
        dailyCompletedBeforePlanCount: dailyTraining.completedBeforePlanCount,
        dailyCategoryCounts: dailyTraining.categoryCounts,
        dailyCategoryQuestionIds: dailyTraining.categoryQuestionIds,
        dailyInitialCompletedQuestionIds: dailyTraining.initialCompletedQuestionIds,
        remainingCount: dailyTraining.remainingCount,
      };
    }

    if (mode === "todayWrong") {
      const [questions, wrongRecords] = await Promise.all([loadAllImageQuestions(), listWrongQuestions()]);
      const today = localTodayKey();
      const byId = new Map(questions.map((question) => [question.id, question]));
      const todayWrongRecords = wrongRecords.filter((record) => localTodayKey(new Date(record.lastWrongAt)) === today);
      const wrongCounts = Object.fromEntries(todayWrongRecords.map((record) => [record.questionId, record.wrongCount]));
      return {
        title: T.todayWrongTitle,
        subtitle: T.todayWrongSubtitle,
        emptyTitle: T.todayWrongEmpty,
        questions: todayWrongRecords
          .map((record) => byId.get(record.questionId))
          .filter((question): question is ImageQuizQuestion => Boolean(question)),
        wrongCounts,
      };
    }

    if (mode === "wrong") {
      const [questions, wrongRecords] = await Promise.all([loadAllImageQuestions(), listWrongQuestions()]);
      const byId = new Map(questions.map((question) => [question.id, question]));
      const wrongCounts = Object.fromEntries(wrongRecords.map((record) => [record.questionId, record.wrongCount]));
      return {
        title: T.wrongTitle,
        subtitle: T.wrongSubtitle,
        emptyTitle: T.wrongEmpty,
        questions: wrongRecords
          .map((record) => byId.get(record.questionId))
          .filter((question): question is ImageQuizQuestion => Boolean(question)),
        wrongCounts,
      };
    }

    if (mode === "favorites") {
      const [questions, favoriteRecords] = await Promise.all([loadAllImageQuestions(), listFavoriteQuestions()]);
      const byId = new Map(questions.map((question) => [question.id, question]));
      return {
        title: T.favoriteTitle,
        subtitle: T.favoriteSubtitle,
        emptyTitle: T.favoriteEmpty,
        questions: favoriteRecords
          .map((record) => byId.get(record.questionId))
          .filter((question): question is ImageQuizQuestion => Boolean(question)),
      };
    }

    if (mode === "random") {
      const session = await getImageQuizSession(sessionId);
      if (!session) {
        return {
          title: T.randomTitle,
          subtitle: T.randomSubtitle,
          emptyTitle: T.randomEmpty,
          questions: [],
        };
      }
      const bankQuestions = session.bankId === "__full_exam__"
        ? await loadAllImageQuestions()
        : await loadImageBankQuestions(session.bankId);
      const byId = new Map(bankQuestions.map((question) => [question.id, question]));
      return {
        title: `${session.bankTitle} / ${T.randomTitle}`,
        subtitle: T.randomSubtitle,
        emptyTitle: T.randomEmpty,
        questions: session.questionIds
          .map((questionId) => byId.get(questionId))
          .filter((question): question is ImageQuizQuestion => Boolean(question)),
        answerRecords: sessionAnswersToRecords(session),
        session,
      };
    }

    if (mode === "sessionWrong") {
      const session = await getImageQuizSession(sessionId);
      if (!session) {
        return {
          title: T.sessionWrongTitle,
          subtitle: T.sessionWrongSubtitle,
          emptyTitle: T.sessionWrongEmpty,
          questions: [],
        };
      }
      const bankQuestions = session.bankId === "__full_exam__"
        ? await loadAllImageQuestions()
        : await loadImageBankQuestions(session.bankId);
      const byId = new Map(bankQuestions.map((question) => [question.id, question]));
      return {
        title: `${session.bankTitle} / ${T.sessionWrongTitle}`,
        subtitle: T.sessionWrongSubtitle,
        emptyTitle: T.sessionWrongEmpty,
        questions: session.wrongQuestionIds
          .map((questionId) => byId.get(questionId))
          .filter((question): question is ImageQuizQuestion => Boolean(question)),
      };
    }

    if (mode === "chapter") {
      const [questions, chapter, bank] = await Promise.all([
        loadImageChapterQuestions(bankId, chapterId),
        loadImageQuizChapter(bankId, chapterId),
        loadImageQuizBank(bankId),
      ]);
      return {
        title: chapter && bank ? `${bank.bankTitle} / ${chapter.chapterTitle}` : T.chapterTitle,
        subtitle: T.chapterSubtitle,
        emptyTitle: T.chapterEmpty,
        questions,
      };
    }

    if (mode === "bank") {
      const [questions, bank] = await Promise.all([loadImageBankQuestions(bankId), loadImageQuizBank(bankId)]);
      return {
        title: bank?.bankTitle ?? T.bankTitle,
        subtitle: T.bankSubtitle,
        emptyTitle: T.bankEmpty,
        questions,
      };
    }

    const questions = await loadAllImageQuestions();
    return {
      title: T.allTitle,
      subtitle: T.allSubtitle,
      emptyTitle: T.allEmpty,
      questions,
    };
  }, [bankId, chapterId, mode, sessionId, user?.id]);

  const questions = useMemo(() => data?.questions ?? [], [data]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [progressRestored, setProgressRestored] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [jumpInput, setJumpInput] = useState("");
  const [jumpError, setJumpError] = useState("");
  const [answerModeEnabled, setAnswerModeEnabled] = useState(() => getAnswerModeEnabled());
  const [confidenceByQuestion] = useState<Record<string, AnswerConfidence>>({});
  const [retryQueue, setRetryQueue] = useState<string[]>([]);
  const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<string>>(new Set());
  const [answerCardOpen, setAnswerCardOpen] = useState(false);
  const [autoNextCorrectEnabled, setAutoNextCorrectEnabled] = useState(() => getAutoNextCorrectEnabled());

  useEffect(() => {
    setElapsedSeconds(0);
    setTimerPaused(false);
    setJumpInput("");
    setJumpError("");
    setRetryQueue([]);
    setMarkedQuestionIds(new Set());
    setAnswerCardOpen(false);
  }, [progressKey]);

  useEffect(() => {
    function refreshAnswerModeSetting(): void {
      setAnswerModeEnabled(getAnswerModeEnabled());
    }
    function refreshAutoNextCorrectSetting(): void {
      setAutoNextCorrectEnabled(getAutoNextCorrectEnabled());
    }
    function refreshAllSettings(): void {
      refreshAnswerModeSetting();
      refreshAutoNextCorrectSetting();
    }
    window.addEventListener(ANSWER_MODE_SETTING_CHANGED, refreshAnswerModeSetting);
    window.addEventListener(AUTO_NEXT_CORRECT_SETTING_CHANGED, refreshAutoNextCorrectSetting);
    window.addEventListener("storage", refreshAllSettings);
    return () => {
      window.removeEventListener(ANSWER_MODE_SETTING_CHANGED, refreshAnswerModeSetting);
      window.removeEventListener(AUTO_NEXT_CORRECT_SETTING_CHANGED, refreshAutoNextCorrectSetting);
      window.removeEventListener("storage", refreshAllSettings);
    };
  }, []);

  useEffect(() => {
    if (!progressRestored || finished || timerPaused) {
      return;
    }
    const timer = window.setInterval(() => {
      setElapsedSeconds((seconds) => seconds + 1);
      addPracticeSeconds(1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finished, progressKey, progressRestored, timerPaused]);

  useEffect(() => {
    let cancelled = false;

    async function restoreState() {
      setProgressRestored(false);
      setAnswers({});
      setFinished(false);

      if (!questions.length) {
        setCurrentIndex(0);
        setFavoriteIds(new Set());
        setProgressRestored(true);
        return;
      }

      const shouldRestoreGlobalAnswers = !data?.answerRecords && mode !== "sessionWrong" && mode !== "todayWrong" && mode !== "wrong";
      const [progress, favoriteRecords, storedAnswers] = await Promise.all([
        getQuizProgress(progressKey),
        listFavoriteQuestions(),
        shouldRestoreGlobalAnswers ? listUserAnswers() : Promise.resolve([]),
      ]);
      if (cancelled) {
        return;
      }

      const maxIndex = Math.max(0, questions.length - 1);
      const restoredIndex =
        progress && progress.totalQuestions === questions.length
          ? Math.min(Math.max(progress.currentIndex, 0), maxIndex)
          : 0;

      setCurrentIndex(restoredIndex);
      setAnswers(data?.answerRecords ?? storedAnswersToRecords(storedAnswers, questions));
      setFavoriteIds(new Set(favoriteRecords.map((record) => record.questionId)));
      setMarkedQuestionIds(new Set(data?.session?.markedQuestionIds ?? []));
      setProgressRestored(true);
    }

    void restoreState();

    return () => {
      cancelled = true;
    };
  }, [data?.answerRecords, data?.session?.markedQuestionIds, mode, progressKey, questions]);

  useEffect(() => {
    if (!progressRestored || !questions.length || finished) {
      return;
    }

    void saveQuizProgress(progressKey, currentIndex, questions.length);
  }, [currentIndex, finished, progressKey, progressRestored, questions.length]);

  const answeredRecords = Object.values(answers);
  const correctCount = answeredRecords.filter((record) => record.isCorrect).length;
  const resultTotal = answeredRecords.length;
  const wrongCount = resultTotal - correctCount;
  const accuracy = resultTotal ? calculateAccuracy(correctCount, resultTotal) : 0;
  const shouldPromptRandomExit =
    mode === "random" && !finished && resultTotal > 0 && resultTotal < questions.length && Boolean(data?.session);
  const dailyAnsweredIds = useMemo(() => new Set(Object.keys(answers)), [answers]);
  const dailyInitialCompletedIds = useMemo(() => new Set(data?.dailyInitialCompletedQuestionIds ?? []), [data?.dailyInitialCompletedQuestionIds]);
  const dailyRemainingCount = mode === "daily"
    ? calculateLiveDailyRemainingCount(
        data?.remainingCount ?? questions.length,
        data?.dailyCategoryQuestionIds,
        dailyAnsweredIds,
        dailyInitialCompletedIds,
      )
    : undefined;
  const dailyPlannedCount = mode === "daily" ? (data?.dailyPlannedCount ?? questions.length) : undefined;
  const dailyAnsweredCount = mode === "daily"
    ? Math.max(0, (dailyPlannedCount ?? questions.length) - (dailyRemainingCount ?? 0))
    : undefined;
  const dailyProgressValue = mode === "daily"
    ? Math.min(dailyPlannedCount ?? questions.length, Math.max(0, dailyAnsweredCount ?? 0))
    : currentIndex + 1;

  useEffect(() => {
    if (!shouldPromptRandomExit) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldPromptRandomExit]);

  useEffect(() => {
    function handleNavigationAttempt(event: Event): void {
      if (!shouldPromptRandomExit) {
        return;
      }

      const navigationEvent = event as CustomEvent<{ continueNavigation?: () => void }>;
      event.preventDefault();

      async function confirmSettlement(): Promise<void> {
        const confirmed = window.confirm(T.settleConfirm);
        if (!confirmed) {
          return;
        }

        if (data?.session) {
          await settleImageQuizSession(data.session.sessionId);
        }
        window.alert(
          `${T.settleSummaryTitle}\n${T.answered} ${resultTotal} / ${questions.length} ${T.total}\n${T.correctCount} ${correctCount}\n${T.wrongCount} ${wrongCount}\n${T.answerRate} ${accuracy}%`,
        );
        navigationEvent.detail?.continueNavigation?.();
      }

      void confirmSettlement();
    }

    window.addEventListener("quiz:navigation-attempt", handleNavigationAttempt);
    return () => window.removeEventListener("quiz:navigation-attempt", handleNavigationAttempt);
  }, [accuracy, correctCount, data?.session, questions.length, resultTotal, shouldPromptRandomExit, wrongCount]);


  useEffect(() => {
    return preloadNeighborQuestionAssets(questions, currentIndex);
  }, [currentIndex, questions]);

  if (loading || (questions.length > 0 && !progressRestored)) {
    return <LoadingState label={T.loading} />;
  }

  if (error) {
    return <ErrorState title={T.loadError} message={error} />;
  }

  if (!questions.length) {
    return (
      <EmptyState title={data?.emptyTitle ?? T.allEmpty} message={emptyMessageForMode(mode)} actionLabel={T.home} actionTo="/" />
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    return <ErrorState title={T.questionError} message={T.questionErrorMessage} />;
  }

  const savedAnswer = answers[currentQuestion.id];
  const isDeferredExam = mode === "random" && data?.session?.feedbackMode === "deferred";
  const examAnsweredCount = Object.keys(answers).length;
  const examUnansweredCount = Math.max(0, questions.length - examAnsweredCount);
  const currentIsMarked = markedQuestionIds.has(currentQuestion.id);
  const answerModeAllowed = answerModeEnabled
    && !isDeferredExam
    && mode !== "wrong"
    && mode !== "todayWrong"
    && mode !== "sessionWrong";
  const answerModeRecord: AnswerRecord | undefined = answerModeAllowed
    ? { selected: currentQuestion.answer, correct: currentQuestion.answer, isCorrect: true }
    : undefined;
  const currentAnswer = savedAnswer ?? answerModeRecord;
  const currentConfidence = confidenceByQuestion[currentQuestion.id] ?? "sure";
  const revealCurrentAnswer = !isDeferredExam;
  const isFavorite = favoriteIds.has(currentQuestion.id);
  const displayedQuestionNumber =
    mode === "random" || mode === "sessionWrong" ? currentIndex + 1 : currentQuestion.number;
  const currentWrongCount = mode === "wrong" || mode === "todayWrong" ? data?.wrongCounts?.[currentQuestion.id] : undefined;
  const currentCorrectStreak = calculateConsecutiveCorrectStreak(questions, answers, currentIndex);
  const activeCorrectStreak = calculateActiveCorrectStreak(questions, answers, currentIndex);
  const encouragementCorrectStreak = currentAnswer?.isCorrect
    ? Math.max(currentCorrectStreak, activeCorrectStreak, 1)
    : activeCorrectStreak;
  const encouragementIsCorrect = isDeferredExam
    ? undefined
    : currentAnswer?.isCorrect === false
      ? false
      : encouragementCorrectStreak > 0
        ? true
        : undefined;
  const questionSourceLabel = formatImageQuizQuestionSource(currentQuestion);
  const contextLabel =
    mode === "daily"
      ? `${T.dailyTitle} · ${questionSourceLabel}`
      : mode === "random"
        ? `${T.randomTitle} · ${questionSourceLabel}`
        : mode === "sessionWrong"
          ? `${T.sessionWrongTitle} · ${questionSourceLabel}`
          : mode === "chapter" || mode === "bank"
            ? (data?.title ?? questionSourceLabel)
            : questionSourceLabel;

  async function handleAnswer(selected: NumericAnswer): Promise<void> {
    if (!currentQuestion || answers[currentQuestion.id] || answerModeAllowed) {
      return;
    }

    const record: AnswerRecord = {
      selected,
      correct: currentQuestion.answer,
      isCorrect: selected === currentQuestion.answer,
    };

    setAnswers((previous) => ({
      ...previous,
      [currentQuestion.id]: record,
    }));
    await recordImageUserAnswer(currentQuestion, selected, {
      confidence: currentConfidence,
      sessionId: data?.session?.sessionId ?? null,
      sessionMode: data?.session?.mode ?? mode,
    });
    if (mode === "random" && data?.session) {
      await saveImageQuizSessionAnswer(data.session.sessionId, currentQuestion.id, {
        ...record,
        answeredAt: new Date().toISOString(),
      });
    }
    if (!isDeferredExam && !record.isCorrect) {
      setRetryQueue((current) => current.includes(currentQuestion.id) ? current : [...current, currentQuestion.id]);
    }

    if (!isDeferredExam && autoNextCorrectEnabled && record.isCorrect && currentIndex < questions.length - 1) {
      window.setTimeout(() => {
        setCurrentIndex((index) => (index === currentIndex ? Math.min(index + 1, questions.length - 1) : index));
      }, 650);
    }
  }

  function goPrevious(): void {
    setJumpError("");
    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  function openNextQueuedRetry(): boolean {
    const retryQuestionId = retryQueue[0];
    if (!retryQuestionId) return false;
    const retryIndex = questions.findIndex((question) => question.id === retryQuestionId);
    if (retryIndex < 0) {
      setRetryQueue((current) => current.slice(1));
      return false;
    }
    setAnswers((current) => {
      const next = { ...current };
      delete next[retryQuestionId];
      return next;
    });
    setRetryQueue((current) => current.slice(1));
    setCurrentIndex(retryIndex);
    setJumpError("");
    return true;
  }

  async function goNext(): Promise<void> {
    const shouldRetryNow = !isDeferredExam && retryQueue.length > 0
      && (currentIndex >= questions.length - 1 || Object.keys(answers).length % 4 === 0);
    if (shouldRetryNow && openNextQueuedRetry()) return;
    if (currentIndex >= questions.length - 1) {
      if (isDeferredExam) {
        const unanswered = Math.max(0, questions.length - Object.keys(answers).length);
        const confirmed = window.confirm(unanswered > 0
          ? `尚有 ${unanswered} 題未作答，確定要交卷嗎？`
          : "確定要交卷並查看成績嗎？");
        if (!confirmed) return;
      }
      if (mode === "random" && data?.session) {
        await saveRandomSessionResult(data.session.sessionId, questions, answers);
      }
      setFinished(true);
      void clearQuizProgress(progressKey);
      return;
    }

    setJumpError("");
    setCurrentIndex((index) => Math.min(questions.length - 1, index + 1));
  }

  function handleJump(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = Number(jumpInput.trim());
    if (!Number.isInteger(value) || value < 1 || value > questions.length) {
      setJumpError(T.jumpError.replace("{total}", questions.length.toString()));
      return;
    }
    setCurrentIndex(value - 1);
    setJumpInput("");
    setJumpError("");
  }

  async function toggleExamMark(): Promise<void> {
    const question = questions[currentIndex];
    if (!isDeferredExam || !data?.session || !question) return;
    const next = new Set(markedQuestionIds);
    if (next.has(question.id)) next.delete(question.id);
    else next.add(question.id);
    setMarkedQuestionIds(next);
    await saveImageQuizSessionMarks(data.session.sessionId, Array.from(next));
  }

  function jumpFromAnswerCard(index: number): void {
    setCurrentIndex(index);
    setJumpError("");
    if (window.innerWidth < 760) setAnswerCardOpen(false);
  }

  async function toggleFavorite(): Promise<void> {
    const question = questions[currentIndex];
    if (!question) {
      return;
    }

    const active = await toggleFavoriteRef({
      questionId: question.id,
      bankId: question.bankId,
      chapter: question.chapterId,
    });

    setFavoriteIds((previous) => {
      const next = new Set(previous);
      if (active) {
        next.add(question.id);
      } else {
        next.delete(question.id);
      }
      return next;
    });
  }

  async function restartQuiz(): Promise<void> {
    setAnswers({});
    setCurrentIndex(0);
    setFinished(false);
    await clearQuizProgress(progressKey);
  }

  if (finished) {
    return (
      <GlassCard className="image-quiz-card">
        <div className="quiz-result-hero">
          <p className="eyebrow">{data?.title}</p>
          <h1>{T.finished}</h1>
          <p>{data?.subtitle}</p>
        </div>
        <div className="quiz-stats-grid">
          <StatCard label={T.total} value={questions.length.toString()} />
          <StatCard label={T.correctCount} value={correctCount.toString()} />
          <StatCard label={T.wrongCount} value={wrongCount.toString()} />
          <StatCard label={T.accuracy} value={`${accuracy}%`} />
        </div>
        <div className="result-actions">
          <GlassButton variant="primary" onClick={() => void restartQuiz()}>
            <RotateCcw aria-hidden="true" size={18} />
            <span>{T.restart}</span>
          </GlassButton>
          <GlassLinkButton to="/image-quiz/wrong" variant="secondary">
            {T.reviewWrong}
          </GlassLinkButton>
          <GlassLinkButton to="/" variant="secondary">
            <Home aria-hidden="true" size={18} />
            <span>{T.home}</span>
          </GlassLinkButton>
        </div>
      </GlassCard>
    );
  }

  return (
    <div className="image-quiz-page">
      <GlassCard className="image-quiz-card">
        <div className="image-quiz-header">
          <div>
            <p className="eyebrow">
              {contextLabel}
            </p>
            <div className="quiz-title-line">
              <h1>
                {"\u7b2c "}
                {displayedQuestionNumber}
                {" \u984c"}
              </h1>
              <span className="glass-badge quiz-timer-badge" aria-label={`練習時間 ${formatElapsedTime(elapsedSeconds)}`}>
                <Clock3 aria-hidden="true" size={15} />
                {formatElapsedTime(elapsedSeconds)}
                {!isDeferredExam ? (
                  <button
                    type="button"
                    className="timer-pause-button"
                    aria-label={timerPaused ? T.resumeTimer : T.pauseTimer}
                    title={timerPaused ? T.resumeTimer : T.pauseTimer}
                    onClick={() => setTimerPaused((paused) => !paused)}
                  >
                    {timerPaused ? <Play aria-hidden="true" size={13} /> : <Pause aria-hidden="true" size={13} />}
                    <span>{timerPaused ? T.resumeTimer : T.pauseTimer}</span>
                  </button>
                ) : null}
              </span>
              {mode === "daily" ? (
                <span className="glass-badge daily-count-badge">
                  今日剩餘 {dailyRemainingCount ?? 0} 題 / 答對 {correctCount} 題 / 答錯 {wrongCount} 題
                </span>
              ) : null}
              {currentWrongCount ? (
                <span className="glass-badge weak-count-badge">
                  {T.wrongTimes} {currentWrongCount}
                </span>
              ) : null}
            </div>
          </div>
          <div className="quiz-header-actions">
            {isDeferredExam ? (
              <>
                <button
                  type="button"
                  className={`quiz-exam-action${answerCardOpen ? " is-active" : ""}`}
                  aria-label="開啟答題卡"
                  aria-expanded={answerCardOpen}
                  onClick={() => setAnswerCardOpen((open) => !open)}
                >
                  <ListChecks aria-hidden="true" size={19} /><span>答題卡</span>
                </button>
                <button
                  type="button"
                  className={`quiz-exam-action${currentIsMarked ? " is-marked" : ""}`}
                  aria-label={currentIsMarked ? "取消待檢標記" : "標記為待檢"}
                  aria-pressed={currentIsMarked}
                  onClick={() => void toggleExamMark()}
                >
                  <Flag aria-hidden="true" size={18} fill={currentIsMarked ? "currentColor" : "none"} /><span>{currentIsMarked ? "已標記" : "待檢"}</span>
                </button>
              </>
            ) : null}
            <button
              type="button"
              className={`quiz-favorite-button ${isFavorite ? "is-active" : ""}`}
              aria-label={isFavorite ? T.removeFavorite : T.addFavorite}
              title={isFavorite ? T.removeFavorite : T.addFavorite}
              onClick={() => void toggleFavorite()}
            >
              <Heart aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        {mode === "daily" ? (
          <>
            <p className="daily-quiz-subtitle">
              今日規劃 {dailyPlannedCount ?? questions.length} 題，已完成 {dailyAnsweredCount ?? 0} 題，剩餘 {dailyRemainingCount ?? 0} 題。
            </p>
            <div className="daily-question-source-badge" aria-label="題目來源">
              <span>{questionSourceLabel}</span>
            </div>
          </>
        ) : mode === "random" || mode === "sessionWrong" ? (
          <div className="daily-question-source-badge" aria-label="題目來源">
            <span>{questionSourceLabel}</span>
          </div>
        ) : null}

        {!isDeferredExam ? (
          <EncouragementNote
            isCorrect={encouragementIsCorrect}
            seed={`${currentQuestion.id}:${encouragementCorrectStreak}:top`}
            correctStreak={encouragementCorrectStreak}
            compact
          />
        ) : (
          <p className="deferred-exam-notice">考試模式：作答後只鎖定選項，交卷前不顯示正解與解析。</p>
        )}

        <ProgressBar
          value={dailyProgressValue}
          max={mode === "daily" ? (dailyPlannedCount ?? questions.length) : questions.length}
          label={mode === "daily"
            ? `已完成 ${dailyProgressValue} / ${dailyPlannedCount ?? questions.length} 題`
            : `${"\u7b2c"} ${currentIndex + 1} / ${questions.length} ${"\u984c"}`}
        />

        {isDeferredExam && answerCardOpen ? (
          <section className="exam-answer-card" aria-label="模擬考答題卡">
            <div className="exam-answer-card-head">
              <div><strong>答題卡</strong><span>已作答 {examAnsweredCount}／{questions.length} · 未作答 {examUnansweredCount} · 待檢 {markedQuestionIds.size}</span></div>
              <button type="button" onClick={() => setAnswerCardOpen(false)} aria-label="收合答題卡">收合</button>
            </div>
            <div className="exam-answer-card-legend"><span className="is-answered">已作答</span><span className="is-marked">待檢</span><span>未作答</span></div>
            <div className="exam-answer-card-grid">
              {questions.map((question, index) => {
                const answered = Boolean(answers[question.id]);
                const marked = markedQuestionIds.has(question.id);
                return (
                  <button
                    type="button"
                    key={question.id}
                    className={`${answered ? "is-answered" : ""}${marked ? " is-marked" : ""}${index === currentIndex ? " is-current" : ""}`}
                    aria-label={`第 ${index + 1} 題${answered ? "，已作答" : "，未作答"}${marked ? "，待檢" : ""}`}
                    onClick={() => jumpFromAnswerCard(index)}
                  >
                    {index + 1}{marked ? <Flag size={10} fill="currentColor" /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <PdfSegmentStack
          label={`${"\u7b2c"} ${currentQuestion.number} ${"\u984c\u984c\u76ee"}`}
          segments={currentQuestion.questionSegments}
          priority="high"
        />

        <div className="numeric-option-grid" aria-label={T.answerOptions}>
          {ANSWERS.map((answer) => (
            <button
              key={answer}
              type="button"
              className={answerButtonClass(answer, currentAnswer, revealCurrentAnswer)}
              disabled={Boolean(currentAnswer)}
              aria-pressed={currentAnswer?.selected === answer}
              aria-label={`${T.choose} (${answer})`}
              onClick={() => void handleAnswer(answer)}
            >
              <span className="answer-key">({answer})</span>
              {currentAnswer ? <span className="answer-status-label">{answerStatusLabel(answer, currentAnswer, revealCurrentAnswer)}</span> : null}
            </button>
          ))}
        </div>

        {currentAnswer && revealCurrentAnswer ? (
          <div className="image-answer-panel">
            <div className="result-line">
              <span className="glass-badge">
                {T.yourAnswer} ({currentAnswer.selected})
              </span>
              <span className="glass-badge">
                {T.correctAnswer} ({currentAnswer.correct})
              </span>
              {!currentAnswer.isCorrect && retryQueue.includes(currentQuestion.id) ? <span className="glass-badge retry-queued-badge">已加入本次重試</span> : null}
            </div>
            <div className="glass-explanation">
              <h2>{T.explanation}</h2>
              <PdfSegmentStack
                label={`${"\u7b2c"} ${currentQuestion.number} ${"\u984c\u89e3\u6790"}`}
                segments={currentQuestion.explanationSegments}
                priority="auto"
              />
            </div>
          </div>
        ) : null}
      </GlassCard>

      {jumpError ? <p className="inline-error jump-error-fixed" role="alert">{jumpError}</p> : null}
      <div className="image-quiz-controls" aria-label={T.navigation}>
        <GlassButton variant="secondary" onClick={goPrevious} disabled={currentIndex === 0}>
          <ArrowLeft aria-hidden="true" size={18} />
          <span>{T.previous}</span>
        </GlassButton>
        <form className="question-jump-form inline-jump-form" onSubmit={handleJump}>
          <label htmlFor="question-jump-input">{T.jumpLabel}</label>
          <input
            id="question-jump-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={questions.length}
            value={jumpInput}
            placeholder={T.jumpPlaceholder}
            onChange={(event) => setJumpInput(event.currentTarget.value)}
          />
          <GlassButton variant="secondary" type="submit" disabled={!jumpInput.trim()}>
            {T.jumpAction}
          </GlassButton>
        </form>
        <GlassButton variant="primary" onClick={() => void goNext()}>
          <span>{currentIndex >= questions.length - 1 ? (isDeferredExam ? "交卷" : T.finish) : T.next}</span>
          <ArrowRight aria-hidden="true" size={18} />
        </GlassButton>
      </div>
    </div>
  );
}


function calculateLiveDailyRemainingCount(
  baseRemainingCount: number,
  categoryQuestionIds: Record<DailyPlanCategory, string[]> | undefined,
  answeredIds: Set<string>,
  initialCompletedIds: Set<string>,
): number {
  if (!categoryQuestionIds) {
    return Math.max(0, baseRemainingCount - answeredIds.size);
  }

  const dailyQuestionIds = new Set(Object.values(categoryQuestionIds).flat());
  const completedQuestionIds = new Set<string>();
  initialCompletedIds.forEach((questionId) => {
    if (dailyQuestionIds.has(questionId)) {
      completedQuestionIds.add(questionId);
    }
  });
  answeredIds.forEach((questionId) => {
    if (dailyQuestionIds.has(questionId)) {
      completedQuestionIds.add(questionId);
    }
  });
  const calculatedRemaining = Math.max(0, dailyQuestionIds.size - completedQuestionIds.size);
  return Math.min(Math.max(0, baseRemainingCount), calculatedRemaining);
}


function preloadNeighborQuestionAssets(questions: readonly ImageQuizQuestion[], currentIndex: number): () => void {
  if (typeof window === "undefined" || !questions.length) {
    return () => undefined;
  }

  const nextQuestion = questions[currentIndex + 1];
  if (!nextQuestion) return () => undefined;
  const sources = new Set<string>();
  nextQuestion.questionSegments.forEach((segment) => sources.add(segment.src));

  const preload = () => {
    sources.forEach((source) => {
      const image = new Image();
      image.decoding = "async";
      image.fetchPriority = "low";
      image.src = assetUrl(source);
    });
  };

  if (typeof window.requestIdleCallback === "function") {
    const idleId = window.requestIdleCallback(preload, { timeout: 1_500 });
    return () => window.cancelIdleCallback(idleId);
  }

  const timerId = window.setTimeout(preload, 250);
  return () => window.clearTimeout(timerId);
}

function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}

function emptyMessageForMode(mode: ImageQuizMode): string {
  if (mode === "daily") return "今日安排的新題、錯題與複習題都完成了，回首頁查看首輪覆蓋與明日任務。";
  if (mode === "todayWrong") return "今天答錯但尚未訂正的題目會出現在這裡。";
  if (mode === "wrong") return "答錯的題目會自動收進這裡，答對後即完成訂正。";
  if (mode === "favorites") return "在題目頁點選收藏後，就能從這裡集中複習。";
  return T.emptyMessage;
}

type DailyTrainingBuildResult = {
  questions: ImageQuizQuestion[];
  planQuestionIds: string[];
  categoryCounts: Record<DailyPlanCategory, number>;
  categoryQuestionIds?: Record<DailyPlanCategory, string[]>;
  remainingCount?: number;
  plannedCount: number;
  completedBeforePlanCount: number;
  initialCompletedQuestionIds: string[];
  plan: ReturnType<typeof calculateSmartStudyPlanStats>;
  summary: string;
};

function buildDailyTrainingQuestions(
  allQuestions: ImageQuizQuestion[],
  storedAnswers: UserAnswer[],
  wrongRecords: WrongQuestionRecord[],
  userId: string | null,
): DailyTrainingBuildResult {
  const config = getStudyPlanConfig();
  const allQuestionIds = new Set(allQuestions.map((question) => question.id));
  const todayAnsweredIds = getTodayAnsweredIds(storedAnswers, allQuestionIds);
  const planningAnswers = storedAnswers.filter((answer) => !todayAnsweredIds.has(answer.questionId));
  const byQuestionId = new Map(allQuestions.map((question) => [question.id, question]));
  const answersById = new Map(planningAnswers.map((answer) => [answer.questionId, answer]));
  const wrongDueRecords = wrongRecords.filter((record) => answersById.get(record.questionId)?.isCorrect !== true);
  const wrongIds = new Set(wrongDueRecords.map((record) => record.questionId));
  const unattemptedQuestions = allQuestions.filter((question) => !answersById.has(question.id));
  const wrongDueQuestions = wrongDueRecords
    .slice()
    .sort((left, right) => right.wrongCount - left.wrongCount || right.lastWrongAt.localeCompare(left.lastWrongAt))
    .map((record) => byQuestionId.get(record.questionId))
    .filter((question): question is ImageQuizQuestion => Boolean(question));
  const learningStates = new Map(listLocalLearningStates(userId).map((state) => [state.questionId, state]));
  const now = Date.now();
  const reviewDueQuestions = planningAnswers
    .filter((answer) => {
      if (!answer.isCorrect || wrongIds.has(answer.questionId)) return false;
      const learningState = learningStates.get(answer.questionId);
      return learningState
        ? new Date(learningState.nextReviewAt).getTime() <= now
        : isReviewDue(answer.answeredAt);
    })
    .sort((left, right) => {
      const leftDue = learningStates.get(left.questionId)?.nextReviewAt ?? left.answeredAt;
      const rightDue = learningStates.get(right.questionId)?.nextReviewAt ?? right.answeredAt;
      return leftDue.localeCompare(rightDue);
    })
    .map((answer) => byQuestionId.get(answer.questionId))
    .filter((question): question is ImageQuizQuestion => Boolean(question));
  const reviewDueIds = new Set(reviewDueQuestions.map((question) => question.id));
  const mixedPoolQuestions = allQuestions.filter(
    (question) => answersById.has(question.id) && !wrongIds.has(question.id) && !reviewDueIds.has(question.id),
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
  });

  const storedDailyPlan = readStoredDailyPlan(allQuestions, plan, storedAnswers);
  if (storedDailyPlan) {
    return storedDailyPlan;
  }

  const selectedIds = new Set<string>();
  const wrongQuestions = takeBalancedByExamSubject(wrongDueQuestions, plan.allocations.wrong.count, selectedIds);
  const reviewQuestions = takeBalancedByExamSubject(reviewDueQuestions, plan.allocations.review.count, selectedIds);
  const newQuestions = takeBalancedByExamSubject(unattemptedQuestions, plan.allocations.new.count, selectedIds);
  // 「混合小測」已從每日計畫移除；保留 mixed 欄位只為相容舊的本機暫存格式。
  const mixedQuestions: ImageQuizQuestion[] = [];
  const categoryQuestionIds: Record<DailyPlanCategory, string[]> = {
    new: newQuestions.map((question) => question.id),
    wrong: wrongQuestions.map((question) => question.id),
    review: reviewQuestions.map((question) => question.id),
    mixed: mixedQuestions.map((question) => question.id),
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
  const remainingQuestions = selectedQuestions.filter((question) => !todayAnsweredIds.has(question.id));
  const plannedCount = selectedQuestions.length;
  const categoryCounts = countRemainingCategoryQuestions(categoryQuestionIds, todayAnsweredIds);
  const summary = buildDailySummary(categoryCounts);
  const result = {
    questions: remainingQuestions,
    planQuestionIds: selectedQuestions.map((question) => question.id),
    categoryCounts,
    categoryQuestionIds,
    remainingCount: remainingQuestions.length,
    plannedCount,
    completedBeforePlanCount: Math.max(0, plannedCount - remainingQuestions.length),
    initialCompletedQuestionIds: selectedQuestions
      .map((question) => question.id)
      .filter((questionId) => todayAnsweredIds.has(questionId)),
    plan,
    summary,
  };
  writeStoredDailyPlan(result);
  return result;
}

function interleaveDailyQuestions(
  categories: Record<DailyPlanCategory, ImageQuizQuestion[]>,
  intensity: StudyIntensity,
): ImageQuizQuestion[] {
  const queues = Object.fromEntries(
    DAILY_PLAN_CATEGORIES.map((category) => [category, [...categories[category]]]),
  ) as Record<DailyPlanCategory, ImageQuizQuestion[]>;
  // Every intensity starts with retrieval repair: wrong answers first, then
  // spaced reviews. Higher intensity adds more new-question slots without
  // pushing those due items behind untouched material.
  const patternByIntensity: Record<StudyIntensity, DailyPlanCategory[]> = {
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

function takeBalancedByExamSubject(source: ImageQuizQuestion[], count: number, selectedIds: Set<string>): ImageQuizQuestion[] {
  if (count <= 0 || source.length === 0) return [];

  const available = source.filter((question) => !selectedIds.has(question.id));
  const buckets = {
    investment: available.filter((question) => examSubjectKey(question) === "investment"),
    financial: available.filter((question) => examSubjectKey(question) === "financial"),
    trading: available.filter((question) => examSubjectKey(question) === "trading"),
  };
  const targetBySubject = distributeCount(count, [
    { key: "investment", available: buckets.investment.length, weight: 1 },
    { key: "financial", available: buckets.financial.length, weight: 1 },
    { key: "trading", available: buckets.trading.length, weight: 1 },
  ]);

  const selected: ImageQuizQuestion[] = [];
  selected.push(...takeFromBucket(buckets.investment, targetBySubject.investment, selectedIds));
  selected.push(...takeFromBucket(buckets.financial, targetBySubject.financial, selectedIds));
  selected.push(...takeTradingQuestions(buckets.trading, targetBySubject.trading, selectedIds));

  if (selected.length < count) {
    selected.push(...takeFromBucket(available, count - selected.length, selectedIds));
  }

  return selected;
}

function takeTradingQuestions(source: ImageQuizQuestion[], count: number, selectedIds: Set<string>): ImageQuizQuestion[] {
  if (count <= 0) return [];
  const regulations = source.filter((question) => question.bankId === "securities-trading-regulations");
  const practice = source.filter((question) => question.bankId === "securities-trading-practice");
  const targets = distributeCount(count, [
    { key: "regulations", available: regulations.length, weight: Math.max(1, regulations.length) },
    { key: "practice", available: practice.length, weight: Math.max(1, practice.length) },
  ]);
  const selected = [
    ...takeFromBucket(regulations, targets.regulations, selectedIds),
    ...takeFromBucket(practice, targets.practice, selectedIds),
  ];
  if (selected.length < count) {
    selected.push(...takeFromBucket(source, count - selected.length, selectedIds));
  }
  return selected;
}

function takeFromBucket(source: ImageQuizQuestion[], count: number, selectedIds: Set<string>): ImageQuizQuestion[] {
  const selected: ImageQuizQuestion[] = [];
  for (const question of source) {
    if (selected.length >= count) break;
    if (selectedIds.has(question.id)) continue;
    selected.push(question);
    selectedIds.add(question.id);
  }
  return selected;
}

function distributeCount<K extends string>(count: number, inputs: { key: K; available: number; weight: number }[]): Record<K, number> {
  const result = Object.fromEntries(inputs.map((input) => [input.key, 0])) as Record<K, number>;
  const remaining = Math.min(count, inputs.reduce((sum, input) => sum + input.available, 0));
  const active = inputs.filter((input) => input.available > 0);
  if (remaining <= 0 || active.length === 0) return result;
  const totalWeight = active.reduce((sum, input) => sum + input.weight, 0);

  for (const input of active) {
    const target = Math.floor((remaining * input.weight) / totalWeight);
    result[input.key] = Math.min(input.available, target);
  }

  let assigned: number = (Object.values(result) as number[]).reduce((sum: number, value: number) => sum + value, 0);
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

function examSubjectKey(question: ImageQuizQuestion): "investment" | "financial" | "trading" {
  if (question.bankId === "investment") return "investment";
  if (question.bankId === "financial-analysis") return "financial";
  return "trading";
}


type StoredDailyPlan = {
  date: string;
  version?: number;
  planSignature?: string;
  questionIds: string[];
  plannedCount?: number;
  categoryCounts: Record<DailyPlanCategory, number>;
  categoryQuestionIds?: Record<DailyPlanCategory, string[]>;
};

function dailyPlanStorageKey(): string {
  return `quizpwa:daily-plan:${localTodayKey()}`;
}

const DAILY_PLAN_CATEGORIES: DailyPlanCategory[] = ["new", "wrong", "review", "mixed"];

function countRemainingCategoryQuestions(
  categoryQuestionIds: Record<DailyPlanCategory, string[]>,
  answeredIds: Set<string>,
): Record<DailyPlanCategory, number> {
  return {
    new: categoryQuestionIds.new.filter((questionId) => !answeredIds.has(questionId)).length,
    wrong: categoryQuestionIds.wrong.filter((questionId) => !answeredIds.has(questionId)).length,
    review: categoryQuestionIds.review.filter((questionId) => !answeredIds.has(questionId)).length,
    mixed: categoryQuestionIds.mixed.filter((questionId) => !answeredIds.has(questionId)).length,
  };
}

function normalizeCategoryQuestionIds(stored: StoredDailyPlan, validQuestionIds: Set<string>): Record<DailyPlanCategory, string[]> {
  if (stored.categoryQuestionIds) {
    return {
      new: (stored.categoryQuestionIds.new ?? []).filter((questionId) => validQuestionIds.has(questionId)),
      wrong: (stored.categoryQuestionIds.wrong ?? []).filter((questionId) => validQuestionIds.has(questionId)),
      review: (stored.categoryQuestionIds.review ?? []).filter((questionId) => validQuestionIds.has(questionId)),
      mixed: (stored.categoryQuestionIds.mixed ?? []).filter((questionId) => validQuestionIds.has(questionId)),
    };
  }

  const result: Record<DailyPlanCategory, string[]> = { new: [], wrong: [], review: [], mixed: [] };
  let cursor = 0;
  for (const category of DAILY_PLAN_CATEGORIES) {
    const count = Math.max(0, stored.categoryCounts?.[category] ?? 0);
    result[category] = stored.questionIds.slice(cursor, cursor + count).filter((questionId) => validQuestionIds.has(questionId));
    cursor += count;
  }
  return result;
}

function buildDailySummary(categoryCounts: Record<DailyPlanCategory, number>): string {
  return [`錯題 ${categoryCounts.wrong}`, `複習 ${categoryCounts.review}`, `新題 ${categoryCounts.new}`].join(" / ");
}

function getTodayAnsweredIds(answers: UserAnswer[], allQuestionIds: Set<string>): Set<string> {
  const today = localTodayKey();
  return new Set(
    answers
      .filter((answer) => allQuestionIds.has(answer.questionId) && localTodayKey(new Date(answer.answeredAt)) === today)
      .map((answer) => answer.questionId),
  );
}

function readStoredDailyPlan(
  allQuestions: ImageQuizQuestion[],
  plan: ReturnType<typeof calculateSmartStudyPlanStats>,
  storedAnswers: UserAnswer[],
): DailyTrainingBuildResult | undefined {
  if (typeof window === "undefined") return undefined;
  const raw = readScopedStorageItem(dailyPlanStorageKey());
  if (!raw) return undefined;
  try {
    const stored = JSON.parse(raw) as StoredDailyPlan;
    if (
      stored.date !== localTodayKey() ||
      stored.version !== DAILY_PLAN_STORAGE_VERSION ||
      stored.planSignature !== getStudyPlanSignature() ||
      !Array.isArray(stored.questionIds) ||
      stored.questionIds.length === 0
    ) {
      return undefined;
    }
    const byId = new Map(allQuestions.map((question) => [question.id, question]));
    const allStoredQuestions = stored.questionIds
      .map((questionId) => byId.get(questionId))
      .filter((question): question is ImageQuizQuestion => Boolean(question));
    if (allStoredQuestions.length === 0) return undefined;
    const allQuestionIds = new Set(allQuestions.map((question) => question.id));
    const answeredIds = getTodayAnsweredIds(storedAnswers, allQuestionIds);
    const categoryQuestionIds = normalizeCategoryQuestionIds(stored, allQuestionIds);
    const categoryCounts = countRemainingCategoryQuestions(categoryQuestionIds, answeredIds);
    const remainingQuestions = allStoredQuestions.filter((question) => !answeredIds.has(question.id));
    const storedValidCount = allStoredQuestions.length;
    const plannedCount = Math.max(0, stored.plannedCount ?? storedValidCount);
    const remainingCount = remainingQuestions.length;
    const completedBeforePlanCount = Math.max(0, plannedCount - remainingCount);
    const initialCompletedQuestionIds = stored.questionIds.filter((questionId) => answeredIds.has(questionId));
    return {
      questions: remainingQuestions,
      planQuestionIds: allStoredQuestions.map((question) => question.id),
      categoryCounts,
      categoryQuestionIds,
      remainingCount,
      plannedCount,
      completedBeforePlanCount,
      initialCompletedQuestionIds,
      plan: { ...plan, suggestedDailyCount: plannedCount },
      summary: buildDailySummary(categoryCounts),
    };
  } catch {
    return undefined;
  }
}

function writeStoredDailyPlan(result: DailyTrainingBuildResult): void {
  if (typeof window === "undefined" || result.planQuestionIds.length === 0) return;
  const stored: StoredDailyPlan = {
    version: DAILY_PLAN_STORAGE_VERSION,
    date: localTodayKey(),
    planSignature: getStudyPlanSignature(),
    questionIds: result.planQuestionIds,
    plannedCount: result.plannedCount,
    categoryCounts: result.categoryCounts,
    categoryQuestionIds: result.categoryQuestionIds,
  };
  writeScopedStorageItem(dailyPlanStorageKey(), JSON.stringify(stored));
}

function storedAnswersToRecords(
  storedAnswers: UserAnswer[],
  questions: ImageQuizQuestion[],
): Record<string, AnswerRecord> {
  const byQuestionId = new Map(questions.map((question) => [question.id, question]));
  const records: Record<string, AnswerRecord> = {};
  for (const answer of storedAnswers) {
    const question = byQuestionId.get(answer.questionId);
    if (!question) {
      continue;
    }
    const selected = answerKeyToNumeric[answer.selectedAnswer];
    const correct = question.answer;
    records[answer.questionId] = {
      selected,
      correct,
      isCorrect: selected === correct,
    };
  }
  return records;
}

function sessionAnswersToRecords(session: ImageQuizSessionRecord): Record<string, AnswerRecord> {
  const records: Record<string, AnswerRecord> = {};
  for (const [questionId, answer] of Object.entries(session.answers)) {
    records[questionId] = {
      selected: answer.selected,
      correct: answer.correct,
      isCorrect: answer.isCorrect,
    };
  }
  return records;
}

async function saveRandomSessionResult(
  sessionId: string,
  questions: ImageQuizQuestion[],
  answers: Record<string, AnswerRecord>,
): Promise<void> {
  const answered = questions
    .map((question) => ({ question, answer: answers[question.id] }))
    .filter((item): item is { question: ImageQuizQuestion; answer: AnswerRecord } => Boolean(item.answer));
  const correctCount = answered.filter((item) => item.answer.isCorrect).length;
  const wrongQuestionIds = answered.filter((item) => !item.answer.isCorrect).map((item) => item.question.id);
  const answeredCount = answered.length;
  const wrongCount = answeredCount - correctCount;
  await finishImageQuizSession(sessionId, {
    correctCount,
    wrongCount,
    accuracy: calculateAccuracy(correctCount, answeredCount),
    wrongQuestionIds,
  });
}


function calculateConsecutiveCorrectStreak(
  questions: ImageQuizQuestion[],
  answers: Record<string, AnswerRecord>,
  currentIndex: number,
): number {
  return calculateCorrectStreakFromIndex(questions, answers, currentIndex);
}

function calculateActiveCorrectStreak(
  questions: ImageQuizQuestion[],
  answers: Record<string, AnswerRecord>,
  currentIndex: number,
): number {
  const currentQuestion = questions[currentIndex];
  const currentAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const startIndex = currentAnswer ? currentIndex : currentIndex - 1;
  return calculateCorrectStreakFromIndex(questions, answers, startIndex);
}

function calculateCorrectStreakFromIndex(
  questions: ImageQuizQuestion[],
  answers: Record<string, AnswerRecord>,
  startIndex: number,
): number {
  let streak = 0;
  for (let index = startIndex; index >= 0; index -= 1) {
    const question = questions[index];
    if (!question) {
      break;
    }
    const answer = answers[question.id];
    if (!answer?.isCorrect) {
      break;
    }
    streak += 1;
  }
  return streak;
}

function answerButtonClass(answer: NumericAnswer, record: AnswerRecord | undefined, revealAnswer = true): string {
  const classes = ["glass-answer-button"];
  if (!record) {
    return classes.join(" ");
  }

  if (answer === record.selected) {
    classes.push("glass-answer-selected");
  }
  if (revealAnswer && answer === record.correct) {
    classes.push("glass-answer-correct");
  }
  if (revealAnswer && answer === record.selected && !record.isCorrect) {
    classes.push("glass-answer-wrong");
  }
  if (!revealAnswer && answer === record.selected) {
    classes.push("glass-answer-deferred");
  }

  return classes.join(" ");
}

function answerStatusLabel(answer: NumericAnswer, record: AnswerRecord, revealAnswer = true): string {
  if (!revealAnswer) return answer === record.selected ? "已選擇" : "";
  if (answer === record.selected && answer === record.correct) {
    return T.selectedCorrect;
  }
  if (answer === record.correct) {
    return T.correct;
  }
  if (answer === record.selected) {
    return T.selected;
  }
  return "";
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
