import { Clock3 } from "lucide-react";

type QuizTimerProps = {
  seconds: number;
  mode: "elapsed" | "countdown";
  urgent?: boolean;
  compact?: boolean;
  label?: string;
};

export function QuizTimer({
  seconds,
  mode,
  urgent = false,
  compact = false,
  label,
}: QuizTimerProps) {
  const resolvedLabel = label ?? (mode === "countdown" ? "剩餘時間" : "測驗時間");
  const value = formatQuizTime(seconds);
  return (
    <div
      className={`unified-quiz-timer${urgent ? " is-urgent" : ""}${compact ? " is-compact" : ""}`}
      aria-label={`${resolvedLabel} ${value}`}
    >
      <Clock3 aria-hidden="true" size={16} />
      <span className="unified-quiz-timer-label">{resolvedLabel}</span>
      <strong>{value}</strong>
    </div>
  );
}

export function formatQuizTime(totalSeconds: number): string {
  const safe = Math.max(0, Math.trunc(totalSeconds));
  const hours = Math.floor(safe / 3600);
  const minutes = Math.floor((safe % 3600) / 60);
  const seconds = safe % 60;
  const two = (value: number) => value.toString().padStart(2, "0");
  return hours > 0 ? `${hours}:${two(minutes)}:${two(seconds)}` : `${minutes}:${two(seconds)}`;
}
