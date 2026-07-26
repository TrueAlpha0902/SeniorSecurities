import { ArrowRight, Play } from "lucide-react";
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
import {
  loadImageQuizBank,
  resetImageQuizCaches,
  type ImageQuizBank,
  type ImageQuizChapter,
} from "../lib/imageQuiz";
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
  const { data, error, loading, retry } = useAsync(() => loadBankPageData(bankId), [bankId, refreshKey]);

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
    return (
      <ErrorState
        title="無法載入科目題庫"
        message={error}
        onRetry={() => {
          resetImageQuizCaches();
          retry();
        }}
      />
    );
  }

  if (!data?.bank) {
    return <EmptyState title={T.notFoundTitle} message={T.notFoundMessage} actionLabel={T.home} actionTo="/" />;
  }

  const bank = data.bank;
  const totalQuestions = bank.chapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);
  const chapterGroups = groupChapters(bank.chapters);

  return (
    <div className="page-stack product-bank-page">
      <header className="product-bank-heading">
        <div>
          <p>證券高業科目</p>
          <h1>{bank.bankTitle}</h1>
          <span>{bank.chapters.length}章 · {totalQuestions}題</span>
        </div>
        <div className="product-bank-heading-actions-v86">
          <GlassLinkButton
            to={`/image-quiz/bank/${bank.bankId}`}
            variant="primary"
            aria-label={`開始${bank.bankTitle}全章練習，共 ${totalQuestions} 題`}
          >
            <Play aria-hidden="true" size={18} />
            全章練習
          </GlassLinkButton>
        </div>
      </header>

      {chapterGroups.map((group) => (
        <section key={group.id} className="chapter-section product-chapter-section" aria-label={`${group.title} ${T.chapterList}`}>
          <div className="section-heading product-section-heading">
            <div><h2>{group.title}</h2><p>{group.chapters.length}章</p></div>
          </div>
          <GlassCard className="chapter-table-card">
            <div className="chapter-table-head" aria-hidden="true">
              <span>章節</span><span>進度</span><span>正確率</span><span>錯題</span><span>動作</span>
            </div>
            <div className="chapter-table-body">
              {group.chapters.map((chapter) => {
                const chapterAnswers = chapter.questions
                  .map((question) => answerById.get(question.id))
                  .filter((answer): answer is UserAnswer => Boolean(answer));
                const answeredCount = chapterAnswers.length;
                const correctCount = chapterAnswers.filter((answer) => answer.isCorrect).length;
                const wrongCount = answeredCount - correctCount;
                const accuracy = answeredCount ? calculateAccuracy(correctCount, answeredCount) : 0;
                const destination = `/image-quiz/bank/${bank.bankId}/chapter/${encodeURIComponent(chapter.chapterId)}`;
                return (
                  <article key={chapter.chapterId} className="chapter-table-row">
                    <div className="chapter-table-title">
                      <h3>{displayChapterTitle(chapter, bank.bankId)}</h3>
                      {chapter.chapterTopic ? <p>{chapter.chapterTopic}</p> : null}
                      <span>{chapter.questionCount}題</span>
                    </div>
                    <div className="chapter-table-progress" data-label="進度">
                      <strong>{answeredCount} / {chapter.questionCount}</strong>
                      <ProgressBar value={answeredCount} max={chapter.questionCount} label={`已作答 ${answeredCount} / ${chapter.questionCount} 題`} />
                    </div>
                    <div className="chapter-table-metric" data-label="正確率"><strong>{accuracy}%</strong></div>
                    <div className="chapter-table-metric" data-label="錯題"><strong>{wrongCount}</strong></div>
                    <GlassLinkButton
                      to={destination}
                      variant="secondary"
                      className="chapter-table-action"
                      aria-label={`${answeredCount ? "繼續" : "開始"}${displayChapterTitle(chapter, bank.bankId)}，共 ${chapter.questionCount} 題`}
                    >
                      {answeredCount ? "繼續" : "開始"}<ArrowRight aria-hidden="true" size={16} />
                    </GlassLinkButton>
                  </article>
                );
              })}
            </div>
          </GlassCard>
        </section>
      ))}
    </div>
  );

}

function groupChapters(chapters: ImageQuizChapter[]): ChapterGroup[] {
  // Regulations and practice are one official subject. Keep a single chapter
  // list instead of presenting them as two learner-facing subjects.
  return [{ id: "chapters", title: T.chapterList, chapters }];
}

function displayChapterTitle(chapter: ImageQuizChapter, bankId: string): string {
  if (bankId === "securities-laws-practice") {
    return chapter.chapterTitle.replace(" / ", "・");
  }
  const parts = chapter.chapterTitle.split(" / ");
  return parts[parts.length - 1] ?? chapter.chapterTitle;
}
