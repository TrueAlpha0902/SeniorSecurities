import { Play } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { GlassLinkButton } from "./GlassButton";

type ChapterCardProps = {
  bankId: string;
  chapter: {
    id: string;
    title: string;
    questionCount: number;
  };
};

export function ChapterCard({ bankId, chapter }: ChapterCardProps) {
  return (
    <GlassCard interactive as="article" className="chapter-card">
      <div>
        <h2>{chapter.title}</h2>
        <span className="glass-badge">{chapter.questionCount} 題</span>
      </div>
      <div className="chapter-actions">
        <GlassLinkButton to={`/questions/bank/${bankId}/chapter/${encodeURIComponent(chapter.id)}`} variant="secondary">
          <span>查看</span>
        </GlassLinkButton>
        <GlassLinkButton to={`/quiz/bank/${bankId}/chapter/${encodeURIComponent(chapter.id)}`} variant="primary">
          <Play aria-hidden="true" size={18} />
          <span>開始</span>
        </GlassLinkButton>
      </div>
    </GlassCard>
  );
}
