import {
  ArrowLeft,
  CalendarDays,
  Download,
  Settings2,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";
import { useAsync } from "../hooks/useAsync";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import {
  clearSelectedUserRecords,
  listFavoriteQuestions,
  listImageQuizSessions,
  listUserAnswers,
  listWrongQuestions,
  type ClearRecordPart,
} from "../lib/db";
import {
  ANSWER_MODE_SETTING_CHANGED,
  getAnswerModeEnabled,
  getAutoNextCorrectEnabled,
  setAnswerModeEnabled,
  setAutoNextCorrectEnabled,
} from "../lib/appSettings";
import {
  clearForeignExchangeProgress,
  foreignExchangeProgressSummary,
  type ForeignExchangeClearMode,
} from "../lib/foreignExchangeProgress";
import {
  clearStudyPlanConfigForExam,
  formatExamDate,
  getStudyPlanConfigForExam,
  getStudyPlanConfigsByExam,
  getStudyPlanExamTitle,
  getStudyPlanScopesForExam,
  isStudyPlanConfigured,
  localTodayKey,
  setStudyPlanConfigForExam,
  type StudyIntensity,
  type StudyPlanConfig,
  type StudyPlanExamId,
} from "../lib/studyPlan";
import type { SettingsSectionTarget } from "../lib/settingsNavigation";
import { removeScopedStorageItem } from "../lib/userScopedStorage";
import {
  loadImageQuizBankSummaries,
  loadQuestionReleaseManifest,
  type ImageQuizBank,
  type ImageQuizChapter,
  type QuestionReleaseManifest,
} from "../lib/imageQuiz";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { OfflineContentPanel } from "./OfflineContentPanel";
import { StudyPlanEditor } from "./StudyPlanEditor";
import { V93InlineNotice } from "./V93InteractionPrimitives";
import { announceInteractionFeedback } from "../lib/interactionFeedback";

const CLEAR_LEVELS = {
  wrong: {
    title: "清空錯題清單",
    description: "只移除待複習標記；歷史作答、正確率、收藏、進度與測驗紀錄都保留。",
  },
  restart: {
    title: "重新開始進度",
    description: "清除作答、錯題、章節進度與測驗紀錄；保留收藏，適合重新準備一輪。",
  },
  complete: {
    title: "刪除全部學習資料",
    description: "連同作答、錯題、收藏、進度與測驗紀錄全部刪除。",
  },
} as const;

type SettingsPanelProps = {
  open: boolean;
  onClose: () => void;
  initialSection?: SettingsSectionTarget;
  initialPlanExamId?: StudyPlanExamId;
  requestKey?: number;
};

type SettingsSection = SettingsSectionTarget;
type SettingsView = "menu" | "clear" | "studyPlan" | "offline";
type ClearExamScope = "senior-securities" | "junior-foreign-exchange" | "all";
type ClearLevel = keyof typeof CLEAR_LEVELS;

type SettingsData = {
  banks: ImageQuizBank[];
  securitiesQuestionIds: string[];
  securitiesProgressScopeIds: string[];
  recordCounts: Record<ClearExamScope, RecordCountSummary>;
};

type RecordCountSummary = {
  answers: number;
  wrong: number;
  favorites: number;
  sessions: number;
};

function initialSection(pathname: string): SettingsSection {
  if (
    pathname.startsWith("/securities") ||
    pathname.startsWith("/banks") ||
    pathname.startsWith("/image-quiz") ||
    pathname.startsWith("/random") ||
    pathname.startsWith("/similar") ||
    pathname.startsWith("/answer-drill") ||
    pathname.startsWith("/foreign-exchange")
  ) return "plans";
  return "general";
}

function inferPlanExam(pathname: string): StudyPlanExamId {
  return pathname.startsWith("/foreign-exchange")
    ? "junior-foreign-exchange"
    : "senior-securities";
}

function dailyPracticeScopeIds(): string[] {
  return getStudyPlanScopesForExam("senior-securities").map(
    (scope) => `image:daily:${localTodayKey()}:${scope.id}`,
  );
}

function dailyPlanStorageKeys(): string[] {
  return getStudyPlanScopesForExam("senior-securities").map(
    (scope) => `quizpwa:daily-plan:${scope.id}:${localTodayKey()}`,
  );
}

export function SettingsPanel({ open, onClose, initialSection: requestedSection, initialPlanExamId, requestKey = 0 }: SettingsPanelProps) {
  const location = useLocation();
  const overlayRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const [dataRevision, setDataRevision] = useState(0);
  const { data, error, loading } = useAsync(loadSettingsData, [open, dataRevision]);

  const [section, setSection] = useState<SettingsSection>(() => initialSection(location.pathname));
  const [view, setView] = useState<SettingsView>("menu");
  const [message, setMessage] = useState("");
  const [operationError, setOperationError] = useState("");
  const [answerModeEnabled, setAnswerModeEnabledState] = useState(() => getAnswerModeEnabled());
  const [autoNextCorrectEnabled, setAutoNextCorrectEnabledState] = useState(() => getAutoNextCorrectEnabled());
  const [studyPlans, setStudyPlans] = useState(() => getStudyPlanConfigsByExam());
  const [selectedPlanExamId, setSelectedPlanExamId] = useState<StudyPlanExamId>(() => inferPlanExam(location.pathname));
  const [draftExamDate, setDraftExamDate] = useState(() => getStudyPlanConfigForExam(inferPlanExam(location.pathname)).examDate ?? "");
  const [draftStudyMinutes, setDraftStudyMinutes] = useState(() => getStudyPlanConfigForExam(inferPlanExam(location.pathname)).dailyStudyMinutes);
  const [draftIntensity, setDraftIntensity] = useState<StudyIntensity>(() => getStudyPlanConfigForExam(inferPlanExam(location.pathname)).intensity);
  const [clearScope, setClearScope] = useState<ClearExamScope>("senior-securities");
  const [clearLevel, setClearLevel] = useState<ClearLevel>("restart");
  const [clearAcknowledged, setClearAcknowledged] = useState(false);
  const [clearConfirmationOpen, setClearConfirmationOpen] = useState(false);
  const [clearing, setClearing] = useState(false);

  useDialogFocusTrap(open, overlayRef, closeButtonRef);

  useEffect(() => {
    if (!open) return;
    const planExamId = initialPlanExamId ?? inferPlanExam(location.pathname);
    const currentPlans = getStudyPlanConfigsByExam();
    const currentPlan = currentPlans[planExamId];
    setStudyPlans(currentPlans);
    setSelectedPlanExamId(planExamId);
    setSection(requestedSection ?? (initialPlanExamId ? "plans" : initialSection(location.pathname)));
    setView(initialPlanExamId ? "studyPlan" : "menu");
    setMessage("");
    setOperationError("");
    setAnswerModeEnabledState(getAnswerModeEnabled());
    setAutoNextCorrectEnabledState(getAutoNextCorrectEnabled());
    setDraftExamDate(currentPlan.examDate ?? "");
    setDraftStudyMinutes(currentPlan.dailyStudyMinutes);
    setDraftIntensity(currentPlan.intensity);
    setClearScope(location.pathname.startsWith("/foreign-exchange") ? "junior-foreign-exchange" : "senior-securities");
    setClearLevel("restart");
    setClearAcknowledged(false);
    setClearConfirmationOpen(false);
    setClearing(false);
  }, [initialPlanExamId, location.pathname, location.search, open, requestKey, requestedSection]);

  useEffect(() => {
    if (!open) return;
    const refresh = () => {
      setAnswerModeEnabledState(getAnswerModeEnabled());
    };
    window.addEventListener(ANSWER_MODE_SETTING_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(ANSWER_MODE_SETTING_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      if (clearConfirmationOpen) {
        setClearConfirmationOpen(false);
        return;
      }
      if (view !== "menu") {
        setView("menu");
        return;
      }
      onClose();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [clearConfirmationOpen, onClose, open, view]);

  if (!open) return null;

  function changeSection(next: SettingsSection): void {
    setSection(next);
    setMessage("");
    setOperationError("");
  }

  function handleAnswerModeChange(enabled: boolean): void {
    setAnswerModeEnabled(enabled);
    setAnswerModeEnabledState(enabled);
    const nextMessage = `正解模式已${enabled ? "開啟" : "關閉"}。`;
    setMessage(nextMessage);
    announceInteractionFeedback(nextMessage, "success");
  }

  function handleAutoNextCorrectChange(enabled: boolean): void {
    setAutoNextCorrectEnabled(enabled);
    setAutoNextCorrectEnabledState(enabled);
    const nextMessage = enabled
      ? "已開啟答對後自動下一題。"
      : "已關閉自動下一題。";
    setMessage(nextMessage);
    announceInteractionFeedback(nextMessage, "success");
  }

  function openPlanEditor(examId: StudyPlanExamId): void {
    const config = getStudyPlanConfigForExam(examId);
    setSelectedPlanExamId(examId);
    setDraftExamDate(config.examDate ?? "");
    setDraftStudyMinutes(config.dailyStudyMinutes);
    setDraftIntensity(config.intensity);
    setMessage("");
    setView("studyPlan");
  }

  function handleSaveStudyPlan(): void {
    setStudyPlanConfigForExam(selectedPlanExamId, {
      examDate: draftExamDate || null,
      dailyStudyMinutes: draftStudyMinutes,
      intensity: draftIntensity,
    });
    const nextPlans = getStudyPlanConfigsByExam();
    setStudyPlans(nextPlans);
    const nextMessage = `已更新${getStudyPlanExamTitle(selectedPlanExamId)}考試計畫。`;
    setMessage(nextMessage);
    announceInteractionFeedback(nextMessage, "success");
    setSection("plans");
    setView("menu");
    window.dispatchEvent(new Event("records:changed"));
  }

  function handleClearStudyPlan(): void {
    clearStudyPlanConfigForExam(selectedPlanExamId);
    const nextPlans = getStudyPlanConfigsByExam();
    const config = nextPlans[selectedPlanExamId];
    setStudyPlans(nextPlans);
    setDraftExamDate(config.examDate ?? "");
    setDraftStudyMinutes(config.dailyStudyMinutes);
    setDraftIntensity(config.intensity);
    const nextMessage = `已清除${getStudyPlanExamTitle(selectedPlanExamId)}考試計畫。`;
    setMessage(nextMessage);
    announceInteractionFeedback(nextMessage, "success");
    setSection("plans");
    setView("menu");
    window.dispatchEvent(new Event("records:changed"));
  }

  async function handleClearRecords(): Promise<void> {
    if (!data || !clearAcknowledged || clearing) return;
    setClearing(true);
    setMessage("");
    setOperationError("");
    try {
      if (clearScope === "senior-securities" || clearScope === "all") {
        const parts = clearPartsForLevel(clearLevel);
        await clearSelectedUserRecords({
          parts,
          questionIds: data.securitiesQuestionIds,
          progressScopeIds: data.securitiesProgressScopeIds,
          sessionBankIds: data.banks.map((bank) => bank.bankId),
          clearLegacyQuizSessions: parts.includes("sessions"),
        });
        if (parts.includes("progress")) {
          dailyPlanStorageKeys().forEach((key) => removeScopedStorageItem(key));
        }
      }

      if (clearScope === "junior-foreign-exchange" || clearScope === "all") {
        await clearForeignExchangeProgress(clearLevel as ForeignExchangeClearMode);
      }

      setClearConfirmationOpen(false);
      setClearAcknowledged(false);
      setDataRevision((value) => value + 1);
      const nextMessage = "已完成學習資料重設。";
      setMessage(nextMessage);
      announceInteractionFeedback(nextMessage, "success", 3600);
      window.dispatchEvent(new Event("records:changed"));
    } catch (reason) {
      const nextError = reason instanceof Error
        ? reason.message
        : "無法完成學習資料重設，請稍後再試。";
      announceInteractionFeedback(nextError, "error", 5200);
      setMessage("");
      setOperationError(nextError);
    } finally {
      setClearing(false);
    }
  }

  const title = view === "studyPlan"
    ? `${getStudyPlanExamTitle(selectedPlanExamId)}考試計畫`
    : view === "offline"
      ? "離線題庫"
      : view === "clear"
        ? "重設學習資料"
        : "設定";

  return (
    <div
      ref={overlayRef}
      className="clear-record-overlay settings-overlay"
      role="presentation"
      tabIndex={-1}
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && view === "menu" && !clearConfirmationOpen) onClose();
      }}
    >
      <GlassCard
        className={`clear-record-dialog settings-dialog${view === "menu" ? " settings-menu-dialog" : ""}`}
        as="div"
        role="dialog"
        aria-modal="true"
        aria-labelledby="settings-title"
      >
        <div className="clear-record-header settings-dialog-header">
          <div>
            <p className="eyebrow">個人偏好</p>
            <h2 id="settings-title">{title}</h2>
          </div>
          <button
            ref={closeButtonRef}
            type="button"
            className="nav-icon-button"
            aria-label="關閉設定"
            title="關閉設定"
            onClick={onClose}
          >
            <X aria-hidden="true" size={20} />
          </button>
        </div>

        {message ? <V93InlineNotice tone="success">{message}</V93InlineNotice> : null}
        {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
        {operationError ? <V93InlineNotice tone="error">{operationError}</V93InlineNotice> : null}

        {view === "menu" ? (
          <div className="settings-workspace">
            <nav className="settings-section-tabs" role="tablist" aria-label="設定分類">
              <SettingsTab active={section === "general"} icon={<Settings2 size={17} />} label="一般" onClick={() => changeSection("general")} />
              <SettingsTab active={section === "plans"} icon={<CalendarDays size={17} />} label="考試計畫" onClick={() => changeSection("plans")} />
              <SettingsTab active={section === "data"} icon={<Download size={17} />} label="資料管理" onClick={() => changeSection("data")} />
            </nav>

            <div className="settings-section-content">
              {section === "general" ? (
                <SettingsSection title="一般" description="兩個題庫共用的練習偏好。">
                  <ToggleSetting
                    label="正解模式"
                    description="預設關閉；開啟後，一般練習直接顯示答案與解析，模擬考不受影響。"
                    checked={answerModeEnabled}
                    onChange={handleAnswerModeChange}
                  />
                  <ToggleSetting
                    label="答對後自動下一題"
                    description="答對後自動進入下一題；答錯時停留在原題，以便閱讀解析。"
                    checked={autoNextCorrectEnabled}
                    onChange={handleAutoNextCorrectChange}
                  />
                </SettingsSection>
              ) : null}

              {section === "plans" ? (
                <SettingsSection
                  title="考試計畫"
                  description="每個題庫共用一個考試日期與每日讀書時間，系統會自動分配到各考科。"
                >
                  <div className="settings-plan-list-v86">
                    <StudyPlanSettingRow
                      title="證券高業"
                      subjects={["投資學", "財務分析", "證券相關法規與實務"]}
                      config={studyPlans["senior-securities"]}
                      onClick={() => openPlanEditor("senior-securities")}
                    />
                    <StudyPlanSettingRow
                      title="初階外匯"
                      subjects={["國外匯兌業務", "進出口外匯業務"]}
                      config={studyPlans["junior-foreign-exchange"]}
                      onClick={() => openPlanEditor("junior-foreign-exchange")}
                    />
                  </div>
                </SettingsSection>
              ) : null}

              {section === "data" ? (
                <SettingsSection title="資料管理" description="管理文字離線包與學習資料。">
                  <ActionSetting
                    title="文字離線題庫"
                    description="按科目下載文字題目與解析，不包含掃描頁。"
                    action="管理離線內容"
                    icon={<Download size={18} />}
                    onClick={() => setView("offline")}
                  />
                  <ActionSetting
                    title="重設學習資料"
                    description="依題庫選擇安全的重設層級；預設保留收藏。"
                    action="選擇重設方式"
                    icon={<Trash2 size={18} />}
                    danger
                    onClick={() => setView("clear")}
                  />
                </SettingsSection>
              ) : null}
            </div>
          </div>
        ) : view === "studyPlan" ? (
          <>
            <div className="settings-study-plan-form">
              <StudyPlanEditor
                value={{
                  examDate: draftExamDate || null,
                  dailyStudyMinutes: draftStudyMinutes,
                  intensity: draftIntensity,
                }}
                onChange={(next) => {
                  setDraftExamDate(next.examDate ?? "");
                  setDraftStudyMinutes(next.dailyStudyMinutes);
                  setDraftIntensity(next.intensity);
                }}
              />
            </div>
            <DialogActions onBack={() => { setSection("plans"); setView("menu"); }}>
              {isStudyPlanConfigured(studyPlans[selectedPlanExamId]) ? (
                <GlassButton variant="secondary" onClick={handleClearStudyPlan}>
                  <Trash2 aria-hidden="true" size={18} />清除計畫
                </GlassButton>
              ) : null}
              <GlassButton variant="primary" onClick={handleSaveStudyPlan}>
                <CalendarDays aria-hidden="true" size={18} />儲存計畫
              </GlassButton>
            </DialogActions>
          </>
        ) : view === "offline" ? (
          <>
            <OfflineContentPanel />
            <DialogActions onBack={() => setView("menu")} />
          </>
        ) : (
          <>
            <div className="memory-reset-workspace">
              <section className="memory-reset-intro">
                <span aria-hidden="true"><ShieldCheck size={22} /></span>
                <div>
                  <h3>先保留重要資料，再重設需要重新練習的部分</h3>
                  <p>建議選擇「重新開始進度」：重做整套題庫時仍保留你整理過的收藏題目。</p>
                </div>
              </section>

              <fieldset className="memory-reset-group">
                <legend>要重設哪一套題庫？</legend>
                <div className="memory-reset-choice-grid is-scope">
                  <ResetChoice title="證券高業" description={recordCountLabel(data?.recordCounts["senior-securities"])} selected={clearScope === "senior-securities"} onClick={() => setClearScope("senior-securities")} />
                  <ResetChoice title="初階外匯" description={recordCountLabel(data?.recordCounts["junior-foreign-exchange"])} selected={clearScope === "junior-foreign-exchange"} onClick={() => setClearScope("junior-foreign-exchange")} />
                  <ResetChoice title="全部題庫" description={recordCountLabel(data?.recordCounts.all)} selected={clearScope === "all"} onClick={() => setClearScope("all")} />
                </div>
              </fieldset>

              <fieldset className="memory-reset-group">
                <legend>要清除到什麼程度？</legend>
                <div className="memory-reset-choice-grid is-level">
                  {(Object.keys(CLEAR_LEVELS) as ClearLevel[]).map((level) => (
                    <ResetChoice
                      key={level}
                      title={CLEAR_LEVELS[level].title}
                      description={CLEAR_LEVELS[level].description}
                      selected={clearLevel === level}
                      recommended={level === "restart"}
                      danger={level === "complete"}
                      onClick={() => {
                        setClearLevel(level);
                        setClearAcknowledged(false);
                      }}
                    />
                  ))}
                </div>
              </fieldset>

              <section className="memory-reset-summary" aria-live="polite">
                <strong>本次操作</strong>
                <p>{clearScopeLabel(clearScope)}／{CLEAR_LEVELS[clearLevel].title}</p>
                <span>{clearImpactLabel(clearLevel, data?.recordCounts[clearScope])}</span>
              </section>

              <label className="memory-reset-acknowledgement">
                <input type="checkbox" checked={clearAcknowledged} onChange={(event) => setClearAcknowledged(event.currentTarget.checked)} />
                <span>我了解清除後會同步更新雲端紀錄，且無法從 App 內復原。</span>
              </label>
            </div>

            <DialogActions onBack={() => setView("menu")}>
              <GlassButton
                variant="danger"
                disabled={!clearAcknowledged || loading || clearing}
                onClick={() => setClearConfirmationOpen(true)}
              >
                <Trash2 aria-hidden="true" size={18} />{clearing ? "處理中" : "確認重設"}
              </GlassButton>
            </DialogActions>
          </>
        )}

        {clearConfirmationOpen ? (
          <div className="settings-confirmation" role="alertdialog" aria-modal="true" aria-labelledby="clear-confirm-title">
            <div>
              <h3 id="clear-confirm-title">最後確認</h3>
              <p>{clearScopeLabel(clearScope)}將執行「{CLEAR_LEVELS[clearLevel].title}」。</p>
            </div>
            <div className="button-row">
              <GlassButton variant="secondary" disabled={clearing} onClick={() => setClearConfirmationOpen(false)}>取消</GlassButton>
              <GlassButton variant="danger" busy={clearing} disabled={clearing} onClick={() => void handleClearRecords()}>{clearing ? "正在重設" : "執行重設"}</GlassButton>
            </div>
          </div>
        ) : null}
      </GlassCard>
    </div>
  );
}

function SettingsTab({ active, icon, label, onClick }: { active: boolean; icon: React.ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      type="button"
      role="tab"
      className={active ? "is-active" : ""}
      aria-selected={active}
      tabIndex={active ? 0 : -1}
      onClick={onClick}
    >
      {icon}<span>{label}</span>
    </button>
  );
}

function SettingsSection({ title, description, children }: { title: string; description: string; children: React.ReactNode }) {
  return (
    <section className="settings-section-panel">
      <header><h3>{title}</h3><p>{description}</p></header>
      <div>{children}</div>
    </section>
  );
}

function ToggleSetting({ label, description, checked, onChange }: { label: string; description: string; checked: boolean; onChange: (checked: boolean) => void }) {
  return (
    <label className="settings-toggle-row">
      <span><strong>{label}</strong><small>{description}</small></span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.currentTarget.checked)} />
      <span className="settings-switch" aria-hidden="true" />
    </label>
  );
}

function StudyPlanSettingRow({
  title,
  subjects,
  config,
  onClick,
}: {
  title: string;
  subjects: string[];
  config: StudyPlanConfig;
  onClick: () => void;
}) {
  const configured = isStudyPlanConfigured(config);
  return (
    <div className="settings-plan-row-v86">
      <div>
        <strong>{title}</strong>
        <span className="settings-plan-subjects" aria-label={`${subjects.join("、")}共用`}>
          {subjects.map((subject) => <span key={subject}>{subject}</span>)}
          <small aria-hidden="true">共用</small>
        </span>
        <small>
          {configured
            ? `${formatExamDate(config.examDate)}・每天 ${config.dailyStudyMinutes} 分鐘`
            : "尚未設定考試日期"}
        </small>
      </div>
      <GlassButton variant="secondary" onClick={onClick}>
        <CalendarDays aria-hidden="true" size={17} />{configured ? "調整" : "設定"}
      </GlassButton>
    </div>
  );
}

function ActionSetting({ title, description, action, icon, danger = false, onClick }: { title: string; description: string; action: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }) {
  return (
    <div className="settings-action-row">
      <span><strong>{title}</strong><small>{description}</small></span>
      <GlassButton variant={danger ? "danger" : "secondary"} onClick={onClick}>{icon}{action}</GlassButton>
    </div>
  );
}

function DialogActions({ onBack, children }: { onBack: () => void; children?: React.ReactNode }) {
  return (
    <div className="clear-record-actions">
      <GlassButton variant="secondary" onClick={onBack}><ArrowLeft aria-hidden="true" size={18} />回到設定</GlassButton>
      {children}
    </div>
  );
}

function ResetChoice({ title, description, selected, recommended = false, danger = false, onClick }: { title: string; description: string; selected: boolean; recommended?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`memory-reset-choice${selected ? " is-selected" : ""}${danger ? " is-danger" : ""}`}
      aria-pressed={selected}
      onClick={onClick}
    >
      <span>
        <strong>{title}</strong>
        {recommended ? <small>建議</small> : null}
      </span>
      <p>{description}</p>
    </button>
  );
}

function clearPartsForLevel(level: ClearLevel): ClearRecordPart[] {
  if (level === "wrong") return ["wrong"];
  if (level === "restart") return ["answers", "wrong", "progress", "sessions"];
  return ["answers", "wrong", "favorites", "progress", "sessions"];
}

function clearScopeLabel(scope: ClearExamScope): string {
  if (scope === "senior-securities") return "證券高業";
  if (scope === "junior-foreign-exchange") return "初階外匯";
  return "全部題庫";
}

function recordCountLabel(counts: RecordCountSummary | undefined): string {
  if (!counts) return "讀取學習紀錄中";
  return `已作答 ${counts.answers} 題・錯題 ${counts.wrong} 題・收藏 ${counts.favorites} 題`;
}

function clearImpactLabel(
  level: ClearLevel,
  counts: RecordCountSummary | undefined,
): string {
  if (level === "wrong") {
    return `只清空 ${counts?.wrong ?? 0} 題錯題清單；其他資料全部保留`;
  }
  if (level === "restart") {
    return `清除 ${counts?.answers ?? 0} 筆作答與進度；保留 ${counts?.favorites ?? 0} 題收藏`;
  }
  return "清除全部作答、錯題、收藏、進度與測驗紀錄；完成後無法復原";
}

async function loadSettingsData(): Promise<SettingsData> {
  const [banks, manifest, answers, wrong, favorites, imageSessions] = await Promise.all([
    loadImageQuizBankSummaries(),
    loadQuestionReleaseManifest(),
    listUserAnswers().catch(() => []),
    listWrongQuestions().catch(() => []),
    listFavoriteQuestions().catch(() => []),
    listImageQuizSessions().catch(() => []),
  ]);
  const securitiesQuestionIds = new Set(Object.keys(manifest.questionIndex));
  const isForeignExchangeQuestion = (questionId: string) => questionId.startsWith("fx-");
  const securitiesAnswers = answers.filter((record) => securitiesQuestionIds.has(record.questionId));
  const foreignExchangeAnswers = answers.filter((record) => isForeignExchangeQuestion(record.questionId));
  const securitiesWrong = wrong.filter((record) => securitiesQuestionIds.has(record.questionId));
  const foreignExchangeWrong = wrong.filter((record) => isForeignExchangeQuestion(record.questionId));
  const securitiesFavorites = favorites.filter((record) => securitiesQuestionIds.has(record.questionId));
  const foreignExchangeFavorites = favorites.filter((record) => isForeignExchangeQuestion(record.questionId));
  const securitiesCounts: RecordCountSummary = {
    answers: securitiesAnswers.length,
    wrong: securitiesWrong.length,
    favorites: securitiesFavorites.length,
    sessions: imageSessions.filter((session) => !session.bankId.startsWith("fx-")).length,
  };
  const localForeignExchange = foreignExchangeProgressSummary();
  const foreignExchangeCounts: RecordCountSummary = {
    answers: Math.max(foreignExchangeAnswers.length, localForeignExchange.answered),
    wrong: Math.max(foreignExchangeWrong.length, localForeignExchange.wrong),
    favorites: Math.max(foreignExchangeFavorites.length, localForeignExchange.favorites),
    sessions: countForeignExchangeMockSnapshots(),
  };
  return {
    banks,
    securitiesQuestionIds: [...securitiesQuestionIds],
    securitiesProgressScopeIds: buildSecuritiesProgressScopeIds(banks, manifest),
    recordCounts: {
      "senior-securities": securitiesCounts,
      "junior-foreign-exchange": foreignExchangeCounts,
      all: {
        answers: securitiesCounts.answers + foreignExchangeCounts.answers,
        wrong: securitiesCounts.wrong + foreignExchangeCounts.wrong,
        favorites: securitiesCounts.favorites + foreignExchangeCounts.favorites,
        sessions: securitiesCounts.sessions + foreignExchangeCounts.sessions,
      },
    },
  };
}

function countForeignExchangeMockSnapshots(): number {
  if (typeof window === "undefined") return 0;
  let count = 0;
  try {
    for (let index = 0; index < window.localStorage.length; index += 1) {
      const key = window.localStorage.key(index);
      if (key?.includes("quizpwa:fx-mock:v2:")) count += 1;
    }
  } catch {
    return 0;
  }
  return count;
}

function buildSecuritiesProgressScopeIds(
  banks: ImageQuizBank[],
  manifest: QuestionReleaseManifest,
): string[] {
  const values = [
    "image:all:all:all",
    "image:wrong:all:all",
    "image:favorites:all:all",
    ...dailyPracticeScopeIds(),
  ];
  for (const bank of banks) {
    values.push(`image:bank:${bank.bankId}:all`);
    for (const chapter of bank.chapters) {
      values.push(...buildChapterProgressScopeIds(bank.bankId, chapter));
    }
  }
  for (const bank of manifest.banks) {
    for (const chapter of bank.chapters) {
      values.push(`image:chapter:${bank.bankId}:${chapter.chapterId}`);
    }
  }
  return Array.from(new Set(values));
}

function buildChapterProgressScopeIds(bankId: string, chapter: ImageQuizChapter): string[] {
  const sourceBankId = chapter.sourceBankId ?? chapter.bankId;
  const sourceChapterId = chapter.sourceChapterId ?? chapter.chapterId;
  return [
    `image:chapter:${bankId}:${chapter.chapterId}`,
    `image:chapter:${sourceBankId}:${sourceChapterId}`,
  ];
}
