import { ArrowRight, BadgeDollarSign, BookOpenCheck, CheckCircle2, LockKeyhole } from "lucide-react";
import { useAuth, type ExamId } from "../auth/AuthContext";
import { GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";

type ExamCardConfig = {
  id: ExamId;
  title: string;
  questionCount: string;
  subjectCount: string;
  destination: string;
  activationDestination: string;
  icon: typeof BadgeDollarSign;
};

const EXAMS: ExamCardConfig[] = [
  {
    id: "senior-securities",
    title: "證券高業",
    questionCount: "3,526 題",
    subjectCount: "3 科",
    destination: "/securities",
    activationDestination: "/activate?exam=senior-securities",
    icon: BadgeDollarSign,
  },
  {
    id: "junior-foreign-exchange",
    title: "初階外匯",
    questionCount: "390 題",
    subjectCount: "2 科",
    destination: "/foreign-exchange",
    activationDestination: "/activate?exam=junior-foreign-exchange",
    icon: BookOpenCheck,
  },
];

export function ExamCatalogPage() {
  const { hasExamAccess } = useAuth();

  return (
    <div className="page-stack exam-catalog">
      <GlassCard className="exam-catalog-head">
        <h1>金融證照題庫</h1>
      </GlassCard>

      <div className="exam-card-grid">
        {EXAMS.map((exam) => {
          const Icon = exam.icon;
          const active = hasExamAccess(exam.id);
          return (
            <GlassCard key={exam.id} className="exam-card">
              <div className="exam-card-top">
                <div className="exam-card-icon"><Icon aria-hidden="true" size={25} /></div>
                <span className={`exam-card-status${active ? "" : " is-locked"}`}>
                  {active ? <CheckCircle2 aria-hidden="true" size={15} /> : <LockKeyhole aria-hidden="true" size={15} />}
                  {active ? "已開通" : "尚未開通"}
                </span>
              </div>
              <div>
                <h2>{exam.title}</h2>
                <div className="exam-card-meta">
                  <span>{exam.questionCount}</span>
                  <span>{exam.subjectCount}</span>
                </div>
              </div>
              <div className="exam-card-actions">
                <GlassLinkButton to={active ? exam.destination : exam.activationDestination} variant="primary">
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
