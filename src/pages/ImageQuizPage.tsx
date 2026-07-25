import {
  ArrowLeft,
  ArrowRight,
  ChevronUp,
  Flag,
  Grid2X2,
  Star,
  Home,
  ListChecks,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import {
  V93ConfirmDialog,
  V93InlineNotice,
} from "../components/V93InteractionPrimitives";
import { V93AnswerBadge } from "../components/V93VisualMaterials";
import {
  ScanExplanationContent,
  ScanOptionText,
  ScanQuestionContent,
} from "../components/ScanDerivedQuestionContent";
import { ProgressBar } from "../components/ProgressBar";
import { QuestionExplanationSurface } from "../components/QuestionExplanationSurface";
import { QuizTimer } from "../components/QuizTimer";
import { useAsync } from "../hooks/useAsync";
import {
  applyImageQuizMockGrading,
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
  saveImageQuizSessionFeedbackMode,
  saveImageQuizSessionMarks,
  saveQuizProgress,
  settleImageQuizSession,
  toggleFavoriteRef,
  type ImageQuizSessionRecord,
} from "../lib/db";
import {
  formatImageQuizQuestionSource,
  isSecuritiesQuestionId,
  loadAllImageQuestions,
  loadImageQuestionsByIds,
  loadImageQuizPlanningIndex,
  loadImageBankQuestions,
  loadImageChapterQuestions,
  loadImageQuizBank,
  loadImageQuizChapter,
  loadTrialImageQuestions,
  resetImageQuizCaches,
  resumeSecuritiesMock,
  submitSecuritiesMock,
  type ImageQuizQuestion,
  type NumericAnswer,
} from "../lib/imageQuiz";
import { calculateAccuracy } from "../lib/quiz";
import { focusQuestionAtTop, vibrateForAnswer } from "../lib/quizViewport";
import { addPracticeSeconds } from "../lib/practiceTime";
import {
  getStudyPlanConfig,
  getStudyPlanScope,
  isSecuritiesStudyPlanScopeId,
  isStudyPlanScopeId,
  localTodayKey,
  studyPlanScopeMatchesBankId,
  type DailyPlanCategory,
  type StudyPlanScopeId,
} from "../lib/studyPlan";
import { buildOrReadDailyPlan } from "../lib/dailyPlanService";
import {
  ANSWER_MODE_SETTING_CHANGED,
  AUTO_NEXT_CORRECT_SETTING_CHANGED,
  MOCK_EXAM_FEEDBACK_SETTING_CHANGED,
  getAnswerModeEnabled,
  getAutoNextCorrectEnabled,
  getMockExamDeferredFeedbackEnabled,
} from "../lib/appSettings";
import { type AnswerConfidence } from "../lib/learningEngine";
import { formatAnswerKey } from "../lib/learnerText";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import { readSecuritiesMockToken } from "../lib/securitiesMockTokenStore";
import {
  canChooseImageQuizAnswer,
  getMockExamAnswerCardStatus,
  isMockExamLearningRecorded,
  isMockExamSessionSubmitted,
  resolveMockExamSessionFeedbackMode,
  shouldEnforceDeferredMockExamFeedback,
  shouldPromptMockExamExit,
} from "../lib/mockExam";
import type { UserAnswer } from "../types";

const ANSWERS: NumericAnswer[] = ["1", "2", "3", "4"];
const answerKeyToNumeric = {
  A: "1",
  B: "2",
  C: "3",
  D: "4",
} as const;
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
  chapterSubtitle: "依題號順序練習",
  chapterEmpty: "\u9019\u500b\u7ae0\u7bc0\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  bankTitle: "\u79d1\u76ee\u7df4\u7fd2",
  bankSubtitle:
    "依章節與題號順序練習",
  bankEmpty: "\u9019\u500b\u79d1\u76ee\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  allTitle: "\u5168\u90e8\u984c\u76ee\u6df7\u5408\u7df4\u7fd2",
  allSubtitle:
    "所有題目依題庫順序練習",
  allEmpty: "\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  dailyTitle: "每日練習",
  dailyEmpty: "今天的智能練習已完成",
  todayWrongTitle: "今日錯題複習",
  todayWrongSubtitle: "只複習今天答錯且尚未訂正成功的題目",
  todayWrongEmpty: "今天目前沒有待複習的錯題",
  loading: "載入文字題庫",
  loadError: "\u7121\u6cd5\u8f09\u5165\u984c\u5eab",
  emptyMessage:
    "目前沒有可練習的題目，請回首頁選擇其他題庫。",
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

type ImageQuizLocationState = {
  mockExamFeedbackMode?: unknown;
};

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
  const requestedQuestionNumber = useMemo(() => {
    const rawValue = new URLSearchParams(location.search).get("jump");
    if (!rawValue) return null;
    const parsed = Number.parseInt(rawValue, 10);
    return Number.isInteger(parsed) && parsed > 0 ? parsed : null;
  }, [location.search]);
  const navigationFeedbackMode = (location.state as ImageQuizLocationState | null)
    ?.mockExamFeedbackMode;
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
  const dailyScopeId = resolveSecuritiesDailyScope(location.search);
  const progressKey =
    mode === "daily"
      ? `image:daily:${localTodayKey()}:${dailyScopeId}`
      : mode === "todayWrong"
        ? `image:today-wrong:${localTodayKey()}:all`
        : mode === "trial"
          ? "image:trial:free"
          : `image:${mode}:${bankId || "all"}:${chapterId || sessionId || "all"}`;

  const { data, error, loading, retry } = useAsync<ImageQuizData>(async () => {
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
      const subjectQuestions = dailyScopeId === "all"
        ? planningQuestions
        : planningQuestions.filter((question) =>
            studyPlanScopeMatchesBankId(dailyScopeId, question.bankId),
          );
      const subjectQuestionIds = new Set(
        subjectQuestions.map((question) => question.id),
      );
      const subjectAnswers = storedAnswers.filter((answer) =>
        subjectQuestionIds.has(answer.questionId),
      );
      const subjectWrongRecords = wrongRecords.filter((record) =>
        subjectQuestionIds.has(record.questionId),
      );
      const dailyTraining = buildOrReadDailyPlan({
        allQuestions: subjectQuestions,
        storedAnswers: subjectAnswers,
        wrongRecords: subjectWrongRecords,
        userId: user?.id ?? null,
        config: getStudyPlanConfig(dailyScopeId === "all" ? "investment" : dailyScopeId),
        planScopeId: dailyScopeId === "all" ? "senior-securities" : dailyScopeId,
      });
      const questions = await loadImageQuestionsByIds(
        dailyTraining.questions.map((question) => question.id),
      );
      const today = localTodayKey();
      const todayAnswers = subjectAnswers.filter(
        (answer) => localTodayKey(new Date(answer.answeredAt)) === today,
      );
      const subjectTitle = dailyScopeId === "all"
        ? "證券高業"
        : getStudyPlanScope(dailyScopeId).title;
      return {
        title: `${subjectTitle}每日練習`,
        subtitle: dailyTraining.summary,
        emptyTitle: `${subjectTitle}今日練習已完成`,
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
        (record) => isSecuritiesQuestionId(record.questionId)
          && localTodayKey(new Date(record.lastWrongAt)) === today,
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
      const wrongRecords = (await listWrongQuestions())
        .filter((record) => isSecuritiesQuestionId(record.questionId));
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
      const favoriteRecords = (await listFavoriteQuestions())
        .filter((record) => isSecuritiesQuestionId(record.questionId));
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
      const protectedToken = !session.finishedAt && session.feedbackMode === "deferred"
        ? readSecuritiesMockToken(session.sessionId)
        : null;
      const bankQuestions = protectedToken
        ? (await resumeSecuritiesMock(protectedToken)).questions
        : await loadImageQuestionsByIds(session.questionIds);
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
  }, [bankId, chapterId, dailyScopeId, mode, sessionId, user?.id]);

  const [gradedMockQuestions, setGradedMockQuestions] = useState<ImageQuizQuestion[] | null>(null);
  const questions = useMemo(
    () => gradedMockQuestions ?? data?.questions ?? [],
    [data, gradedMockQuestions],
  );
  const isSubmittedMockExam =
    mode === "random" &&
    isMockExamSessionSubmitted({ finishedAt: data?.session?.finishedAt });
  const mockExamFeedbackMode = resolveMockExamSessionFeedbackMode(
    data?.session?.feedbackMode,
    navigationFeedbackMode,
  );
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, AnswerRecord>>({});
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [progressRestored, setProgressRestored] = useState(false);
  const [finished, setFinished] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [answerModeRevision, setAnswerModeRevision] = useState(0);
  const [deferredFeedbackEnabled, setDeferredFeedbackEnabledState] = useState(
    () => getMockExamDeferredFeedbackEnabled(),
  );
  const [confidenceByQuestion] = useState<Record<string, AnswerConfidence>>({});
  const [markedQuestionIds, setMarkedQuestionIds] = useState<Set<string>>(
    new Set(),
  );
  const [answerCardOpen, setAnswerCardOpen] = useState(false);
  const [questionListOpen, setQuestionListOpen] = useState(false);
  const [reviewingSubmittedExam, setReviewingSubmittedExam] = useState(false);
  const [autoNextCorrectEnabled, setAutoNextCorrectEnabled] = useState(() =>
    getAutoNextCorrectEnabled(),
  );
  const answerWritePendingRef = useRef<string | null>(null);
  const [answerWritePendingQuestionId, setAnswerWritePendingQuestionId] =
    useState<string | null>(null);
  const submissionPendingRef = useRef(false);
  const [submissionPending, setSubmissionPending] = useState(false);
  const [quizOperationError, setQuizOperationError] = useState<string | null>(null);
  const [exitConfirmationOpen, setExitConfirmationOpen] = useState(false);
  const [exitSettlementPending, setExitSettlementPending] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<(() => void) | null>(null);
  const [submitConfirmationOpen, setSubmitConfirmationOpen] = useState(false);
  const submitConfirmedRef = useRef(false);
  const autoNextTimerRef = useRef<number | null>(null);
  const questionFocusRef = useRef<HTMLDivElement>(null);
  const shouldFocusQuestionRef = useRef(false);
  const navigationScrollYRef = useRef<number | null>(null);
  const initialJumpHandledRef = useRef<string | null>(null);

  useEffect(() => {
    setElapsedSeconds(0);
    setMarkedQuestionIds(new Set());
    setAnswerCardOpen(false);
    setQuestionListOpen(false);
    setReviewingSubmittedExam(false);
    setGradedMockQuestions(null);
    answerWritePendingRef.current = null;
    setAnswerWritePendingQuestionId(null);
    submissionPendingRef.current = false;
    setSubmissionPending(false);
    setQuizOperationError(null);
    setExitConfirmationOpen(false);
    setExitSettlementPending(false);
    setPendingNavigation(null);
    setSubmitConfirmationOpen(false);
    submitConfirmedRef.current = false;
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
      setAnswerModeRevision((value) => value + 1);
    }
    function refreshAutoNextCorrectSetting(): void {
      setAutoNextCorrectEnabled(getAutoNextCorrectEnabled());
    }
    function refreshDeferredFeedbackSetting(): void {
      setDeferredFeedbackEnabledState(getMockExamDeferredFeedbackEnabled());
    }
    function refreshAllSettings(): void {
      refreshAnswerModeSetting();
      refreshAutoNextCorrectSetting();
      refreshDeferredFeedbackSetting();
    }
    window.addEventListener(
      ANSWER_MODE_SETTING_CHANGED,
      refreshAnswerModeSetting,
    );
    window.addEventListener(
      AUTO_NEXT_CORRECT_SETTING_CHANGED,
      refreshAutoNextCorrectSetting,
    );
    window.addEventListener(
      MOCK_EXAM_FEEDBACK_SETTING_CHANGED,
      refreshDeferredFeedbackSetting,
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
      window.removeEventListener(
        MOCK_EXAM_FEEDBACK_SETTING_CHANGED,
        refreshDeferredFeedbackSetting,
      );
      window.removeEventListener("storage", refreshAllSettings);
    };
  }, []);

  useEffect(() => {
    if (mode !== "random" || isSubmittedMockExam || finished) return;

    const mustDefer =
      deferredFeedbackEnabled || mockExamFeedbackMode === "deferred";
    if (!mustDefer) return;

    // Mock exams remain independent from practice answer mode. Deferred
    // grading is enforced by the session and server-side grading contract.
    setDeferredFeedbackEnabledState(true);

    if (
      data?.session &&
      data.session.feedbackMode !== "deferred"
    ) {
      void saveImageQuizSessionFeedbackMode(
        data.session.sessionId,
        "deferred",
      ).catch((reason) => {
        console.warn("Unable to upgrade pending mock exam to deferred grading", reason);
      });
    }
  }, [
    data?.session,
    deferredFeedbackEnabled,
    finished,
    isSubmittedMockExam,
    mockExamFeedbackMode,
    mode,
  ]);

  useEffect(() => {
    if (!progressRestored || finished) return;
    const timer = window.setInterval(() => {
      // General practice still contributes to cumulative study time, but it
      // does not maintain a visible per-question clock. Only mock exams need
      // the elapsed timer state.
      if (mode === "random") {
        setElapsedSeconds((seconds) => seconds + 1);
      }
      addPracticeSeconds(1);
    }, 1000);
    return () => window.clearInterval(timer);
  }, [finished, mode, progressKey, progressRestored]);

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
      const jumpKey = requestedQuestionNumber
        ? `${progressKey}:${requestedQuestionNumber}`
        : null;
      const requestedIndex = requestedQuestionNumber
        ? questions.findIndex(
          (question) => question.number === requestedQuestionNumber,
        )
        : -1;
      const shouldHandleJump =
        jumpKey !== null && initialJumpHandledRef.current !== jumpKey;
      const nextIndex = shouldHandleJump && requestedIndex >= 0
        ? requestedIndex
        : restoredIndex;

      if (shouldHandleJump) {
        initialJumpHandledRef.current = jumpKey;
        if (requestedIndex >= 0) {
          shouldFocusQuestionRef.current = true;
          announceInteractionFeedback(
            `已前往第 ${requestedQuestionNumber} 題`,
            "success",
          );
        } else {
          announceInteractionFeedback(
            `找不到第 ${requestedQuestionNumber} 題，已回到目前進度。`,
            "warning",
            4200,
          );
        }
      }

      setCurrentIndex(nextIndex);
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
    requestedQuestionNumber,
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
      if (submissionPendingRef.current || answerWritePendingRef.current !== null) {
        event.preventDefault();
        setQuizOperationError(T.answerSaving);
        announceInteractionFeedback(T.answerSaving, "warning", 3200);
        return;
      }
      if (!shouldPromptRandomExit) {
        return;
      }

      const navigationEvent = event as CustomEvent<{
        continueNavigation?: () => void;
      }>;
      event.preventDefault();
      setQuizOperationError(null);
      setPendingNavigation(() => navigationEvent.detail?.continueNavigation ?? null);
      setExitConfirmationOpen(true);
    }

    window.addEventListener("quiz:navigation-attempt", handleNavigationAttempt);
    return () =>
      window.removeEventListener(
        "quiz:navigation-attempt",
        handleNavigationAttempt,
      );
  }, [shouldPromptRandomExit]);

  useEffect(() => {
    if (!progressRestored || !shouldFocusQuestionRef.current) return;
    shouldFocusQuestionRef.current = false;
    const previousScrollY = navigationScrollYRef.current;
    navigationScrollYRef.current = null;
    const frame = window.requestAnimationFrame(() => {
      focusQuestionAtTop(questionFocusRef.current, {
        previousScrollY,
        neverScrollDown: true,
      });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [currentIndex, progressRestored]);

  if (loading || (questions.length > 0 && !progressRestored)) {
    return <LoadingState label={T.loading} />;
  }

  if (error) {
    return (
      <ErrorState
        title={T.loadError}
        message={error}
        onRetry={() => {
          resetImageQuizCaches();
          retry();
        }}
      />
    );
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

  const savedAnswer = answers[currentQuestion.id];
  const mockExamIsSubmitted = isSubmittedMockExam || finished;
  const isDeferredExam =
    mode === "random" &&
    shouldEnforceDeferredMockExamFeedback(
      mockExamFeedbackMode,
      deferredFeedbackEnabled,
      mockExamIsSubmitted,
    );
  const examAnsweredCount = Object.keys(answers).length;
  const examUnansweredCount = unansweredCount;
  const currentIsMarked = markedQuestionIds.has(currentQuestion.id);
  void answerModeRevision;
  const answerModeEnabled = getAnswerModeEnabled();
  const answerModeAllowed =
    !currentQuestion.answerRedacted &&
    answerModeEnabled &&
    !isDeferredExam &&
    !isSubmittedMockExam &&
    !finished &&
    mode !== "random";
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
  const currentWrongCount =
    mode === "wrong" || mode === "todayWrong"
      ? data?.wrongCounts?.[currentQuestion.id]
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
    setQuizOperationError(null);

    const answerIsRedacted = mode === "random" && Boolean(currentQuestion.answerRedacted);
    const record: AnswerRecord = {
      selected,
      correct: answerIsRedacted ? selected : currentQuestion.answer,
      isCorrect: answerIsRedacted ? false : selected === currentQuestion.answer,
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
      setQuizOperationError(T.answerSaveError);
      announceInteractionFeedback(T.answerSaveError, "error", 4200);
      return;
    } finally {
      if (answerWritePendingRef.current === currentQuestion.id) {
        answerWritePendingRef.current = null;
        setAnswerWritePendingQuestionId(null);
      }
    }

    if (!isDeferredExam) vibrateForAnswer(record.isCorrect);

    if (
      !isDeferredExam &&
      autoNextCorrectEnabled &&
      record.isCorrect &&
      currentIndex < questions.length - 1
    ) {
      autoNextTimerRef.current = window.setTimeout(() => {
        autoNextTimerRef.current = null;
        prepareQuestionNavigation();
        setCurrentIndex((index) =>
          index === currentIndex
            ? Math.min(index + 1, questions.length - 1)
            : index,
        );
      }, 650);
    }
  }

  function requestQuizNavigation(continueNavigation: () => void): void {
    const event = new CustomEvent("quiz:navigation-attempt", {
      cancelable: true,
      detail: { continueNavigation },
    });
    if (window.dispatchEvent(event)) continueNavigation();
  }

  async function confirmRandomExit(): Promise<void> {
    if (exitSettlementPending) return;
    setExitSettlementPending(true);
    setQuizOperationError(null);
    try {
      if (data?.session) {
        await settleImageQuizSession(data.session.sessionId);
      }
      const continueNavigation = pendingNavigation;
      setExitConfirmationOpen(false);
      setPendingNavigation(null);
      announceInteractionFeedback(T.settleSummaryTitle, "success", 3600);
      continueNavigation?.();
    } catch {
      const message = "模擬考進度尚未儲存，請檢查網路後再試。";
      setQuizOperationError(message);
      announceInteractionFeedback(message, "error", 4800);
    } finally {
      setExitSettlementPending(false);
    }
  }

  function cancelRandomExit(): void {
    if (exitSettlementPending) return;
    setExitConfirmationOpen(false);
    setPendingNavigation(null);
  }

  function confirmDeferredSubmission(): void {
    setSubmitConfirmationOpen(false);
    submitConfirmedRef.current = true;
    void goNext();
  }

  function prepareQuestionNavigation(): void {
    navigationScrollYRef.current = window.scrollY;
    shouldFocusQuestionRef.current = true;
  }

  function goPrevious(): void {
    if (
      answerWritePendingRef.current !== null ||
      submissionPendingRef.current
    ) {
      setQuizOperationError(T.answerSaving);
      announceInteractionFeedback(T.answerSaving, "warning", 2600);
      return;
    }
    setQuizOperationError(null);
    prepareQuestionNavigation();
    setCurrentIndex((index) => Math.max(0, index - 1));
  }

  async function goNext(): Promise<void> {
    if (
      answerWritePendingRef.current !== null ||
      submissionPendingRef.current
    ) {
      setQuizOperationError(T.answerSaving);
      announceInteractionFeedback(T.answerSaving, "warning", 2600);
      return;
    }
    setQuizOperationError(null);
    if (currentIndex >= questions.length - 1) {
      if (isDeferredExam && !submitConfirmedRef.current) {
        setSubmitConfirmationOpen(true);
        return;
      }
      submitConfirmedRef.current = false;
      if (mode === "random" && data?.session) {
        submissionPendingRef.current = true;
        setSubmissionPending(true);
        let submittedQuestions = questions;
        try {
          const protectedToken = data.session.feedbackMode === "deferred"
            ? readSecuritiesMockToken(data.session.sessionId)
            : null;
          if (protectedToken && questions.some((question) => question.answerRedacted)) {
            const selectedAnswers = Object.fromEntries(
              Object.entries(answers).map(([questionId, answer]) => [questionId, answer.selected]),
            ) as Record<string, NumericAnswer>;
            const submission = await submitSecuritiesMock(protectedToken, selectedAnswers);
            submittedQuestions = submission.results;
            const gradedAnswers = submission.results.flatMap((question) => {
              const selected = selectedAnswers[question.id];
              return selected ? [{
                questionId: question.id,
                selected,
                correct: question.answer,
                isCorrect: question.isCorrect,
              }] : [];
            });
            await applyImageQuizMockGrading(data.session.sessionId, gradedAnswers);
            setGradedMockQuestions(submittedQuestions);
            setAnswers((current) => {
              const next = { ...current };
              for (const question of submission.results) {
                const selected = selectedAnswers[question.id];
                if (!selected) continue;
                next[question.id] = {
                  selected,
                  correct: question.answer,
                  isCorrect: question.isCorrect,
                  learningRecorded: false,
                };
              }
              return next;
            });
          }
          await saveRandomSessionResult(data.session.sessionId);
        } catch {
          setQuizOperationError(T.submitSaveError);
          announceInteractionFeedback(T.submitSaveError, "error", 4800);
          submissionPendingRef.current = false;
          setSubmissionPending(false);
          return;
        }
        void clearQuizProgress(progressKey);
        try {
          await commitImageQuizSessionLearningAnswers(
            data.session.sessionId,
            submittedQuestions,
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

    prepareQuestionNavigation();
    setCurrentIndex((index) => Math.min(questions.length - 1, index + 1));
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
    prepareQuestionNavigation();
    setCurrentIndex(index);
    if (window.innerWidth < 760) setAnswerCardOpen(false);
  }

  function openSubmittedReview(index: number): void {
    prepareQuestionNavigation();
    setCurrentIndex(index);
    setReviewingSubmittedExam(true);
  }

  function returnToSubmittedResult(): void {
    setReviewingSubmittedExam(false);
  }

  function goNextSubmittedReview(): void {
    prepareQuestionNavigation();
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
    <div
      className="image-quiz-page"
      data-mock-exam-feedback-mode={
        mode === "random" ? mockExamFeedbackMode : undefined
      }
      data-mock-exam-submitted={
        mode === "random" ? String(isSubmittedMockExam || finished) : undefined
      }
    >
      {quizOperationError ? (
        <V93InlineNotice tone="error" className="v93-quiz-operation-notice">
          {quizOperationError}
        </V93InlineNotice>
      ) : null}
      <GlassCard className="image-quiz-card">
        <div className="image-quiz-header v90-quiz-header">
          <div className="v90-quiz-topline">
            <button type="button" className="v90-quiz-back" onClick={() => requestQuizNavigation(() => navigate(-1))} aria-label="返回上一頁">
              <ArrowLeft aria-hidden="true" size={19} />
            </button>
            <div className="v90-quiz-position">
              <strong>{currentIndex + 1} / {questions.length}</strong>
              <small>{contextLabel}</small>
            </div>
          </div>
          <div className="quiz-header-actions v90-quiz-actions">
            {mode === "random" && !isSubmittedReview ? (
              <QuizTimer seconds={elapsedSeconds} mode="elapsed" label="測驗時間" compact />
            ) : null}
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
                  <Flag aria-hidden="true" size={18} fill={currentIsMarked ? "currentColor" : "none"} />
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
              <Star aria-hidden="true" fill={isFavorite ? "currentColor" : "none"} />
            </button>
          </div>
        </div>
        <div className="v90-quiz-meta-row">
          <span className="v90-question-type">單選題</span>
          {mode === "daily" ? <span>今日剩餘 {dailyRemainingCount ?? 0} 題</span> : null}
          {currentWrongCount ? <span>{T.wrongTimes} {currentWrongCount}</span> : null}
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
        ) : isDeferredExam ? (
          <p className="deferred-exam-notice">
            考試模式：交卷前可隨時修改答案，不顯示正解與解析。
          </p>
        ) : null}

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

        <div
          ref={questionFocusRef}
          className="active-question-panel"
          tabIndex={-1}
        >
          <ScanQuestionContent
            question={currentQuestion}
            label={`${"\u7b2c"} ${currentQuestion.number} ${"\u984c\u984c\u76ee"}`}
            prominent
          />
        </div>

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
              aria-label={`${T.choose} ${formatAnswerKey(answer)}${currentQuestion.optionTexts?.[answer] ? ` ${currentQuestion.optionTexts[answer]}` : ""}`}
              onClick={() => void handleAnswer(answer)}
            >
              <span className="answer-key">{formatAnswerKey(answer)}</span>
              <ScanOptionText question={currentQuestion} answer={answer} />
              <AnswerResultMark
                status={answerVisualStatus(
                  answer,
                  currentAnswer,
                  revealCurrentAnswer,
                  isSubmittedReview ? currentQuestion.answer : undefined,
                )}
              />
            </button>
          ))}
        </div>

        {(currentAnswer || isSubmittedReview) && revealCurrentAnswer ? (
          <details className="v90-explanation-disclosure" open>
            <summary>
              <span>查看解析</span>
              <ChevronUp aria-hidden="true" size={17} />
            </summary>
            <div className="image-answer-panel">
              <QuestionExplanationSurface className="glass-explanation" title="解析">
                <ScanExplanationContent
                  question={currentQuestion}
                  label={`${"\u7b2c"} ${currentQuestion.number} ${"\u984c\u89e3\u6790"}`}
                />
              </QuestionExplanationSurface>
            </div>
          </details>
        ) : null}
      </GlassCard>

      {questionListOpen ? (
        <section className="v90-question-list-panel" aria-label="題目列表">
          <div className="v90-question-list-head">
            <strong>題目列表</strong>
            <span>第 {currentIndex + 1}／{questions.length} 題</span>
          </div>
          <div className="v90-question-list-grid">
            {questions.map((question, index) => (
              <button
                key={question.id}
                type="button"
                className={`${index === currentIndex ? "is-current" : ""}${answers[question.id] ? " is-answered" : ""}`}
                onClick={() => {
                  jumpFromAnswerCard(index);
                  setQuestionListOpen(false);
                }}
              >
                {index + 1}
              </button>
            ))}
          </div>
        </section>
      ) : null}
      {isSubmittedReview ? (
        <nav className="image-quiz-controls submitted-review-controls v90-bottom-controls" aria-label={T.navigation}>
          <GlassButton variant="secondary" onClick={goPrevious} disabled={currentIndex === 0}>
            <ArrowLeft aria-hidden="true" size={18} />
            <span>{T.previous}</span>
          </GlassButton>
          <GlassButton variant="secondary" onClick={returnToSubmittedResult}>
            <ListChecks aria-hidden="true" size={18} />
            <span>{T.backToResultCard}</span>
          </GlassButton>
          <GlassButton variant="primary" onClick={goNextSubmittedReview} disabled={currentIndex >= questions.length - 1}>
            <span>{T.next}</span>
            <ArrowRight aria-hidden="true" size={18} />
          </GlassButton>
        </nav>
      ) : (
        <nav className="image-quiz-controls v90-bottom-controls" aria-label={T.navigation}>
          <GlassButton variant="secondary" onClick={goPrevious} disabled={currentIndex === 0 || interactionPending}>
            <ArrowLeft aria-hidden="true" size={18} />
            <span>{T.previous}</span>
          </GlassButton>
          <GlassButton
            variant="secondary"
            className="v90-question-list-trigger"
            onClick={() => {
              if (isDeferredExam) setAnswerCardOpen((open) => !open);
              else setQuestionListOpen((open) => !open);
            }}
          >
            <Grid2X2 aria-hidden="true" size={17} />
            <span>題目列表</span>
          </GlassButton>
          <GlassButton
            variant="primary"
            disabled={interactionPending}
            busy={submissionPending}
            onClick={() => void goNext()}
          >
            <span>
              {currentIndex >= questions.length - 1
                ? (isDeferredExam ? "交卷" : T.finish)
                : T.next}
            </span>
            <ArrowRight aria-hidden="true" size={18} />
          </GlassButton>
        </nav>
      )}

      <V93ConfirmDialog
        open={exitConfirmationOpen}
        title="儲存模擬考進度"
        message={T.settleConfirm}
        confirmLabel="儲存並離開"
        cancelLabel="繼續作答"
        tone="primary"
        busy={exitSettlementPending}
        onCancel={cancelRandomExit}
        onConfirm={() => void confirmRandomExit()}
      />

      <V93ConfirmDialog
        open={submitConfirmationOpen}
        title="確認交卷"
        message={
          Math.max(0, questions.length - Object.keys(answers).length) > 0
            ? `尚有 ${Math.max(0, questions.length - Object.keys(answers).length)} 題未作答。交卷後答案會鎖定，確定要交卷嗎？`
            : "交卷後答案會鎖定並顯示成績，確定要繼續嗎？"
        }
        confirmLabel="確認交卷"
        cancelLabel="返回檢查"
        tone="primary"
        busy={submissionPending}
        onCancel={() => setSubmitConfirmationOpen(false)}
        onConfirm={confirmDeferredSubmission}
      />
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

type SecuritiesDailyScope = StudyPlanScopeId | "all";

function resolveSecuritiesDailyScope(search: string): SecuritiesDailyScope {
  const requested = new URLSearchParams(search).get("scope");
  if (requested === "all" || requested === null) return "all";
  if (
    isStudyPlanScopeId(requested) &&
    isSecuritiesStudyPlanScopeId(requested)
  ) {
    return requested;
  }
  return "all";
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

type AnswerVisualStatus = "correct" | "wrong" | "selected" | null;

function answerVisualStatus(
  answer: NumericAnswer,
  record: AnswerRecord | undefined,
  revealAnswer = true,
  revealedCorrectAnswer?: NumericAnswer,
): AnswerVisualStatus {
  const correctAnswer = record?.correct ?? revealedCorrectAnswer;
  if (!revealAnswer) return answer === record?.selected ? "selected" : null;
  if (answer === correctAnswer) return "correct";
  if (record && answer === record.selected && !record.isCorrect) return "wrong";
  return null;
}

function AnswerResultMark({ status }: { status: AnswerVisualStatus }) {
  if (!status || status === "selected") return null;
  const correct = status === "correct";
  return (
    <V93AnswerBadge status={correct ? "correct" : "wrong"} />
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
