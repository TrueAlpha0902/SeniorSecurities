import { HeartOff, Trash2, X } from "lucide-react";
import { useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { useAsync } from "../hooks/useAsync";
import { loadQuestionsForRefs } from "../lib/data";
import {
  clearWrongQuestions,
  listFavoriteQuestions,
  listWrongQuestions,
  removeFavoriteQuestion,
  removeWrongQuestion
} from "../lib/db";
import type { FavoriteQuestionRecord, Question, WrongQuestionRecord } from "../types";

type ReviewData = {
  wrongRecords: WrongQuestionRecord[];
  wrongQuestions: Question[];
  favoriteRecords: FavoriteQuestionRecord[];
  favoriteQuestions: Question[];
};

async function loadReviewData(): Promise<ReviewData> {
  const [wrongRecords, favoriteRecords] = await Promise.all([listWrongQuestions(), listFavoriteQuestions()]);
  const [wrongQuestions, favoriteQuestions] = await Promise.all([
    loadQuestionsForRefs(wrongRecords),
    loadQuestionsForRefs(favoriteRecords)
  ]);
  return { wrongRecords, wrongQuestions, favoriteRecords, favoriteQuestions };
}

export function ReviewPage() {
  const [refreshKey, setRefreshKey] = useState(0);
  const { data, error, loading } = useAsync(loadReviewData, [refreshKey]);

  const refresh = () => setRefreshKey((key) => key + 1);

  if (loading) {
    return <LoadingState label="載入複習清單" />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!data || (data.wrongRecords.length === 0 && data.favoriteRecords.length === 0)) {
    return <EmptyState title="複習清單是空的" message="答錯或收藏題目後，這裡會顯示可複習的題目。" actionLabel="回首頁" actionTo="/" />;
  }

  const wrongById = new Map(data.wrongRecords.map((record) => [record.questionId, record]));

  const handleClearWrong = async () => {
    await clearWrongQuestions();
    refresh();
  };

  const handleRemoveWrong = async (questionId: string) => {
    await removeWrongQuestion(questionId);
    refresh();
  };

  const handleRemoveFavorite = async (questionId: string) => {
    await removeFavoriteQuestion(questionId);
    refresh();
  };

  return (
    <div className="page-stack">
      <GlassCard className="review-header">
        <div>
          <p className="eyebrow">Review</p>
          <h1>複習清單</h1>
        </div>
        {data.wrongRecords.length > 0 ? (
          <GlassButton variant="danger" onClick={() => void handleClearWrong()}>
            <Trash2 aria-hidden="true" size={18} />
            <span>清空錯題</span>
          </GlassButton>
        ) : null}
      </GlassCard>

      <section className="review-section">
        <div className="section-heading">
          <h2>錯題</h2>
          <span className="glass-badge">{data.wrongRecords.length} 題</span>
        </div>
        {data.wrongQuestions.length === 0 ? (
          <EmptyState title="沒有錯題" message="目前沒有錯題紀錄。" />
        ) : (
          <div className="review-list">
            {data.wrongQuestions.map((question) => {
              const record = wrongById.get(question.id);
              return (
                <GlassCard key={question.id} className="review-item">
                  <div className="review-item-head">
                    <span className="glass-badge">{question.bankTitle} / {question.chapter}</span>
                    <button
                      type="button"
                      className="icon-danger-button"
                      onClick={() => void handleRemoveWrong(question.id)}
                      aria-label="移除此錯題"
                      title="移除此錯題"
                    >
                      <X aria-hidden="true" size={18} />
                    </button>
                  </div>
                  <h3>{question.question}</h3>
                  <p>正確答案：{question.answer}</p>
                  <p>{question.explanation}</p>
                  {record ? <span className="glass-badge">錯誤次數 {record.wrongCount}</span> : null}
                </GlassCard>
              );
            })}
          </div>
        )}
      </section>

      <section className="review-section">
        <div className="section-heading">
          <h2>收藏</h2>
          <span className="glass-badge">{data.favoriteRecords.length} 題</span>
        </div>
        {data.favoriteQuestions.length === 0 ? (
          <EmptyState title="沒有收藏" message="點選題目右上角星號即可收藏。" />
        ) : (
          <div className="review-list">
            {data.favoriteQuestions.map((question) => (
              <GlassCard key={question.id} className="review-item">
                <div className="review-item-head">
                  <span className="glass-badge">{question.bankTitle} / {question.chapter}</span>
                  <button
                    type="button"
                    className="icon-danger-button"
                    onClick={() => void handleRemoveFavorite(question.id)}
                    aria-label="移除此收藏"
                    title="移除此收藏"
                  >
                    <HeartOff aria-hidden="true" size={18} />
                  </button>
                </div>
                <h3>{question.question}</h3>
                <p>正確答案：{question.answer}</p>
                <p>{question.explanation}</p>
              </GlassCard>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
