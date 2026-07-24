import { ArrowLeft, ChevronLeft, ChevronRight, ChevronUp, Grid2X2, Send, Star } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { HandwrittenAsset, HandwrittenLabel } from "../components/HandwrittenAsset";
import { ProgressBar } from "../components/ProgressBar";
import { QuestionExplanationSurface } from "../components/QuestionExplanationSurface";
import { QuizTimer } from "../components/QuizTimer";
import {
  acceptedForeignExchangeAnswers,
  isForeignExchangeAnswerCorrect,
  isForeignExchangeSession,
  loadForeignExchangeQuestions,
  resetForeignExchangeQuestionCache,
  resumeForeignExchangeMock,
  startForeignExchangeMock,
  subjectDuration,
  subjectTitle,
  submitForeignExchangeMock,
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
import { readScopedStorageItem, writeScopedStorageItem } from "../lib/userScopedStorage";
import {
  ANSWER_MODE_SETTING_CHANGED,
  getAnswerModeEnabled,
} from "../lib/appSettings";
import { formatAnswerKey, formatLearnerText } from "../lib/learnerText";
import { focusQuestionAtTop, vibrateForAnswer } from "../lib/quizViewport";

type PracticeMode = "practice" | "mock" | "random" | "wrong" | "favorites";

const ANSWER_KEYS: readonly ForeignExchangeAnswerKey[] = ["A", "B", "C", "D"];

type ForeignExchangeMockSnapshot = {
  version: 2;
  mockToken: string;
  questionIds: string[];
  answers: Record<string, ForeignExchangeAnswerKey>;
  currentIndex: number;
  deadlineAt: string;
  submitted: boolean;
};

function mockSnapshotKey(session?: ForeignExchangeSession, subject?: ForeignExchangeSubjectId): string {
  return `quizpwa:fx-mock:v2:${session ?? "all"}:${subject ?? "all"}`;
}

function readMockSnapshot(session?: ForeignExchangeSession, subject?: ForeignExchangeSubjectId): ForeignExchangeMockSnapshot | null {
  try {
    const raw = readScopedStorageItem(mockSnapshotKey(session, subject), false);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ForeignExchangeMockSnapshot;
    if (
      parsed.version !== 2
      || !parsed.mockToken
      || !Array.isArray(parsed.questionIds)
      || typeof parsed.deadlineAt !== "string"
    ) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseMode(value: string | null): PracticeMode {
  return value === "mock" || value === "random" || value === "wrong" || value === "favorites" ? value : "practice";
}

function parseSession(value: string | null): ForeignExchangeSession | undefined {
  const session = Number(value);
  return isForeignExchangeSession(session) ? session : undefined;
}

function parseSubject(value: string | null): ForeignExchangeSubjectId | undefined {
  return value === "remittance" || value === "trade" ? value : undefined;
}

type ForeignExchangeAnswerVisualStatus = "correct" | "wrong" | "selected" | null;

function ForeignExchangeAnswerMark({
  status,
}: {
  status: ForeignExchangeAnswerVisualStatus;
}) {
  if (!status || status === "selected") return null;
  const correct = status === "correct";
  return (
    <HandwrittenAsset
      category="states"
      name={correct ? "correct-chip" : "wrong-chip"}
      text={correct ? "正解" : "錯誤"}
      className={`answer-result-label is-${status} v91-answer-state-image`}
    />
  );
}

function modeTitle(mode: PracticeMode, session?: ForeignExchangeSession, subject?: ForeignExchangeSubjectId): string {
  if (mode === "mock") return `${session ? `第${session}屆 ` : ""}${subject ? subjectTitle(subject) : "模擬測驗"}`;
  if (mode === "random") return subject ? `${subjectTitle(subject)}隨機練習` : "隨機練習";
  if (mode === "wrong") return "錯題複習";
  if (mode === "favorites") return "收藏題目";
  return `${session ? `第${session}屆 ` : ""}${subject ? subjectTitle(subject) : "逐題練習"}`;
}

export function ForeignExchangePracticePage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const mode = parseMode(searchParams.get("mode"));
  const session = parseSession(searchParams.get("session"));
  const subject = parseSubject(searchParams.get("subject"));
  const requestedCount = Math.min(100, Math.max(1, Number(searchParams.get("count")) || 20));
  const requestedId = searchParams.get("id")?.trim() || undefined;
  const isMock = mode === "mock";
  const durationMinutes = subject ? subjectDuration(subject) : 60;

  const [questions, setQuestions] = useState<ForeignExchangeQuestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [loadRevision, setLoadRevision] = useState(0);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [questionListOpen, setQuestionListOpen] = useState(false);
  const [answers, setAnswers] = useState<Record<string, ForeignExchangeAnswerKey>>({});
  const [submitted, setSubmitted] = useState(false);
  const [mockToken, setMockToken] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [favoriteIds, setFavoriteIds] = useState(() => new Set(readForeignExchangeProgress().favorites));
  const [answerModeRevision, setAnswerModeRevision] = useState(0);
  const [secondsRemaining, setSecondsRemaining] = useState(durationMinutes * 60);
  const [deadlineAt, setDeadlineAt] = useState<string | null>(null);
  const submissionRef = useRef(false);
  const questionFocusRef = useRef<HTMLDivElement>(null);
  const shouldFocusQuestionRef = useRef(false);
  const navigationScrollYRef = useRef<number | null>(null);

  useEffect(() => {
    const refresh = () => setAnswerModeRevision((value) => value + 1);
    window.addEventListener(ANSWER_MODE_SETTING_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ANSWER_MODE_SETTING_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  const applySubmittedResults = useCallback((results: ForeignExchangeQuestion[]): void => {
    setQuestions(results);
    setSubmitted(true);
    const records = results.flatMap((question) => {
      const selectedAnswer = answers[question.id];
      if (!selectedAnswer || !question.answer) return [];
      return [{
        questionId: question.id,
        selectedAnswer,
        correctAnswer: question.answer,
        isCorrect: isForeignExchangeAnswerCorrect(question, selectedAnswer),
      }];
    });
    if (records.length) recordForeignExchangeAnswers(records);
  }, [answers]);

  const submitMock = useCallback(async (): Promise<void> => {
    if (!isMock || submitted || submitting || submissionRef.current || !mockToken) return;
    submissionRef.current = true;
    setSubmitting(true);
    try {
      const result = await submitForeignExchangeMock(mockToken, answers);
      applySubmittedResults(result.results);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "模擬考批改失敗。");
    } finally {
      submissionRef.current = false;
      setSubmitting(false);
    }
  }, [answers, applySubmittedResults, isMock, mockToken, submitted, submitting]);

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    setQuestions([]);
    setCurrentIndex(0);
    setQuestionListOpen(false);
    setAnswers({});
    setSubmitted(false);
    setMockToken(null);
    setSubmitting(false);
    submissionRef.current = false;
    setSecondsRemaining(durationMinutes * 60);
    setDeadlineAt(null);

    async function load(): Promise<void> {
      try {
        if (isMock) {
          const snapshot = readMockSnapshot(session, subject);
          if (snapshot) {
            setAnswers(snapshot.answers);
            setCurrentIndex(Math.min(Math.max(0, snapshot.currentIndex), Math.max(0, snapshot.questionIds.length - 1)));
            setDeadlineAt(snapshot.deadlineAt);
            setSecondsRemaining(Math.max(0, Math.ceil((new Date(snapshot.deadlineAt).getTime() - Date.now()) / 1000)));
            setMockToken(snapshot.mockToken);
            if (snapshot.submitted) {
              const submission = await submitForeignExchangeMock(snapshot.mockToken, snapshot.answers, controller.signal);
              setQuestions(submission.results);
              setSubmitted(true);
            } else {
              const resumed = await resumeForeignExchangeMock(snapshot.mockToken, controller.signal);
              setQuestions(resumed.questions);
            }
            return;
          }

          const created = await startForeignExchangeMock({ session, subject, signal: controller.signal });
          const nextDeadline = new Date(Date.now() + durationMinutes * 60_000).toISOString();
          setQuestions(created.questions);
          setMockToken(created.mockToken);
          setDeadlineAt(nextDeadline);
          writeScopedStorageItem(mockSnapshotKey(session, subject), JSON.stringify({
            version: 2,
            mockToken: created.mockToken,
            questionIds: created.questions.map((question) => question.id),
            answers: {},
            currentIndex: 0,
            deadlineAt: nextDeadline,
            submitted: false,
          } satisfies ForeignExchangeMockSnapshot));
          return;
        }

        let nextQuestions: ForeignExchangeQuestion[];
        if (requestedId) {
          nextQuestions = await loadForeignExchangeQuestions({ ids: [requestedId], signal: controller.signal });
        } else if (mode === "wrong" || mode === "favorites") {
          const ids = mode === "wrong" ? foreignExchangeWrongIds() : foreignExchangeFavoriteIds();
          nextQuestions = ids.length ? await loadForeignExchangeQuestions({ ids, signal: controller.signal }) : [];
          const order = new Map(ids.map((id, index) => [id, index]));
          nextQuestions.sort((left, right) => (order.get(left.id) ?? 0) - (order.get(right.id) ?? 0));
        } else {
          nextQuestions = await loadForeignExchangeQuestions({
            session,
            subject,
            randomCount: mode === "random" ? requestedCount : undefined,
            signal: controller.signal,
          });
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
  }, [
    durationMinutes,
    isMock,
    loadRevision,
    mode,
    requestedCount,
    requestedId,
    session,
    subject,
  ]);

  useEffect(() => {
    if (!isMock || submitted || loading || !questions.length || !deadlineAt) return;
    const tick = () => {
      const remaining = Math.max(0, Math.ceil((new Date(deadlineAt).getTime() - Date.now()) / 1000));
      setSecondsRemaining(remaining);
      if (remaining <= 0) void submitMock();
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [deadlineAt, isMock, loading, questions.length, submitMock, submitted]);

  useEffect(() => {
    if (!isMock || !questions.length || !deadlineAt || !mockToken) return;
    writeScopedStorageItem(mockSnapshotKey(session, subject), JSON.stringify({
      version: 2,
      mockToken,
      questionIds: questions.map((question) => question.id),
      answers,
      currentIndex,
      deadlineAt,
      submitted,
    } satisfies ForeignExchangeMockSnapshot));
  }, [answers, currentIndex, deadlineAt, isMock, mockToken, questions, session, subject, submitted]);

  useEffect(() => {
    if (!shouldFocusQuestionRef.current) return;
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
  }, [currentIndex]);

  function prepareQuestionNavigation(): void {
    navigationScrollYRef.current = window.scrollY;
    shouldFocusQuestionRef.current = true;
  }

  function goToQuestion(index: number): void {
    prepareQuestionNavigation();
    setQuestionListOpen(false);
    setCurrentIndex(Math.min(Math.max(0, index), Math.max(0, questions.length - 1)));
  }

  const currentQuestion = questions[currentIndex];
  const selectedAnswer = currentQuestion ? answers[currentQuestion.id] : undefined;
  void answerModeRevision;
  const answerModeAllowed = Boolean(
    !isMock
      && currentQuestion
      && getAnswerModeEnabled(),
  );
  const showResult = Boolean(
    currentQuestion && (submitted || (!isMock && (selectedAnswer || answerModeAllowed))),
  );
  const answeredCount = Object.keys(answers).length;
  const correctCount = useMemo(() => {
    if (isMock && !submitted) return 0;
    return questions.reduce((count, question) => {
      const selected = answers[question.id];
      return count + (selected && isForeignExchangeAnswerCorrect(question, selected) ? 1 : 0);
    }, 0);
  }, [answers, isMock, questions, submitted]);
  const wrongCount = submitted ? questions.length - correctCount : Math.max(0, answeredCount - correctCount);

  function chooseAnswer(answer: ForeignExchangeAnswerKey): void {
    if (!currentQuestion || submitted || answerModeAllowed || (!isMock && selectedAnswer)) return;
    setAnswers((current) => ({ ...current, [currentQuestion.id]: answer }));
    if (!isMock && currentQuestion.answer) {
      const isCorrect = isForeignExchangeAnswerCorrect(currentQuestion, answer);
      recordForeignExchangeAnswer({
        questionId: currentQuestion.id,
        selectedAnswer: answer,
        correctAnswer: currentQuestion.answer,
        isCorrect,
      });
      vibrateForAnswer(isCorrect);
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
    if (showResult && currentQuestion) {
      const accepted = acceptedForeignExchangeAnswers(currentQuestion);
      const answerReceivesCredit = currentQuestion.automaticCredit || currentQuestion.allAnsweredCredit
        ? selectedAnswer === answer
        : accepted.includes(answer);
      if (answerReceivesCredit) classes.push("is-correct");
      if (selectedAnswer === answer && !isForeignExchangeAnswerCorrect(currentQuestion, selectedAnswer)) classes.push("is-wrong");
    }
    return classes.join(" ");
  }

  function optionVisualStatus(answer: ForeignExchangeAnswerKey): ForeignExchangeAnswerVisualStatus {
    if (!currentQuestion) return null;
    if (!showResult) return selectedAnswer === answer ? "selected" : null;
    const accepted = acceptedForeignExchangeAnswers(currentQuestion);
    const receivesCredit = currentQuestion.automaticCredit || currentQuestion.allAnsweredCredit
      ? selectedAnswer === answer
      : accepted.includes(answer);
    if (receivesCredit) return "correct";
    if (selectedAnswer === answer) return "wrong";
    return null;
  }

  if (loading) return <LoadingState label="載入初階外匯" />;

  if (error) {
    return (
      <div className="page-stack">
        <GlassCard className="fx-empty">
          <h1>無法載入題庫</h1>
          <p>{error}</p>
          <div className="error-state-actions">
            <GlassButton
              variant="primary"
              onClick={() => {
                resetForeignExchangeQuestionCache();
                setLoadRevision((revision) => revision + 1);
              }}
            >
              重新載入題庫
            </GlassButton>
            <GlassLinkButton to="/foreign-exchange" variant="secondary">
              回初階外匯
            </GlassLinkButton>
          </div>
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
    <div className="page-stack fx-practice-page">
      {submitted ? (
        <GlassCard className="fx-result-banner">
          <div><span>測驗結果</span><strong>{correctCount} / {questions.length}</strong></div>
          <div>{Math.round((correctCount / questions.length) * 100)} 分</div>
        </GlassCard>
      ) : null}

      <div className="fx-quiz-shell">
        <GlassCard className="fx-question-card unified-question-card">
          <div ref={questionFocusRef} className="fx-question-focus-anchor" tabIndex={-1} />
          <div className="fx-question-top v90-quiz-header">
            <div className="v90-quiz-topline">
              <button type="button" className="v90-quiz-back" onClick={() => navigate(-1)} aria-label="返回上一頁">
                <ArrowLeft aria-hidden="true" size={19} />
              </button>
              <div className="v90-quiz-position">
                <strong>{currentIndex + 1} / {questions.length}</strong>
                <small>{modeTitle(mode, session, subject)}</small>
              </div>
            </div>
            <div className="fx-question-top-actions v90-quiz-actions">
              {isMock && !submitted ? (
                <QuizTimer seconds={secondsRemaining} mode="countdown" urgent={secondsRemaining <= 300} compact />
              ) : null}
              <button type="button" className={`fx-favorite${favoriteIds.has(currentQuestion.id) ? " is-active" : ""}`} onClick={toggleFavorite} aria-pressed={favoriteIds.has(currentQuestion.id)} aria-label="收藏題目">
                <Star aria-hidden="true" size={19} fill={favoriteIds.has(currentQuestion.id) ? "currentColor" : "none"} />
              </button>
            </div>
          </div>

          <div className="v90-quiz-meta-row">
            <span className="v90-question-type">單選題</span>
            <span>第{currentQuestion.session}屆</span>
            <span>{currentQuestion.bankTitle}</span>
          </div>

          <ProgressBar value={currentIndex + 1} max={questions.length} label={`第 ${currentIndex + 1} / ${questions.length} 題`} />

          <p className="fx-question-text">{formatLearnerText(currentQuestion.question)}</p>
          <div className="fx-options">
            {ANSWER_KEYS.map((answer) => (
              <button
                key={answer}
                type="button"
                className={optionClass(answer)}
                disabled={submitted || answerModeAllowed || (!isMock && Boolean(selectedAnswer))}
                onClick={() => chooseAnswer(answer)}
                aria-label={`${formatAnswerKey(answer)} ${formatLearnerText(currentQuestion.options[answer])}`}
              >
                <span className="fx-option-key">{formatAnswerKey(answer)}</span>
                <span className="fx-option-text">{formatLearnerText(currentQuestion.options[answer])}</span>
                <ForeignExchangeAnswerMark status={optionVisualStatus(answer)} />
              </button>
            ))}
          </div>

          {showResult ? (
            <details className="v90-explanation-disclosure" open>
              <summary><HandwrittenLabel name="show-explanation" text="查看解析" className="v91-explanation-label" /><ChevronUp aria-hidden="true" size={17} /></summary>
              <div className="fx-feedback-stack">
                <QuestionExplanationSurface className="fx-explanation" title="解析">
                  <p>{formatLearnerText(currentQuestion.explanation || "本題暫無解析。")}</p>
                </QuestionExplanationSurface>
              </div>
            </details>
          ) : null}

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
                      goToQuestion(index);
                      setQuestionListOpen(false);
                    }}
                  >
                    {index + 1}
                  </button>
                ))}
              </div>
            </section>
          ) : null}

          <div className="fx-quiz-actions v90-bottom-controls">
            <GlassButton variant="secondary" disabled={currentIndex === 0} onClick={() => goToQuestion(currentIndex - 1)}>
              <ChevronLeft aria-hidden="true" size={17} /><HandwrittenLabel name="previous" text="上一題" className="v91-control-label" />
            </GlassButton>
            <GlassButton variant="secondary" className="v90-question-list-trigger" onClick={() => setQuestionListOpen((open) => !open)}>
              <Grid2X2 aria-hidden="true" size={17} />題目列表
            </GlassButton>
            {currentIndex < questions.length - 1 ? (
              <GlassButton variant="primary" disabled={!isMock && !selectedAnswer && !answerModeAllowed} onClick={() => goToQuestion(currentIndex + 1)}>
                <HandwrittenLabel name="next" text="下一題" className="v91-control-label" /><ChevronRight aria-hidden="true" size={17} />
              </GlassButton>
            ) : isMock && !submitted ? (
              <GlassButton variant="primary" onClick={() => void submitMock()} disabled={submitting}>
                <Send aria-hidden="true" size={17} />{submitting ? "批改中" : <HandwrittenLabel name="submit" text="交卷" className="v91-control-label" />}
              </GlassButton>
            ) : (
              <GlassLinkButton to="/foreign-exchange" variant="primary">完成</GlassLinkButton>
            )}
          </div>
        </GlassCard>

        <aside className="fx-quiz-side">
          {isMock && !submitted ? (
            <GlassCard className="fx-side-card fx-submit-side-card">
              <h2>模擬考</h2>
              <p>完成後可直接交卷，未作答題目以未答計算。</p>
              <GlassButton variant="primary" onClick={() => void submitMock()} disabled={!answeredCount || submitting}>
                <Send aria-hidden="true" size={16} />{submitting ? "批改中" : "提前交卷"}
              </GlassButton>
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
                <button key={question.id} type="button" className={`fx-number-button${index === currentIndex ? " is-current" : ""}${answers[question.id] ? " is-answered" : ""}`} onClick={() => goToQuestion(index)} aria-label={`第 ${index + 1} 題`}>
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
