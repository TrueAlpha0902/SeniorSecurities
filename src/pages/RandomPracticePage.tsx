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
  TimerReset,
  Layers3,
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
import { loadAllImageQuestions, loadImageBankQuestions, loadImageQuizBanks, type ImageQuizBank, type ImageQuizQuestion } from "../lib/imageQuiz";
import { buildSessionId, calculateAccuracy, shuffleQuestions } from "../lib/quiz";
import type { UserAnswer } from "../types";
import "../styles/learner-experience-v65.css";
import "../styles/mock-exam-v66.css";

const DEFAULT_RANDOM_SIZE = 50;
const MIN_RANDOM_SIZE = 1;
const MAX_RANDOM_SIZE = 300;
const QUICK_RANDOM_SIZES = [25, 50, 80, 100] as const;

const T = {
  loading: "載入模擬考測驗",
  title: "模擬考測驗",
  description: "可選擇單科模考或完整 150 題正式模考。考試模式會在交卷後統一顯示成績與解析，作答進度會自動保存。",
  subject: "科目",
  chapter: "章",
  question: "題",
  start: "開始模擬考",
  avoidAnswered: "避開已作答題目",
  questionCount: "單科模考題數",
  questionCountHint: "預設 50 題，系統依各章節題庫比例抽題並自動換算建議作答時間。若題目不足，會以可抽題數為準。",
  proportionalHint: "依章節比例抽題",
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
  examRules: "證券高業考試規定",
  examRulesNote: "完整模考依正式科目配置抽取 150 題，限時 210 分鐘，交卷後統一批改。",
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
  const [examKind, setExamKind] = useState<"single" | "full">("single");
  const [deferredFeedback, setDeferredFeedback] = useState(true);
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
      durationMinutes: resolveSingleSubjectDuration(bank.bankId, questions.length),
      feedbackMode: deferredFeedback ? "deferred" : "immediate",
      markedQuestionIds: [],
    });
    navigate(`/image-quiz/random/${bank.bankId}/${sessionId}`);
  }


  async function handleStartFullMock(): Promise<void> {
    const allQuestions = await loadAllImageQuestions();
    const answeredIds = new Set((data?.answers ?? []).map((answer) => answer.questionId));
    const questions = buildFullMockExamQuestions(allQuestions, answeredIds, avoidAnswered);
    if (questions.length < 150) {
      window.alert("目前可用題目不足 150 題，請關閉『避開已作答題目』後再試一次。");
      return;
    }
    const sessionId = buildSessionId();
    await createImageQuizSession({
      sessionId,
      mode: "fullMock",
      bankId: "__full_exam__",
      bankTitle: "證券高業完整模擬考",
      questionIds: questions.map((question) => question.id),
      answers: {},
      wrongQuestionIds: [],
      startedAt: new Date().toISOString(),
      totalQuestions: questions.length,
      correctCount: 0,
      wrongCount: 0,
      accuracy: 0,
      durationMinutes: 210,
      feedbackMode: "deferred",
      markedQuestionIds: [],
    });
    navigate(`/image-quiz/random/__full_exam__/${sessionId}`);
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
            <strong>{examKind === "full" ? 150 : normalizedQuestionCount} <small>題</small></strong>
            <small>{examKind === "full" ? "210 分鐘正式配比" : `尚有 ${remainingQuestionCount.toLocaleString("zh-TW")} 題待練習`}</small>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="random-builder-card" as="section" aria-labelledby="random-builder-title">
        <div className="random-builder-heading">
          <div className="learner-section-icon" aria-hidden="true"><ListFilter size={20} /></div>
          <div>
            <h2 id="random-builder-title">設定模擬考</h2>
            <p>{examKind === "single" ? T.questionCountHint : "完整模考固定 150 題、210 分鐘，依正式科目比例抽題並於交卷後批改。"}</p>
          </div>
        </div>

        <div className="mock-exam-kind-switch" role="tablist" aria-label="模擬考類型">
          <button type="button" className={examKind === "single" ? "is-active" : ""} onClick={() => setExamKind("single")}><BookOpenCheck size={18} /><span><strong>單科模考</strong><small>自訂題數與科目</small></span></button>
          <button type="button" className={examKind === "full" ? "is-active" : ""} onClick={() => setExamKind("full")}><Layers3 size={18} /><span><strong>完整模考</strong><small>150 題 · 210 分鐘</small></span></button>
        </div>

        {examKind === "single" ? <div className="random-quiz-options">
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
          <label className="random-answer-toggle">
            <input type="checkbox" checked={deferredFeedback} onChange={(event) => setDeferredFeedback(event.currentTarget.checked)} />
            <span className="random-toggle-copy"><strong>交卷後統一批改</strong><small>{deferredFeedback ? "作答時不顯示答案與解析" : "每題作答後立即顯示解析"}</small></span>
            <span className="random-switch" aria-hidden="true" />
          </label>
        </div> : (
          <div className="full-mock-launch-card">
            <div><span className="full-mock-icon"><TimerReset size={26} /></span><div><strong>證券高業完整模擬考</strong><p>投資學 50 題、財務分析 50 題、法規與實務合計 50 題。交卷前不顯示正解。</p></div></div>
            <dl><div><dt>總題數</dt><dd>150 題</dd></div><div><dt>作答時間</dt><dd>210 分鐘</dd></div><div><dt>批改方式</dt><dd>交卷後統一批改</dd></div></dl>
            <GlassButton variant="primary" className="full-mock-start" onClick={() => void handleStartFullMock()}><Play size={19} />開始完整模考</GlassButton>
          </div>
        )}
      </GlassCard>

      {examKind === "single" ? <section className="random-subject-section" aria-labelledby="random-subject-title">
        <div className="learner-section-heading">
          <div>
            <p className="eyebrow">Choose a subject</p>
            <h2 id="random-subject-title">選擇模考科目</h2>
            <p>系統依章節題量比例抽題，題目分布更接近完整科目測驗。</p>
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
      </section> : null}

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


function resolveSingleSubjectDuration(bankId: string, questionCount: number): number {
  const fullDuration = bankId === "investment" ? 60 : bankId === "financial-analysis" ? 90 : 60;
  return Math.max(10, Math.round(fullDuration * questionCount / 50));
}

function buildFullMockExamQuestions(
  allQuestions: ImageQuizQuestion[],
  answeredIds: Set<string>,
  avoidAnswered: boolean,
): ImageQuizQuestion[] {
  const take = (bankIds: string[], count: number): ImageQuizQuestion[] => {
    const pool = allQuestions.filter((question) => bankIds.includes(question.bankId));
    const preferred = avoidAnswered ? pool.filter((question) => !answeredIds.has(question.id)) : pool;
    const source = preferred.length >= count ? preferred : pool;
    return shuffleQuestions(source).slice(0, count);
  };
  const investment = take(["investment"], 50);
  const financial = take(["financial-analysis"], 50);
  const lawPool = allQuestions.filter((question) => ["securities-trading-regulations", "securities-trading-practice"].includes(question.bankId));
  const regulationCount = Math.round(50 * lawPool.filter((question) => question.bankId === "securities-trading-regulations").length / Math.max(1, lawPool.length));
  const regulations = take(["securities-trading-regulations"], regulationCount);
  const practice = take(["securities-trading-practice"], 50 - regulationCount);
  return shuffleQuestions([...investment, ...financial, ...regulations, ...practice]);
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
