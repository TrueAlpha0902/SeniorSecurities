import { CalendarDays, Trash2, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import {
  clearStudyPlanConfigForExam,
  getStudyPlanConfigForExam,
  getStudyPlanExamTitle,
  setStudyPlanConfigForExam,
  type StudyPlanConfig,
  type StudyPlanExamId,
} from "../lib/studyPlan";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { StudyPlanEditor } from "./StudyPlanEditor";

type ExamStudyPlanDialogProps = {
  examId: StudyPlanExamId;
  onClose: () => void;
  onSaved?: (config: StudyPlanConfig) => void;
};

export function ExamStudyPlanDialog({ examId, onClose, onSaved }: ExamStudyPlanDialogProps) {
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [draft, setDraft] = useState<StudyPlanConfig>(() => getStudyPlanConfigForExam(examId));
  useDialogFocusTrap(true, overlayRef, closeButtonRef, onClose);

  useEffect(() => {
    setDraft(getStudyPlanConfigForExam(examId));
  }, [examId]);

  const examTitle = getStudyPlanExamTitle(examId);

  function save(): void {
    const next: StudyPlanConfig = {
      examDate: draft.examDate || null,
      dailyStudyMinutes: draft.dailyStudyMinutes,
      intensity: draft.intensity,
    };
    setStudyPlanConfigForExam(examId, next);
    onSaved?.(getStudyPlanConfigForExam(examId));
    onClose();
  }

  function clear(): void {
    clearStudyPlanConfigForExam(examId);
    onSaved?.(getStudyPlanConfigForExam(examId));
    onClose();
  }

  return (
    <div
      ref={overlayRef}
      className="clear-record-overlay exam-date-overlay"
      role="presentation"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <GlassCard
        className="exam-setup-dialog exam-plan-dialog-v91"
        as="div"
        role="dialog"
        aria-modal="true"
        aria-labelledby="exam-plan-dialog-title"
      >
        <div className="exam-setup-title-row">
          <div>
            <span>{examTitle}</span>
            <h2 id="exam-plan-dialog-title">共同考試計畫</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="product-icon-button"
            aria-label="關閉考試計畫"
            onClick={onClose}
          >
            <X aria-hidden="true" size={19} />
          </button>
        </div>
        <p className="exam-plan-dialog-description">
          同一題庫只設定一份計畫；旗下所有考科共用考試日期、每日時間與備考強度。
        </p>
        <StudyPlanEditor value={draft} onChange={setDraft} />
        <div className="setup-action-row exam-plan-dialog-actions-v86">
          {draft.examDate ? (
            <GlassButton type="button" variant="secondary" onClick={clear}>
              <Trash2 aria-hidden="true" size={17} />清除計畫
            </GlassButton>
          ) : <span />}
          <div>
            <GlassButton type="button" variant="secondary" onClick={onClose}>取消</GlassButton>
            <GlassButton type="button" variant="primary" onClick={save}>
              <CalendarDays aria-hidden="true" size={18} />儲存計畫
            </GlassButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
