import { Home, RotateCcw, XCircle } from "lucide-react";
import { useLocation } from "react-router-dom";
import { EmptyState } from "../components/EmptyState";
import { GlassCard } from "../components/GlassCard";
import { GlassLinkButton } from "../components/GlassButton";
import type { QuizResultState } from "../types";

export function ResultPage() {
  const location = useLocation();
  const state = location.state as QuizResultState | null;

  if (!state?.session) {
    return <EmptyState title="尚無測驗結果" message="完成一次測驗後會在這裡看到統計。" actionLabel="回首頁" actionTo="/" />;
  }

  const { session } = state;

  return (
    <div className="page-stack result-page">
      <GlassCard className="result-card">
        <p className="eyebrow">Result</p>
        <h1>{session.accuracy}%</h1>
        <div className="result-metrics">
          <span className="glass-badge">總題數 {session.totalQuestions}</span>
          <span className="glass-badge">答對 {session.correctCount}</span>
          <span className="glass-badge">答錯 {session.wrongCount}</span>
        </div>
      </GlassCard>

      <div className="quick-actions">
        <GlassLinkButton to={state.restartTo} variant="primary">
          <RotateCcw aria-hidden="true" size={19} />
          <span>重新測驗</span>
        </GlassLinkButton>
        <GlassLinkButton to="/quiz/wrong" variant="secondary">
          <XCircle aria-hidden="true" size={19} />
          <span>複習錯題</span>
        </GlassLinkButton>
        <GlassLinkButton to="/" variant="secondary">
          <Home aria-hidden="true" size={19} />
          <span>回首頁</span>
        </GlassLinkButton>
      </div>
    </div>
  );
}
