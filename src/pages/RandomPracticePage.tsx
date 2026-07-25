import {
  BookOpenCheck,
  ClipboardList,
  History,
  ListFilter,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState } from "../components/ErrorState";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { V93ConfirmDialog, V93InlineNotice } from "../components/V93InteractionPrimitives";
import { useAsync } from "../hooks/useAsync";
import {
  commitImageQuizSessionLearningAnswers,
  createImageQuizSession,
  deleteImageQuizSessions,
  getImageQuizSession,
  listImageQuizSessions,
  listUserAnswers,
  saveImageQuizSessionFeedbackMode,
  type ImageQuizSessionRecord,
} from "../lib/db";
import {
  loadImageBankQuestions,
  loadImageQuestionsByIds,
  isSecuritiesQuestionId,
  loadImageQuizBankSummaries,
  resetImageQuizCaches,
  startSecuritiesMock,
  type ImageQuizBank,
  type ImageQuizQuestion,
} from "../lib/imageQuiz";
import {
  MOCK_EXAM_FEEDBACK_SETTING_CHANGED,
  getMockExamDeferredFeedbackEnabled,
  setMockExamDeferredFeedbackEnabled,
} from "../lib/appSettings";
import { buildSessionId, calculateAccuracy, shuffleQuestions } from "../lib/quiz";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import { USER_STORAGE_SCOPE_CHANGED } from "../lib/userScopedStorage";
import { writeSecuritiesMockToken } from "../lib/securitiesMockTokenStore";
import {
  isMockExamSessionSubmitted,
  resolveMockExamFeedbackMode,
  shouldHidePendingMockExamResults,
} from "../lib/mockExam";
import type { UserAnswer } from "../types";
import "../styles/learner-experience-v65.css";
import "../styles/mock-exam-v66.css";

const DEFAULT_RANDOM_SIZE = 50;
const MIN_RANDOM_SIZE = 1;
const MAX_RANDOM_SIZE = 300;

const T = {
  loading: "載入模擬考測驗",
  title: "模擬考測驗",
  start: "開始模擬考",
  avoidAnswered: "避開已作答題目",
  customQuestionCount: "自訂題數",
  remaining: "剩餘",
  noAvailable: "這個科目目前沒有可抽取的題目。",
  progress: "進度",
  records: "測驗紀錄",
  noRecords: "目前還沒有模擬考測驗紀錄",
  accuracy: "答對率",
  correct: "答對",
  wrong: "答錯",
  answered: "已作答",
  completed: "已完成",
  unfinished: "未完成",
  continueTest: "繼續測驗",
  reviewWrong: "錯題複習",
  startError: "無法建立測驗",
  selectRecord: "選取紀錄",
  deleteMode: "刪除紀錄",
  deleteSelected: "刪除選取",
  cancelDelete: "取消",
  deleteConfirm: "確定要刪除選取的模擬考測驗紀錄嗎？",
  deletePending:
    "部分測驗的學習紀錄仍在整理，已先保留；請稍後再試一次。",
  proportionalHint: "依章節比例抽題",
};


type RandomPracticeData = {
  banks: ImageQuizBank[];
  sessions: ImageQuizSessionRecord[];
  answers: UserAnswer[];
};

async function loadRandomPracticeData(): Promise<RandomPracticeData> {
  const [banks, loadedSessions] = await Promise.all([
    loadImageQuizBankSummaries(),
    listImageQuizSessions(),
  ]);
  const sessionsWithPendingLearning = loadedSessions.filter(
    (session) =>
      Boolean(session.finishedAt) &&
      Object.values(session.answers).some(
        (answer) => answer.learningRecorded === false,
      ),
  );
  for (const session of sessionsWithPendingLearning) {
    try {
      const pendingQuestionIds = session.questionIds.filter(
        (questionId) => session.answers[questionId]?.learningRecorded === false,
      );
      const questions = await loadImageQuestionsByIds(pendingQuestionIds);
      await commitImageQuizSessionLearningAnswers(session.sessionId, questions);
    } catch (reason) {
      console.warn("Submitted mock-exam learning records will retry", reason);
    }
  }
  const [sessions, answers] = await Promise.all([
    sessionsWithPendingLearning.length
      ? listImageQuizSessions()
      : Promise.resolve(loadedSessions),
    listUserAnswers(),
  ]);
  return { banks, sessions, answers: answers.filter((answer) => isSecuritiesQuestionId(answer.questionId)) };
}

export function RandomPracticePage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [avoidAnswered, setAvoidAnswered] = useState(true);
  const [deferredFeedback, setDeferredFeedback] = useState(() =>
    getMockExamDeferredFeedbackEnabled(),
  );
  const [questionCount, setQuestionCount] = useState<number | "">(DEFAULT_RANDOM_SIZE);
  const [startingBankId, setStartingBankId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const [deleteConfirmationOpen, setDeleteConfirmationOpen] = useState(false);
  const [deleteBusy, setDeleteBusy] = useState(false);
  const [operationError, setOperationError] = useState<string | null>(null);
  const [operationMessage, setOperationMessage] = useState<string | null>(null);
  const { data, error, loading, retry } = useAsync(loadRandomPracticeData, [refreshKey]);

  useEffect(() => {
    function refreshMockExamSettings(): void {
      setDeferredFeedback(getMockExamDeferredFeedbackEnabled());
    }

    window.addEventListener(MOCK_EXAM_FEEDBACK_SETTING_CHANGED, refreshMockExamSettings);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refreshMockExamSettings);
    window.addEventListener("storage", refreshMockExamSettings);
    return () => {
      window.removeEventListener(MOCK_EXAM_FEEDBACK_SETTING_CHANGED, refreshMockExamSettings);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refreshMockExamSettings);
      window.removeEventListener("storage", refreshMockExamSettings);
    };
  }, []);

  function handleDeferredFeedbackChange(enabled: boolean): void {
    setMockExamDeferredFeedbackEnabled(enabled);
    const persistedEnabled = getMockExamDeferredFeedbackEnabled();
    setDeferredFeedback(persistedEnabled);

    if (persistedEnabled) {
      // Upgrade every unfinished legacy session. The quiz page also enforces
      // this immediately, so a fast click on「繼續測驗」cannot leak answers.
      for (const session of data?.sessions ?? []) {
        if (!session.finishedAt && session.feedbackMode !== "deferred") {
          void saveImageQuizSessionFeedbackMode(
            session.sessionId,
            "deferred",
          ).catch((reason) => {
            console.warn("Unable to upgrade pending mock exam grading mode", reason);
          });
        }
      }
    }
  }

  function normalizeQuestionCount(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_RANDOM_SIZE;
    return Math.min(MAX_RANDOM_SIZE, Math.max(MIN_RANDOM_SIZE, Math.round(value)));
  }

  async function handleStart(bank: ImageQuizBank): Promise<void> {
    if (startingBankId !== null) return;
    setStartingBankId(bank.bankId);
    setOperationError(null);
    setOperationMessage(null);

    try {
      const answeredIds = new Set((data?.answers ?? []).map((answer) => answer.questionId));
      const targetCount = normalizeQuestionCount(questionCount === "" ? DEFAULT_RANDOM_SIZE : questionCount);

      // Read preferences at click time so the persisted session always matches
      // the visible grading controls.
      const currentDeferredFeedback = getMockExamDeferredFeedbackEnabled();
      const feedbackMode = resolveMockExamFeedbackMode(
        false,
        currentDeferredFeedback,
      );
      setDeferredFeedback(currentDeferredFeedback);

      let questionIds: string[];
      let protectedMockToken: string | null = null;

      if (feedbackMode === "deferred") {
        const created = await startSecuritiesMock({
          bankId: bank.bankId,
          randomCount: targetCount,
          avoidIds: avoidAnswered ? Array.from(answeredIds) : [],
        });
        questionIds = created.questions.map((question) => question.id);
        protectedMockToken = created.mockToken;
      } else {
        const allQuestions = await loadImageBankQuestions(bank.bankId);
        const questions = buildProportionalMockExamQuestions({
          bank,
          allQuestions,
          answeredIds,
          avoidAnswered,
          targetCount,
        });
        questionIds = questions.map((question) => question.id);
      }

      if (questionIds.length === 0) {
        setOperationMessage(T.noAvailable);
        announceInteractionFeedback(T.noAvailable, "warning", 3600);
        return;
      }

      const sessionId = buildSessionId();
      await createImageQuizSession({
        sessionId,
        mode: "random80",
        bankId: bank.bankId,
        bankTitle: bank.bankTitle,
        questionIds,
        answers: {},
        wrongQuestionIds: [],
        startedAt: new Date().toISOString(),
        totalQuestions: questionIds.length,
        correctCount: 0,
        wrongCount: 0,
        accuracy: 0,
        feedbackMode,
        markedQuestionIds: [],
      });
      if (protectedMockToken) writeSecuritiesMockToken(sessionId, protectedMockToken);

      const persistedSession = await getImageQuizSession(sessionId);
      if (!persistedSession || persistedSession.feedbackMode !== feedbackMode) {
        throw new Error("Mock-exam grading mode was not persisted");
      }

      navigate(`/image-quiz/random/${bank.bankId}/${sessionId}`, {
        state: { mockExamFeedbackMode: feedbackMode },
      });
    } catch (reason) {
      console.error("Unable to create mock exam", reason);
      const errorMessage = reason instanceof Error
        ? reason.message
        : "模擬考建立失敗，請確認網路與題庫權限後再試一次。";
      setOperationError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4600);
    } finally {
      setStartingBankId(null);
    }
  }

  async function handleDeleteSelected(): Promise<void> {
    const sessionIds = Array.from(selectedSessionIds);
    if (sessionIds.length === 0 || deleteBusy) return;
    setDeleteBusy(true);
    setOperationError(null);
    setOperationMessage(null);
    try {
      const skippedSessionIds = await deleteImageQuizSessions(sessionIds);
      setSelectedSessionIds(new Set(skippedSessionIds));
      setDeleteMode(skippedSessionIds.length > 0);
      if (skippedSessionIds.length > 0) {
        setOperationMessage(T.deletePending);
        announceInteractionFeedback(T.deletePending, "warning", 4400);
      } else {
        const successMessage = `已刪除 ${sessionIds.length} 筆測驗紀錄。`;
        setOperationMessage(successMessage);
        announceInteractionFeedback(successMessage, "success");
      }
      setRefreshKey((key) => key + 1);
    } catch (reason) {
      const errorMessage = reason instanceof Error ? reason.message : "刪除測驗紀錄失敗。";
      setOperationError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4400);
    } finally {
      setDeleteBusy(false);
      setDeleteConfirmationOpen(false);
    }
  }

  function toggleSelected(sessionId: string, selected: boolean): void {
    setSelectedSessionIds((previous) => {
      const next = new Set(previous);
      if (selected) next.add(sessionId);
      else next.delete(sessionId);
      return next;
    });
  }

  if (loading) return <LoadingState label={T.loading} />;
  if (error) {
    return (
      <ErrorState
        title={T.startError}
        message={error}
        onRetry={() => {
          resetImageQuizCaches();
          retry();
        }}
      />
    );
  }

  const banks = data?.banks ?? [];
  const sessions = data?.sessions ?? [];
  const answers = data?.answers ?? [];
  const normalizedQuestionCount = normalizeQuestionCount(questionCount === "" ? DEFAULT_RANDOM_SIZE : questionCount);

  return (
    <div className="page-stack learner-page random-practice-page mock-exam-v68-page">
      {operationError ? <V93InlineNotice tone="error">{operationError}</V93InlineNotice> : null}
      {operationMessage ? <V93InlineNotice tone={operationMessage === T.deletePending || operationMessage === T.noAvailable ? "warning" : "success"}>{operationMessage}</V93InlineNotice> : null}

      <GlassCard className="mock-exam-console-v797" as="section" aria-labelledby="mock-exam-title">
        <div className="mock-exam-console-head-v797">
          <div className="mock-exam-console-title-v797">
            <span className="learner-section-icon" aria-hidden="true"><ClipboardList size={21} /></span>
            <div>
              <p className="eyebrow">Mock Exam</p>
              <h1 id="mock-exam-title">模擬考</h1>
            </div>
          </div>
          <span className="mock-exam-method-v797"><ListFilter size={16} aria-hidden="true" />依章節比例抽題</span>
        </div>

        <div className="mock-settings-grid-v797">
          <label className="mock-setting-card-v797 is-count">
            <span className="mock-setting-copy-v797"><small>題目數量</small><strong>自訂本次測驗規模</strong></span>
            <span className="random-number-input">
              <input
                type="number"
                min={MIN_RANDOM_SIZE}
                max={MAX_RANDOM_SIZE}
                inputMode="numeric"
                value={questionCount}
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setQuestionCount(value === "" ? "" : normalizeQuestionCount(Number(value)));
                }}
                onBlur={() => setQuestionCount(normalizedQuestionCount)}
              />
              <span aria-hidden="true">題</span>
            </span>
          </label>

          <label className="mock-setting-card-v797">
            <span className="mock-setting-copy-v797"><small>抽題策略</small><strong>{T.avoidAnswered}</strong></span>
            <input type="checkbox" checked={avoidAnswered} onChange={(event) => setAvoidAnswered(event.currentTarget.checked)} />
            <span className="random-switch" aria-hidden="true" />
          </label>

          <label className="mock-setting-card-v797">
            <span className="mock-setting-copy-v797">
              <small>批改方式</small>
              <strong>交卷後統一批改</strong>
              <span id="mock-exam-feedback-state" className="mock-setting-state-v797">
                {deferredFeedback
                  ? "作答期間不顯示正解，交卷後統一批改"
                  : "每題作答後立即顯示正解與解析"}
              </span>
            </span>
            <input
              type="checkbox"
              checked={deferredFeedback}
              aria-describedby="mock-exam-feedback-state"
              onChange={(event) => handleDeferredFeedbackChange(event.currentTarget.checked)}
            />
            <span className="random-switch" aria-hidden="true" />
          </label>
        </div>
      </GlassCard>

      <section className="random-subject-section" aria-labelledby="random-subject-title">
        <div className="learner-section-heading">
          <div>
            <p className="eyebrow">Choose a subject</p>
            <h2 id="random-subject-title">選擇模考科目</h2>
          </div>
          <span className="learner-count-pill">{banks.length} 科</span>
        </div>

        {banks.length === 0 ? (
          <GlassCard className="learner-empty-state">
            <BookOpenCheck aria-hidden="true" size={28} />
            <h3>目前沒有可用科目</h3>
            <p>題庫完成載入後，科目會顯示在這裡。</p>
          </GlassCard>
        ) : (
          <div className="random-bank-grid">
            {banks.map((bank) => {
              const total = bank.chapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);
              const answeredCount = countAnsweredQuestionsForBank(bank.bankId, answers);
              const availableCount = Math.max(0, total - answeredCount);
              const drawableCount = avoidAnswered ? availableCount : total;
              const sessionQuestionCount = Math.min(normalizedQuestionCount, drawableCount);
              const progress = calculateAccuracy(answeredCount, total);

              return (
                <GlassCard key={bank.bankId} className="bank-card random-bank-card" interactive as="article">
                  <div className="random-bank-header">
                    <div className="learner-section-icon" aria-hidden="true"><BookOpenCheck size={20} /></div>
                    <div><h3>{bank.bankTitle}</h3><p>{bank.chapters.length} 個章節 · {T.proportionalHint}</p></div>
                    <span className="random-progress-badge">{progress}%</span>
                  </div>
                  <div className="random-bank-progress">
                    <span><strong>{T.progress}</strong><small>{progress > 0 ? "持續累積中" : "從第一題開始"}</small></span>
                    <progress value={progress} max={100} aria-label={`${bank.bankTitle}練習進度 ${progress}%`} />
                  </div>
                  <dl className="random-bank-stats">
                    <div><dt>題庫</dt><dd>{total.toLocaleString("zh-TW")} 題</dd></div>
                    <div><dt>{avoidAnswered ? T.remaining : "可抽題數"}</dt><dd>{drawableCount.toLocaleString("zh-TW")} 題</dd></div>
                    <div className="is-primary"><dt>本次</dt><dd>{sessionQuestionCount} 題</dd></div>
                  </dl>
                  <GlassButton
                    variant="primary"
                    className="random-start-button"
                    onClick={() => void handleStart(bank)}
                    busy={startingBankId === bank.bankId}
                    disabled={sessionQuestionCount <= 0 || startingBankId !== null}
                    aria-label={`${T.start} ${bank.bankTitle} ${sessionQuestionCount} 題`}
                  >
                    <Play aria-hidden="true" size={18} />
                    <span>
                      {startingBankId === bank.bankId
                        ? "建立中…"
                        : sessionQuestionCount > 0
                          ? `${T.start} · ${sessionQuestionCount} 題`
                          : T.noAvailable}
                    </span>
                  </GlassButton>
                </GlassCard>
              );
            })}
          </div>
        )}
      </section>

      <section className="review-section random-record-section" aria-labelledby="random-record-title">
        <div className="learner-section-heading">
          <div><p className="eyebrow">Recent sessions</p><h2 id="random-record-title">{T.records}</h2></div>
          <div className="section-actions">
            <span className="learner-count-pill">{sessions.length} 筆</span>
            {deleteMode ? (
              <>
                <GlassButton variant="secondary" onClick={() => { setDeleteMode(false); setSelectedSessionIds(new Set()); }}>{T.cancelDelete}</GlassButton>
                <GlassButton variant="danger" disabled={selectedSessionIds.size === 0 || deleteBusy} onClick={() => setDeleteConfirmationOpen(true)}><Trash2 aria-hidden="true" size={17} /><span>{T.deleteSelected} {selectedSessionIds.size}</span></GlassButton>
              </>
            ) : sessions.length > 0 ? (
              <GlassButton variant="secondary" onClick={() => setDeleteMode(true)}><Trash2 aria-hidden="true" size={17} /><span>{T.deleteMode}</span></GlassButton>
            ) : null}
          </div>
        </div>
        {sessions.length === 0 ? (
          <GlassCard className="learner-empty-state"><History aria-hidden="true" size={28} /><h3>{T.noRecords}</h3><p>完成或暫停一場測驗後，進度會自動保留在這裡。</p></GlassCard>
        ) : (
          <div className="record-list">
            {sessions.map((session) => <SessionRecordCard key={session.sessionId} session={session} showSelection={deleteMode} selected={selectedSessionIds.has(session.sessionId)} onSelectedChange={toggleSelected} />)}
          </div>
        )}
      </section>

      <V93ConfirmDialog
        open={deleteConfirmationOpen}
        title="刪除測驗紀錄"
        message={`確定要刪除選取的 ${selectedSessionIds.size} 筆模擬考紀錄嗎？此操作不會刪除已同步的學習作答。`}
        confirmLabel={deleteBusy ? "刪除中" : "刪除紀錄"}
        busy={deleteBusy}
        onConfirm={() => void handleDeleteSelected()}
        onCancel={() => setDeleteConfirmationOpen(false)}
      />
    </div>
  );
}

function SessionRecordCard({ session, showSelection, selected, onSelectedChange }: { session: ImageQuizSessionRecord; showSelection: boolean; selected: boolean; onSelectedChange: (sessionId: string, selected: boolean) => void }) {
  const date = new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(session.finishedAt ?? session.startedAt));
  const answeredCount = Object.keys(session.answers).length;
  const isCompleted = isMockExamSessionSubmitted(session);
  const hidePendingResults = shouldHidePendingMockExamResults(
    session.feedbackMode,
    isCompleted,
  );
  const completionRate = calculateAccuracy(answeredCount, session.totalQuestions);

  return (
    <GlassCard className={`record-card ${showSelection ? "is-selecting" : ""}`} as="article">
      {showSelection ? <label className="record-select"><input type="checkbox" checked={selected} aria-label={`${T.selectRecord} ${session.bankTitle} ${date}`} onChange={(event) => onSelectedChange(session.sessionId, event.currentTarget.checked)} /></label> : null}
      <div className="random-record-main">
        <div className="random-record-heading"><div><p className="eyebrow">{date}</p><h3>{session.bankTitle}</h3></div><span className={`random-session-status ${isCompleted ? "is-completed" : "is-pending"}`}>{isCompleted ? T.completed : T.unfinished}</span></div>
        <div className="random-session-progress"><span>{T.answered} <strong>{answeredCount} / {session.totalQuestions}</strong></span><span>{completionRate}%</span><progress value={answeredCount} max={Math.max(session.totalQuestions, 1)} aria-label={`${session.bankTitle} 作答進度 ${completionRate}%`} /></div>
      </div>
      <dl className="record-metrics"><div><dt>{T.accuracy}</dt><dd>{hidePendingResults ? "—" : `${session.accuracy}%`}</dd></div><div><dt>{T.correct}</dt><dd>{hidePendingResults ? "—" : session.correctCount}</dd></div><div><dt>{T.wrong}</dt><dd>{hidePendingResults ? "—" : session.wrongCount}</dd></div></dl>
      <div className="button-row random-record-actions">
        {!isCompleted ? (
          <GlassLinkButton to={`/image-quiz/random/${session.bankId}/${session.sessionId}`} variant="primary"><RotateCcw aria-hidden="true" size={18} /><span>{T.continueTest}</span></GlassLinkButton>
        ) : session.wrongQuestionIds.length > 0 ? (
          <GlassLinkButton to={`/image-quiz/session-wrong/${session.sessionId}`} variant="secondary">{T.reviewWrong}</GlassLinkButton>
        ) : (
          <span className="random-record-complete-label">全數答對</span>
        )}
      </div>
    </GlassCard>
  );
}

type ProportionalMockExamInput = {
  bank: ImageQuizBank;
  allQuestions: ImageQuizQuestion[];
  answeredIds: Set<string>;
  avoidAnswered: boolean;
  targetCount: number;
};

type ChapterQuestionBucket = {
  chapterId: string;
  questionCount: number;
  questions: ImageQuizQuestion[];
};

function buildProportionalMockExamQuestions({ bank, allQuestions, answeredIds, avoidAnswered, targetCount }: ProportionalMockExamInput): ImageQuizQuestion[] {
  const questionById = new Map(allQuestions.map((question) => [question.id, question]));
  const buckets: ChapterQuestionBucket[] = bank.chapters
    .map((chapter) => ({
      chapterId: chapter.chapterId,
      questionCount: chapter.questionCount,
      questions: shuffleQuestions(chapter.questions.map((questionRef) => questionById.get(questionRef.id)).filter((question): question is ImageQuizQuestion => Boolean(question)).filter((question) => !avoidAnswered || !answeredIds.has(question.id))),
    }))
    .filter((bucket) => bucket.questions.length > 0);

  const availableTotal = buckets.reduce((sum, bucket) => sum + bucket.questions.length, 0);
  const drawTotal = Math.min(targetCount, availableTotal);
  if (drawTotal <= 0 || availableTotal <= 0) return [];

  const quotas = buckets.map((bucket, index) => {
    const rawQuota = (drawTotal * bucket.questions.length) / availableTotal;
    return { bucket, index, count: Math.min(bucket.questions.length, Math.floor(rawQuota)), remainder: rawQuota - Math.floor(rawQuota) };
  });
  let allocated = quotas.reduce((sum, quota) => sum + quota.count, 0);
  for (const quota of [...quotas].sort((a, b) => b.remainder - a.remainder || b.bucket.questions.length - a.bucket.questions.length || a.index - b.index)) {
    if (allocated >= drawTotal) break;
    if (quota.count < quota.bucket.questions.length) { quota.count += 1; allocated += 1; }
  }
  return shuffleQuestions(quotas.flatMap((quota) => quota.bucket.questions.slice(0, quota.count)));
}

function countAnsweredQuestionsForBank(
  bankId: string,
  answers: UserAnswer[],
): number {
  const acceptedBankIds = bankId === "securities-laws-practice"
    ? new Set([
        "securities-laws-practice",
        "securities-trading-regulations",
        "securities-trading-practice",
      ])
    : new Set([bankId]);

  return new Set(
    answers
      .filter((answer) => acceptedBankIds.has(answer.bankId))
      .map((answer) => answer.questionId),
  ).size;
}
