import {
  BookOpen,
  BrainCircuit,
  ChevronLeft,
  ChevronRight,
  Eye,
  GitCompareArrows,
  RotateCcw,
  Target,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import {
  ScanExplanationContent,
  ScanOptionText,
  ScanQuestionContent,
} from "../components/ScanDerivedQuestionContent";
import { useAsync } from "../hooks/useAsync";
import { formatAnswerKey, formatLearnerText } from "../lib/learnerText";
import { recordImageUserAnswer } from "../lib/db";
import {
  loadImageQuestionsByIds,
  loadSimilarQuestionGroups,
  resetImageQuizCaches,
  type ImageQuizQuestion,
  type NumericAnswer,
  type SimilarQuestionGroup,
} from "../lib/imageQuiz";
import "../styles/similar-learning-v66.css";

const ANSWERS: NumericAnswer[] = ["1", "2", "3", "4"];

type SimilarPageData = {
  groups: SimilarQuestionGroup[];
  questionsById: Map<string, ImageQuizQuestion>;
};
type ResolvedSimilarGroup = SimilarQuestionGroup & {
  questions: ImageQuizQuestion[];
};
type AnswerState = Record<string, NumericAnswer>;

async function loadSimilarPageData(): Promise<SimilarPageData> {
  const groups = (await loadSimilarQuestionGroups()).filter(
    (group) => group.reviewed === true && group.questionIds.length === 2,
  );
  const questionIds = [...new Set(groups.flatMap((group) => group.questionIds))];
  const questions = await loadImageQuestionsByIds(questionIds);
  return {
    groups,
    questionsById: new Map(questions.map((question) => [question.id, question])),
  };
}

export function SimilarQuestionsPage() {
  const { data, error, loading, retry } = useAsync(loadSimilarPageData, []);
  const [selectedBankId, setSelectedBankId] = useState("all");
  const [groupIndex, setGroupIndex] = useState(0);
  const [answers, setAnswers] = useState<AnswerState>({});
  const [revealedGroups, setRevealedGroups] = useState<Set<string>>(new Set());
  const [savingAttempt, setSavingAttempt] = useState(false);

  const groups = useMemo<ResolvedSimilarGroup[]>(() => {
    if (!data) return [];
    return data.groups
      .map((group) => ({
        ...group,
        questions: group.questionIds
          .map((id) => data.questionsById.get(id))
          .filter((question): question is ImageQuizQuestion => Boolean(question)),
      }))
      .filter((group) => group.questions.length === 2);
  }, [data]);

  const bankOptions = useMemo(() => {
    const byId = new Map<string, string>();
    groups.forEach((group) => byId.set(group.bankId, group.bankTitle));
    return Array.from(byId, ([bankId, bankTitle]) => ({ bankId, bankTitle })).sort(
      (left, right) => left.bankTitle.localeCompare(right.bankTitle, "zh-Hant"),
    );
  }, [groups]);

  const filteredGroups = useMemo(
    () => groups.filter((group) => selectedBankId === "all" || group.bankId === selectedBankId),
    [groups, selectedBankId],
  );
  const currentGroup = filteredGroups[groupIndex];
  const questionCount = filteredGroups.reduce((sum, group) => sum + group.questions.length, 0);

  useEffect(() => {
    setGroupIndex(0);
  }, [selectedBankId]);

  useEffect(() => {
    if (groupIndex >= filteredGroups.length && filteredGroups.length > 0) {
      setGroupIndex(filteredGroups.length - 1);
    }
  }, [filteredGroups.length, groupIndex]);

  if (loading) return <LoadingState label="載入相似題組" />;
  if (error) {
    return (
      <ErrorState
        title="無法載入相似題組"
        message={error}
        onRetry={() => {
          resetImageQuizCaches();
          retry();
        }}
      />
    );
  }
  if (!groups.length) {
    return (
      <EmptyState
        title="目前沒有相似題組"
        message="只有完成題幹、選項及考點人工核對的題組才會顯示。"
      />
    );
  }

  async function revealGroup(group: ResolvedSimilarGroup): Promise<void> {
    const answeredQuestions = group.questions.filter((question) => answers[question.id]);
    if (answeredQuestions.length !== group.questions.length) return;
    setSavingAttempt(true);
    try {
      await Promise.all(
        answeredQuestions.map((question) => {
          const selected = answers[question.id];
          if (!selected) throw new Error("尚有題目未作答。");
          return recordImageUserAnswer(question, selected, {
            confidence: selected === question.answer ? "sure" : "unsure",
            sessionId: group.id,
            sessionMode: "similar-comparison",
          });
        }),
      );
      setRevealedGroups((current) => new Set(current).add(group.id));
    } finally {
      setSavingAttempt(false);
    }
  }

  function resetGroup(group: ResolvedSimilarGroup): void {
    setAnswers((current) => {
      const next = { ...current };
      group.questions.forEach((question) => delete next[question.id]);
      return next;
    });
    setRevealedGroups((current) => {
      const next = new Set(current);
      next.delete(group.id);
      return next;
    });
  }

  function moveGroup(offset: number): void {
    setGroupIndex((current) =>
      Math.min(Math.max(0, current + offset), Math.max(0, filteredGroups.length - 1)),
    );
    window.requestAnimationFrame(() => {
      document.querySelector<HTMLElement>(".similar-pair-card")?.focus({ preventScroll: true });
    });
  }

  return (
    <div className="page-stack similar-learning-page">
      <GlassCard className="similar-learning-hero">
        <div className="similar-learning-heading">
          <span><BrainCircuit aria-hidden="true" size={24} /></span>
          <div>
            <p className="eyebrow">同考點比較</p>
            <h1>相似題比較</h1>
            <p>只保留題幹、四個選項與核心考點均完成核對的題組；每組固定兩題，方便直接比較差異。</p>
          </div>
        </div>
        <div className="similar-learning-kpis" aria-label="相似題組統計">
          <div><Target aria-hidden="true" size={17} /><span>核對題組</span><strong>{filteredGroups.length}</strong></div>
          <div><BookOpen aria-hidden="true" size={17} /><span>題目數</span><strong>{questionCount}</strong></div>
        </div>
      </GlassCard>

      <GlassCard className="similar-learning-toolbar" as="section">
        <div className="similar-filter" aria-label="科目篩選">
          <button
            type="button"
            className={`filter-pill ${selectedBankId === "all" ? "is-active" : ""}`}
            onClick={() => setSelectedBankId("all")}
          >
            全部科目
          </button>
          {bankOptions.map((option) => (
            <button
              key={option.bankId}
              type="button"
              className={`filter-pill ${selectedBankId === option.bankId ? "is-active" : ""}`}
              onClick={() => setSelectedBankId(option.bankId)}
            >
              {option.bankTitle}
            </button>
          ))}
        </div>
        <div className="similar-pair-position" aria-live="polite">
          第 {Math.min(groupIndex + 1, filteredGroups.length)}／{filteredGroups.length} 組
        </div>
      </GlassCard>

      {currentGroup ? (
        <SimilarPairCard
          group={currentGroup}
          answers={answers}
          revealed={revealedGroups.has(currentGroup.id)}
          savingAttempt={savingAttempt}
          canGoPrevious={groupIndex > 0}
          canGoNext={groupIndex < filteredGroups.length - 1}
          onAnswer={(questionId, answer) =>
            setAnswers((current) => ({ ...current, [questionId]: answer }))
          }
          onReveal={() => void revealGroup(currentGroup)}
          onReset={() => resetGroup(currentGroup)}
          onPrevious={() => moveGroup(-1)}
          onNext={() => moveGroup(1)}
        />
      ) : (
        <EmptyState title="此科目尚無核對完成的相似題組" message="請改選其他科目。" />
      )}
    </div>
  );
}

function SimilarPairCard({
  group,
  answers,
  revealed,
  savingAttempt,
  canGoPrevious,
  canGoNext,
  onAnswer,
  onReveal,
  onReset,
  onPrevious,
  onNext,
}: {
  group: ResolvedSimilarGroup;
  answers: AnswerState;
  revealed: boolean;
  savingAttempt: boolean;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onAnswer: (questionId: string, answer: NumericAnswer) => void;
  onReveal: () => void;
  onReset: () => void;
  onPrevious: () => void;
  onNext: () => void;
}) {
  const answeredCount = group.questions.filter((question) => answers[question.id]).length;

  return (
    <GlassCard className="similar-pair-card" as="article" tabIndex={-1}>
      <header className="similar-pair-header">
        <div>
          <p className="eyebrow">{group.bankTitle}／{group.chapterTitle}</p>
          <h2><GitCompareArrows aria-hidden="true" size={22} />第 {group.questions.map((question) => question.number).join("、")} 題</h2>
          <p>{formatLearnerText(group.reason ?? "兩題考點高度相近，請比較限定條件後再作答。")}</p>
        </div>
        <div className="similar-contrast-wrap">
          <strong>真正改變答案的條件</strong>
          <div className="similar-contrast-list" aria-label="真正改變答案的條件">
            {(group.contrastTerms ?? []).map((term) => <span key={term}>{formatLearnerText(term)}</span>)}
          </div>
        </div>
      </header>

      <div className="similar-learning-question-grid">
        {group.questions.map((question) => {
          const selected = answers[question.id];
          return (
            <article key={question.id} className="similar-learning-question">
              <div className="similar-learning-question-head">
                <strong>第 {question.number} 題</strong>
                <span>{revealed ? "解析已開啟" : selected ? "已作答" : "尚未作答"}</span>
              </div>
              <ScanQuestionContent
                question={question}
                label={`${question.bankTitle} ${question.chapterTitle} 第 ${question.number} 題`}
              />
              <div className="similar-learning-answer-grid" aria-label={`第 ${question.number} 題作答`}>
                {ANSWERS.map((answer) => {
                  const isCorrect = revealed && answer === question.answer;
                  const isWrong = revealed && selected === answer && answer !== question.answer;
                  return (
                    <button
                      key={answer}
                      type="button"
                      disabled={revealed}
                      className={`${selected === answer ? "is-selected" : ""}${isCorrect ? " is-answer" : ""}${isWrong ? " is-wrong" : ""}`}
                      onClick={() => onAnswer(question.id, answer)}
                      aria-pressed={selected === answer}
                    >
                      <span className="answer-key">{formatAnswerKey(answer)}</span>
                      <ScanOptionText question={question} answer={answer} />
                      {isCorrect || isWrong ? (
                        <span
                          className={`answer-result-label ${isCorrect ? "is-correct" : "is-wrong"}`}
                          aria-label={isCorrect ? "正確" : "錯誤"}
                        >
                          {isCorrect ? "正確" : "錯誤"}
                        </span>
                      ) : null}
                    </button>
                  );
                })}
              </div>
              {revealed ? (
                <div className="similar-learning-explanation">
                  <strong>解析</strong>
                  {question.explanationText?.trim() ? (
                    <ScanExplanationContent question={question} label={`第 ${question.number} 題解析`} />
                  ) : (
                    <p>本題目前沒有可用解析。</p>
                  )}
                </div>
              ) : null}
            </article>
          );
        })}
      </div>

      <footer className="similar-pair-actions">
        <GlassButton variant="secondary" disabled={!canGoPrevious} onClick={onPrevious}>
          <ChevronLeft aria-hidden="true" size={17} />上一組
        </GlassButton>
        {!revealed ? (
          <GlassButton
            variant="primary"
            disabled={answeredCount !== group.questions.length || savingAttempt}
            onClick={onReveal}
          >
            <Eye aria-hidden="true" size={17} />{savingAttempt ? "儲存中" : "查看解析"}
          </GlassButton>
        ) : (
          <GlassButton variant="secondary" onClick={onReset}>
            <RotateCcw aria-hidden="true" size={17} />重新作答
          </GlassButton>
        )}
        <GlassButton variant="primary" disabled={!canGoNext} onClick={onNext}>
          下一組<ChevronRight aria-hidden="true" size={17} />
        </GlassButton>
      </footer>
    </GlassCard>
  );
}
