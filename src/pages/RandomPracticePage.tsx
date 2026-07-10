import { ClipboardList, History, Play, RotateCcw, Trash2 } from "lucide-react";
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
  const [questionCount, setQuestionCount] = useState(DEFAULT_RANDOM_SIZE);
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
    const targetCount = normalizeQuestionCount(questionCount);
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
  const normalizedQuestionCount = normalizeQuestionCount(questionCount);

  return (
    <div className="page-stack">
      <GlassCard className="bank-hero random-practice-hero">
        <div>
          <p className="eyebrow">Mock Exam</p>
          <h1>{T.title}</h1>
          <p>{T.description}</p>
        </div>

        <div className="random-quiz-options" aria-label="單科隨機測驗設定">
          <div className="random-count-panel">
            <div>
              <h2>{T.questionCount}</h2>
              <p>{T.questionCountHint}</p>
            </div>
            <div className="random-count-quick-actions" role="group" aria-label="快速選擇題數">
              {QUICK_RANDOM_SIZES.map((size) => (
                <button
                  key={size}
                  type="button"
                  className={`random-count-chip ${normalizedQuestionCount === size ? "is-active" : ""}`}
                  onClick={() => setQuestionCount(size)}
                >
                  {size} {T.question}
                </button>
              ))}
            </div>
            <label className="random-count-input-label">
              <span>{T.customQuestionCount}</span>
              <input
                type="number"
                min={MIN_RANDOM_SIZE}
                max={MAX_RANDOM_SIZE}
                inputMode="numeric"
                value={questionCount}
                onChange={(event) => setQuestionCount(normalizeQuestionCount(Number(event.currentTarget.value)))}
              />
            </label>
          </div>

          <label className="setting-toggle">
            <input
              type="checkbox"
              checked={avoidAnswered}
              onChange={(event) => setAvoidAnswered(event.currentTarget.checked)}
            />
            <span>{T.avoidAnswered}</span>
          </label>
        </div>
      </GlassCard>

      <GlassCard className="exam-rules-card" as="section" aria-label={T.examRules}>
        <div className="section-heading exam-rules-heading">
          <div>
            <p className="eyebrow">Exam Rules</p>
            <h2>{T.examRules}</h2>
            <p>{T.examRulesNote}</p>
          </div>
          <span className="glass-badge">{T.totalRules}</span>
        </div>
        <div className="exam-rule-grid">
          {SENIOR_SECURITIES_EXAM_RULES.map((rule) => (
            <div key={rule.subject} className="exam-rule-item">
              <ClipboardList aria-hidden="true" size={22} />
              <div>
                <h3>{rule.subject}</h3>
                <p>{rule.questions} {T.questionsUnit} / {rule.minutes} {T.minutesUnit}</p>
              </div>
            </div>
          ))}
        </div>
      </GlassCard>

      <section className="card-grid" aria-label={T.subject}>
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
              <div>
                <h2>{bank.bankTitle}</h2>
                <div className="metric-row">
                  <span className="glass-badge">{total} {T.question}</span>
                  <span className="glass-badge">{bank.chapters.length} {T.chapter}</span>
                  <span className="glass-badge">{T.progress} {progress}%</span>
                  {avoidAnswered ? <span className="glass-badge">{T.remaining} {availableCount} {T.question}</span> : null}
                  <span className="glass-badge">{T.proportionalHint}</span>
                  <span className="glass-badge">本次 {sessionQuestionCount} {T.question}</span>
                </div>
              </div>
              <GlassButton variant="primary" className="random-start-button" onClick={() => void handleStart(bank)} disabled={sessionQuestionCount <= 0}>
                <Play aria-hidden="true" size={18} />
                <span>{T.start}</span>
              </GlassButton>
            </GlassCard>
          );
        })}
      </section>

      <section className="review-section">
        <div className="section-heading">
          <h2>{T.records}</h2>
          <div className="section-actions">
            <span className="glass-badge">{sessions.length}</span>
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
          <GlassCard className="state-card">
            <History aria-hidden="true" size={28} />
            <p>{T.noRecords}</p>
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
      <div>
        <p className="eyebrow">{date}</p>
        <h3>{session.bankTitle}</h3>
      </div>
      <div className="record-metrics">
        <span className="glass-badge">{isCompleted ? T.completed : T.unfinished}</span>
        <span className="glass-badge">{T.answered} {answeredCount} / {session.totalQuestions}</span>
        <span className="glass-badge">{T.accuracy} {session.accuracy}%</span>
        <span className="glass-badge">{T.correct} {session.correctCount}</span>
        <span className="glass-badge">{T.wrong} {session.wrongCount}</span>
      </div>
      <div className="button-row">
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
