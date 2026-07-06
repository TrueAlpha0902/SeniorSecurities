import { GlassCard } from "./GlassCard";

type LoadingStateProps = {
  label?: string;
};

export function LoadingState({ label = "載入中" }: LoadingStateProps) {
  return (
    <GlassCard className="state-card loading-state" aria-live="polite">
      <span className="loading-spinner" aria-hidden="true" />
      <p>{label}</p>
    </GlassCard>
  );
}
