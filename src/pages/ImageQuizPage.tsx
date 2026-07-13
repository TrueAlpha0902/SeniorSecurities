import {
  ArrowLeft,
  ArrowRight,
  Clock3,
  Flag,
  Heart,
  Home,
  ListChecks,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { EncouragementNote } from "../components/EncouragementNote";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { PdfSegmentStack } from "../components/PdfSegmentStack";
import { pdfImageUrl } from "../lib/pdfAssets";
import { ProgressBar } from "../components/ProgressBar";
import { useAsync } from "../hooks/useAsync";
import {
  clearQuizProgress,
  commitImageQuizSessionLearningAnswers,
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
  formatImageQuizQuestionSource,
  getImageQuizSegments,
  hasVerifiedMobileImageQuizSegments,
  loadAllImageQuestions,
  loadImageQuestionsByIds,
  loadImageQuizPlanningIndex,
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
import { localTodayKey, type DailyPlanCategory } from "../lib/studyPlan";
import { buildOrReadDailyPlan } from "../lib/dailyPlanService";
import {
  ANSWER_MODE_SETTING_CHANGED,
  AUTO_NEXT_CORRECT_SETTING_CHANGED,
  getAnswerModeEnabled,
  getAutoNextCorrectEnabled,
} from "../lib/appSettings";
import { type AnswerConfidence } from "../lib/learningEngine";
import {
  canChooseImageQuizAnswer,
  getMockExamAnswerCardStatus,
  isMockExamLearningRecorded,
  isMockExamSessionSubmitted,
  shouldDeferMockExamFeedback,
  shouldPromptMockExamExit,
} from "../lib/mockExam";
import type { UserAnswer } from "../types";

const ANSWERS: NumericAnswer[] = ["1", "2", "3", "4"];
const PHONE_SEGMENT_MEDIA_QUERY = "(max-width: 600px)";
const answerKeyToNumeric = {
  A: "1",
  B: "2",
  C: "3",
  D: "4",
} as const;

function usePhoneSegmentLayout(): boolean {
  const [matches, setMatches] = useState(
    () =>
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia(PHONE_SEGMENT_MEDIA_QUERY).matches,
  );

  useEffect(() => {
    if (typeof window.matchMedia !== "function") return;
    const mediaQuery = window.matchMedia(PHONE_SEGMENT_MEDIA_QUERY);
    const updateMatch = () => setMatches(mediaQuery.matches);
    updateMatch();
    mediaQuery.addEventListener("change", updateMatch);
    return () => mediaQuery.removeEventListener("change", updateMatch);
  }, []);

  return matches;
}

const T = {
  wrongTitle: "\u5f31\u9ede\u7df4\u7fd2",
  wrongSubtitle:
    "\u91cd\u65b0\u7df4\u7fd2\u66fe\u7d93\u7b54\u932f\u7684\u984c\u76ee",
  wrongEmpty: "\u76ee\u524d\u6c92\u6709\u932f\u984c",
  favoriteTitle: "\u6536\u85cf\u984c\u76ee",
  favoriteSubtitle:
    "\u7df4\u7fd2\u4f60\u52a0\u5165\u6536\u85cf\u7684\u984c\u76ee",
  favoriteEmpty: "\u76ee\u524d\u6c92\u6709\u6536\u85cf\u984c\u76ee",
  chapterTitle: "\u7ae0\u7bc0\u7df4\u7fd2",
  chapterSubtitle: "\u4f9d\u539f PDF \u984c\u865f\u9806\u5e8f\u7df4\u7fd2",
  chapterEmpty: "\u9019\u500b\u7ae0\u7bc0\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  bankTitle: "\u79d1\u76ee\u7df4\u7fd2",
  bankSubtitle:
    "\u4f9d\u7ae0\u7bc0\u8207\u539f PDF \u984c\u865f\u9806\u5e8f\u7df4\u7fd2",
  bankEmpty: "\u9019\u500b\u79d1\u76ee\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  allTitle: "\u5168\u90e8\u984c\u76ee\u6df7\u5408\u7df4\u7fd2",
  allSubtitle:
    "\u6240\u6709 PDF \u984c\u5eab\u4f9d\u8cc7\u6599\u9806\u5e8f\u7df4\u7fd2",
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
  emptyMessage:
    "\u8acb\u5148\u56de\u9996\u9801\u9078\u64c7\u5176\u4ed6\u984c\u5eab\uff0c\u6216\u91cd\u65b0\u532f\u5165 PDF \u984c\u5eab\u3002",
  home: "\u56de\u9996\u9801",
  questionError: "\u7121\u6cd5\u8f09\u5165\u984c\u76ee",
  questionErrorMessage:
    "\u76ee\u524d\u984c\u865f\u8d85\u51fa\u984c\u5eab\u7bc4\u570d\uff0c\u8acb\u56de\u9996\u9801\u91cd\u65b0\u9078\u64c7\u984c\u5eab\u3002",
  finished: "\u7df4\u7fd2\u5b8c\u6210",
  resultAnswerCard: "\u4ea4\u5377\u7b54\u6848\u5361",
  resultAnswerCardHint:
    "\u7d05\u8272\u662f\u7b54\u932f\u984c\uff0c\u9ede\u64ca\u984c\u865f\u53ef\u56de\u5230\u984c\u76ee\u67e5\u770b\u4f5c\u7b54\u3001\u6b63\u89e3\u8207\u89e3\u6790\u3002",
  submittedReviewNotice:
    "\u4ea4\u5377\u5f8c\u8907\u67e5\uff1a\u7b54\u6848\u5df2\u9396\u5b9a\uff0c\u76ee\u524d\u53ea\u986f\u793a\u4f60\u7684\u4f5c\u7b54\u3001\u6b63\u89e3\u8207\u89e3\u6790\u3002",
  backToResultCard: "\u8fd4\u56de\u4ea4\u5377\u7b54\u6848\u5361",
  unanswered: "\u672a\u4f5c\u7b54",
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
  settleConfirm:
    "要儲存目前進度並離開模擬考嗎？之後可從測驗紀錄點選「繼續測驗」。",
  settleSummaryTitle: "模擬考進度已儲存，之後可繼續作答。",
  submitSaveError: "交卷資料尚未完整儲存，請稍後再試。",
  answerSaveError: "答案尚未儲存成功，請再選一次。",
  answerSaving: "答案正在儲存，請稍候再切換頁面。",
  randomTitle: "模擬考測驗",
  randomSubtitle:
    "\u5f9e\u672c\u79d1\u6240\u6709\u7ae0\u7bc0\u96a8\u6a5f\u62bd\u984c",
  randomEmpty: "\u627e\u4e0d\u5230\u9019\u6b21\u6a21\u64ec\u8003",
  sessionWrongTitle: "\u6e2c\u9a57\u932f\u984c\u8907\u7fd2",
  sessionWrongSubtitle:
    "\u91cd\u65b0\u7df4\u7fd2\u9019\u6b21\u6a21\u64ec\u8003\u7b54\u932f\u7684\u984c\u76ee",
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
  learningRecorded?: boolean;
};

type ImageQuizMode =
  | "all"
  | "bank"
  | "chapter"
  | "wrong"
  | "todayWrong"
  | "favorites"
  | "random"
  | "sessionWrong"
  | "daily"
  | "trial";

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
  const navigate = useNavigate();
  const { bankId = "", chapterId = "", sessionId = "" } = useParams();
  const location = useLocation();
  const phoneSegmentLayout = usePhoneSegmentLayout();
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
  const progressKey =
    mode === "daily"
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
      const [planningQuestions, storedAnswers, wrongRecords] =
        await Promise.all([
          loadImageQuizPlanningIndex(),
          listUserAnswers(),
          listWrongQuestions(),
        ]);
      const dailyTraining = buildOrReadDailyPlan({
        allQuestions: planningQuestions,
        storedAnswers,
        wrongRecords,
        userId: user?.id ?? null,
      });
      const questions = await loadImageQuestionsByIds(
        dailyTraining.questions.map((question) => question.id),
      );
      const today = localTodayKey();
      const todayAnswers = storedAnswers.filter(
        (answer) => localTodayKey(new Date(answer.answeredAt)) === today,
      );
      return {
        title: T.dailyTitle,
        subtitle: dailyTraining.summary,
        emptyTitle: T.dailyEmpty,
        questions,
        answerRecords: storedAnswersToRecords(todayAnswers, questions),
        dailyPlannedCount: dailyTraining.plannedCount,
        dailyCompletedBeforePlanCount: dailyTraining.completedBeforePlanCount,
        dailyCategoryCounts: dailyTraining.categoryCounts,
        dailyCategoryQuestionIds: dailyTraining.categoryQuestionIds,
        dailyInitialCompletedQuestionIds:
          dailyTraining.initialCompletedQuestionIds,
        remainingCount: dailyTraining.remainingCount,
      };
    }

    if (mode === "todayWrong") {
      const wrongRecords = await listWrongQuestions();
      const today = localTodayKey();
      const todayWrongRecords = wrongRecords.filter(
        (record) => localTodayKey(new Date(record.lastWrongAt)) === today,
      );
      const questions = await loadImageQuestionsByIds(
        todayWrongRecords.map((record) => record.questionId),
      );
      const byId = new Map(
        questions.map((question) => [question.id, question]),
      );
      const wrongCounts = Object.fromEntries(
        todayWrongRecords.map((record) => [
          record.questionId,
          record.wrongCount,
        ]),
      );
      return {
        title: T.todayWrongTitle,
        subtitle: T.todayWrongSubtitle,
        emptyTitle: T.todayWrongEmpty,
        questions: todayWrongRecords
          .map((record) => byId.get(record.questionId))
          .filter((question): question is ImageQuizQuestion =>
            Boolean(question),
          ),
        wrongCounts,
      };
    }

    if (mode === "wrong") {
      const wrongRecords = await listWrongQuestions();
      const questions = await loadImageQuestionsByIds(
        wrongRecords.map((record) => record.questionId),
      );
      const byId = new Map(
        questions.map((question) => [question.id, question]),
      );
      const wrongCounts = Object.fromEntries(
        wrongRecords.map((record) => [record.questionId, record.wrongCount]),
      );
      return {
        title: T.wrongTitle,
        subtitle: T.wrongSubtitle,
        emptyTitle: T.wrongEmpty,
        questions: wrongRecords
          .map((record) => byId.get(record.questionId))
          .filter((question): question is ImageQuizQuestion =>
            Boolean(question),
          ),
        wrongCounts,
      };
    }

    if (mode === "favorites") {
      const favoriteRecords = await listFavoriteQuestions();
      const questions = await loadImageQuestionsByIds(
        favoriteRecords.map((record) => record.questionId),
      );
      const byId = new Map(
        questions.map((question) => [question.id, question]),
      );
      return {
        title: T.favoriteTitle,
        subtitle: T.favoriteSubtitle,
        emptyTitle: T.favoriteEmpty,
        questions: favoriteRecords
          .map((record) => byId.get(record.questionId))
          .filter((question): question is ImageQuizQuestion =>
            Boolean(question),
          ),
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
      const bankQuestions = await loadImageQuestionsByIds(session.questionIds);
      const byId = new Map(
        bankQuestions.map((question) => [question.id, question]),
      );
      return {
        title: `${session.bankTitle} / ${T.randomTitle}`,
        subtitle: T.randomSubtitle,
        emptyTitle: T.randomEmpty,
        questions: session.questionIds
          .map((questionId) => byId.get(questionId))
          .filter((question): question is ImageQuizQuestion =>
            Boolean(question),
          ),
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
      const bankQuestions = await loadImageQuestionsByIds(
        session.wrongQuestionIds,
      );
      const byId = new Map(
        bankQuestions.map((question) => [question.id, question]),
      );
      return {
        title: `${session.bankTitle} / ${T.sessionWrongTitle}`,
        subtitle: T.sessionWrongSubtitle,
        emptyTitle: T.sessionWrongEmpty,
        questions: session.wrongQuestionIds
          .map((questionId) => byId.get(questionId))
          .filter((question): question is ImageQuizQuestion =>
            Boolean(question),
          ),
      };
    }

    if (mode === "chapter") {
      const [questions, chapter, bank] = await Promise.all([
        loadImageChapterQuestions(bankId, chapterId),
        loadImageQuizChapter(bankId, chapterId),
        loadImageQuizBank(bankId),
      ]);
      return {
        title:
          chapter && bank
            ? `${bank.bankTitle} / ${chapter.chapterTitle}`
            : T.chapterTitle,
        subtitle: T.chapterSubtitle,
        emptyTitle: T.chapterEmpty,
        questions,
      };
    }

    if (mode === "bank") {
      const [questions, bank] = await Promise.all([
        loadImageBankQuestions(bankId),
        loadImageQuizBank(bankId),
      ]);
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
  const isSubmittedMockExam =
    mode === "random" &&
    isMockExamSessionSubmitted({ finishedAt: data?.session?.finishedAt });
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [progressRestored, setProgressRestored] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [jumpInput, setJumpInput] = useState("");
  const [jumpError, setJumpError] = useState("");
  const [answerModeEnabled, setAnswerModeEnabled] = useState(() =>
    getAnswerModeEnabled(),
  );
  const [confidenceByQuestion] = useState<Record<string, AnswerConfidence>>({});
  const [retryQueue, setRetryQueue] = useState<string[]>([]);
  const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<string>>(
    new Set(),
  );
  const [answerCardOpen, setAnswerCardOpen] = useState(false);
  const [reviewingSubmittedExam, setReviewingSubmittedExam] = useState(false);
  const [autoNextCorrectEnabled, setAutoNextCorrectEnabled] = useState(() =>
    getAutoNextCorrectEnabled(),
  );
  const answerWritePendingRef = useRef<string | null>(null);
  const [answerWritePendingQuestionId, setAnswerWritePendingQuestionId] =
    useState<string | null>(null);
  const submissionPendingRef = useRef(false);
  const [submissionPending, setSubmissionPending] = useState(false);
  const autoNextTimerRef = useRef<number | null>(null);

  useEffect(() => {
    setElapsedSeconds(0);
    setTimerPaused(false);
    setJumpInput("");
    setJumpError("");
    setRetryQueue([]);
    setMarkedQuestionIds(new Set());
    setAnswerCardOpen(false);
    setReviewingSubmittedExam(false);
    answerWritePendingRef.current = null;
    setAnswerWritePendingQuestionId(null);
    submissionPendingRef.current = false;
    setSubmissionPending(false);
    if (autoNextTimerRef.current !== null) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
  }, [progressKey]);

  useEffect(
    () => () => {
      if (autoNextTimerRef.current !== null) {
        window.clearTimeout(autoNextTimerRef.current);
      }
    },
    [],
  );

  useEffect(() => {
    if (autoNextTimerRef.current !== null) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }
  }, [currentIndex]);

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
    window.addEventListener(
      ANSWER_MODE_SETTING_CHANGED,
      refreshAnswerModeSetting,
    );
    window.addEventListener(
      AUTO_NEXT_CORRECT_SETTING_CHANGED,
      refreshAutoNextCorrectSetting,
    );
    window.addEventListener("storage", refreshAllSettings);
    return () => {
      window.removeEventListener(
        ANSWER_MODE_SETTING_CHANGED,
        refreshAnswerModeSetting,
      );
      window.removeEventListener(
        AUTO_NEXT_CORRECT_SETTING_CHANGED,
        refreshAutoNextCorrectSetting,
      );
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
      setReviewingSubmittedExam(false);

      if (!questions.length) {
        setCurrentIndex(0);
        setFavoriteIds(new Set());
        setProgressRestored(true);
        return;
      }

      const shouldRestoreGlobalAnswers =
        !data?.answerRecords &&
        mode !== "sessionWrong" &&
        mode !== "todayWrong" &&
        mode !== "wrong";
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
      setAnswers(
        data?.answerRecords ?? storedAnswersToRecords(storedAnswers, questions),
      );
      setFavoriteIds(
        new Set(favoriteRecords.map((record) => record.questionId)),
      );
      setMarkedQuestionIds(new Set(data?.session?.markedQuestionIds ?? []));
      setFinished(isSubmittedMockExam);
      setProgressRestored(true);
    }

    void restoreState();

    return () => {
      cancelled = true;
    };
  }, [
    data?.answerRecords,
    data?.session?.markedQuestionIds,
    isSubmittedMockExam,
    mode,
    progressKey,
    questions,
  ]);

  useEffect(() => {
    if (!progressRestored || !questions.length || finished) {
      return;
    }

    void saveQuizProgress(progressKey, currentIndex, questions.length);
  }, [currentIndex, finished, progressKey, progressRestored, questions.length]);

  useEffect(() => {
    const session = data?.session;
    if (
      !progressRestored ||
      mode !== "random" ||
      !isSubmittedMockExam ||
      !session
    ) {
      return;
    }
    const pendingQuestions = questions.filter(
      (question) => session.answers[question.id]?.learningRecorded === false,
    );
    if (!pendingQuestions.length) return;

    void commitImageQuizSessionLearningAnswers(
      session.sessionId,
      pendingQuestions,
    ).catch((reason) => {
      console.warn("Submitted mock-exam learning records will retry", reason);
    });
  }, [
    data?.session,
    isSubmittedMockExam,
    mode,
    progressRestored,
    questions,
  ]);

  const answeredRecords = Object.values(answers);
  const correctCount = answeredRecords.filter(
    (record) => record.isCorrect,
  ).length;
  const resultTotal = answeredRecords.length;
  const wrongCount = resultTotal - correctCount;
  const unansweredCount = Math.max(0, questions.length - resultTotal);
  const accuracy = resultTotal
    ? calculateAccuracy(correctCount, resultTotal)
    : 0;
  const shouldPromptRandomExit = shouldPromptMockExamExit({
    hasSession: mode === "random" && Boolean(data?.session),
    isFinishedView: finished,
    isSubmitted: isSubmittedMockExam,
    answeredCount: resultTotal,
  });
  const dailyAnsweredIds = useMemo(
    () => new Set(Object.keys(answers)),
    [answers],
  );
  const dailyInitialCompletedIds = useMemo(
    () => new Set(data?.dailyInitialCompletedQuestionIds ?? []),
    [data?.dailyInitialCompletedQuestionIds],
  );
  const dailyRemainingCount =
    mode === "daily"
      ? calculateLiveDailyRemainingCount(
          data?.remainingCount ?? questions.length,
          data?.dailyCategoryQuestionIds,
          dailyAnsweredIds,
          dailyInitialCompletedIds,
        )
      : undefined;
  const dailyPlannedCount =
    mode === "daily"
      ? (data?.dailyPlannedCount ?? questions.length)
      : undefined;
  const dailyAnsweredCount =
    mode === "daily"
      ? Math.max(
          0,
          (dailyPlannedCount ?? questions.length) - (dailyRemainingCount ?? 0),
        )
      : undefined;
  const dailyProgressValue =
    mode === "daily"
      ? Math.min(
          dailyPlannedCount ?? questions.length,
          Math.max(0, dailyAnsweredCount ?? 0),
        )
      : currentIndex + 1;

  useEffect(() => {
    if (!shouldPromptRandomExit && !submissionPending) {
      return;
    }

    function handleBeforeUnload(event: BeforeUnloadEvent): void {
      event.preventDefault();
      event.returnValue = "";
    }

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [shouldPromptRandomExit, submissionPending]);

  useEffect(() => {
    function handleNavigationAttempt(event: Event): void {
      if (submissionPendingRef.current) {
        event.preventDefault();
        window.alert(T.answerSaving);
        return;
      }
      if (!shouldPromptRandomExit) {
        return;
      }

      const navigationEvent = event as CustomEvent<{
        continueNavigation?: () => void;
      }>;
      event.preventDefault();
      if (answerWritePendingRef.current !== null) {
        window.alert(T.answerSaving);
        return;
      }

      async function confirmSettlement(): Promise<void> {
        const confirmed = window.confirm(T.settleConfirm);
        if (!confirmed) {
          return;
        }

        if (data?.session) {
          await settleImageQuizSession(data.session.sessionId);
        }
        window.alert(T.settleSummaryTitle);
        navigationEvent.detail?.continueNavigation?.();
      }

      void confirmSettlement();
    }

    window.addEventListener("quiz:navigation-attempt", handleNavigationAttempt);
    return () =>
      window.removeEventListener(
        "quiz:navigation-attempt",
        handleNavigationAttempt,
      );
  }, [
    data?.session,
    shouldPromptRandomExit,
  ]);

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
      <EmptyState
        title={data?.emptyTitle ?? T.allEmpty}
        message={emptyMessageForMode(mode)}
        actionLabel={T.home}
        actionTo="/"
      />
    );
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    return (
      <ErrorState title={T.questionError} message={T.questionErrorMessage} />
    );
  }

  const isSubmittedReview =
    mode === "random" && finished && reviewingSubmittedExam;

  const interactionPending =
    answerWritePendingQuestionId !== null || submissionPending;

  const usesMobileQuestionSegments =
    phoneSegmentLayout &&
    hasVerifiedMobileImageQuizSegments(currentQuestion, "question");
  const usesMobileExplanationSegments =
    phoneSegmentLayout &&
    hasVerifiedMobileImageQuizSegments(currentQuestion, "explanation");
  const renderedQuestionSegments = getImageQuizSegments(
    currentQuestion,
    "question",
    phoneSegmentLayout,
  );
  const renderedExplanationSegments = getImageQuizSegments(
    currentQuestion,
    "explanation",
    phoneSegmentLayout,
  );

  const savedAnswer = answers[currentQuestion.id];
  const isDeferredExam =
    mode === "random" &&
    shouldDeferMockExamFeedback(
      data?.session?.feedbackMode,
      answerModeEnabled,
      isSubmittedMockExam || finished,
    );
  const examAnsweredCount = Object.keys(answers).length;
  const examUnansweredCount = unansweredCount;
  const currentIsMarked = markedQuestionIds.has(currentQuestion.id);
  const answerModeAllowed =
    answerModeEnabled &&
    !isDeferredExam &&
    !isSubmittedMockExam &&
    !finished &&
    mode !== "wrong" &&
    mode !== "todayWrong" &&
    mode !== "sessionWrong";
  const answerModeRecord: AnswerRecord | undefined = answerModeAllowed
    ? {
        selected: currentQuestion.answer,
        correct: currentQuestion.answer,
        isCorrect: true,
      }
    : undefined;
  const currentAnswer = savedAnswer ?? answerModeRecord;
  const canChooseCurrentAnswer = canChooseImageQuizAnswer({
    isMockExam: mode === "random",
    isSubmitted: isSubmittedMockExam || finished,
    hasSavedAnswer: Boolean(savedAnswer),
    answerModeAllowed,
  });
  const currentConfidence = confidenceByQuestion[currentQuestion.id] ?? "sure";
  const revealCurrentAnswer = !isDeferredExam;
  const isFavorite = favoriteIds.has(currentQuestion.id);
  const displayedQuestionNumber =
    mode === "random" || mode === "sessionWrong"
      ? currentIndex + 1
      : currentQuestion.number;
  const currentWrongCount =
    mode === "wrong" || mode === "todayWrong"
      ? data?.wrongCounts?.[currentQuestion.id]
      : undefined;
  const currentCorrectStreak = calculateConsecutiveCorrectStreak(
    questions,
    answers,
    currentIndex,
  );
  const activeCorrectStreak = calculateActiveCorrectStreak(
    questions,
    answers,
    currentIndex,
  );
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
    if (
      !currentQuestion ||
      !canChooseCurrentAnswer ||
      answerWritePendingRef.current !== null ||
      submissionPendingRef.current
    ) {
      return;
    }

    if (autoNextTimerRef.current !== null) {
      window.clearTimeout(autoNextTimerRef.current);
      autoNextTimerRef.current = null;
    }

    const previousAnswer = answers[currentQuestion.id];
    if (previousAnswer?.selected === selected) return;

    const record: AnswerRecord = {
      selected,
      correct: currentQuestion.answer,
      isCorrect: selected === currentQuestion.answer,
      learningRecorded:
        mode === "random"
          ? (previousAnswer?.learningRecorded ?? false)
          : undefined,
    };

    setAnswers((previous) => ({
      ...previous,
      [currentQuestion.id]: record,
    }));
    answerWritePendingRef.current = currentQuestion.id;
    setAnswerWritePendingQuestionId(currentQuestion.id);
    try {
      if (mode === "random" && data?.session) {
        const savedSession = await saveImageQuizSessionAnswer(
          data.session.sessionId,
          currentQuestion.id,
          {
            ...record,
            answeredAt: new Date().toISOString(),
          },
        );
        if (!savedSession) {
          throw new Error("Mock-exam answer could not be saved");
        }
      } else {
        await recordImageUserAnswer(currentQuestion, selected, {
          confidence: currentConfidence,
          sessionId: data?.session?.sessionId ?? null,
          sessionMode: data?.session?.mode ?? mode,
        });
      }
    } catch {
      setAnswers((current) => {
        if (current[currentQuestion.id]?.selected !== selected) return current;
        const next = { ...current };
        if (previousAnswer) next[currentQuestion.id] = previousAnswer;
        else delete next[currentQuestion.id];
        return next;
      });
      window.alert(T.answerSaveError);
      return;
    } finally {
      if (answerWritePendingRef.current === currentQuestion.id) {
        answerWritePendingRef.current = null;
        setAnswerWritePendingQuestionId(null);
      }
    }

    if (!isDeferredExam && mode !== "random") {
      setRetryQueue((current) =>
        record.isCorrect
          ? current.filter((questionId) => questionId !== currentQuestion.id)
          : current.includes(currentQuestion.id)
            ? current
            : [...current, currentQuestion.id],
      );
    }

    if (
      !isDeferredExam &&
      autoNextCorrectEnabled &&
      record.isCorrect &&
      currentIndex < questions.length - 1
    ) {
      autoNextTimerRef.current = window.setTimeout(() => {
        autoNextTimerRef.current = null;
        setCurrentIndex((index) =>
          index === currentIndex
            ? Math.min(index + 1, questions.length - 1)
            : index,
        );
      }, 650);
    }
  }

  function goPrevious(): void {
    if (
      answerWritePendingRef.current !== null ||
      submissionPendingRef.current
    ) {
      return;
    }
    setJumpError("");
    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  function openNextQueuedRetry(): boolean {
    const retryQuestionId = retryQueue[0];
    if (!retryQuestionId) return false;
    const retryIndex = questions.findIndex(
      (question) => question.id === retryQuestionId,
    );
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
    if (
      answerWritePendingRef.current !== null ||
      submissionPendingRef.current
    ) {
      return;
    }
    const shouldRetryNow =
      !isDeferredExam &&
      retryQueue.length > 0 &&
      (currentIndex >= questions.length - 1 ||
        Object.keys(answers).length % 4 === 0);
    if (shouldRetryNow && openNextQueuedRetry()) return;
    if (currentIndex >= questions.length - 1) {
      if (isDeferredExam) {
        const unanswered = Math.max(
          0,
          questions.length - Object.keys(answers).length,
        );
        const confirmed = window.confirm(
          unanswered > 0
            ? `尚有 ${unanswered} 題未作答，確定要交卷嗎？`
            : "確定要交卷並查看成績嗎？",
        );
        if (!confirmed) return;
      }
      if (mode === "random" && data?.session) {
        submissionPendingRef.current = true;
        setSubmissionPending(true);
        try {
          await saveRandomSessionResult(data.session.sessionId);
        } catch {
          window.alert(T.submitSaveError);
          submissionPendingRef.current = false;
          setSubmissionPending(false);
          return;
        }
        void clearQuizProgress(progressKey);
        try {
          await commitImageQuizSessionLearningAnswers(
            data.session.sessionId,
            questions,
          );
        } catch (reason) {
          console.warn("Submitted mock-exam learning records will retry", reason);
        }
        setFinished(true);
        submissionPendingRef.current = false;
        setSubmissionPending(false);
      } else {
        setFinished(true);
        void clearQuizProgress(progressKey);
      }
      return;
    }

    setJumpError("");
    setCurrentIndex((index) => Math.min(questions.length - 1, index + 1));
  }

  function handleJump(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    if (
      answerWritePendingRef.current !== null ||
      submissionPendingRef.current
    ) {
      return;
    }
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
    if (
      !isDeferredExam ||
      !data?.session ||
      !question ||
      answerWritePendingRef.current !== null ||
      submissionPendingRef.current
    ) {
      return;
    }
    const next = new Set(markedQuestionIds);
    if (next.has(question.id)) next.delete(question.id);
    else next.add(question.id);
    setMarkedQuestionIds(next);
    await saveImageQuizSessionMarks(data.session.sessionId, Array.from(next));
  }

  function jumpFromAnswerCard(index: number): void {
    if (
      answerWritePendingRef.current !== null ||
      submissionPendingRef.current
    ) {
      return;
    }
    setCurrentIndex(index);
    setJumpError("");
    if (window.innerWidth < 760) setAnswerCardOpen(false);
  }

  function openSubmittedReview(index: number): void {
    setCurrentIndex(index);
    setJumpError("");
    setReviewingSubmittedExam(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function returnToSubmittedResult(): void {
    setReviewingSubmittedExam(false);
    setJumpError("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function goNextSubmittedReview(): void {
    setJumpError("");
    setCurrentIndex((index) => Math.min(questions.length - 1, index + 1));
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
    if (mode === "random") {
      navigate("/random");
      return;
    }
    setAnswers({});
    setCurrentIndex(0);
    setFinished(false);
    setReviewingSubmittedExam(false);
    await clearQuizProgress(progressKey);
  }

  if (finished && !isSubmittedReview) {
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
          {mode === "random" ? (
            <StatCard label={T.unanswered} value={unansweredCount.toString()} />
          ) : null}
          <StatCard label={T.accuracy} value={`${accuracy}%`} />
        </div>
        {mode === "random" ? (
          <section
            className="exam-answer-card submitted-exam-answer-card"
            aria-labelledby="submitted-exam-answer-card-title"
          >
            <div className="exam-answer-card-head">
              <div>
                <strong id="submitted-exam-answer-card-title">
                  {T.resultAnswerCard}
                </strong>
                <span>{T.resultAnswerCardHint}</span>
              </div>
            </div>
            <div className="exam-answer-card-legend submitted-exam-answer-card-legend">
              <span className="is-correct">{T.correctCount}</span>
              <span className="is-wrong">{T.wrongCount}</span>
              <span className="is-unanswered">{T.unanswered}</span>
            </div>
            <div className="exam-answer-card-grid submitted-exam-answer-card-grid">
              {questions.map((question, index) => {
                const answer = answers[question.id];
                const status = getMockExamAnswerCardStatus(answer);
                const statusLabel =
                  status === "correct"
                    ? T.correctCount
                    : status === "wrong"
                      ? T.wrongCount
                      : T.unanswered;
                return (
                  <button
                    type="button"
                    key={question.id}
                    className={`is-${status}${markedQuestionIds.has(question.id) ? " is-marked" : ""}`}
                    aria-label={`第 ${index + 1} 題，${statusLabel}，點擊複查`}
                    onClick={() => openSubmittedReview(index)}
                  >
                    {index + 1}
                    {markedQuestionIds.has(question.id) ? (
                      <Flag size={10} fill="currentColor" aria-hidden="true" />
                    ) : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}
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
          <div className="quiz-title-block">
            <p className="eyebrow">{contextLabel}</p>
            <div className="quiz-title-line">
              <h1>
                {"\u7b2c "}
                {displayedQuestionNumber}
                {" \u984c"}
              </h1>
              {!isSubmittedReview ? (
                <span
                  className="glass-badge quiz-timer-badge"
                  aria-label={`練習時間 ${formatElapsedTime(elapsedSeconds)}`}
                >
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
                      {timerPaused ? (
                        <Play aria-hidden="true" size={13} />
                      ) : (
                        <Pause aria-hidden="true" size={13} />
                      )}
                      <span>{timerPaused ? T.resumeTimer : T.pauseTimer}</span>
                    </button>
                  ) : null}
                </span>
              ) : null}
              {mode === "daily" ? (
                <span className="glass-badge daily-count-badge">
                  今日剩餘 {dailyRemainingCount ?? 0} 題 / 答對 {correctCount}{" "}
                  題 / 答錯 {wrongCount} 題
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
            {isSubmittedReview ? (
              <button
                type="button"
                className="quiz-exam-action is-active"
                aria-label={T.backToResultCard}
                onClick={returnToSubmittedResult}
              >
                <ListChecks aria-hidden="true" size={19} />
                <span>{T.backToResultCard}</span>
              </button>
            ) : isDeferredExam ? (
              <>
                <button
                  type="button"
                  className={`quiz-exam-action${answerCardOpen ? " is-active" : ""}`}
                  aria-label="開啟答題卡"
                  aria-expanded={answerCardOpen}
                  disabled={interactionPending}
                  onClick={() => setAnswerCardOpen((open) => !open)}
                >
                  <ListChecks aria-hidden="true" size={19} />
                  <span>答題卡</span>
                </button>
                <button
                  type="button"
                  className={`quiz-exam-action${currentIsMarked ? " is-marked" : ""}`}
                  aria-label={currentIsMarked ? "取消待檢標記" : "標記為待檢"}
                  aria-pressed={currentIsMarked}
                  disabled={interactionPending}
                  onClick={() => void toggleExamMark()}
                >
                  <Flag
                    aria-hidden="true"
                    size={18}
                    fill={currentIsMarked ? "currentColor" : "none"}
                  />
                  <span>{currentIsMarked ? "已標記" : "待檢"}</span>
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
              <Heart
                aria-hidden="true"
                fill={isFavorite ? "currentColor" : "none"}
              />
            </button>
          </div>
        </div>
        {mode === "daily" ? (
          <>
            <p className="daily-quiz-subtitle">
              今日規劃 {dailyPlannedCount ?? questions.length} 題，已完成{" "}
              {dailyAnsweredCount ?? 0} 題，剩餘 {dailyRemainingCount ?? 0} 題。
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

        {isSubmittedReview ? (
          <p className="deferred-exam-notice submitted-exam-review-notice">
            {T.submittedReviewNotice}
          </p>
        ) : !isDeferredExam ? (
          <EncouragementNote
            isCorrect={encouragementIsCorrect}
            seed={`${currentQuestion.id}:${encouragementCorrectStreak}:top`}
            correctStreak={encouragementCorrectStreak}
            compact
          />
        ) : (
          <p className="deferred-exam-notice">
            考試模式：交卷前可隨時修改答案，不顯示正解與解析。
          </p>
        )}

        <ProgressBar
          value={dailyProgressValue}
          max={
            mode === "daily"
              ? (dailyPlannedCount ?? questions.length)
              : questions.length
          }
          label={
            mode === "daily"
              ? `已完成 ${dailyProgressValue} / ${dailyPlannedCount ?? questions.length} 題`
              : `${"\u7b2c"} ${currentIndex + 1} / ${questions.length} ${"\u984c"}`
          }
        />

        {isDeferredExam && answerCardOpen ? (
          <section className="exam-answer-card" aria-label="模擬考答題卡">
            <div className="exam-answer-card-head">
              <div>
                <strong>答題卡</strong>
                <span>
                  已作答 {examAnsweredCount}／{questions.length} · 未作答{" "}
                  {examUnansweredCount} · 待檢 {markedQuestionIds.size}
                </span>
              </div>
              <button
                type="button"
                onClick={() => setAnswerCardOpen(false)}
                aria-label="收合答題卡"
              >
                收合
              </button>
            </div>
            <div className="exam-answer-card-legend">
              <span className="is-answered">已作答</span>
              <span className="is-marked">待檢</span>
              <span>未作答</span>
            </div>
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
                    disabled={interactionPending}
                    onClick={() => jumpFromAnswerCard(index)}
                  >
                    {index + 1}
                    {marked ? <Flag size={10} fill="currentColor" /> : null}
                  </button>
                );
              })}
            </div>
          </section>
        ) : null}

        <PdfSegmentStack
          label={`${"\u7b2c"} ${currentQuestion.number} ${"\u984c\u984c\u76ee"}`}
          segments={renderedQuestionSegments}
          priority="high"
          fitToWidth={usesMobileQuestionSegments}
          horizontalScrollHint={phoneSegmentLayout && !usesMobileQuestionSegments}
        />

        <div className="numeric-option-grid" aria-label={T.answerOptions}>
          {ANSWERS.map((answer) => (
            <button
              key={answer}
              type="button"
              className={answerButtonClass(
                answer,
                currentAnswer,
                revealCurrentAnswer,
                isSubmittedReview ? currentQuestion.answer : undefined,
              )}
              disabled={
                !canChooseCurrentAnswer ||
                interactionPending
              }
              aria-busy={
                answerWritePendingQuestionId === currentQuestion.id
                  ? "true"
                  : undefined
              }
              aria-pressed={currentAnswer?.selected === answer}
              aria-label={`${T.choose} (${answer})`}
              onClick={() => void handleAnswer(answer)}
            >
              <span className="answer-key">({answer})</span>
              {currentAnswer || isSubmittedReview ? (
                <span className="answer-status-label">
                  {answerStatusLabel(
                    answer,
                    currentAnswer,
                    revealCurrentAnswer,
                    isSubmittedReview ? currentQuestion.answer : undefined,
                  )}
                </span>
              ) : null}
            </button>
          ))}
        </div>

        {(currentAnswer || isSubmittedReview) && revealCurrentAnswer ? (
          <div className="image-answer-panel">
            <div className="result-line">
              <span className="glass-badge">
                {T.yourAnswer}{" "}
                {currentAnswer ? `(${currentAnswer.selected})` : T.unanswered}
              </span>
              <span className="glass-badge">
                {T.correctAnswer} ({currentAnswer?.correct ?? currentQuestion.answer})
              </span>
              {currentAnswer &&
              !currentAnswer.isCorrect &&
              retryQueue.includes(currentQuestion.id) ? (
                <span className="glass-badge retry-queued-badge">
                  已加入本次重試
                </span>
              ) : null}
            </div>
            <div className="glass-explanation">
              <h2>{T.explanation}</h2>
              <PdfSegmentStack
                label={`${"\u7b2c"} ${currentQuestion.number} ${"\u984c\u89e3\u6790"}`}
                segments={renderedExplanationSegments}
                priority="auto"
                fitToWidth={usesMobileExplanationSegments}
                horizontalScrollHint={phoneSegmentLayout && !usesMobileExplanationSegments}
              />
            </div>
          </div>
        ) : null}
      </GlassCard>

      {jumpError ? (
        <p className="inline-error jump-error-fixed" role="alert">
          {jumpError}
        </p>
      ) : null}
      {isSubmittedReview ? (
        <nav
          className="image-quiz-controls submitted-review-controls"
          aria-label={T.navigation}
        >
          <GlassButton
            variant="secondary"
            onClick={goPrevious}
            disabled={currentIndex === 0}
          >
            <ArrowLeft aria-hidden="true" size={18} />
            <span className="quiz-control-label">{T.previous}</span>
          </GlassButton>
          <GlassButton variant="secondary" onClick={returnToSubmittedResult}>
            <ListChecks aria-hidden="true" size={18} />
            <span>{T.backToResultCard}</span>
          </GlassButton>
          <GlassButton
            variant="primary"
            onClick={goNextSubmittedReview}
            disabled={currentIndex >= questions.length - 1}
          >
            <span className="quiz-control-label">{T.next}</span>
            <ArrowRight aria-hidden="true" size={18} />
          </GlassButton>
        </nav>
      ) : (
        <nav className="image-quiz-controls" aria-label={T.navigation}>
          <GlassButton
            variant="secondary"
            onClick={goPrevious}
            disabled={currentIndex === 0 || interactionPending}
          >
            <ArrowLeft aria-hidden="true" size={18} />
            <span className="quiz-control-label">{T.previous}</span>
          </GlassButton>
          <form
            className="question-jump-form inline-jump-form"
            onSubmit={handleJump}
          >
            <label htmlFor="question-jump-input">{T.jumpLabel}</label>
            <input
              id="question-jump-input"
              type="number"
              inputMode="numeric"
              min={1}
              max={questions.length}
              value={jumpInput}
              placeholder={T.jumpPlaceholder}
              disabled={interactionPending}
              onChange={(event) => setJumpInput(event.currentTarget.value)}
            />
            <GlassButton
              variant="secondary"
              type="submit"
              disabled={!jumpInput.trim() || interactionPending}
            >
              {T.jumpAction}
            </GlassButton>
          </form>
          <GlassButton
            variant="primary"
            disabled={interactionPending}
            aria-busy={submissionPending ? "true" : undefined}
            onClick={() => void goNext()}
          >
            <span className="quiz-control-label">
              {currentIndex >= questions.length - 1
                ? isDeferredExam
                  ? "交卷"
                  : T.finish
                : T.next}
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </GlassButton>
        </nav>
      )}
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
  const calculatedRemaining = Math.max(
    0,
    dailyQuestionIds.size - completedQuestionIds.size,
  );
  return Math.min(Math.max(0, baseRemainingCount), calculatedRemaining);
}

function preloadNeighborQuestionAssets(
  questions: readonly ImageQuizQuestion[],
  currentIndex: number,
): () => void {
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
      image.src = pdfImageUrl(source);
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
  return hours > 0
    ? `${hours}:${two(minutes)}:${two(seconds)}`
    : `${minutes}:${two(seconds)}`;
}

function emptyMessageForMode(mode: ImageQuizMode): string {
  if (mode === "daily")
    return "今日安排的新題、錯題與複習題都完成了，回首頁查看首輪覆蓋與明日任務。";
  if (mode === "todayWrong") return "今天答錯但尚未訂正的題目會出現在這裡。";
  if (mode === "wrong") return "答錯的題目會自動收進這裡，答對後即完成訂正。";
  if (mode === "favorites") return "在題目頁點選收藏後，就能從這裡集中複習。";
  return T.emptyMessage;
}

function storedAnswersToRecords(
  storedAnswers: UserAnswer[],
  questions: ImageQuizQuestion[],
): Record<string, AnswerRecord> {
  const byQuestionId = new Map(
    questions.map((question) => [question.id, question]),
  );
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

function sessionAnswersToRecords(
  session: ImageQuizSessionRecord,
): Record<string, AnswerRecord> {
  const records: Record<string, AnswerRecord> = {};
  for (const [questionId, answer] of Object.entries(session.answers)) {
    records[questionId] = {
      selected: answer.selected,
      correct: answer.correct,
      isCorrect: answer.isCorrect,
      learningRecorded: isMockExamLearningRecorded(answer.learningRecorded),
    };
  }
  return records;
}

async function saveRandomSessionResult(
  sessionId: string,
): Promise<void> {
  const session = await finishImageQuizSession(sessionId);
  if (!session) {
    throw new Error("Mock-exam session could not be submitted");
  }
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
  const currentAnswer = currentQuestion
    ? answers[currentQuestion.id]
    : undefined;
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

function answerButtonClass(
  answer: NumericAnswer,
  record: AnswerRecord | undefined,
  revealAnswer = true,
  revealedCorrectAnswer?: NumericAnswer,
): string {
  const classes = ["glass-answer-button"];
  const correctAnswer = record?.correct ?? revealedCorrectAnswer;
  if (!record && !correctAnswer) {
    return classes.join(" ");
  }

  if (record && answer === record.selected) {
    classes.push("glass-answer-selected");
  }
  if (revealAnswer && answer === correctAnswer) {
    classes.push("glass-answer-correct");
  }
  if (
    revealAnswer &&
    record &&
    answer === record.selected &&
    !record.isCorrect
  ) {
    classes.push("glass-answer-wrong");
  }
  if (!revealAnswer && record && answer === record.selected) {
    classes.push("glass-answer-deferred");
  }

  return classes.join(" ");
}

function answerStatusLabel(
  answer: NumericAnswer,
  record: AnswerRecord | undefined,
  revealAnswer = true,
  revealedCorrectAnswer?: NumericAnswer,
): string {
  const correctAnswer = record?.correct ?? revealedCorrectAnswer;
  if (!revealAnswer) return answer === record?.selected ? "已選擇" : "";
  if (
    record &&
    answer === record.selected &&
    answer === correctAnswer
  ) {
    return T.selectedCorrect;
  }
  if (answer === correctAnswer) {
    return T.correct;
  }
  if (answer === record?.selected) {
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
