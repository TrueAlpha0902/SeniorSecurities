import { BookOpen, GitCompareArrows } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { PdfSegmentStack } from "../components/PdfSegmentStack";
import { useAsync } from "../hooks/useAsync";
import {
  loadAllImageQuestions,
  loadSimilarQuestionGroups,
  type ImageQuizQuestion,
  type SimilarQuestionGroup,
} from "../lib/imageQuiz";

const T = {
  loading: "\u8f09\u5165\u76f8\u4f3c\u984c",
  title: "\u76f8\u4f3c\u984c\u6bd4\u8f03",
  empty: "\u76ee\u524d\u6c92\u6709\u76f8\u4f3c\u984c\u7d44",
  emptyMessage: "\u91cd\u5efa\u76f8\u4f3c\u984c\u7d22\u5f15\u5f8c\u6703\u5728\u9019\u88e1\u986f\u793a\u3002",
  group: "\u7d44",
  question: "\u984c",
  allSubjects: "\u5168\u90e8\u79d1\u76ee",
  answer: "\u6b63\u89e3",
  similarScore: "\u76f8\u4f3c\u5ea6",
};

type SimilarPageData = {
  groups: SimilarQuestionGroup[];
  questionsById: Map<string, ImageQuizQuestion>;
};

type ResolvedSimilarGroup = SimilarQuestionGroup & {
  questions: ImageQuizQuestion[];
};

async function loadSimilarPageData(): Promise<SimilarPageData> {
  const [groups, questions] = await Promise.all([loadSimilarQuestionGroups(), loadAllImageQuestions()]);
  return {
    groups,
    questionsById: new Map(questions.map((question) => [question.id, question])),
  };
}

export function SimilarQuestionsPage() {
  const { data, error, loading } = useAsync(loadSimilarPageData, []);
  const [selectedBankId, setSelectedBankId] = useState("all");

  const groups = useMemo<ResolvedSimilarGroup[]>(() => {
    if (!data) {
      return [];
    }
    return data.groups
      .map((group) => ({
        ...group,
        questions: group.questionIds
          .map((questionId) => data.questionsById.get(questionId))
          .filter((question): question is ImageQuizQuestion => Boolean(question)),
      }))
      .filter((group) => group.questions.length >= 2);
  }, [data]);

  const bankOptions = useMemo(() => {
    const byId = new Map<string, string>();
    for (const group of groups) {
      byId.set(group.bankId, group.bankTitle);
    }
    return Array.from(byId, ([bankId, bankTitle]) => ({ bankId, bankTitle })).sort((left, right) =>
      left.bankTitle.localeCompare(right.bankTitle, "zh-Hant"),
    );
  }, [groups]);

  const visibleGroups = selectedBankId === "all" ? groups : groups.filter((group) => group.bankId === selectedBankId);
  const visibleQuestionCount = visibleGroups.reduce((sum, group) => sum + group.questions.length, 0);

  if (loading) {
    return <LoadingState label={T.loading} />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!groups.length) {
    return <EmptyState title={T.empty} message={T.emptyMessage} />;
  }

  return (
    <div className="page-stack similar-page">
      <GlassCard className="similar-hero">
        <div>
          <p className="eyebrow">{T.title}</p>
          <h1>{T.title}</h1>
        </div>
        <div className="metric-row">
          <span className="glass-badge">
            {visibleGroups.length} {T.group}
          </span>
          <span className="glass-badge">
            {visibleQuestionCount} {T.question}
          </span>
        </div>
      </GlassCard>

      <section className="similar-filter" aria-label={T.allSubjects}>
        <button
          type="button"
          className={`filter-pill ${selectedBankId === "all" ? "is-active" : ""}`}
          onClick={() => setSelectedBankId("all")}
        >
          <BookOpen aria-hidden="true" size={18} />
          <span>{T.allSubjects}</span>
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
      </section>

      <section className="similar-group-list" aria-label={T.title}>
        {visibleGroups.map((group) => (
          <GlassCard key={group.id} className="similar-group-card" as="article">
            <div className="similar-group-header">
              <div>
                <p className="eyebrow">
                  {group.bankTitle} / {group.chapterTitle}
                </p>
                <h2>
                  <GitCompareArrows aria-hidden="true" size={20} />
                  {group.questions.map((question) => `\u7b2c${question.number}\u984c`).join(" / ")}
                </h2>
              </div>
              <span className="glass-badge">
                {T.similarScore} {Math.max(0, Math.round((1 - group.score) * 100))}%
              </span>
            </div>
            <div className="similar-question-grid">
              {group.questions.map((question) => (
                <article className="similar-question-panel" key={question.id}>
                  <div className="similar-question-head">
                    <strong>
                      {"\u7b2c "}
                      {question.number}
                      {" \u984c"}
                    </strong>
                    <span className="glass-badge">
                      {T.answer} ({question.answer})
                    </span>
                  </div>
                  <PdfSegmentStack
                    label={`${question.bankTitle} ${question.chapterTitle} ${question.number} \u984c`}
                    segments={question.questionSegments}
                    priority="low"
                  />
                </article>
              ))}
            </div>
          </GlassCard>
        ))}
      </section>
    </div>
  );
}
