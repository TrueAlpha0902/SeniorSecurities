import {
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  History,
  ListFilter,
  Play,
  RotateCcw,
  Sparkles,
  Target,
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
import { loadImageBankQuestions, loadImageQuizBanks, type ImageQuizBank, type ImageQuizQuestion } from "../lib/imageQuiz";
import { buildSessionId, calculateAccuracy, shuffleQuestions } from "../lib/quiz";
import type { UserAnswer } from "../types";
import "../styles/learner-experience-v65.css";

const DEFAULT_RANDOM_SIZE = 50;
const MIN_RANDOM_SIZE = 1;
const MAX_RANDOM_SIZE = 300;
const QUICK_RANDOM_SIZES = [25, 50, 80, 100] as const;

const T = {
  loading: "載入單科隨機測驗",
  title: "單科隨機測驗",
  description: "每次從單一科目依各章節題庫比例抽題，預設 50 題，也可以依自己的時間自訂練習題數。退出或完成後會保留當次答對率與錯題複習。",
  subject: "科目",
  chapter: "章",
  question: "題",
  start: "測驗開始",
  avoidAnswered: "避開已作答題目",
  questionCount: "每次練習題數",
  questionCountHint: "預設 50 題，系統會依各章節題庫比例分配抽題。若可用題目不足，會以目前可抽題數為準。",
  proportionalHint: "依章節比例抽題",
  customQuestionCount: "自訂題數",
  remaining: "剩餘",
  noAvailable: "這個科目目前沒有可抽取的題目。",
  progress: "進度",
  records: "測驗紀錄",
  noRecords: "目前還沒有單科隨機測驗紀錄",
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
  deleteConfirm: "確定要刪除選取的單科隨機測驗紀錄嗎？",
  examRules: "證券高業考試規定",
  examRulesNote: "這裡是單科隨機測驗並會逐題回饋；完整三科、統一交卷後批改的正式模考將另行提供。",
  questionsUnit: "題",
  minutesUnit: "分鐘",
  totalRules: "合計 150 題 / 210 分鐘",
};

const SENIOR_SECURITIES_EXAM_RULES = [
  { subject: "投資學", questions: 50, minutes: 60 },
  { subject: "財務分析", questions: 50, minutes: 90 },
  { subject: "證券交易相關法規與實務", questions: 50, minutes: 60 },
];

type RandomPracticeData = {
  banks: ImageQuizBank[];
  sessions: ImageQuizSessionRecord[];
  answers: UserAnswer[];
};

async function loadRandomPracticeData(): Promise<RandomPracticeData> {
  const [banks, sessions, answers] = await Promise.all([loadImageQuizBanks(), listImageQuizSessions(), listUserAnswers()]);
  return { banks, sessions, answers };
}

export function RandomPracticePage() {
  const navigate = useNavigate();
  const [refreshKey, setRefreshKey] = useState(0);
  const [avoidAnswered, setAvoidAnswered] = useState(true);
  const [questionCount, setQuestionCount] = useState<number | "">(DEFAULT_RANDOM_SIZE);
  const [deleteMode, setDeleteMode] = useState(false);
  const [selectedSessionIds, setSelectedSessionIds] = useState<Set<string>>(new Set());
  const { data, error, loading } = useAsync(loadRandomPracticeData, [refreshKey]);

  function normalizeQuestionCount(value: number): number {
    if (!Number.isFinite(value)) {
      return DEFAULT_RANDOM_SIZE;
    }
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
    const startedAt = new Date().toISOString();
    const sessionId = buildSessionId();
    await createImageQuizSession({
      sessionId,
      mode: "random80",
      bankId: bank.bankId,
      bankTitle: bank.bankTitle,
      questionIds: questions.map((question) => question.id),
      answers: {},
      wrongQuestionIds: [],
      startedAt,
      totalQuestions: questions.length,
      correctCount: 0,
      wrongCount: 0,
      accuracy: 0,
    });
    navigate(`/image-quiz/random/${bank.bankId}/${sessionId}`);
  }

  async function handleDeleteSelected(): Promise<void> {
    const sessionIds = Array.from(selectedSessionIds);
    if (sessionIds.length === 0) {
      return;
    }

    const confirmed = window.confirm(T.deleteConfirm);
    if (!confirmed) {
      return;
    }

    await deleteImageQuizSessions(sessionIds);
    setSelectedSessionIds(new Set());
    setDeleteMode(false);
    setRefreshKey((key) => key + 1);
  }

  function toggleSelected(sessionId: string, selected: boolean): void {
    setSelectedSessionIds((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(sessionId);
      } else {
        next.delete(sessionId);
      }
      return next;
    });
  }

  if (loading) {
    return <LoadingState label={T.loading} />;
  }

  if (error) {
    return <ErrorState title={T.startError} message={error} />;
  }

  const banks = data?.banks ?? [];
  const sessions = data?.sessions ?? [];
  const answers = data?.answers ?? [];
  const answeredIds = new Set(answers.map((answer) => answer.questionId));
  const normalizedQuestionCount = normalizeQuestionCount(questionCount === "" ? DEFAULT_RANDOM_SIZE : questionCount);
  const bankQuestionIds = new Set(
    banks.flatMap((bank) => bank.chapters.flatMap((chapter) => chapter.questions.map((question) => question.id))),
  );
  const totalQuestionCount = banks.reduce(
    (bankSum, bank) => bankSum + bank.chapters.reduce((chapterSum, chapter) => chapterSum + chapter.questionCount, 0),
    0,
  );
  const completedQuestionCount = Array.from(answeredIds).filter((questionId) => bankQuestionIds.has(questionId)).length;
  const remainingQuestionCount = Math.max(0, totalQuestionCount - completedQuestionCount);
  const overallProgress = calculateAccuracy(completedQuestionCount, totalQuestionCount);

  return (
    <div className="page-stack learner-page random-practice-page">
      <GlassCard className="learner-hero random-practice-hero">
        <div className="learner-hero-copy">
          <div className="learner-title-icon" aria-hidden="true">
            <Sparkles size={22} />
          </div>
          <div>
            <p className="eyebrow">Mock Exam</p>
            <h1>{T.title}</h1>
            <p>{T.description}</p>
          </div>
        </div>

        <div className="learner-kpi-grid" aria-label="練習進度摘要">
          <div className="learner-kpi">
            <span><BookOpenCheck aria-hidden="true" size={17} /> 題庫總量</span>
            <strong>{totalQuestionCount.toLocaleString("zh-TW")} <small>題</small></strong>
          </div>
          <div className="learner-kpi">
            <span><CheckCircle2 aria-hidden="true" size={17} /> 已練習</span>
            <strong>{completedQuestionCount.toLocaleString("zh-TW")} <small>題</small></strong>
            <progress value={completedQuestionCount} max={Math.max(totalQuestionCount, 1)} aria-label={`整體練習進度 ${overallProgress}%`} />
          </div>
          <div className="learner-kpi is-accent">
            <span><Target aria-hidden="true" size={17} /> 本次目標</span>
            <strong>{normalizedQuestionCount} <small>題</small></strong>
            <small>尚有 {remainingQuestionCount.toLocaleString("zh-TW")} 題待練習</small>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="random-builder-card" as="section" aria-labelledby="random-builder-title">
        <div className="random-builder-heading">
          <div className="learner-section-icon" aria-hidden="true"><ListFilter size={20} /></div>
          <div>
            <h2 id="random-builder-title">設定本次練習</h2>
            <p>{T.questionCountHint}</p>
          </div>
        </div>

        <div className="random-quiz-options">
          <fieldset className="random-count-panel">
            <legend>{T.questionCount}</legend>
            <div className="random-count-quick-actions" aria-label="快速選擇題數">
              {QUICK_RANDOM_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`random-count-chip ${normalizedQuestionCount === size ? "is-active" : ""}`}
                  aria-pressed={normalizedQuestionCount === size}
                  onClick={() => setQuestionCount(size)}
                >
                  <strong>{size}</strong>
                  <span>{T.question}</span>
                </button>
              ))}
            </div>
          </fieldset>

          <label className="random-count-input-label">
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
            <input
              type="checkbox"
              checked={avoidAnswered}
              onChange={(event) => setAvoidAnswered(event.currentTarget.checked)}
            />
            <span className="random-toggle-copy">
              <strong>{T.avoidAnswered}</strong>
              <small>{avoidAnswered ? "優先探索尚未練過的題目" : "已作答題目也可能再次出現"}</small>
            </span>
            <span className="random-switch" aria-hidden="true" />
          </label>
        </div>
      </GlassCard>

      <section className="random-subject-section" aria-labelledby="random-subject-title">
        <div className="learner-section-heading">
          <div>
            <p className="eyebrow">Choose a subject</p>
            <h2 id="random-subject-title">選擇練習科目</h2>
            <p>每科都會依章節題量自動分配，選好後即可開始。</p>
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
          const availableCount = bank.chapters
            .flatMap((chapter) => chapter.questions)
            .filter((question) => !answeredIds.has(question.id)).length;
          const drawableCount = avoidAnswered ? availableCount : total;
          const sessionQuestionCount = Math.min(normalizedQuestionCount, drawableCount);
          const progress = calculateBankProgress(bank, answers);
          return (
            <GlassCard key={bank.bankId} className="bank-card random-bank-card" interactive as="article">
              <div className="random-bank-header">
                <div className="learner-section-icon" aria-hidden="true"><BookOpenCheck size={20} /></div>
                <div>
                  <h3>{bank.bankTitle}</h3>
                  <p>{bank.chapters.length} 個章節 · {T.proportionalHint}</p>
                </div>
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

      <GlassCard className="exam-rules-card learner-exam-rules" as="section" aria-label={T.examRules}>
        <div className="exam-rules-heading">
          <div className="learner-section-icon" aria-hidden="true"><ClipboardList size={20} /></div>
          <div>
            <p className="eyebrow">Exam Rules</p>
            <h2>{T.examRules}</h2>
            <p>{T.examRulesNote}</p>
          </div>
          <span className="learner-count-pill">{T.totalRules}</span>
        </div>
        <div className="exam-rule-grid">
          {SENIOR_SECURITIES_EXAM_RULES.map((rule) => (
            <div key={rule.subject} className="exam-rule-item">
              <strong>{rule.subject}</strong>
              <span>{rule.questions} {T.questionsUnit}</span>
              <span>{rule.minutes} {T.minutesUnit}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      <section className="review-section random-record-section" aria-labelledby="random-record-title">
        <div className="learner-section-heading">
          <div>
            <p className="eyebrow">Recent sessions</p>
            <h2 id="random-record-title">{T.records}</h2>
          </div>
          <div className="section-actions">
            <span className="learner-count-pill">{sessions.length} 筆</span>
            {deleteMode ? (
              <>
                <GlassButton variant="secondary" onClick={() => {
                  setDeleteMode(false);
                  setSelectedSessionIds(new Set());
                }}>
                  {T.cancelDelete}
                </GlassButton>
                <GlassButton variant="danger" disabled={selectedSessionIds.size === 0} onClick={() => void handleDeleteSelected()}>
                  <Trash2 aria-hidden="true" size={17} />
                  <span>
                    {T.deleteSelected} {selectedSessionIds.size}
                  </span>
                </GlassButton>
              </>
            ) : sessions.length > 0 ? (
              <GlassButton variant="secondary" onClick={() => setDeleteMode(true)}>
                <Trash2 aria-hidden="true" size={17} />
                <span>{T.deleteMode}</span>
              </GlassButton>
            ) : null}
          </div>
        </div>
        {sessions.length === 0 ? (
          <GlassCard className="learner-empty-state">
            <History aria-hidden="true" size={28} />
            <h3>{T.noRecords}</h3>
            <p>完成或暫停一場測驗後，進度會自動保留在這裡。</p>
          </GlassCard>
        ) : (
          <div className="record-list">
            {sessions.map((session) => (
              <SessionRecordCard
                key={session.sessionId}
                session={session}
                showSelection={deleteMode}
                selected={selectedSessionIds.has(session.sessionId)}
                onSelectedChange={toggleSelected}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function SessionRecordCard({
  session,
  showSelection,
  selected,
  onSelectedChange,
}: {
  session: ImageQuizSessionRecord;
  showSelection: boolean;
  selected: boolean;
  onSelectedChange: (sessionId: string, selected: boolean) => void;
}) {
  const date = new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(session.finishedAt ?? session.startedAt));
  const answeredCount = Object.keys(session.answers).length;
  const isCompleted = Boolean(session.finishedAt) || answeredCount >= session.totalQuestions;
  const completionRate = calculateAccuracy(answeredCount, session.totalQuestions);

  return (
    <GlassCard className={`record-card ${showSelection ? "is-selecting" : ""}`} as="article">
      {showSelection ? (
        <label className="record-select">
          <input
            type="checkbox"
            checked={selected}
            aria-label={`${T.selectRecord} ${session.bankTitle} ${date}`}
            onChange={(event) => onSelectedChange(session.sessionId, event.currentTarget.checked)}
          />
        </label>
      ) : null}
      <div className="random-record-main">
        <div className="random-record-heading">
          <div>
            <p className="eyebrow">{date}</p>
            <h3>{session.bankTitle}</h3>
          </div>
          <span className={`random-session-status ${isCompleted ? "is-completed" : "is-pending"}`}>
            {isCompleted ? T.completed : T.unfinished}
          </span>
        </div>
        <div className="random-session-progress">
          <span>{T.answered} <strong>{answeredCount} / {session.totalQuestions}</strong></span>
          <span>{completionRate}%</span>
          <progress value={answeredCount} max={Math.max(session.totalQuestions, 1)} aria-label={`${session.bankTitle} 作答進度 ${completionRate}%`} />
        </div>
      </div>

      <dl className="record-metrics">
        <div><dt>{T.accuracy}</dt><dd>{session.accuracy}%</dd></div>
        <div><dt>{T.correct}</dt><dd>{session.correctCount}</dd></div>
        <div><dt>{T.wrong}</dt><dd>{session.wrongCount}</dd></div>
      </dl>

      <div className="button-row random-record-actions">
        {!isCompleted ? (
          <GlassLinkButton to={`/image-quiz/random/${session.bankId}/${session.sessionId}`} variant="primary">
            <RotateCcw aria-hidden="true" size={18} />
            <span>{T.continueTest}</span>
          </GlassLinkButton>
        ) : null}
        {session.wrongQuestionIds.length > 0 ? (
          <GlassLinkButton to={`/image-quiz/session-wrong/${session.sessionId}`} variant="secondary">
            {T.reviewWrong}
          </GlassLinkButton>
        ) : null}
      </div>
    </GlassCard>
  );
}

function calculateBankProgress(bank: ImageQuizBank, answers: UserAnswer[]): number {
  const questionIds = new Set(bank.chapters.flatMap((chapter) => chapter.questions.map((question) => question.id)));
  const answeredIds = new Set(answers.filter((answer) => questionIds.has(answer.questionId)).map((answer) => answer.questionId));
  return calculateAccuracy(answeredIds.size, questionIds.size);
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

function buildProportionalMockExamQuestions({
  bank,
  allQuestions,
  answeredIds,
  avoidAnswered,
  targetCount,
}: ProportionalMockExamInput): ImageQuizQuestion[] {
  const questionById = new Map(allQuestions.map((question) => [question.id, question]));
  const buckets: ChapterQuestionBucket[] = bank.chapters
    .map((chapter) => {
      const chapterQuestions = chapter.questions
        .map((questionRef) => questionById.get(questionRef.id))
        .filter((question): question is ImageQuizQuestion => Boolean(question))
        .filter((question) => !avoidAnswered || !answeredIds.has(question.id));

      return {
        chapterId: chapter.chapterId,
        questionCount: chapter.questionCount,
        questions: shuffleQuestions(chapterQuestions),
      };
    })
    .filter((bucket) => bucket.questions.length > 0);

  const availableTotal = buckets.reduce((sum, bucket) => sum + bucket.questions.length, 0);
  const drawTotal = Math.min(targetCount, availableTotal);

  if (drawTotal <= 0 || availableTotal <= 0) {
    return [];
  }

  const quotas = buckets.map((bucket, index) => {
    const rawQuota = (drawTotal * bucket.questions.length) / availableTotal;
    return {
      bucket,
      index,
      count: Math.min(bucket.questions.length, Math.floor(rawQuota)),
      remainder: rawQuota - Math.floor(rawQuota),
    };
  });

  let allocated = quotas.reduce((sum, quota) => sum + quota.count, 0);

  for (const quota of [...quotas].sort((a, b) => {
    if (b.remainder !== a.remainder) {
      return b.remainder - a.remainder;
    }
    if (b.bucket.questions.length !== a.bucket.questions.length) {
      return b.bucket.questions.length - a.bucket.questions.length;
    }
    return a.index - b.index;
  })) {
    if (allocated >= drawTotal) {
      break;
    }
    if (quota.count < quota.bucket.questions.length) {
      quota.count += 1;
      allocated += 1;
    }
  }

  return shuffleQuestions(quotas.flatMap((quota) => quota.bucket.questions.slice(0, quota.count)));
}
