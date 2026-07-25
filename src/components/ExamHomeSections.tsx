import {
  ArrowRight,
  CalendarDays,
  type LucideIcon,
} from "lucide-react";
import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { calculateDaysLeft, formatExamDate } from "../lib/studyPlan";
import { GlassButton } from "./GlassButton";
import {
  SketchExamInfoArt,
  SketchForeignExchangeHero,
  SketchLearningChart,
  SketchSecuritiesHero,
} from "./SketchIllustrations";
import { V93SectionTitle } from "./V93VisualMaterials";

export type ExamThemeTone = "securities" | "foreign-exchange";

export type ExamHomeHeroProps = {
  tone: ExamThemeTone;
  eyebrow: string;
  title: string;
  subtitle: string;
  answered: number;
  total: number;
  wrong: number;
  favorites: number;
  examDate: string | null;
  dailyCount: number;
  dailyActionLabel?: string;
  dailyActionTo: string;
  onEditPlan: () => void;
  planConfigured: boolean;
};

function ExamHeroArtwork({ tone }: { tone: ExamThemeTone }) {
  return (
    <div className="v93-hero-material" aria-hidden="true">
      {tone === "foreign-exchange"
        ? <SketchForeignExchangeHero />
        : <SketchSecuritiesHero />}
    </div>
  );
}


export function ExamHomeHero({
  tone,
  eyebrow,
  title,
  subtitle,
  answered,
  total,
  wrong,
  favorites,
  examDate,
  dailyCount,
  dailyActionLabel = "開始練習",
  dailyActionTo,
  onEditPlan,
  planConfigured,
}: ExamHomeHeroProps) {
  const progress = total > 0
    ? Math.min(100, Math.round((answered / total) * 1000) / 10)
    : 0;
  const daysLeft = calculateDaysLeft(examDate);
  const circumference = 2 * Math.PI * 42;
  const dashOffset = circumference * (1 - progress / 100);

  return (
    <header className={`premium-home-hero v90-home-hero is-${tone}`}>
      <section className="v90-hero-banner" aria-label={`${title}學習概況`}>
        <div className="v90-home-copy">
          <div className="v90-title-row">
            <h1 className="v93-home-title">{title}</h1>
            <p>{eyebrow}</p>
          </div>
          <span>{subtitle}</span>
        </div>
        <ExamHeroArtwork tone={tone} />
      </section>

      <section className="v90-overview-grid" aria-label="進度與考試計畫">
        <article className="v90-paper-card v90-progress-card">
          <h2><V93SectionTitle>整體進度</V93SectionTitle></h2>
          <div className="v90-progress-layout">
            <div className="v90-progress-ring" aria-label={`整體進度 ${progress}%`}>
              <svg viewBox="0 0 96 96" aria-hidden="true">
                <circle cx="48" cy="48" r="42" className="v90-progress-ring-track" />
                <circle
                  cx="48"
                  cy="48"
                  r="42"
                  className="v90-progress-ring-value"
                  strokeDasharray={circumference}
                  strokeDashoffset={dashOffset}
                />
                <circle cx="48" cy="48" r="39" className="v90-progress-ring-ghost" />
              </svg>
              <strong>{progress}%</strong>
            </div>
            <dl className="v90-progress-metrics">
              <div><dt>已作答</dt><dd>{answered.toLocaleString()}<small>題</small></dd></div>
              <div><dt>待訂正</dt><dd>{wrong.toLocaleString()}<small>題</small></dd></div>
              <div><dt>收藏</dt><dd>{favorites.toLocaleString()}<small>題</small></dd></div>
            </dl>
          </div>
        </article>

        <button
          type="button"
          className="v90-paper-card v90-plan-card"
          onClick={onEditPlan}
          aria-label={planConfigured ? "調整考試計畫" : "設定考試計畫"}
        >
          <span className="v90-plan-icon"><CalendarDays aria-hidden="true" size={34} /></span>
          <span className="v90-plan-copy">
            <small className="v93-card-label">共同考試日期</small>
            <strong>{formatExamDate(examDate)}</strong>
            <em>
              {daysLeft === null
                ? "尚未設定日期"
                : `距離考試還有 ${daysLeft} 天`}
            </em>
          </span>
          <span className="v90-edit-plan">{planConfigured ? "編輯" : "設定"}</span>
        </button>

        <Link className="v90-paper-card v90-daily-card" to={dailyActionTo}>
          <span>
            <small className="v93-card-label">今日建議題數</small>
            <strong>{Math.max(0, dailyCount)}<em>題</em></strong>
          </span>
          <span className="v90-outline-action">
            <span>{dailyActionLabel}</span><ArrowRight aria-hidden="true" size={18} />
          </span>
        </Link>
      </section>
    </header>
  );
}

export type QuickAction = {
  label: string;
  description: string;
  to?: string;
  icon: LucideIcon;
  onClick?: () => void;
};

export function ExamQuickActions({
  title = "學習捷徑",
  actions,
}: {
  title?: string;
  actions: QuickAction[];
}) {
  return (
    <section className="premium-home-section v90-home-section v90-quick-section" aria-label={title}>
      <div className="v90-section-heading">
        <h2><V93SectionTitle>{title}</V93SectionTitle></h2>
      </div>
      <div className={`v90-quick-grid is-${actions.length}-items`}>
        {actions.map((action) => {
          const Icon = action.icon;
          const content = (
            <>
              <span className="v90-quick-icon v93-quick-icon">
                <Icon aria-hidden="true" size={24} />
              </span>
              <span className="v93-quick-copy"><strong>{action.label}</strong><small>{action.description}</small></span>
            </>
          );
          return action.to
            ? <Link key={action.label} className="v90-quick-action" to={action.to}>{content}</Link>
            : <button key={action.label} type="button" className="v90-quick-action" onClick={action.onClick}>{content}</button>;
        })}
      </div>
    </section>
  );
}

export type SubjectPathItem = {
  id: string;
  title: string;
  progress: number;
  answered: number;
  total: number;
  to: string;
  meta?: ReactNode;
};

export function ExamSubjectPath({
  title = "考科學習路徑",
  items,
}: {
  title?: string;
  items: SubjectPathItem[];
}) {
  return (
    <section id="learning-path" className="premium-home-section v90-home-section v90-subject-section" aria-labelledby="v90-path-title">
      <div className="v90-section-heading">
        <h2 id="v90-path-title"><V93SectionTitle>{title}</V93SectionTitle></h2>
      </div>
      <ol className={`v90-subject-path is-${items.length}-items`}>
        {items.map((item, index) => (
          <li key={item.id}>
            <span className="v90-path-index" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
            <Link className="v90-path-content" to={item.to}>
              <span className="v90-path-copy">
                <h3>{item.title}</h3>
                <small>進度 {item.progress}%</small>
                <small>已作答 {item.answered.toLocaleString()} 題</small>
                {item.meta ? <em>{item.meta}</em> : null}
              </span>
              <span className="v90-path-progress">
                <span><i style={{ width: `${Math.min(100, Math.max(0, item.progress))}%` }} /></span>
              </span>
              <ArrowRight aria-hidden="true" size={19} />
            </Link>
          </li>
        ))}
      </ol>
    </section>
  );
}

export type ExamLearningSummaryProps = {
  tone: ExamThemeTone;
  weeklyValues: number[];
  weeklyAnswered: number;
  completion: number;
  studyTimeLabel: string;
  examDate: string | null;
  subjectCount: number;
  totalQuestions: number;
  mockTimeLabel: string;
  onEditPlan: () => void;
};

export function ExamLearningSummary({
  tone,
  weeklyValues,
  weeklyAnswered,
  completion,
  studyTimeLabel,
  examDate,
  subjectCount,
  totalQuestions,
  mockTimeLabel,
  onEditPlan,
}: ExamLearningSummaryProps) {
  const circumference = 2 * Math.PI * 34;
  const dashOffset = circumference * (1 - Math.min(100, Math.max(0, completion)) / 100);
  return (
    <section id="learning-summary" className={`v90-learning-summary is-${tone}`} aria-label="學習數據與考試資訊">
      <article className="v90-learning-data-card">
        <div className="v90-section-heading is-inline">
          <h2><V93SectionTitle>學習數據摘要</V93SectionTitle></h2>
          <span>近 7 天</span>
        </div>
        <div className="v90-learning-data-grid">
          <div className="v90-weekly-chart-block">
            <div><small>作答趨勢</small><strong>{weeklyAnswered.toLocaleString()}<em>題</em></strong></div>
            <SketchLearningChart values={weeklyValues} />
          </div>
          <div className="v90-summary-divider" aria-hidden="true" />
          <div className="v90-summary-ring-block">
            <small>完成率</small>
            <div className="v90-summary-ring">
              <svg viewBox="0 0 80 80" aria-hidden="true">
                <circle cx="40" cy="40" r="34" className="is-track" />
                <circle cx="40" cy="40" r="34" className="is-value" strokeDasharray={circumference} strokeDashoffset={dashOffset} />
              </svg>
              <strong>{Math.round(completion)}%</strong>
            </div>
          </div>
          <div className="v90-summary-divider" aria-hidden="true" />
          <div className="v90-study-time-block">
            <small>累積學習</small>
            <strong>{studyTimeLabel}</strong>
            <span>持續留下穩定紀錄</span>
          </div>
        </div>
      </article>

      <article className="v90-exam-info-card">
        <div className="v90-section-heading is-inline"><h2><V93SectionTitle>考試資訊</V93SectionTitle></h2></div>
        <dl>
          <div><dt>考試日期</dt><dd>{formatExamDate(examDate)}</dd></div>
          <div><dt>考科數</dt><dd>{subjectCount} 科</dd></div>
          <div><dt>題庫規模</dt><dd>{totalQuestions.toLocaleString()} 題</dd></div>
          <div><dt>模擬考</dt><dd>{mockTimeLabel}</dd></div>
        </dl>
        <SketchExamInfoArt />
        <button type="button" onClick={onEditPlan}>查看計畫<ArrowRight aria-hidden="true" size={17} /></button>
      </article>
    </section>
  );
}


export function PlanButton({ children, onClick }: { children: ReactNode; onClick: () => void }) {
  return (
    <GlassButton className="premium-inline-plan-button" variant="secondary" onClick={onClick}>
      <CalendarDays aria-hidden="true" size={17} />
      {children}
    </GlassButton>
  );
}
