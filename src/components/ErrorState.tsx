import { AlertTriangle } from "lucide-react";
import { GlassCard } from "./GlassCard";

type ErrorStateProps = {
  title?: string;
  message: string;
};

export function ErrorState({ title = "載入失敗", message }: ErrorStateProps) {
  return (
    <GlassCard className="state-card error-state">
      <AlertTriangle aria-hidden="true" size={34} />
      <h2>{title}</h2>
      <p>{message}</p>
    </GlassCard>
  );
}
