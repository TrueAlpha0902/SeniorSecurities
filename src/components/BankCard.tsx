import { BookOpen, ChevronRight } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { GlassLinkButton } from "./GlassButton";
import type { QuizBank } from "../types";

type BankCardProps = {
  bank: QuizBank;
};

export function BankCard({ bank }: BankCardProps) {
  const questionCount = bank.chapters.reduce((sum, chapter) => sum + chapter.questionCount, 0);

  return (
    <GlassCard interactive as="article" className="bank-card">
      <div className="card-title-row">
        <div className="title-icon" aria-hidden="true">
          <BookOpen size={22} />
        </div>
        <div>
          <h2>{bank.title}</h2>
          {bank.description ? <p>{bank.description}</p> : null}
        </div>
      </div>
      <div className="metric-row">
        <span className="glass-badge">{bank.chapters.length} 章</span>
        <span className="glass-badge">{questionCount} 題</span>
      </div>
      <GlassLinkButton to={`/banks/${bank.id}`} variant="primary">
        <span>進入題庫</span>
        <ChevronRight aria-hidden="true" size={20} />
      </GlassLinkButton>
    </GlassCard>
  );
}
