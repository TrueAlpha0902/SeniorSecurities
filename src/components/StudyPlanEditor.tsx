import type { StudyIntensity, StudyPlanConfig } from "../lib/studyPlan";
import { localTodayKey } from "../lib/studyPlan";

export const STUDY_TIME_OPTIONS = [30, 60, 90, 120, 240] as const;
export const STUDY_INTENSITY_OPTIONS: Array<{
  id: StudyIntensity;
  label: string;
  description: string;
}> = [
  { id: "steady", label: "穩定型", description: "保留較多複習時間，適合長期準備。" },
  { id: "standard", label: "標準型", description: "新題、錯題與複習平均分配。" },
  { id: "sprint", label: "衝刺型", description: "提高每日新題量，適合考前衝刺。" },
];

type StudyPlanEditorProps = {
  value: StudyPlanConfig;
  onChange: (next: StudyPlanConfig) => void;
  compact?: boolean;
};

export function StudyPlanEditor({ value, onChange, compact = false }: StudyPlanEditorProps) {
  return (
    <div className={`study-plan-editor${compact ? " is-compact" : ""}`}>
      <label className="exam-date-field">
        <span>考試日期</span>
        <input
          type="date"
          min={localTodayKey()}
          value={value.examDate ?? ""}
          onChange={(event) => onChange({ ...value, examDate: event.currentTarget.value || null })}
        />
      </label>

      <section className="smart-setup-section" aria-label="每天讀書時間">
        <span>每天讀書時間</span>
        <div className="setup-choice-grid setup-time-grid">
          {STUDY_TIME_OPTIONS.map((minutes) => (
            <button
              key={minutes}
              type="button"
              aria-pressed={value.dailyStudyMinutes === minutes}
              className={`setup-choice-button${value.dailyStudyMinutes === minutes ? " is-selected" : ""}`}
              onClick={() => onChange({ ...value, dailyStudyMinutes: minutes })}
            >
              {minutes} 分鐘
            </button>
          ))}
        </div>
        <label className="custom-minutes-field">
          <span>自訂分鐘</span>
          <input
            type="number"
            min={15}
            max={720}
            step={5}
            value={value.dailyStudyMinutes}
            onChange={(event) => onChange({ ...value, dailyStudyMinutes: Number(event.currentTarget.value) })}
          />
        </label>
      </section>

      <section className="smart-setup-section" aria-label="備考強度">
        <span>備考強度</span>
        <div className="setup-choice-grid settings-intensity-grid">
          {STUDY_INTENSITY_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              aria-pressed={value.intensity === option.id}
              className={`setup-choice-button setup-intensity-button${value.intensity === option.id ? " is-selected" : ""}`}
              onClick={() => onChange({ ...value, intensity: option.id })}
            >
              <strong>{option.label}</strong>
              {compact ? null : <small>{option.description}</small>}
            </button>
          ))}
        </div>
      </section>
    </div>
  );
}
