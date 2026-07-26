import { ArrowRight, LockKeyhole } from "lucide-react";
import { useEffect, useState } from "react";
import { useAuth, type ExamId } from "../auth/AuthContext";
import { GlassLinkButton } from "../components/GlassButton";
import { ExamBrandMark, type ExamBrandKind } from "../components/ExamBrandMark";
import { GlassCard } from "../components/GlassCard";
import { ProgressBar } from "../components/ProgressBar";
import { useAsync } from "../hooks/useAsync";
import { EXAM_QUESTION_COUNTS, loadExamProgress } from "../lib/examProgress";
import { FOREIGN_EXCHANGE_PROGRESS_CHANGED } from "../lib/foreignExchangeProgress";
import { USER_STORAGE_SCOPE_CHANGED } from "../lib/userScopedStorage";

const EXAMS: Array<{
  id: ExamId;
  title: string;
  description: string;
  subjectCount: string;
  destination: string;
  activationDestination: string;
  logoKind: ExamBrandKind;
}> = [
  {
    id: "senior-securities",
    title: "證券高業",
    description: "投資學、財務分析、證券交易相關法規與實務。",
    subjectCount: "3考科",
    destination: "/securities",
    activationDestination: "/activate?exam=senior-securities",
    logoKind: "securities",
  },
  {
    id: "junior-foreign-exchange",
    title: "初階外匯",
    description: "第23至47屆，涵蓋國外匯兌與進出口外匯。",
    subjectCount: "2考科／25屆",
    destination: "/foreign-exchange",
    activationDestination: "/activate?exam=junior-foreign-exchange",
    logoKind: "foreign-exchange",
  },
];

export function ExamCatalogPage() {
  const { hasExamAccess } = useAuth();
  const [refreshKey, setRefreshKey] = useState(0);
  const { data } = useAsync(loadExamProgress, [refreshKey]);

  useEffect(() => {
    const refresh = () => setRefreshKey((value) => value + 1);
    window.addEventListener("records:changed", refresh);
    window.addEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("records:changed", refresh);
      window.removeEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  return (
    <div className="page-stack exam-catalog product-catalog-page exam-catalog-v84">
      <header className="catalog-page-heading">
        <div><p>你的金融證照學習中心</p><h1>選擇題庫</h1></div>
      </header>

      <div className="exam-card-grid product-exam-grid">
        {EXAMS.map((exam) => {
          const active = hasExamAccess(exam.id);
          const progress = data?.[exam.id];
          const questionCount = EXAM_QUESTION_COUNTS[exam.id];
          return (
            <GlassCard key={exam.id} className={`exam-card product-exam-card${active ? " has-access" : " is-locked"}`}>
              <div className="product-exam-card-head">
                <div className="exam-card-icon"><ExamBrandMark kind={exam.logoKind} size={38} /></div>
                <span className={`exam-card-status-v84${active ? " has-access" : " is-locked"}`}>
                  <span aria-hidden="true" className="exam-card-status-dot" />
                  {active ? "可使用" : "尚未開通"}
                </span>
              </div>
              <div className="product-exam-card-copy">
                <h2>{exam.title}</h2>
                <p>{exam.description}</p>
                <div className="product-exam-meta">
                  <span>{questionCount.toLocaleString()}題</span><span>{exam.subjectCount}</span>
                </div>
              </div>
              <div className="product-exam-progress">
                <div><span>學習進度</span><strong>{progress?.progressPercent ?? 0}%</strong></div>
                <ProgressBar
                  value={progress?.answered ?? 0}
                  max={questionCount}
                  label={`已作答 ${(progress?.answered ?? 0).toLocaleString()} / ${questionCount.toLocaleString()} 題`}
                />
                <div className="product-exam-progress-caption">
                  <span>已作答 {(progress?.answered ?? 0).toLocaleString()}題</span>
                  <span>剩餘 {Math.max(0, questionCount - (progress?.answered ?? 0)).toLocaleString()}題</span>
                </div>
              </div>
              <div className="exam-card-actions">
                <GlassLinkButton
                  to={active ? exam.destination : exam.activationDestination}
                  variant="primary"
                  aria-label={active ? `進入${exam.title}題庫` : `輸入${exam.title}啟用碼`}
                >
                  {active ? "進入題庫" : "輸入啟用碼"}
                  {active ? <ArrowRight aria-hidden="true" size={17} /> : <LockKeyhole aria-hidden="true" size={16} />}
                </GlassLinkButton>
              </div>
            </GlassCard>
          );
        })}
      </div>
    </div>
  );
}
