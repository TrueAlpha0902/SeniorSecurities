type ProgressBarProps = {
  value: number;
  max: number;
  label: string;
};

export function ProgressBar({ value, max, label }: ProgressBarProps) {
  const percent = max > 0 ? Math.min(100, Math.max(0, (value / max) * 100)) : 0;
  return (
    <div className="progress-wrap" aria-label={label}>
      <div className="glass-progress" role="progressbar" aria-valuemin={0} aria-valuemax={max} aria-valuenow={value}>
        <span style={{ width: `${percent}%`, minWidth: value > 0 ? "12px" : 0 }} />
      </div>
      <span className="progress-label">{label}</span>
    </div>
  );
}
