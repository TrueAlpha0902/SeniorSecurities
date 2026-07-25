import { type FormEvent, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { EncouragementNote } from "../components/EncouragementNote";
import { Clock3, Pause, Play } from "lucide-react";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { ProgressBar } from "../components/ProgressBar";
import { QuestionView } from "../components/QuestionView";
import { QuizStats } from "../components/QuizStats";
import { useAsync } from "../hooks/useAsync";
import { loadAllQuestions, loadBankQuestions, loadChapterQuestions, loadQuestionsForRefs } from "../lib/data";
import { getQuizProgress, listFavoriteQuestions, listWrongQuestions, recordUserAnswer, saveQuizProgress, clearQuizProgress, saveQuizSession } from "../lib/db";
import { buildSessionId, calculateAccuracy } from "../lib/quiz";
import {
  ANSWER_MODE_SETTING_CHANGED,
  AUTO_NEXT_CORRECT_SETTING_CHANGED,
  getAnswerModeEnabled,
  getAutoNextCorrectEnabled,
} from "../lib/appSettings";
import type { AnswerKey, Question, QuizResultState, QuizSessionMode } from "../types";

type QuizConfig = {
  mode: QuizSessionMode;
  title: string;
  restartTo: string;
  load: () => Promise<Question[]>;
};

export function QuizPage() {
  const { bankId = "", chapterId = "" } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const startedAtRef = useRef(new Date().toISOString());

  const config = useMemo<QuizConfig>(() => {
    if (location.pathname === "/quiz/all") {
      return {
        mode: "all",
        title: "全部混合",
        restartTo: "/quiz/all",
        load: loadAllQuestions
      };
    }
    if (location.pathname === "/quiz/wrong") {
      return {
        mode: "wrong",
        title: "錯題複習",
        restartTo: "/quiz/wrong",
        load: async () => loadQuestionsForRefs(await listWrongQuestions())
      };
    }
    if (location.pathname === "/quiz/favorites") {
      return {
        mode: "favorites",
        title: "收藏複習",
        restartTo: "/quiz/favorites",
        load: async () => loadQuestionsForRefs(await listFavoriteQuestions())
      };
    }
    if (chapterId) {
      return {
        mode: "chapter",
        title: `${bankId} / ${chapterId}`,
        restartTo: `/quiz/bank/${bankId}/chapter/${encodeURIComponent(chapterId)}`,
        load: () => loadChapterQuestions(bankId, chapterId)
      };
    }
    return {
      mode: "bank",
      title: bankId,
      restartTo: `/quiz/bank/${bankId}`,
      load: () => loadBankQuestions(bankId)
    };
  }, [bankId, chapterId, location.pathname]);

  const { data: loadedQuestions, error, loading } = useAsync(config.load, [config]);
  const progressKey = `text:${config.mode}:${bankId || "all"}:${chapterId || "all"}`;
  const [questions, setQuestions] = useState<Question[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<AnswerKey | null>(null);
  const [revealed, setRevealed] = useState(false);
  const [correctCount, setCorrectCount] = useState(0);
  const [wrongCount, setWrongCount] = useState(0);
  const [wrongQuestionIds, setWrongQuestionIds] = useState<string[]>([]);
  const [correctStreak, setCorrectStreak] = useState(0);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [timerPaused, setTimerPaused] = useState(false);
  const [jumpInput, setJumpInput] = useState("");
  const [jumpError, setJumpError] = useState("");
  const [answerModeEnabled, setAnswerModeEnabled] = useState(() => getAnswerModeEnabled());
  const [autoNextCorrectEnabled, setAutoNextCorrectEnabled] = useState(() => getAutoNextCorrectEnabled());

  useEffect(() => {
    if (!loadedQuestions) {
      return;
    }
    let cancelled = false;
    const nextQuestions = loadedQuestions;
    async function restore() {
      const progress = await getQuizProgress(progressKey);
      if (cancelled) return;
      const maxIndex = Math.max(0, nextQuestions.length - 1);
      setQuestions(nextQuestions);
      setCurrentIndex(progress && progress.totalQuestions === nextQuestions.length ? Math.min(Math.max(progress.currentIndex, 0), maxIndex) : 0);
      setSelectedAnswer(null);
      setRevealed(false);
      setCorrectCount(0);
      setWrongCount(0);
      setWrongQuestionIds([]);
      setCorrectStreak(0);
      setSaveError(null);
      setElapsedSeconds(0);
      setTimerPaused(false);
      setJumpInput("");
      setJumpError("");
      startedAtRef.current = new Date().toISOString();
    }
    void restore();
    return () => { cancelled = true; };
  }, [loadedQuestions, progressKey]);


  useEffect(() => {
    if (questions.length === 0) return;
    void saveQuizProgress(progressKey, currentIndex, questions.length);
  }, [currentIndex, progressKey, questions.length]);

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
    if (questions.length === 0 || timerPaused) return;
    const timer = window.setInterval(() => setElapsedSeconds((seconds) => seconds + 1), 1000);
    return () => window.clearInterval(timer);
  }, [questions.length, timerPaused]);

  if (loading) {
    return <LoadingState label="載入測驗" />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (questions.length === 0) {
    return <EmptyState title="沒有可練習的題目" message="此範圍目前沒有題目，或複習清單尚未建立。" actionLabel="回首頁" actionTo="/" />;
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    return <ErrorState message="題目索引異常，請重新開始測驗。" />;
  }

  const answeredCount = correctCount + wrongCount;
  const isLastQuestion = currentIndex === questions.length - 1;
  const accuracy = calculateAccuracy(correctCount, answeredCount);
  const currentResult = answerModeEnabled
    ? true
    : revealed && selectedAnswer
      ? selectedAnswer === currentQuestion.answer
      : undefined;
  const encouragementIsCorrect = currentResult === false
    ? false
    : currentResult === true || correctStreak > 0
      ? true
      : undefined;
  const encouragementCorrectStreak = encouragementIsCorrect === true ? Math.max(correctStreak, 1) : 0;

  const handleSelect = (answer: AnswerKey) => {
    if (revealed || answerModeEnabled) {
      return;
    }

    setSelectedAnswer(answer);
    setRevealed(true);

    const isCorrect = answer === currentQuestion.answer;
    if (isCorrect) {
      setCorrectCount((count) => count + 1);
      setCorrectStreak((streak) => streak + 1);
    } else {
      setWrongCount((count) => count + 1);
      setCorrectStreak(0);
      setWrongQuestionIds((ids) => [...ids, currentQuestion.id]);
    }

    recordUserAnswer(currentQuestion, answer).catch((recordError: unknown) => {
      const message = recordError instanceof Error ? recordError.message : "無法儲存答題紀錄";
      setSaveError(message);
    });

    if (autoNextCorrectEnabled && isCorrect && currentIndex < questions.length - 1) {
      window.setTimeout(() => {
        setCurrentIndex((index) => (index === currentIndex ? Math.min(index + 1, questions.length - 1) : index));
        setSelectedAnswer(null);
        setRevealed(false);
      }, 650);
    }
  };

  const finishQuiz = async () => {
    const totalQuestions = questions.length;
    const session = {
      sessionId: buildSessionId(),
      mode: config.mode,
      startedAt: startedAtRef.current,
      finishedAt: new Date().toISOString(),
      totalQuestions,
      correctCount,
      wrongCount,
      accuracy: calculateAccuracy(correctCount, totalQuestions)
    };

    try {
      await saveQuizSession(session);
      await clearQuizProgress(progressKey);
    } catch (sessionError: unknown) {
      const message = sessionError instanceof Error ? sessionError.message : "無法儲存測驗紀錄";
      setSaveError(message);
    }

    const state: QuizResultState = {
      session,
      restartTo: config.restartTo,
      wrongQuestionIds
    };
    navigate("/result", { state });
  };

  const handleNext = () => {
    if (!revealed && !answerModeEnabled) {
      return;
    }
    if (isLastQuestion) {
      void finishQuiz();
      return;
    }
    setCurrentIndex((index) => index + 1);
    setSelectedAnswer(null);
    setRevealed(false);
    setJumpError("");
  };

  function handlePrevious(): void {
    setCurrentIndex((index) => Math.max(0, index - 1));
    setSelectedAnswer(null);
    setRevealed(false);
    setJumpError("");
  }

  function handleJump(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const value = Number(jumpInput.trim());
    if (!Number.isInteger(value) || value < 1 || value > questions.length) {
      setJumpError(`請輸入 1 到 ${questions.length} 之間的題號。`);
      return;
    }
    setCurrentIndex(value - 1);
    setSelectedAnswer(null);
    setRevealed(false);
    setJumpInput("");
    setJumpError("");
  }

  return (
    <div className="quiz-page">
      <GlassCard className="quiz-topbar">
        <div>
          <p className="eyebrow">測驗</p>
          <h1>{config.title}</h1>
        </div>
        <div className="quiz-topbar-actions">
          <span className="glass-badge quiz-timer-badge" aria-label={`計時 ${formatElapsedTime(elapsedSeconds)}`}>
            <Clock3 aria-hidden="true" size={15} />
            {formatElapsedTime(elapsedSeconds)}
            <button
              type="button"
              className="timer-pause-button"
              aria-label={timerPaused ? "繼續" : "暫停"}
              title={timerPaused ? "繼續" : "暫停"}
              onClick={() => setTimerPaused((paused) => !paused)}
            >
              {timerPaused ? <Play aria-hidden="true" size={13} /> : <Pause aria-hidden="true" size={13} />}
              <span>{timerPaused ? "繼續" : "暫停"}</span>
            </button>
          </span>
          <QuizStats current={currentIndex + 1} total={questions.length} correct={correctCount} wrong={wrongCount} accuracy={accuracy} />
        </div>
      </GlassCard>

      <ProgressBar value={currentIndex + 1} max={questions.length} label={`${currentIndex + 1} / ${questions.length}`} />

      <EncouragementNote
        isCorrect={encouragementIsCorrect}
        seed={`${currentQuestion.id}:${encouragementCorrectStreak}:top`}
        correctStreak={encouragementCorrectStreak}
        compact
      />

      {saveError ? <p className="inline-error" role="alert">{saveError}</p> : null}

      <GlassCard className="question-card">
        <QuestionView
          question={currentQuestion}
          selectedAnswer={answerModeEnabled && !selectedAnswer ? currentQuestion.answer : selectedAnswer}
          revealed={revealed || answerModeEnabled}
          onSelect={handleSelect}
        />
      </GlassCard>

      {jumpError ? <p className="inline-error jump-error-fixed" role="alert">{jumpError}</p> : null}
      <div className="image-quiz-controls text-quiz-controls" aria-label="題目導覽">
        <GlassButton variant="secondary" onClick={handlePrevious} disabled={currentIndex === 0}>上一題</GlassButton>
        <form className="question-jump-form inline-jump-form" onSubmit={handleJump}>
          <label htmlFor="text-question-jump-input">跳到題號</label>
          <input
            id="text-question-jump-input"
            type="number"
            inputMode="numeric"
            min={1}
            max={questions.length}
            value={jumpInput}
            placeholder="題號"
            onChange={(event) => setJumpInput(event.currentTarget.value)}
          />
          <GlassButton variant="secondary" type="submit" disabled={!jumpInput.trim()}>跳轉</GlassButton>
        </form>
        <GlassButton variant="primary" onClick={handleNext} disabled={!revealed && !answerModeEnabled}>
          {isLastQuestion ? "完成" : "下一題"}
        </GlassButton>
      </div>
    </div>
  );
}


function formatElapsedTime(totalSeconds: number): string {
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  const two = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
