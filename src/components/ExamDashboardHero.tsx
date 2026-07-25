import { ProgressBar } from "./ProgressBar";

type ExamDashboardHeroProps = {
  eyebrow: string;
  title: string;
  subtitle: string;
  answered: number;
  total: number;
  secondaryLabel: string;
  secondaryValue: string;
};

export function ExamDashboardHero({
  eyebrow,
  title,
  subtitle,
  answered,
  total,
  secondaryLabel,
  secondaryValue,
}: ExamDashboardHeroProps) {
  const progress = total > 0 ? Math.min(100, Math.round((answered / total) * 1000) / 10) : 0;
  return (
    <header className="exam-dashboard-hero-v86">
      <div className="exam-dashboard-hero-copy-v86">
        <p>{eyebrow}</p>
        <h1>{title}</h1>
        <span>{subtitle}</span>
      </div>
      <div className="exam-dashboard-progress-v86">
        <div className="exam-dashboard-progress-head-v86">
          <span>整體進度</span>
          <strong>{progress}%</strong>
        </div>
        <ProgressBar value={answered} max={total} label={`已作答 ${answered} / ${total} 題`} />
        <div className="exam-dashboard-progress-meta-v86">
          <span>已作答 {answered.toLocaleString()}／{total.toLocaleString()} 題</span>
          <span>{secondaryLabel} {secondaryValue}</span>
        </div>
      </div>
    </header>
  );
}
