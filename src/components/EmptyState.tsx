import { Inbox } from "lucide-react";
import { GlassCard } from "./GlassCard";
import { GlassLinkButton } from "./GlassButton";

type EmptyStateProps = {
  title: string;
  message: string;
  actionLabel?: string;
  actionTo?: string;
};

export function EmptyState({ title, message, actionLabel, actionTo }: EmptyStateProps) {
  return (
    <GlassCard className="state-card">
      <Inbox aria-hidden="true" size={34} />
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
