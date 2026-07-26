import {
  ArrowRight,
  BadgeDollarSign,
  BookOpenCheck,
  CheckCircle2,
  LockKeyhole,
} from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth, type ExamId } from "../auth/AuthContext";
import { GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { useAsync } from "../hooks/useAsync";
import {
  EXAM_QUESTION_COUNTS,
  loadExamProgress,
} from "../lib/examProgress";
import { FOREIGN_EXCHANGE_PROGRESS_CHANGED } from "../lib/foreignExchangeProgress";
import { USER_STORAGE_SCOPE_CHANGED } from "../lib/userScopedStorage";

type ExamCardConfig = {
  id: ExamId;
  title: string;
  subjectCount: string;
  destination: string;
  activationDestination: string;
  icon: typeof BadgeDollarSign;
};

const EXAMS: ExamCardConfig[] = [
  {
    id: "senior-securities",
    title: "證券高業",
    subjectCount: "3 科",
    destination: "/securities",
    activationDestination: "/activate?exam=senior-securities",
    icon: BadgeDollarSign,
  },
  {
    id: "junior-foreign-exchange",
    title: "初階外匯",
    subjectCount: "2 科",
    destination: "/foreign-exchange",
    activationDestination: "/activate?exam=junior-foreign-exchange",
    icon: BookOpenCheck,
  },
];

export function ExamCatalogPage() {
  const { hasExamAccess } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data } = useAsync(loadExamProgress, [refreshKey]);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("records:changed", refresh);
    window.addEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refreshWhenVisible);

    return () => {
      window.removeEventListener("records:changed", refresh);
      window.removeEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refreshWhenVisible);
    };
  }, []);

  return (
    <div className="page-stack exam-catalog">
      <GlassCard className="exam-catalog-head">
        <h1>金融證照題庫</h1>
      </GlassCard>

      <div className="exam-card-grid">
        {EXAMS.map((exam) => {
          const Icon = exam.icon;
          const active = hasExamAccess(exam.id);
          const questionCount = EXAM_QUESTION_COUNTS[exam.id];
          const progress = data?.[exam.id];
          const progressPercent = progress?.progressPercent ?? 0;
          const answered = progress?.answered ?? 0;

          return (
            <GlassCard key={exam.id} className="exam-card exam-card-with-progress">
              <div className="exam-card-top">
                <div className="exam-card-icon">
                  <Icon aria-hidden="true" size={25} />
                </div>
                <span className={`exam-card-status${active ? "" : " is-locked"}`}>
                  {active ? (
                    <CheckCircle2 aria-hidden="true" size={15} />
                  ) : (
                    <LockKeyhole aria-hidden="true" size={15} />
                  )}
                  {active ? "已開通" : "尚未開通"}
                </span>
              </div>

              <div className="exam-card-main">
                <div className="exam-card-copy">
                  <h2>{exam.title}</h2>
                  <div className="exam-card-meta">
                    <span>{questionCount.toLocaleString()} 題</span>
                    <span>{exam.subjectCount}</span>
                  </div>
                  <span className="exam-card-answered">
                    已作答 {answered.toLocaleString()} 題
                  </span>
                </div>

                <CircularExamProgress
                  title={exam.title}
                  percent={progressPercent}
                />
              </div>

              <div className="exam-card-actions">
                <GlassLinkButton
                  to={active ? exam.destination : exam.activationDestination}
                  variant="primary"
                >
                  {active ? "進入題庫" : "輸入啟用碼"}
                  <ArrowRight aria-hidden="true" size={17} />
                </GlassLinkButton>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}

function CircularExamProgress({
  title,
  percent,
}: {
  title: string;
  percent: number;
}) {
  const normalized = Math.min(100, Math.max(0, Math.round(percent)));

  return (
    <figure
      className="exam-progress-circle"
      role="img"
      aria-label={`${title}學習進度 ${normalized}%`}
    >
      <svg viewBox="0 0 72 72" aria-hidden="true">
        <circle className="exam-progress-circle-track" cx="36" cy="36" r="29" />
        <circle
          className="exam-progress-circle-value"
          cx="36"
          cy="36"
          r="29"
          pathLength="100"
          strokeDasharray="100"
          strokeDashoffset={100 - normalized}
        />
      </svg>
      <figcaption>
        <strong>{normalized}%</strong>
        <span>進度</span>
      </figcaption>
    </figure>
  );
}
