import { RotateCcw } from "lucide-react";
import { GlassButton, GlassLinkButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { V93StateIllustration } from "./V93VisualMaterials";

type ErrorStateProps = {
  title?: string;
  message: string;
  retryLabel?: string;
  onRetry?: () => void;
  backLabel?: string;
  backTo?: string;
};

export function ErrorState({
  title = "載入失敗",
  message,
  retryLabel = "重新載入",
  onRetry,
  backLabel,
  backTo,
}: ErrorStateProps) {
  return (
    <GlassCard className="state-card error-state v91-illustrated-state-card">
      <V93StateIllustration kind="error" />
      <h2>{title}</h2>
      <p>{message}</p>
      {onRetry || (backLabel && backTo) ? (
        <div className="error-state-actions">
          {onRetry ? (
            <GlassButton variant="primary" onClick={onRetry}>
              <RotateCcw aria-hidden="true" size={17} />
              {retryLabel}
            </GlassButton>
          ) : null}
          {backLabel && backTo ? (
            <GlassLinkButton to={backTo} variant="secondary">
              {backLabel}
            </GlassLinkButton>
          ) : null}
        </div>
      ) : null}
    </GlassCard>
  );
}
