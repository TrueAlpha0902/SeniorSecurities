import { BookOpen, Play } from "lucide-react";
import { useMemo } from "react";
import { useLocation, useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { GlassCard } from "../components/GlassCard";
import { GlassLinkButton } from "../components/GlassButton";
import { LoadingState } from "../components/LoadingState";
import { useAsync } from "../hooks/useAsync";
import { loadAllQuestions, loadBankQuestions, loadChapterQuestions } from "../lib/data";
import { answerKeys } from "../lib/quiz";
import type { Question } from "../types";

type QuestionsConfig = {
  title: string;
  quizTo: string;
  load: () => Promise<Question[]>;
};

export function QuestionsPage() {
  const { bankId = "", chapterId = "" } = useParams();
  const location = useLocation();

  const config = useMemo<QuestionsConfig>(() => {
    if (location.pathname === "/questions/all") {
      return {
        title: "全部題目",
        quizTo: "/quiz/all",
        load: loadAllQuestions
      };
    }

    if (chapterId) {
      return {
        title: `${bankId} / ${chapterId}`,
        quizTo: `/quiz/bank/${bankId}/chapter/${encodeURIComponent(chapterId)}`,
        load: () => loadChapterQuestions(bankId, chapterId)
      };
    }

    return {
      title: bankId,
      quizTo: `/quiz/bank/${bankId}`,
      load: () => loadBankQuestions(bankId)
    };
  }, [bankId, chapterId, location.pathname]);

  const { data: questions, error, loading } = useAsync(config.load, [config]);

  if (loading) {
    return <LoadingState label="載入題目" />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!questions || questions.length === 0) {
    return <EmptyState title="沒有題目" message="此範圍目前沒有可列出的題目。" actionLabel="回首頁" actionTo="/" />;
  }

  return (
    <div className="page-stack questions-page">
      <GlassCard className="questions-header">
        <div>
          <p className="eyebrow">Questions</p>
          <h1>{config.title}</h1>
          <div className="metric-row">
            <span className="glass-badge">依題號排序</span>
            <span className="glass-badge">{questions.length} 題</span>
          </div>
        </div>
        <GlassLinkButton to={config.quizTo} variant="primary">
          <Play aria-hidden="true" size={19} />
          <span>開始測驗</span>
        </GlassLinkButton>
      </GlassCard>

      <section className="question-list" aria-label="All questions">
        {questions.map((question, index) => (
          <GlassCard key={question.id} className="question-list-item" as="article">
            <div className="question-list-head">
              <span className="glass-badge">第 {index + 1} 題</span>
              <span className="glass-badge">{question.bankTitle} / {question.chapter}</span>
            </div>
            <h2>{question.question}</h2>
            <div className="compact-options">
              {answerKeys.map((answerKey) => (
                <div key={answerKey} className={question.answer === answerKey ? "compact-option correct-option" : "compact-option"}>
                  <span>{answerKey}</span>
                  <p>{question.options[answerKey]}</p>
                </div>
              ))}
            </div>
            <div className="question-list-meta">
              <span className="glass-badge">正解 {question.answer}</span>
              <span className="glass-badge">{question.sourceFile}</span>
            </div>
            <p className="question-list-explanation">{question.explanation}</p>
            {question.source && question.source !== "sample" ? (
              <details className="source-details">
                <summary>
                  <BookOpen aria-hidden="true" size={16} />
                  <span>來源原文</span>
                </summary>
                <pre>{question.source}</pre>
              </details>
            ) : null}
          </GlassCard>
        ))}
      </section>
    </div>
  );
}
