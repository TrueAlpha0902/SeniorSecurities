import { ArrowLeft, CalendarDays, HardDrive, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { useAsync } from "../hooks/useAsync";
import { clearSelectedUserRecords, type ClearRecordPart } from "../lib/db";
import {
  getAnswerModeEnabled,
  getAutoNextCorrectEnabled,
  setAnswerModeEnabled,
  setAutoNextCorrectEnabled,
} from "../lib/appSettings";
import { getStudyPlanConfig, localTodayKey, setStudyPlanConfig, type StudyIntensity } from "../lib/studyPlan";
import { removeScopedStorageItem } from "../lib/userScopedStorage";
import { loadImageQuizBanks, type ImageQuizBank, type ImageQuizChapter } from "../lib/imageQuiz";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { OfflineContentPanel } from "./OfflineContentPanel";

const T = {
  settings: "\u8a2d\u5b9a",
  studyPlan: "調整考試計畫",
  studyPlanDescription: "重新設定考試日期、每天讀書時間與備考強度，首頁每日練習會立即重新計算。",
  studyPlanSaved: "已更新考試計畫",
  examDate: "考試日期",
  dailyStudyMinutes: "每天讀書時間",
  studyIntensity: "備考強度",
  steady: "穩定型",
  standard: "標準型",
  sprint: "衝刺型",
  customMinutes: "自訂分鐘",
  saveStudyPlan: "儲存考試計畫",
  offlineContent: "離線題庫",
  offlineContentDescription: "按科目下載題目資料與 PDF 圖片，沒有網路時仍可練習。",
  correctAnswerMode: "正解模式",
  correctAnswerModeDescription: "開啟後，所有測驗都會直接顯示正解與解析。",
  answerModeOn: "已開啟正解模式",
  answerModeOff: "已關閉正解模式",
  autoNextCorrect: "答對自動下一題",
  autoNextCorrectDescription: "開啟後，答對會自動進入下一題；答錯時仍停留在原題，讓你自行訂正。",
  autoNextOn: "已開啟答對自動下一題",
  autoNextOff: "已關閉答對自動下一題",
  clearRecords: "\u6e05\u9664\u7d00\u9304",
  clearConfirm: "\u78ba\u5b9a\u8981\u6e05\u9664\u9078\u53d6\u7684\u7d00\u9304\u55ce\uff1f",
  clearDone: "\u5df2\u6e05\u9664\u9078\u53d6\u7d00\u9304",
  clearDialogTitle: "\u9078\u64c7\u8981\u6e05\u9664\u7684\u7d00\u9304",
  clearDialogScope: "\u7ae0\u7bc0\u7bc4\u570d",
  clearDialogParts: "\u8cc7\u6599\u985e\u578b",
  globalPracticeProgress: "\u5168\u984c\u5eab\u7df4\u7fd2\u9032\u5ea6",
  bankPracticeProgress: "\u5168\u7ae0\u7df4\u7fd2\u9032\u5ea6",
  dailyPracticeProgress: "今日每日練習進度",
  selectAll: "\u5168\u9078",
  backSettings: "\u56de\u5230\u8a2d\u5b9a",
  cancel: "\u53d6\u6d88",
  clearSelected: "\u6e05\u9664\u9078\u53d6",
  noClearSelection: "\u8acb\u81f3\u5c11\u9078\u64c7\u4e00\u500b\u7ae0\u7bc0\u6216\u5168\u984c\u5eab\u7df4\u7fd2\u9032\u5ea6\uff0c\u4e26\u9078\u64c7\u4e00\u7a2e\u8cc7\u6599\u985e\u578b\u3002",
  loading: "\u8f09\u5165\u8a2d\u5b9a",
  question: "\u984c",
};

const CLEAR_PARTS: { id: ClearRecordPart; label: string }[] = [
  { id: "answers", label: "\u4f5c\u7b54\u7d00\u9304" },
  { id: "wrong", label: "\u932f\u984c\u8a18\u61b6" },
  { id: "favorites", label: "\u6536\u85cf\u984c\u76ee" },
  { id: "progress", label: "\u984c\u76ee\u9032\u5ea6" },
  { id: "sessions", label: "\u6a21\u64ec\u8003\u7d00\u9304" },
];

function dailyPracticeScopeId(): string {
  return `image:daily:${localTodayKey()}:all`;
}

function dailyPlanStorageKey(): string {
  return `quizpwa:daily-plan:${localTodayKey()}`;
}

function buildGlobalClearScopes() {
  return [
    { id: "image:all:all:all", label: T.globalPracticeProgress },
    { id: dailyPracticeScopeId(), label: T.dailyPracticeProgress },
  ];
}
const EMPTY_BANKS: ImageQuizBank[] = [];
const STUDY_TIME_OPTIONS = [30, 60, 90, 120, 240] as const;
const STUDY_INTENSITY_OPTIONS: { id: StudyIntensity; label: string }[] = [
  { id: "steady", label: T.steady },
  { id: "standard", label: T.standard },
  { id: "sprint", label: T.sprint },
];

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
};

type ClearChapterOption = {
  key: string;
  bankId: string;
  chapterId: string;
  chapterTitle: string;
  questionCount: number;
  questionIds: string[];
  progressScopeIds: string[];
};

type SettingsView = "menu" | "clear" | "studyPlan" | "offline";

export function SettingsPanel({ open, onClose }: SettingsPanelProps) {
  const { data, error, loading } = useAsync(loadImageQuizBanks, [open]);
  const banks = data ?? EMPTY_BANKS;
  const clearChapterOptions = useMemo(() => buildClearChapterOptions(banks), [banks]);
  const globalClearScopes = useMemo(() => buildGlobalClearScopes(), []);
  const [answerModeEnabled, setAnswerModeEnabledState] = useState(() => getAnswerModeEnabled());
  const [autoNextCorrectEnabled, setAutoNextCorrectEnabledState] = useState(() => getAutoNextCorrectEnabled());
  const [draftExamDate, setDraftExamDate] = useState(() => getStudyPlanConfig().examDate ?? localTodayKey());
  const [draftStudyMinutes, setDraftStudyMinutes] = useState(() => getStudyPlanConfig().dailyStudyMinutes);
  const [draftIntensity, setDraftIntensity] = useState<StudyIntensity>(() => getStudyPlanConfig().intensity);
  const [selectedParts, setSelectedParts] = useState<Set<ClearRecordPart>>(
    () => new Set(CLEAR_PARTS.map((part) => part.id)),
  );
  const [selectedChapterKeys, setSelectedChapterKeys] = useState<Set<string>>(new Set());
  const [selectedGlobalScopeIds, setSelectedGlobalScopeIds] = useState<Set<string>>(
    () => new Set(globalClearScopes.map((scope) => scope.id)),
  );
  const [message, setMessage] = useState("");
  const [view, setView] = useState<SettingsView>("menu");
  const bankPracticeScopes = useMemo(
    () => banks.map((bank) => ({ id: bankPracticeScopeId(bank.bankId), bankId: bank.bankId, label: `${bank.bankTitle} ${T.bankPracticeProgress}` })),
    [banks],
  );

  useEffect(() => {
    if (!open) {
      return;
    }
    setView("menu");
    setMessage("");
    setAnswerModeEnabledState(getAnswerModeEnabled());
    setAutoNextCorrectEnabledState(getAutoNextCorrectEnabled());
    const currentStudyPlan = getStudyPlanConfig();
    setDraftExamDate(currentStudyPlan.examDate ?? localTodayKey());
    setDraftStudyMinutes(currentStudyPlan.dailyStudyMinutes);
    setDraftIntensity(currentStudyPlan.intensity);
    setSelectedParts(new Set());
    setSelectedChapterKeys(new Set());
    setSelectedGlobalScopeIds(new Set());
  }, [open]);

  if (!open) {
    return null;
  }

  function handleAnswerModeChange(enabled: boolean) {
    setAnswerModeEnabled(enabled);
    setAnswerModeEnabledState(enabled);
    setMessage(enabled ? T.answerModeOn : T.answerModeOff);
  }

  function handleAutoNextCorrectChange(enabled: boolean) {
    setAutoNextCorrectEnabled(enabled);
    setAutoNextCorrectEnabledState(enabled);
    setMessage(enabled ? T.autoNextOn : T.autoNextOff);
  }

  function handleSaveStudyPlan() {
    setStudyPlanConfig({
      examDate: draftExamDate || null,
      dailyStudyMinutes: draftStudyMinutes,
      intensity: draftIntensity,
    });
    setMessage(T.studyPlanSaved);
    window.dispatchEvent(new Event("records:changed"));
  }

  function togglePart(part: ClearRecordPart, selected: boolean) {
    setSelectedParts((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(part);
      } else {
        next.delete(part);
      }
      return next;
    });
  }

  function toggleChapter(chapterKey: string, selected: boolean) {
    setSelectedChapterKeys((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(chapterKey);
      } else {
        next.delete(chapterKey);
      }
      return next;
    });
  }

  function toggleGlobalScope(scopeId: string, selected: boolean) {
    setSelectedGlobalScopeIds((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(scopeId);
      } else {
        next.delete(scopeId);
      }
      return next;
    });
  }

  function toggleBankChapters(bankId: string, selected: boolean) {
    const chapterKeys = clearChapterOptions.filter((chapter) => chapter.bankId === bankId).map((chapter) => chapter.key);
    const practiceScopeId = bankPracticeScopeId(bankId);
    setSelectedChapterKeys((previous) => {
      const next = new Set(previous);
      for (const chapterKey of chapterKeys) {
        if (selected) {
          next.add(chapterKey);
        } else {
          next.delete(chapterKey);
        }
      }
      return next;
    });
    setSelectedGlobalScopeIds((previous) => {
      const next = new Set(previous);
      if (selected) {
        next.add(practiceScopeId);
      } else {
        next.delete(practiceScopeId);
      }
      return next;
    });
  }

  async function handleClearRecords() {
    const selectedChapters = clearChapterOptions.filter((chapter) => selectedChapterKeys.has(chapter.key));
    const hasGlobalProgressScope = selectedParts.has("progress") && selectedGlobalScopeIds.size > 0;
    if ((selectedChapters.length === 0 && !hasGlobalProgressScope) || selectedParts.size === 0) {
      window.alert(T.noClearSelection);
      return;
    }

    if (!window.confirm(T.clearConfirm)) {
      return;
    }

    const fullySelectedBankIds = banks
      .filter((bank) => bank.chapters.every((chapter) => selectedChapterKeys.has(chapterKey(bank.bankId, chapter.chapterId))))
      .map((bank) => bank.bankId);

    const progressScopeIds = unique([
      ...selectedChapters.flatMap((chapter) => chapter.progressScopeIds),
      ...selectedGlobalScopeIds,
    ]);
    for (const bankId of fullySelectedBankIds) {
      progressScopeIds.push(`image:bank:${bankId}:all`);
    }
    if (selectedChapters.length === clearChapterOptions.length) {
      progressScopeIds.push("image:wrong:all:all", "image:favorites:all:all");
    }

    await clearSelectedUserRecords({
      parts: Array.from(selectedParts),
      questionIds: unique(selectedChapters.flatMap((chapter) => chapter.questionIds)),
      progressScopeIds: unique(progressScopeIds),
      sessionBankIds: fullySelectedBankIds,
      clearLegacyQuizSessions: selectedChapters.length === clearChapterOptions.length,
    });
    if (selectedParts.has("progress") && selectedGlobalScopeIds.has(dailyPracticeScopeId())) {
      removeScopedStorageItem(dailyPlanStorageKey());
    }
    setMessage(T.clearDone);
    window.dispatchEvent(new Event("records:changed"));
  }

  function handleClose() {
    setMessage("");
    onClose();
  }

  return (
    <div className="clear-record-overlay" role="presentation">
      <GlassCard
        className={`clear-record-dialog settings-dialog ${view === "menu" ? "settings-menu-dialog" : ""}`}
        as="div"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="clear-record-header">
          <div>
            <p className="eyebrow">{T.settings}</p>
            <h2 id="settings-title">{view === "menu" ? T.settings : view === "studyPlan" ? T.studyPlan : view === "offline" ? T.offlineContent : T.clearDialogTitle}</h2>
          </div>
          <button type="button" className="nav-icon-button" aria-label={T.cancel} title={T.cancel} onClick={handleClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        {message ? <p className="inline-success">{message}</p> : null}
        {error ? <p className="inline-error">{error}</p> : null}

        {view === "menu" ? (
          <div className="settings-menu settings-menu-stack">
            <section className="settings-option-card" aria-label={T.correctAnswerMode}>
              <SelectionCheckbox
                label={T.correctAnswerMode}
                checked={answerModeEnabled}
                onChange={handleAnswerModeChange}
              />
              <p>{T.correctAnswerModeDescription}</p>
            </section>
            <section className="settings-option-card" aria-label={T.autoNextCorrect}>
              <SelectionCheckbox
                label={T.autoNextCorrect}
                checked={autoNextCorrectEnabled}
                onChange={handleAutoNextCorrectChange}
              />
              <p>{T.autoNextCorrectDescription}</p>
            </section>
            <section className="settings-option-card" aria-label={T.studyPlan}>
              <div className="settings-action-card-head">
                <div>
                  <strong>{T.studyPlan}</strong>
                  <p>{T.studyPlanDescription}</p>
                </div>
                <GlassButton variant="secondary" onClick={() => setView("studyPlan")}>
                  <CalendarDays aria-hidden="true" size={19} />
                  <span>{T.studyPlan}</span>
                </GlassButton>
              </div>
            </section>
            <section className="settings-option-card" aria-label={T.offlineContent}>
              <div className="settings-action-card-head">
                <div>
                  <strong>{T.offlineContent}</strong>
                  <p>{T.offlineContentDescription}</p>
                </div>
                <GlassButton variant="secondary" onClick={() => setView("offline")}>
                  <HardDrive aria-hidden="true" size={19} />
                  <span>管理離線內容</span>
                </GlassButton>
              </div>
            </section>
            <GlassButton variant="danger" className="settings-danger-button" onClick={() => setView("clear")}>
              <Trash2 aria-hidden="true" size={20} />
              <span>{T.clearRecords}</span>
            </GlassButton>
          </div>
         ) : view === "studyPlan" ? (
          <>
            <div className="settings-study-plan-form">
              <label className="exam-date-field">
                <span>{T.examDate}</span>
                <input
                  type="date"
                  min={localTodayKey()}
                  value={draftExamDate}
                  onChange={(event) => setDraftExamDate(event.currentTarget.value)}
                />
              </label>

              <section className="smart-setup-section" aria-label={T.dailyStudyMinutes}>
                <span>{T.dailyStudyMinutes}</span>
                <div className="setup-choice-grid setup-time-grid">
                  {STUDY_TIME_OPTIONS.map((minutes) => (
                    <button
                      key={minutes}
                      type="button"
                      className={`setup-choice-button ${draftStudyMinutes === minutes ? "is-selected" : ""}`}
                      onClick={() => setDraftStudyMinutes(minutes)}
                    >
                      {minutes} 分鐘
                    </button>
                  ))}
                </div>
                <label className="custom-minutes-field">
                  <span>{T.customMinutes}</span>
                  <input
                    type="number"
                    min={15}
                    max={720}
                    step={5}
                    value={draftStudyMinutes}
                    onChange={(event) => setDraftStudyMinutes(Number(event.currentTarget.value))}
                  />
                </label>
              </section>

              <section className="smart-setup-section" aria-label={T.studyIntensity}>
                <span>{T.studyIntensity}</span>
                <div className="setup-choice-grid settings-intensity-grid">
                  {STUDY_INTENSITY_OPTIONS.map((option) => (
                    <button
                      key={option.id}
                      type="button"
                      className={`setup-choice-button ${draftIntensity === option.id ? "is-selected" : ""}`}
                      onClick={() => setDraftIntensity(option.id)}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </section>
            </div>

            <div className="clear-record-actions">
              <GlassButton variant="secondary" onClick={() => setView("menu")}>
                <ArrowLeft aria-hidden="true" size={18} />
                <span>{T.backSettings}</span>
              </GlassButton>
              <GlassButton variant="primary" onClick={handleSaveStudyPlan}>
                <CalendarDays aria-hidden="true" size={18} />
                <span>{T.saveStudyPlan}</span>
              </GlassButton>
            </div>
          </>
        ) : view === "offline" ? (
          <>
            <OfflineContentPanel />
            <div className="clear-record-actions">
              <GlassButton variant="secondary" onClick={() => setView("menu")}>
                <ArrowLeft aria-hidden="true" size={18} />
                <span>{T.backSettings}</span>
              </GlassButton>
            </div>
          </>
        ) : (
          <>
            <div className="clear-record-body">
              <section className="clear-record-section" aria-label={T.clearDialogParts}>
                <div className="clear-section-title-row">
                  <h3>{T.clearDialogParts}</h3>
                  <SelectionCheckbox
                    label={T.selectAll}
                    checked={selectedParts.size === CLEAR_PARTS.length}
                    onChange={(checked) => setSelectedParts(checked ? new Set(CLEAR_PARTS.map((part) => part.id)) : new Set())}
                  />
                </div>
                <div className="clear-part-list">
                  {CLEAR_PARTS.map((part) => (
                    <SelectionCheckbox
                      key={part.id}
                      label={part.label}
                      checked={selectedParts.has(part.id)}
                      onChange={(checked) => togglePart(part.id, checked)}
                    />
                  ))}
                </div>
              </section>

              <section className="clear-record-section clear-chapter-section" aria-label={T.clearDialogScope}>
                <div className="clear-section-title-row">
                  <h3>{loading ? T.loading : T.clearDialogScope}</h3>
                  <SelectionCheckbox
                    label={T.selectAll}
                    checked={
                      selectedChapterKeys.size === clearChapterOptions.length &&
                      selectedGlobalScopeIds.size === globalClearScopes.length + bankPracticeScopes.length
                    }
                    onChange={(checked) => {
                      setSelectedChapterKeys(checked ? new Set(clearChapterOptions.map((chapter) => chapter.key)) : new Set());
                      setSelectedGlobalScopeIds(
                        checked
                          ? new Set([...globalClearScopes.map((scope) => scope.id), ...bankPracticeScopes.map((scope) => scope.id)])
                          : new Set(),
                      );
                    }}
                  />
                </div>
                <div className="clear-bank-list">
                  <div className="clear-global-list">
                    {globalClearScopes.map((scope) => (
                      <SelectionCheckbox
                        key={scope.id}
                        label={scope.label}
                        checked={selectedGlobalScopeIds.has(scope.id)}
                        onChange={(checked) => toggleGlobalScope(scope.id, checked)}
                      />
                    ))}
                  </div>
                  {banks.map((bank) => {
                    const bankChapters = clearChapterOptions.filter((chapter) => chapter.bankId === bank.bankId);
                    const selectedCount = bankChapters.filter((chapter) => selectedChapterKeys.has(chapter.key)).length;
                    const practiceScopeId = bankPracticeScopeId(bank.bankId);
                    return (
                      <div className="clear-bank-group" key={bank.bankId}>
                        <div className="clear-bank-head">
                          <strong>{bank.bankTitle}</strong>
                          <SelectionCheckbox
                            label={`${T.selectAll} ${selectedCount}/${bankChapters.length}`}
                            checked={selectedCount === bankChapters.length && selectedGlobalScopeIds.has(practiceScopeId)}
                            onChange={(checked) => toggleBankChapters(bank.bankId, checked)}
                          />
                        </div>
                        <div className="clear-chapter-list">
                          <SelectionCheckbox
                            label={`${bank.bankTitle} ${T.bankPracticeProgress}`}
                            checked={selectedGlobalScopeIds.has(practiceScopeId)}
                            onChange={(checked) => toggleGlobalScope(practiceScopeId, checked)}
                          />
                          {bankChapters.map((chapter) => (
                            <SelectionCheckbox
                              key={chapter.key}
                              label={`${chapter.chapterTitle} / ${chapter.questionCount} ${T.question}`}
                              checked={selectedChapterKeys.has(chapter.key)}
                              onChange={(checked) => toggleChapter(chapter.key, checked)}
                            />
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>
            </div>

            <div className="clear-record-actions">
              <GlassButton variant="secondary" onClick={() => setView("menu")}>
                <ArrowLeft aria-hidden="true" size={18} />
                <span>{T.backSettings}</span>
              </GlassButton>
              <GlassButton
                variant="danger"
                disabled={
                  selectedParts.size === 0 ||
                  (selectedChapterKeys.size === 0 && (!selectedParts.has("progress") || selectedGlobalScopeIds.size === 0))
                }
                onClick={() => void handleClearRecords()}
              >
                <Trash2 aria-hidden="true" size={18} />
                <span>{T.clearSelected}</span>
              </GlassButton>
            </div>
          </>
        )}
      </GlassCard>
    </div>
  );
}

function SelectionCheckbox({
  label,
  checked,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (checked: boolean) => void;
}) {
  return (
    <label className="selection-checkbox">
      <input type="checkbox" checked={checked} disabled={disabled} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span>{label}</span>
    </label>
  );
}

function buildClearChapterOptions(banks: ImageQuizBank[]): ClearChapterOption[] {
  return banks.flatMap((bank) =>
    bank.chapters.map((chapter) => ({
      key: chapterKey(bank.bankId, chapter.chapterId),
      bankId: bank.bankId,
      chapterId: chapter.chapterId,
      chapterTitle: displayClearChapterTitle(chapter),
      questionCount: chapter.questionCount,
      questionIds: chapter.questions.map((question) => question.id),
      progressScopeIds: buildChapterProgressScopeIds(bank.bankId, chapter),
    })),
  );
}

function buildChapterProgressScopeIds(bankId: string, chapter: ImageQuizChapter): string[] {
  const sourceBankId = chapter.sourceBankId ?? chapter.bankId;
  const sourceChapterId = chapter.sourceChapterId ?? chapter.chapterId;
  return unique([
    `image:chapter:${bankId}:${chapter.chapterId}`,
    `image:chapter:${sourceBankId}:${sourceChapterId}`,
  ]);
}

function displayClearChapterTitle(chapter: ImageQuizChapter): string {
  return [chapter.chapterTitle, chapter.chapterTopic].filter(Boolean).join(" ");
}

function chapterKey(bankId: string, chapterId: string): string {
  return `${bankId}::${chapterId}`;
}

function bankPracticeScopeId(bankId: string): string {
  return `image:bank:${bankId}:all`;
}

function unique<T>(values: T[]): T[] {
  return Array.from(new Set(values));
}
