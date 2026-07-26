import { Bookmark, BookmarkCheck, CheckCircle2, ChevronLeft, ChevronRight, Clock3, Send } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import {
  loadForeignExchangeQuestions,
  shuffleQuestions,
  subjectDuration,
  subjectTitle,
  type ForeignExchangeAnswerKey,
  type ForeignExchangeQuestion,
  type ForeignExchangeSession,
  type ForeignExchangeSubjectId,
} from "../lib/foreignExchange";
import {
  foreignExchangeFavoriteIds,
  foreignExchangeWrongIds,
  readForeignExchangeProgress,
  recordForeignExchangeAnswer,
  recordForeignExchangeAnswers,
  toggleForeignExchangeFavorite,
} from "../lib/foreignExchangeProgress";

type PracticeMode = "practice" | "mock" | "random" | "wrong" | "favorites";

const ANSWER_KEYS: readonly ForeignExchangeAnswerKey[] = ["A", "B", "C", "D"];

function parseMode(value: string | null): PracticeMode {
  return value === "mock" || value === "random" || value === "wrong" || value === "favorites" ? value : "practice";
}

function parseSession(value: string | null): ForeignExchangeSession | undefined {
  const session = Number(value);
  return session === 45 || session === 46 || session === 47 ? session : undefined;
}

function parseSubject(value: string | null): ForeignExchangeSubjectId | undefined {
  return value === "remittance" || value === "trade" ? value : undefined;
}

function formatTimer(totalSeconds: number): string {
  const safe = Math.max(0, totalSeconds);
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const body = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  return hours ? `${String(hours).padStart(2, "0")}:${body}` : body;
}

function modeTitle(mode: PracticeMode, session?: ForeignExchangeSession, subject?: ForeignExchangeSubjectId): string {
  if (mode === "mock") return `${session ? `第${session}屆 ` : ""}${subject ? subjectTitle(subject) : "模擬測驗"}`;
  if (mode === "random") return "隨機練習";
  if (mode === "wrong") return "錯題重練";
  if (mode === "favorites") return "收藏題目";
  return `${session ? `第${session}屆 ` : ""}${subject ? subjectTitle(subject) : "逐題練習"}`;
}

export function ForeignExchangePracticePage() {
  const [searchParams] = useSearchParams();
  const mode = parseMode(searchParams.get("mode"));
  const session = parseSession(searchParams.get("session"));
  const subject = parseSubject(searchParams.get("subject"));
  const requestedCount = Math.min(390, Math.max(1, Number(searchParams.get("count")) || 20));
  const isMock = mode === "mock";
  const [questions, setQuestions] = useState<ForeignExchangeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [answers, setAnswers] = useState<Record<string, ForeignExchangeAnswerKey>>({});
  const [submitted, setSubmitted] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(readForeignExchangeProgress().favorites));
  const durationMinutes = subject ? subjectDuration(subject) : 60;
  const [secondsRemaining, setSecondsRemaining] = useState(durationMinutes * 60);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setAnswers({});
    setSubmitted(false);
    setSecondsRemaining(durationMinutes * 60);

    async function load(): Promise<void> {
      try {
        let nextQuestions: ForeignExchangeQuestion[];
        if (mode === "wrong" || mode === "favorites") {
          const ids = mode === "wrong" ? foreignExchangeWrongIds() : foreignExchangeFavoriteIds();
          nextQuestions = ids.length
            ? await loadForeignExchangeQuestions({ ids, signal: controller.signal })
            : [];
          const order = new Map(ids.map((id, index) => [id, index]));
          nextQuestions.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
        } else {
          nextQuestions = await loadForeignExchangeQuestions({
            session: mode === "random" ? undefined : session,
            subject: mode === "random" ? undefined : subject,
            signal: controller.signal,
          });
          if (mode === "random") nextQuestions = shuffleQuestions(nextQuestions).slice(0, requestedCount);
        }
        setQuestions(nextQuestions);
      } catch (reason) {
        if (reason instanceof Error && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "題庫載入失敗。");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }

    void load();
    return () => controller.abort();
  }, [durationMinutes, mode, requestedCount, session, subject]);

  const submitMock = useCallback(() => {
    if (submitted) return;
    setSubmitted(true);
    const records = questions.flatMap((question) => {
      const selectedAnswer = answers[question.id];
      return selectedAnswer ? [{ questionId: question.id, selectedAnswer, correctAnswer: question.answer }] : [];
    });
    if (records.length) recordForeignExchangeAnswers(records);
  }, [answers, questions, submitted]);

  useEffect(() => {
    if (!isMock || submitted || loading || !questions.length) return;
    const timer = window.setInterval(() => {
      setSecondsRemaining((current) => {
        if (current <= 1) {
          window.clearInterval(timer);
          window.setTimeout(submitMock, 0);
          return 0;
        }
        return current - 1;
      });
    }, 1000);
    return () => window.clearInterval(timer);
  }, [isMock, loading, questions.length, submitMock, submitted]);

  const currentQuestion = questions[currentIndex];
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  const showResult = Boolean(currentQuestion && (submitted || (!isMock && selectedAnswer)));
  const answeredCount = Object.keys(answers).length;
  const correctCount = useMemo(
    () => questions.reduce((count, question) => count + (answers[question.id] === question.answer ? 1 : 0), 0),
    [answers, questions],
  );
  const wrongCount = submitted ? questions.length - correctCount : answeredCount - correctCount;
  const progressPercent = questions.length ? ((currentIndex + 1) / questions.length) * 100 : 0;

  function chooseAnswer(answer: ForeignExchangeAnswerKey): void {
    if (!currentQuestion || submitted || (!isMock && selectedAnswer)) return;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: answer }));
    if (!isMock) {
      recordForeignExchangeAnswer({
        questionId: currentQuestion.id,
        selectedAnswer: answer,
        correctAnswer: currentQuestion.answer,
      });
    }
  }

  function toggleFavorite(): void {
    if (!currentQuestion) return;
    const active = toggleForeignExchangeFavorite(currentQuestion.id);
    setFavoriteIds((current) => {
      const next = new Set(current);
      if (active) next.add(currentQuestion.id);
      else next.delete(currentQuestion.id);
      return next;
    });
  }

  function optionClass(answer: ForeignExchangeAnswerKey): string {
    const classes = ["fx-option"];
    if (selectedAnswer === answer) classes.push("is-selected");
    if (showResult && currentQuestion?.answer === answer) classes.push("is-correct");
    if (showResult && selectedAnswer === answer && currentQuestion?.answer !== answer) classes.push("is-wrong");
    return classes.join(" ");
  }

  if (loading) return <LoadingState label="載入初階外匯題庫" />;

  if (error) {
    return (
      <div className="page-stack">
        <GlassCard className="fx-empty">
          <h1>無法載入題庫</h1>
          <p>{error}</p>
          <GlassLinkButton to="/foreign-exchange" variant="primary">回初階外匯</GlassLinkButton>
        </GlassCard>
      </div>
    );
  }

  if (!currentQuestion) {
    const emptyText = mode === "wrong" ? "目前沒有錯題。" : mode === "favorites" ? "目前沒有收藏題目。" : "找不到符合條件的題目。";
    return (
      <div className="page-stack">
        <GlassCard className="fx-empty">
          <h1>{modeTitle(mode, session, subject)}</h1>
          <p>{emptyText}</p>
          <GlassLinkButton to="/foreign-exchange" variant="primary">回初階外匯</GlassLinkButton>
        </GlassCard>
      </div>
    );
  }

  return (
    <div className="page-stack">
      <div className="fx-mode-title">
        <h1>{modeTitle(mode, session, subject)}</h1>
        <GlassLinkButton to="/foreign-exchange" variant="secondary">返回題庫</GlassLinkButton>
      </div>

      {submitted ? (
        <GlassCard className="fx-result-banner">
          <div>
            <span>測驗結果</span>
            <strong>{correctCount} / {questions.length}</strong>
          </div>
          <div>{Math.round((correctCount / questions.length) * 100)} 分</div>
        </GlassCard>
      ) : null}

      <div className="fx-quiz-shell">
        <GlassCard className="fx-question-card">
          <div className="fx-question-top">
            <div className="fx-question-labels">
              <span className="fx-question-number">第 {currentQuestion.questionNumber} 題</span>
              <span className="glass-badge">第{currentQuestion.session}屆</span>
              <span className="glass-badge">{currentQuestion.bankTitle}</span>
              <span className="fx-standard">{currentQuestion.standardVersion}</span>
            </div>
            <button
              type="button"
              className={`fx-favorite${favoriteIds.has(currentQuestion.id) ? " is-active" : ""}`}
              onClick={toggleFavorite}
              aria-pressed={favoriteIds.has(currentQuestion.id)}
            >
              {favoriteIds.has(currentQuestion.id)
                ? <BookmarkCheck aria-hidden="true" size={19} />
                : <Bookmark aria-hidden="true" size={19} />}
              收藏
            </button>
          </div>

          <div className="fx-progress-track" aria-label={`進度 ${currentIndex + 1} / ${questions.length}`}>
            <div className="fx-progress-fill" style={{ width: `${progressPercent}%` }} />
          </div>

          <p className="fx-question-text">{currentQuestion.question}</p>
          <div className="fx-options">
            {ANSWER_KEYS.map((answer) => (
              <button
                key={answer}
                type="button"
                className={optionClass(answer)}
                disabled={submitted || (!isMock && Boolean(selectedAnswer))}
                onClick={() => chooseAnswer(answer)}
              >
                <span className="fx-option-key">{answer}</span>
                <span>{currentQuestion.options[answer]}</span>
              </button>
            ))}
          </div>

          {showResult ? (
            <div className="fx-explanation" role="status">
              <p className="fx-answer-line">
                <CheckCircle2 aria-hidden="true" size={18} /> 正確答案：{currentQuestion.answer}．{currentQuestion.options[currentQuestion.answer]}
              </p>
              <h3>解析</h3>
              <p>{currentQuestion.explanation}</p>
            </div>
          ) : null}

          <div className="fx-quiz-actions">
            <GlassButton
              variant="secondary"
              disabled={currentIndex === 0}
              onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
            >
              <ChevronLeft aria-hidden="true" size={17} />上一題
            </GlassButton>
            <span>{currentIndex + 1} / {questions.length}</span>
            {currentIndex < questions.length - 1 ? (
              <GlassButton
                variant="primary"
                disabled={!isMock && !selectedAnswer}
                onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
              >
                下一題<ChevronRight aria-hidden="true" size={17} />
              </GlassButton>
            ) : isMock && !submitted ? (
              <GlassButton variant="primary" onClick={submitMock}>
                <Send aria-hidden="true" size={17} />交卷
              </GlassButton>
            ) : (
              <GlassLinkButton to="/foreign-exchange" variant="primary">完成</GlassLinkButton>
            )}
          </div>
        </GlassCard>

        <aside className="fx-quiz-side">
          {isMock ? (
            <GlassCard className="fx-side-card">
              <h2><Clock3 aria-hidden="true" size={18} />剩餘時間</h2>
              <div className="fx-timer">{submitted ? "已交卷" : formatTimer(secondsRemaining)}</div>
              {!submitted ? (
                <GlassButton variant="primary" onClick={submitMock} disabled={!answeredCount}>
                  <Send aria-hidden="true" size={16} />提前交卷
                </GlassButton>
              ) : null}
            </GlassCard>
          ) : null}

          <GlassCard className="fx-side-card">
            <h2>作答狀態</h2>
            <div className="fx-side-stat"><span>已作答</span><strong>{answeredCount}</strong></div>
            {isMock && !submitted ? (
              <div className="fx-side-stat"><span>未作答</span><strong>{questions.length - answeredCount}</strong></div>
            ) : (
              <>
                <div className="fx-side-stat"><span>答對</span><strong>{correctCount}</strong></div>
                <div className="fx-side-stat"><span>答錯</span><strong>{wrongCount}</strong></div>
              </>
            )}
          </GlassCard>

          <GlassCard className="fx-side-card">
            <h2>題號</h2>
            <div className="fx-number-grid">
              {questions.map((question, index) => (
                <button
                  key={question.id}
                  type="button"
                  className={`fx-number-button${index === currentIndex ? " is-current" : ""}${answers[question.id] ? " is-answered" : ""}`}
                  onClick={() => setCurrentIndex(index)}
                  aria-label={`第 ${index + 1} 題`}
                >
                  {index + 1}
                </button>
              ))}
            </div>
          </GlassCard>
        </aside>
      </div>
    </div>
  );
}
