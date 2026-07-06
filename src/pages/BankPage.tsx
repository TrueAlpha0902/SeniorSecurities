import { Play } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useParams } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { ProgressBar } from "../components/ProgressBar";
import { useAsync } from "../hooks/useAsync";
import { listUserAnswers } from "../lib/db";
import { loadImageQuizBank, type ImageQuizBank, type ImageQuizChapter } from "../lib/imageQuiz";
import { calculateAccuracy } from "../lib/quiz";
import type { UserAnswer } from "../types";

const T = {
  loading: "\u8f09\u5165\u79d1\u76ee",
  notFoundTitle: "\u627e\u4e0d\u5230\u79d1\u76ee",
  notFoundMessage: "\u8acb\u56de\u9996\u9801\u91cd\u65b0\u9078\u64c7\u984c\u5eab\u3002",
  home: "\u56de\u9996\u9801",
  description: "\u4f9d\u5c0f\u7ae0\u7bc0\u7df4\u7fd2\uff0c\u6bcf\u7ae0\u6703\u986f\u793a\u9032\u5ea6\u3001\u7b54\u5c0d\u7387\u8207\u932f\u984c\u72c0\u614b\u3002",
  chapters: "\u7ae0",
  question: "\u984c",
  answered: "\u5df2\u4f5c\u7b54",
  correct: "\u7b54\u5c0d",
  wrong: "\u7b54\u932f",
  accuracy: "\u7b54\u5c0d\u7387",
  allChapters: "\u5168\u7ae0\u7df4\u7fd2",
  chapterList: "\u7ae0\u7bc0",
  start: "\u7df4\u7fd2",
  regulations: "\u8b49\u5238\u76f8\u95dc\u6cd5\u898f",
  practice: "\u8b49\u5238\u76f8\u95dc\u5be6\u52d9",
};

type BankPageData = {
  bank: ImageQuizBank | undefined;
  answers: UserAnswer[];
};

type ChapterGroup = {
  id: string;
  title: string;
  chapters: ImageQuizChapter[];
};

async function loadBankPageData(bankId: string): Promise<BankPageData> {
  const bank = await loadImageQuizBank(bankId);
  const answers = await listUserAnswers();
  return {
    bank,
    answers,
  };
}

export function BankPage() {
  const { bankId = "" } = useParams();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, error, loading } = useAsync(() => loadBankPageData(bankId), [bankId, refreshKey]);

  useEffect(() => {
    const refreshRecords = () => setRefreshKey((key) => key + 1);
    window.addEventListener("records:changed", refreshRecords);
    return () => window.removeEventListener("records:changed", refreshRecords);
  }, []);

  const answerById = useMemo(
    () => new Map((data?.answers ?? []).map((answer) => [answer.questionId, answer])),
    [data?.answers],
  );

  if (loading) {
    return <LoadingState label={T.loading} />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!data?.bank) {
    return <EmptyState title={T.notFoundTitle} message={T.notFoundMessage} actionLabel={T.home} actionTo="/" />;
  }

  const bank = data.bank;
  const totalQuestions = bank.chapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);
  const chapterGroups = groupChapters(bank.chapters);

  return (
    <div className="page-stack">
      <GlassCard className="bank-hero">
        <p className="eyebrow">{bank.bankId}</p>
        <h1>{bank.bankTitle}</h1>
        <p>{T.description}</p>
        <div className="metric-row">
          <span className="glass-badge">
            {bank.chapters.length} {T.chapters}
          </span>
          <span className="glass-badge">
            {totalQuestions} {T.question}
          </span>
        </div>
        <div className="button-row">
          <GlassLinkButton to={`/image-quiz/bank/${bank.bankId}`} variant="primary">
            <Play aria-hidden="true" size={19} />
            <span>{T.allChapters}</span>
          </GlassLinkButton>
        </div>
      </GlassCard>

      {chapterGroups.map((group) => (
        <section key={group.id} className="chapter-section" aria-label={`${group.title} ${T.chapterList}`}>
          <div className="section-heading">
            <h2>{group.title}</h2>
            <span className="glass-badge">{group.chapters.length} {T.chapters}</span>
          </div>
          <div className="chapter-grid">
            {group.chapters.map((chapter) => {
              const chapterAnswers = chapter.questions
                .map((question) => answerById.get(question.id))
                .filter((answer): answer is UserAnswer => Boolean(answer));
              const answeredCount = chapterAnswers.length;
              const correctCount = chapterAnswers.filter((answer) => answer.isCorrect).length;
              const wrongCount = answeredCount - correctCount;
              const accuracy = answeredCount ? calculateAccuracy(correctCount, answeredCount) : 0;
              return (
                <GlassCard key={chapter.chapterId} interactive as="article" className="chapter-card">
                  <div className="chapter-card-main">
                    <div className="chapter-title-line">
                      <h2>{displayChapterTitle(chapter)}</h2>
                    </div>
                    {chapter.chapterTopic ? <p className="chapter-topic">{chapter.chapterTopic}</p> : null}
                    <span className="chapter-answered">
                      {T.answered} {answeredCount} / {chapter.questionCount} {T.question}
                    </span>
                  </div>
                  <div className="chapter-card-progress">
                    <div className="chapter-status-row">
                      <span className="glass-badge">
                        {T.correct} {correctCount}
                      </span>
                      <span className="glass-badge">
                        {T.wrong} {wrongCount}
                      </span>
                      <span className="glass-badge">
                        {T.accuracy} {accuracy}%
                      </span>
                    </div>
                    <ProgressBar
                      value={answeredCount}
                      max={chapter.questionCount}
                      label={`${T.answered} ${answeredCount} / ${chapter.questionCount} ${T.question}`}
                    />
                    <div className="chapter-actions">
                      <GlassLinkButton
                        to={`/image-quiz/bank/${bank.bankId}/chapter/${encodeURIComponent(chapter.chapterId)}`}
                        variant="primary"
                      >
                        <Play aria-hidden="true" size={18} />
                        <span>{T.start}</span>
                      </GlassLinkButton>
                    </div>
                  </div>
                </GlassCard>
              );
            })}
          </div>
        </section>
      ))}
    </div>
  );
}

function groupChapters(chapters: ImageQuizChapter[]): ChapterGroup[] {
  const regulationChapters = chapters.filter((chapter) => chapter.chapterId.startsWith("regulations-"));
  const practiceChapters = chapters.filter((chapter) => chapter.chapterId.startsWith("practice-"));
  if (regulationChapters.length || practiceChapters.length) {
    return [
      { id: "regulations", title: T.regulations, chapters: regulationChapters },
      { id: "practice", title: T.practice, chapters: practiceChapters },
    ].filter((group) => group.chapters.length > 0);
  }
  return [{ id: "chapters", title: T.chapterList, chapters }];
}

function displayChapterTitle(chapter: ImageQuizChapter): string {
  const parts = chapter.chapterTitle.split(" / ");
  return parts[parts.length - 1] ?? chapter.chapterTitle;
}
