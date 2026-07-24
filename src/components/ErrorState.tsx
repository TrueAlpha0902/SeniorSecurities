import { RotateCcw } from "lucide-react";
import { GlassButton, GlassLinkButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { HandwrittenAsset } from "./HandwrittenAsset";

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
      <HandwrittenAsset
        category="illustrations"
        name="not-found"
        text={title}
        className="v91-state-illustration"
        decorative
      />
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
