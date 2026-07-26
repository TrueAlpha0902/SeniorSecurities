import { GlassCard } from "./GlassCard";
import { GlassLinkButton } from "./GlassButton";
import { V93StateIllustration, type V93StateIllustrationKind } from "./V93VisualMaterials";

type EmptyStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  actionTo?: string;
};

function illustrationFor(title: string): V93StateIllustrationKind {
  if (title.includes("完成")) return "complete";
  if (title.includes("搜尋") || title.includes("找不到")) return "search";
  if (title.includes("離線")) return "offline";
  return "empty";
}

export function EmptyState({ title, message, actionLabel, actionTo }: EmptyStateProps) {
  return (
    <GlassCard className="state-card v91-illustrated-state-card">
      <V93StateIllustration kind={illustrationFor(title)} />
      <h2>{title}</h2>
      <p>{message}</p>
      {actionLabel && actionTo ? (
        <GlassLinkButton to={actionTo} variant="primary">
          {actionLabel}
        </GlassLinkButton>
      ) : null}
    </GlassCard>
  );
}
