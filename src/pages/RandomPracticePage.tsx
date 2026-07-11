import {
  BookOpenCheck,
  ClipboardList,
  History,
  ListFilter,
  Play,
  RotateCcw,
  Trash2,
} from "lucide-react";
import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { ErrorState } from "../components/ErrorState";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { useAsync } from "../hooks/useAsync";
import {
  createImageQuizSession,
  deleteImageQuizSessions,
  listImageQuizSessions,
  listUserAnswers,
  type ImageQuizSessionRecord,
} from "../lib/db";
import {
  loadImageBankQuestions,
  loadImageQuizBanks,
  type ImageQuizBank,
  type ImageQuizQuestion,
} from "../lib/imageQuiz";
import { buildSessionId, calculateAccuracy, shuffleQuestions } from "../lib/quiz";
import type { UserAnswer } from "../types";
import "../styles/learner-experience-v65.css";
import "../styles/mock-exam-v66.css";

const DEFAULT_RANDOM_SIZE = 50;
const MIN_RANDOM_SIZE = 1;
const MAX_RANDOM_SIZE = 300;

const T = {
  loading: "載入模擬考測驗",
  title: "模擬考測驗",
  description: "選擇一個科目並自訂題數。系統只記錄實際練習時間，不設倒數壓力。",
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
  proportionalHint: "依章節比例抽題",
};

const EXAM_RULES = [
  "僅提供單科模擬考，可自訂 1–300 題。",
  "作答期間不倒數，系統只記錄實際練習時間。",
  "可選擇交卷後統一批改，作答進度會自動保存。",
] as const;

type RandomPracticeData = {
  banks: ImageQuizBank[];
  sessions: ImageQuizSessionRecord[];
  answers: UserAnswer[];
};

async function loadRandomPracticeData(): Promise<RandomPracticeData> {
  const [banks, sessions, answers] = await Promise.all([
    loadImageQuizBanks(),
    listImageQuizSessions(),
    listUserAnswers(),
  ]);
  return { banks, sessions, answers };
}

export function RandomPracticePage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [avoidAnswered, setAvoidAnswered] = useState(true);
  const [deferredFeedback, setDeferredFeedback] = useState(true);
  const [questionCount, setQuestionCount] = useState<number | "">(DEFAULT_RANDOM_SIZE);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const { data, error, loading } = useAsync(loadRandomPracticeData, [refreshKey]);

  function normalizeQuestionCount(value: number): number {
    if (!Number.isFinite(value)) return DEFAULT_RANDOM_SIZE;
    return Math.min(MAX_RANDOM_SIZE, Math.max(MIN_RANDOM_SIZE, Math.round(value)));
  }

  async function handleStart(bank: ImageQuizBank): Promise<void> {
    const allQuestions = await loadImageBankQuestions(bank.bankId);
    const answeredIds = new Set((data?.answers ?? []).map((answer) => answer.questionId));
    const targetCount = normalizeQuestionCount(questionCount === "" ? DEFAULT_RANDOM_SIZE : questionCount);
    const questions = buildProportionalMockExamQuestions({
      bank,
      allQuestions,
      answeredIds,
      avoidAnswered,
      targetCount,
    });

    if (questions.length === 0) {
      window.alert(T.noAvailable);
      return;
    }

    const sessionId = buildSessionId();
    await createImageQuizSession({
      sessionId,
      mode: "random80",
      bankId: bank.bankId,
      bankTitle: bank.bankTitle,
      questionIds: questions.map((question) => question.id),
      answers: {},
      wrongQuestionIds: [],
      startedAt: new Date().toISOString(),
      totalQuestions: questions.length,
      correctCount: 0,
      wrongCount: 0,
      accuracy: 0,
      feedbackMode: deferredFeedback ? "deferred" : "immediate",
      markedQuestionIds: [],
    });
    navigate(`/image-quiz/random/${bank.bankId}/${sessionId}`);
  }

  async function handleDeleteSelected(): Promise<void> {
    const sessionIds = Array.from(selectedSessionIds);
    if (sessionIds.length === 0 || !window.confirm(T.deleteConfirm)) return;
    await deleteImageQuizSessions(sessionIds);
    setSelectedSessionIds(new Set());
    setDeleteMode(false);
    setRefreshKey((key) => key + 1);
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
  if (error) return <ErrorState title={T.startError} message={error} />;

  const banks = data?.banks ?? [];
  const sessions = data?.sessions ?? [];
  const answers = data?.answers ?? [];
  const answeredIds = new Set(answers.map((answer) => answer.questionId));
  const normalizedQuestionCount = normalizeQuestionCount(questionCount === "" ? DEFAULT_RANDOM_SIZE : questionCount);

  return (
    <div className="page-stack learner-page random-practice-page mock-exam-v68-page">
      <GlassCard className="mock-rules-card-v68" as="section" aria-labelledby="mock-rules-title">
        <div className="mock-rules-heading-v68">
          <span className="learner-section-icon" aria-hidden="true"><ClipboardList size={20} /></span>
          <div>
            <p className="eyebrow">Mock Exam Rules</p>
            <h1 id="mock-rules-title">模擬考規則</h1>
            <p>{T.description}</p>
          </div>
        </div>
        <ul>{EXAM_RULES.map((rule) => <li key={rule}>{rule}</li>)}</ul>
      </GlassCard>

      <GlassCard className="random-builder-card mock-builder-v68" as="section" aria-labelledby="random-builder-title">
        <div className="random-builder-heading">
          <div className="learner-section-icon" aria-hidden="true"><ListFilter size={20} /></div>
          <div>
            <p className="eyebrow">Setup</p>
            <h2 id="random-builder-title">設定模擬考</h2>
            <p>輸入本次題數，再選擇科目開始作答。</p>
          </div>
        </div>

        <div className="mock-settings-grid-v68">
          <label className="random-count-input-label mock-count-only-v68">
            <span>{T.customQuestionCount}</span>
            <span className="random-number-input">
              <input
                type="number"
                min={MIN_RANDOM_SIZE}
                max={MAX_RANDOM_SIZE}
                inputMode="numeric"
                value={questionCount}
                aria-describedby="random-count-range"
                onChange={(event) => {
                  const value = event.currentTarget.value;
                  setQuestionCount(value === "" ? "" : normalizeQuestionCount(Number(value)));
                }}
                onBlur={() => setQuestionCount(normalizedQuestionCount)}
              />
              <span aria-hidden="true">題</span>
            </span>
            <small id="random-count-range">可設定 {MIN_RANDOM_SIZE}–{MAX_RANDOM_SIZE} 題</small>
          </label>

          <label className="random-answer-toggle">
            <input type="checkbox" checked={avoidAnswered} onChange={(event) => setAvoidAnswered(event.currentTarget.checked)} />
            <span className="random-toggle-copy"><strong>{T.avoidAnswered}</strong><small>{avoidAnswered ? "優先探索尚未練過的題目" : "已作答題目也可能再次出現"}</small></span>
            <span className="random-switch" aria-hidden="true" />
          </label>

          <label className="random-answer-toggle">
            <input type="checkbox" checked={deferredFeedback} onChange={(event) => setDeferredFeedback(event.currentTarget.checked)} />
            <span className="random-toggle-copy"><strong>交卷後統一批改</strong><small>{deferredFeedback ? "作答時不顯示答案與解析" : "每題作答後立即顯示解析"}</small></span>
            <span className="random-switch" aria-hidden="true" />
          </label>
        </div>
      </GlassCard>

      <section className="random-subject-section" aria-labelledby="random-subject-title">
        <div className="learner-section-heading">
          <div>
            <p className="eyebrow">Choose a subject</p>
            <h2 id="random-subject-title">選擇模考科目</h2>
            <p>系統依章節題量比例抽題，維持科目內合理分布。</p>
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
              const availableCount = bank.chapters.flatMap((chapter) => chapter.questions).filter((question) => !answeredIds.has(question.id)).length;
              const drawableCount = avoidAnswered ? availableCount : total;
              const sessionQuestionCount = Math.min(normalizedQuestionCount, drawableCount);
              const progress = calculateBankProgress(bank, answers);

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
                  <GlassButton variant="primary" className="random-start-button" onClick={() => void handleStart(bank)} disabled={sessionQuestionCount <= 0}>
                    <Play aria-hidden="true" size={18} />
                    <span>{sessionQuestionCount > 0 ? `${T.start} · ${sessionQuestionCount} 題` : T.noAvailable}</span>
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
                <GlassButton variant="danger" disabled={selectedSessionIds.size === 0} onClick={() => void handleDeleteSelected()}><Trash2 aria-hidden="true" size={17} /><span>{T.deleteSelected} {selectedSessionIds.size}</span></GlassButton>
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
    </div>
  );
}

function SessionRecordCard({ session, showSelection, selected, onSelectedChange }: { session: ImageQuizSessionRecord; showSelection: boolean; selected: boolean; onSelectedChange: (sessionId: string, selected: boolean) => void }) {
  const date = new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(session.finishedAt ?? session.startedAt));
  const answeredCount = Object.keys(session.answers).length;
  const isCompleted = Boolean(session.finishedAt) || answeredCount >= session.totalQuestions;
  const completionRate = calculateAccuracy(answeredCount, session.totalQuestions);

  return (
    <GlassCard className={`record-card ${showSelection ? "is-selecting" : ""}`} as="article">
      {showSelection ? <label className="record-select"><input type="checkbox" checked={selected} aria-label={`${T.selectRecord} ${session.bankTitle} ${date}`} onChange={(event) => onSelectedChange(session.sessionId, event.currentTarget.checked)} /></label> : null}
      <div className="random-record-main">
        <div className="random-record-heading"><div><p className="eyebrow">{date}</p><h3>{session.bankTitle}</h3></div><span className={`random-session-status ${isCompleted ? "is-completed" : "is-pending"}`}>{isCompleted ? T.completed : T.unfinished}</span></div>
        <div className="random-session-progress"><span>{T.answered} <strong>{answeredCount} / {session.totalQuestions}</strong></span><span>{completionRate}%</span><progress value={answeredCount} max={Math.max(session.totalQuestions, 1)} aria-label={`${session.bankTitle} 作答進度 ${completionRate}%`} /></div>
      </div>
      <dl className="record-metrics"><div><dt>{T.accuracy}</dt><dd>{session.accuracy}%</dd></div><div><dt>{T.correct}</dt><dd>{session.correctCount}</dd></div><div><dt>{T.wrong}</dt><dd>{session.wrongCount}</dd></div></dl>
      <div className="button-row random-record-actions">
        {!isCompleted ? <GlassLinkButton to={`/image-quiz/random/${session.bankId}/${session.sessionId}`} variant="primary"><RotateCcw aria-hidden="true" size={18} /><span>{T.continueTest}</span></GlassLinkButton> : null}
        {session.wrongQuestionIds.length > 0 ? <GlassLinkButton to={`/image-quiz/session-wrong/${session.sessionId}`} variant="secondary">{T.reviewWrong}</GlassLinkButton> : null}
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

function calculateBankProgress(bank: ImageQuizBank, answers: UserAnswer[]): number {
  const questionIds = new Set(bank.chapters.flatMap((chapter) => chapter.questions.map((question) => question.id)));
  const answeredIds = new Set(answers.filter((answer) => questionIds.has(answer.questionId)).map((answer) => answer.questionId));
  return calculateAccuracy(answeredIds.size, questionIds.size);
}
