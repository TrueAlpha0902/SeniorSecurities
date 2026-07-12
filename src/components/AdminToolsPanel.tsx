import { Activity, Clipboard, KeyRound, RefreshCcw, Save, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { memo, startTransition, useCallback, useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  loadImageQuizEditorCatalog,
  loadImageQuizEditorChapter,
  type ImageQuizChapter,
  type ImageQuizEditorBankSummary,
  type ImageQuizQuestion,
  type ImageQuizQuestionOverride,
  type NumericAnswer,
  type PdfCropSegment,
} from "../lib/imageQuiz";
import { GlassButton } from "./GlassButton";
import { pdfImageUrl } from "../lib/pdfAssets";
import {
  compressPdfCropSeam,
  contentBoundsToVerticalTrim,
  detectVerticalContentBounds,
  movePdfCropSegment,
  normalizePdfCropSegment,
  resizePdfCropSegment,
  trimPdfCropEdge,
} from "../lib/pdfCropEditor";
import { GlassCard } from "./GlassCard";
import { PdfSegmentStack } from "./PdfSegmentStack";
import "../styles/admin-tools.css";

type ToolId = "activation" | "admins" | "questions" | "health";

type AdminAccountRow = {
  id: string;
  email: string;
  role: string;
  is_active: boolean;
  note: string | null;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};

type ActivationCodeRow = {
  id: string;
  code_preview: string;
  max_uses: number;
  use_count: number;
  is_active: boolean;
  note: string | null;
  created_at: string;
  redeemed_at: string | null;
};


type SystemHealthPayload = {
  releaseId: string;
  environment: string;
  expectedMigration: string;
  role: string;
  checkedAt: string;
  checks: Array<{ id: string; ok: boolean; message: string }>;
};

type ApiPayload = {
  ok?: boolean;
  message?: string;
  error?: string;
  code?: string;
  admins?: AdminAccountRow[];
  primaryEmails?: string[];
  activationCodes?: ActivationCodeRow[];
  isPrimaryAdmin?: boolean;
  overrides?: ImageQuizQuestionOverride[];
  overrideIds?: string[];
  override?: ImageQuizQuestionOverride;
  publishedCount?: number;
  cleanupWarning?: string;
  role?: string;
  health?: SystemHealthPayload;
};


const TOOL_TABS: { id: ToolId; label: string; description: string; primaryOnly?: boolean }[] = [
  { id: "activation", label: "啟用碼", description: "建立與查看啟用碼" },
  { id: "admins", label: "管理員", description: "新增、恢復或停用管理員", primaryOnly: true },
  { id: "questions", label: "題目編輯", description: "儲存修改並由主要管理員直接發布" },
  { id: "health", label: "系統狀態", description: "版本、資料庫與安全檢查" },
];

async function adminRequest(accessToken: string, url: string, init: RequestInit = {}): Promise<ApiPayload> {
  const response = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${accessToken}`,
      ...(init.body ? { "Content-Type": "application/json" } : {}),
      ...(init.headers || {}),
    },
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json() as ApiPayload
    : { error: (await response.text()).slice(0, 240) };
  if (!response.ok) throw new Error(payload.error || `管理工具執行失敗（${response.status}）。`);
  return payload;
}

export function AdminToolsPanel({ accessToken, onClose }: { accessToken: string; onClose?: () => void }) {
  const [activeTool, setActiveTool] = useState<ToolId>("activation");
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);

  useEffect(() => {
    let active = true;
    void adminRequest(accessToken, "/api/admin/tools?tool=access")
      .then((payload) => {
        if (active) setIsPrimaryAdmin(Boolean(payload.isPrimaryAdmin));
      })
      .catch(() => {
        if (active) setIsPrimaryAdmin(false);
      });
    return () => { active = false; };
  }, [accessToken]);

  const visibleTabs = TOOL_TABS.filter((tool) => !tool.primaryOnly || isPrimaryAdmin);

  useEffect(() => {
    if (activeTool === "admins" && !isPrimaryAdmin) setActiveTool("activation");
  }, [activeTool, isPrimaryAdmin]);

  return (
    <GlassCard
      className={`admin-tools-card${onClose ? " is-modal" : ""}`}
      as="section"
      role={onClose ? "dialog" : undefined}
      aria-modal={onClose ? true : undefined}
      aria-labelledby="admin-tools-title"
    >
      <div className="admin-tools-header">
        <div>
          <p className="eyebrow">Unified Admin App</p>
          <h2 id="admin-tools-title">管理工具工作台</h2>
        </div>
        <div className="admin-tools-header-actions">
          <span className="admin-tools-security"><ShieldCheck size={18} aria-hidden="true" />伺服器端權限保護</span>
          {onClose ? (
            <button type="button" className="admin-modal-close" onClick={onClose} aria-label="關閉管理工具" autoFocus>
              <X size={22} aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-tools-tabs" role="tablist" aria-label="管理工具">
        {visibleTabs.map((tool) => (
          <button
            key={tool.id}
            type="button"
            role="tab"
            aria-selected={activeTool === tool.id}
            className={activeTool === tool.id ? "is-active" : ""}
            onClick={() => setActiveTool(tool.id)}
          >
            <strong>{tool.label}</strong>
            <span>{tool.description}</span>
          </button>
        ))}
      </div>

      {activeTool === "activation" ? <ActivationCodeTool accessToken={accessToken} /> : null}
      {activeTool === "admins" && isPrimaryAdmin ? <AdminAccountTool accessToken={accessToken} /> : null}
      {activeTool === "questions" ? <QuestionEditorTool accessToken={accessToken} isPrimaryAdmin={isPrimaryAdmin} /> : null}
      {activeTool === "health" ? <SystemHealthTool accessToken={accessToken} /> : null}
    </GlassCard>
  );
}

function SystemHealthTool({ accessToken }: { accessToken: string }) {
  const [health, setHealth] = useState<SystemHealthPayload | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/ping");
      setHealth(payload.health || null);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "無法取得系統狀態。");
    } finally {
      setBusy(false);
    }
  }, [accessToken]);

  useEffect(() => { void load(); }, [load]);

  return (
    <div className="admin-tool-pane system-health-pane" role="tabpanel">
      <div className="admin-tool-section-head">
        <div><strong><Activity size={19} aria-hidden="true" />系統健康檢查</strong><p>確認正式版本、資料完整性 migration、管理權限與核心資料表。</p></div>
        <GlassButton variant="secondary" disabled={busy} onClick={() => void load()}><RefreshCcw size={17} />重新檢查</GlassButton>
      </div>
      {error ? <p className="form-error">{error}</p> : null}
      {health ? (
        <>
          <div className="system-health-summary">
            <div><span>Release</span><strong>{health.releaseId}</strong></div>
            <div><span>環境</span><strong>{health.environment}</strong></div>
            <div><span>預期 migration</span><strong>{health.expectedMigration}</strong></div>
            <div><span>管理角色</span><strong>{health.role}</strong></div>
          </div>
          <div className="system-health-checks">
            {health.checks.map((check) => <div key={check.id} className={check.ok ? "is-ok" : "is-error"}><span aria-hidden="true">{check.ok ? "✓" : "!"}</span><strong>{check.message}</strong></div>)}
          </div>
          <p className="system-health-time">最後檢查：{new Date(health.checkedAt).toLocaleString("zh-TW")}</p>
        </>
      ) : busy ? <p>檢查中…</p> : null}
    </div>
  );
}

function ActivationCodeTool({ accessToken }: { accessToken: string }) {
  const [customCode, setCustomCode] = useState("");
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [createdCode, setCreatedCode] = useState("");
  const [rows, setRows] = useState<ActivationCodeRow[]>([]);
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/tools?tool=activation-codes");
      setRows(payload.activationCodes || []);
      setIsPrimaryAdmin(Boolean(payload.isPrimaryAdmin));
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入啟用碼。 ");
    }
  }, [accessToken]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  async function createCode(): Promise<void> {
    setBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/tools", {
        method: "POST",
        body: JSON.stringify({ action: "create-activation-code", code: customCode, note, maxUses }),
      });
      setCreatedCode(payload.code || "");
      setMessage(payload.message || "啟用碼已建立。 ");
      setCustomCode("");
      setNote("");
      await loadRows();
    } catch (createError) {
      setError(createError instanceof Error ? createError.message : "無法建立啟用碼。 ");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string): Promise<void> {
    await navigator.clipboard.writeText(code);
    setMessage("啟用碼已複製。 ");
  }

  async function deleteCode(row: ActivationCodeRow): Promise<void> {
    if (!isPrimaryAdmin) {
      setError("只有主要管理員可以刪除啟用碼。");
      return;
    }
    const visibleCode = row.code_preview;
    if (!window.confirm(`確定永久刪除啟用碼 ${visibleCode}？已使用紀錄仍會保留，但無法復原此啟用碼。`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/tools", {
        method: "POST",
        body: JSON.stringify({ action: "delete-activation-code", activationCodeId: row.id }),
      });
      setMessage(payload.message || "啟用碼已刪除。");
      await loadRows();
    } catch (deleteError) {
      setError(deleteError instanceof Error ? deleteError.message : "無法刪除啟用碼。");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-tool-pane" role="tabpanel">
      <div className="admin-tool-form-grid">
        <label>自訂啟用碼（可留空）<input value={customCode} onChange={(event) => setCustomCode(event.target.value)} placeholder="至少 10 個英數字" /></label>
        <label>可使用次數<input type="number" min={1} max={999} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></label>
        <label className="admin-tool-wide">備註<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：2026 夏季班" /></label>
      </div>
      <div className="admin-tool-actions">
        <GlassButton variant="primary" disabled={busy} onClick={() => void createCode()}><KeyRound size={18} />{busy ? "建立中" : "建立啟用碼"}</GlassButton>
        <GlassButton variant="secondary" disabled={busy} onClick={() => void loadRows()}><RefreshCcw size={18} />重新整理</GlassButton>
      </div>
      {createdCode ? (
        <div className="admin-created-code"><div><small>只顯示這一次，關閉後無法再次查看完整啟用碼。</small><strong>{createdCode}</strong></div><GlassButton variant="secondary" onClick={() => void copyCode(createdCode)}><Clipboard size={16} />複製</GlassButton></div>
      ) : null}
      <ToolMessages message={message} error={error} />
      <div className="admin-tool-list">
        {rows.map((row) => {
          const visibleCode = row.code_preview;
          return (
            <article key={row.id}>
              <div><strong>{visibleCode}</strong><span>{row.note || "無備註"}</span></div>
              <div><span>{row.use_count} / {row.max_uses} 次</span><span>{row.is_active ? "啟用" : "停用"}</span></div>
              <div className="admin-inline-actions">
                {isPrimaryAdmin ? (
                  <button type="button" className="is-danger" disabled={busy} onClick={() => void deleteCode(row)}><Trash2 size={14} />刪除</button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function AdminAccountTool({ accessToken }: { accessToken: string }) {
  const [email, setEmail] = useState("");
  const [note, setNote] = useState("");
  const [rows, setRows] = useState<AdminAccountRow[]>([]);
  const [primaryEmails, setPrimaryEmails] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/tools?tool=admins");
      setRows(payload.admins || []);
      setPrimaryEmails(payload.primaryEmails || []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入管理員。 ");
    }
  }, [accessToken]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  async function run(
    action: "upsert-admin" | "disable-admin" | "delete-admin",
    targetEmail = email,
  ): Promise<void> {
    if ((action === "disable-admin" || action === "delete-admin") && !window.confirm(`確定要${action === "delete-admin" ? "刪除" : "停用"}管理員 ${targetEmail}？`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/tools", {
        method: "POST",
        body: JSON.stringify({ action, email: targetEmail, note, role: "admin" }),
      });
      setMessage(payload.message || "操作完成。 ");
      setEmail("");
      setNote("");
      await loadRows();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : "管理員操作失敗。 ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-tool-pane" role="tabpanel">
      <div className="admin-tool-form-grid">
        <label>管理員 Email<input type="email" value={email} onChange={(event) => setEmail(event.target.value)} placeholder="admin@example.com" /></label>
        <label>權限角色<input value="管理員" readOnly aria-label="權限角色" /></label>
        <label className="admin-tool-wide">備註<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="角色或用途" /></label>
      </div>
      <div className="admin-tool-actions">
        <GlassButton variant="primary" disabled={busy || !email.trim()} onClick={() => void run("upsert-admin")}><UsersRound size={18} />加入／恢復管理員</GlassButton>
        <GlassButton variant="secondary" disabled={busy} onClick={() => void loadRows()}><RefreshCcw size={18} />重新整理</GlassButton>
      </div>
      <ToolMessages message={message} error={error} />
      <div className="admin-tool-list admin-account-list">
        {rows.map((row) => {
          const isPrimary = primaryEmails.includes(row.email);
          return (
            <article key={row.id}>
              <div><strong>{row.email}</strong><span>{row.note || "無備註"}{isPrimary ? "・主要管理員" : "・管理員"}</span></div>
              <span className={row.is_active ? "is-enabled" : "is-disabled"}>{row.is_active ? "啟用" : "停用"}</span>
              <div className="admin-inline-actions">
                {!row.is_active ? <button type="button" disabled={busy} onClick={() => void run("upsert-admin", row.email)}>恢復</button> : null}
                {!isPrimary && row.is_active ? <button type="button" disabled={busy} onClick={() => void run("disable-admin", row.email)}>停用</button> : null}
                {!isPrimary ? <button type="button" className="is-danger" disabled={busy} onClick={() => void run("delete-admin", row.email)}><Trash2 size={14} />刪除</button> : null}
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

function QuestionEditorTool({ accessToken, isPrimaryAdmin }: { accessToken: string; isPrimaryAdmin: boolean }) {
  const [catalog, setCatalog] = useState<ImageQuizEditorBankSummary[]>([]);
  const [chapter, setChapter] = useState<ImageQuizChapter | null>(null);
  const [draftOverrideIds, setDraftOverrideIds] = useState<string[]>([]);
  const [draftOverrides, setDraftOverrides] = useState<ImageQuizQuestionOverride[]>([]);
  const [bankId, setBankId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [questionNumber, setQuestionNumber] = useState("");
  const [editable, setEditable] = useState<ImageQuizQuestion | null>(null);
  const [mode, setMode] = useState<"question" | "explanation">("question");
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [chapterLoading, setChapterLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [publishBusy, setPublishBusy] = useState(false);
  const [cropBusy, setCropBusy] = useState(false);
  const [cropStep, setCropStep] = useState(5);
  const [cropUndoStack, setCropUndoStack] = useState<ImageQuizQuestion[]>([]);
  const [cropMessage, setCropMessage] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [chapterReloadKey, setChapterReloadKey] = useState(0);
  const draftOverridesRef = useRef<Map<string, ImageQuizQuestionOverride>>(new Map());
  const pendingQuestionIdRef = useRef<string | null>(null);

  const draftOverrideMap = useMemo(
    () => new Map(draftOverrides.map((override) => [override.questionId, override])),
    [draftOverrides],
  );
  const overrideIds = useMemo(() => new Set(draftOverrideIds), [draftOverrideIds]);

  useEffect(() => { draftOverridesRef.current = draftOverrideMap; }, [draftOverrideMap]);

  const loadEditorData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [nextCatalog, payload] = await Promise.all([
        loadImageQuizEditorCatalog(),
        adminRequest(accessToken, "/api/admin/question-editor?mode=index"),
      ]);
      setCatalog(nextCatalog);
      setDraftOverrideIds(payload.overrideIds || []);
      setDraftOverrides([]);
      setBankId((current) => nextCatalog.some((bank) => bank.bankId === current) ? current : nextCatalog[0]?.bankId || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "題目編輯器載入失敗。");
    } finally {
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => { void loadEditorData(); }, [loadEditorData]);

  const bank = useMemo(() => catalog.find((item) => item.bankId === bankId), [bankId, catalog]);
  const chapterSummary = useMemo(() => bank?.chapters.find((item) => item.chapterId === chapterId), [bank, chapterId]);
  const questionById = useMemo(() => new Map((chapter?.questions || []).map((item) => [item.id, item])), [chapter]);
  const question = questionById.get(questionId);

  useEffect(() => {
    if (!bank) return;
    if (!bank.chapters.some((item) => item.chapterId === chapterId)) setChapterId(bank.chapters[0]?.chapterId || "");
  }, [bank, chapterId]);

  useEffect(() => {
    if (!bankId || !chapterId) return;
    let active = true;
    setChapterLoading(true);
    setError("");
    void loadImageQuizEditorChapter(bankId, chapterId)
      .then(async (loaded) => {
        if (!loaded) throw new Error("找不到這個題庫章節。");
        const payload = await adminRequest(accessToken, "/api/admin/question-editor", {
          method: "POST",
          body: JSON.stringify({ action: "load-overrides", questionIds: loaded.questions.map((item) => item.id) }),
        });
        return { loaded, chapterDrafts: payload.overrides || [] };
      })
      .then(({ loaded, chapterDrafts }) => {
        if (!active) return;
        if (chapterDrafts.length) {
          setDraftOverrides((current) => {
            const next = new Map(current.map((item) => [item.questionId, item]));
            chapterDrafts.forEach((item) => next.set(item.questionId, item));
            return Array.from(next.values());
          });
        }
        const drafts = new Map(draftOverridesRef.current);
        chapterDrafts.forEach((item) => drafts.set(item.questionId, item));
        const merged: ImageQuizChapter = {
          ...loaded,
          questions: loaded.questions.map((sourceQuestion) => {
            const draft = drafts.get(sourceQuestion.id);
            return draft ? {
              ...sourceQuestion,
              answer: draft.answer,
              questionSegments: draft.questionSegments.map((segment) => ({ ...segment })),
              explanationSegments: draft.explanationSegments.map((segment) => ({ ...segment })),
            } : sourceQuestion;
          }),
        };
        startTransition(() => {
          setChapter(merged);
          const pending = pendingQuestionIdRef.current;
          pendingQuestionIdRef.current = null;
          setQuestionId((current) => merged.questions.some((item) => item.id === pending) ? pending! : merged.questions.some((item) => item.id === current) ? current : merged.questions[0]?.id || "");
        });
      })
      .catch((loadError) => {
        if (active) setError(loadError instanceof Error ? loadError.message : "章節載入失敗。");
      })
      .finally(() => { if (active) setChapterLoading(false); });
    return () => { active = false; };
  }, [accessToken, bankId, chapterId, chapterReloadKey]);

  useEffect(() => {
    setEditable(question ? cloneQuestion(question) : null);
    setSegmentIndex(0);
    setCropUndoStack([]);
    setCropMessage("");
  }, [question]);

  useEffect(() => {
    setCropUndoStack([]);
    setCropMessage("");
  }, [mode]);

  const segmentKey = mode === "question" ? "questionSegments" : "explanationSegments";
  const segments = editable?.[segmentKey] || [];
  const segment = segments[segmentIndex];
  const originalSignature = useMemo(() => question ? questionEditSignature(question) : "", [question]);
  const editableSignature = useMemo(() => editable ? questionEditSignature(editable) : "", [editable]);
  const hasUnsavedChanges = Boolean(editable && question && editableSignature !== originalSignature);
  const deferredEditable = useDeferredValue(editable);
  const [previewReady, setPreviewReady] = useState(false);

  useEffect(() => {
    setPreviewReady(false);
    const timer = window.setTimeout(() => setPreviewReady(true), 70);
    return () => window.clearTimeout(timer);
  }, [questionId]);

  const previewEditable = deferredEditable || editable;
  const previewSegments = previewEditable?.[segmentKey] || [];
  const previewSegment = previewSegments[segmentIndex];

  function updateSegment(patch: Partial<PdfCropSegment>): void {
    setEditable((current) => {
      if (!current) return current;
      const next = [...current[segmentKey]];
      if (!next[segmentIndex]) return current;
      next[segmentIndex] = normalizePdfCropSegment({ ...next[segmentIndex], ...patch });
      return { ...current, [segmentKey]: next };
    });
  }

  function applyCropAction(
    transform: (segmentsToEdit: PdfCropSegment[], activeIndex: number) => PdfCropSegment[],
    successMessage = "截圖範圍已調整。",
  ): void {
    if (!editable) return;
    const before = cloneQuestion(editable);
    const nextSegments = transform(editable[segmentKey].slice(), segmentIndex);
    setCropUndoStack((current) => [...current.slice(-29), before]);
    setEditable({ ...editable, [segmentKey]: nextSegments });
    setCropMessage(successMessage);
  }

  function updateActiveSegment(transform: (current: PdfCropSegment) => PdfCropSegment, successMessage?: string): void {
    applyCropAction((currentSegments, activeIndex) => currentSegments.map((item, index) => (
      index === activeIndex ? transform(item) : item
    )), successMessage);
  }

  function undoCropAction(): void {
    const previous = cropUndoStack[cropUndoStack.length - 1];
    if (!previous) return;
    setEditable(cloneQuestion(previous));
    setCropUndoStack((current) => current.slice(0, -1));
    setSegmentIndex((current) => Math.min(current, Math.max(0, previous[segmentKey].length - 1)));
    setCropMessage("已復原上一個裁切調整。");
  }

  async function autoTrimSegment(target: PdfCropSegment): Promise<{ top: number; bottom: number }> {
    const image = await loadCropAnalysisImage(pdfImageUrl(target.src));
    const scaleX = image.naturalWidth / Math.max(1, target.pageWidth);
    const scaleY = image.naturalHeight / Math.max(1, target.pageHeight);
    const sourceX = Math.max(0, target.x * scaleX);
    const sourceY = Math.max(0, target.y * scaleY);
    const sourceWidth = Math.max(1, Math.min(target.width * scaleX, image.naturalWidth - sourceX));
    const sourceHeight = Math.max(1, Math.min(target.height * scaleY, image.naturalHeight - sourceY));
    const analyzedWidth = Math.max(80, Math.min(1200, Math.round(sourceWidth)));
    const analyzedHeight = Math.max(20, Math.round(sourceHeight * analyzedWidth / sourceWidth));
    const canvas = document.createElement("canvas");
    canvas.width = analyzedWidth;
    canvas.height = analyzedHeight;
    const context = canvas.getContext("2d", { willReadFrequently: true });
    if (!context) throw new Error("瀏覽器無法建立圖片分析工具。");
    context.drawImage(image, sourceX, sourceY, sourceWidth, sourceHeight, 0, 0, analyzedWidth, analyzedHeight);
    const pixels = context.getImageData(0, 0, analyzedWidth, analyzedHeight).data;
    const bounds = detectVerticalContentBounds(pixels, analyzedWidth, analyzedHeight);
    if (!bounds) return { top: 0, bottom: 0 };
    return contentBoundsToVerticalTrim(bounds, analyzedHeight, target.height, 6);
  }

  async function autoTrimActiveSegment(): Promise<void> {
    if (!segment || cropBusy) return;
    setCropBusy(true);
    setCropMessage("");
    try {
      const trim = await autoTrimSegment(segment);
      if (trim.top < 1 && trim.bottom < 1) {
        setCropMessage("沒有偵測到可安全裁除的上下白邊。");
        return;
      }
      updateActiveSegment((current) => trimPdfCropEdge(trimPdfCropEdge(current, "top", trim.top), "bottom", trim.bottom), `已自動裁除上方 ${trim.top}px、下方 ${trim.bottom}px 白邊。`);
    } catch (reason) {
      setCropMessage(reason instanceof Error ? reason.message : "自動裁切失敗，請改用手動裁邊。");
    } finally {
      setCropBusy(false);
    }
  }

  async function autoCompressPreviousSeam(): Promise<void> {
    if (!editable || segmentIndex < 1 || cropBusy) return;
    const currentSegments = editable[segmentKey];
    const previous = currentSegments[segmentIndex - 1];
    const current = currentSegments[segmentIndex];
    if (!previous || !current) return;
    setCropBusy(true);
    setCropMessage("");
    try {
      const [previousTrim, currentTrim] = await Promise.all([autoTrimSegment(previous), autoTrimSegment(current)]);
      const previousBottom = previousTrim.bottom;
      const currentTop = currentTrim.top;
      if (previousBottom < 1 && currentTop < 1) {
        setCropMessage("這個接縫沒有偵測到可安全裁除的白邊。");
        return;
      }
      applyCropAction((segmentsToEdit, activeIndex) => segmentsToEdit.map((item, index) => {
        if (index === activeIndex - 1) return trimPdfCropEdge(item, "bottom", previousBottom);
        if (index === activeIndex) return trimPdfCropEdge(item, "top", currentTop);
        return item;
      }), `已壓縮跨頁接縫：前段裁下 ${previousBottom}px，本段裁上 ${currentTop}px。`);
    } catch (reason) {
      setCropMessage(reason instanceof Error ? reason.message : "自動壓縮接縫失敗，請改用手動接縫裁切。");
    } finally {
      setCropBusy(false);
    }
  }

  function addSegment(): void {
    setEditable((current) => {
      if (!current) return current;
      const template = current[segmentKey][segmentIndex] || current.questionSegments[0] || current.explanationSegments[0];
      const nextSegment: PdfCropSegment = template ? { ...template } : {
        page: 1, src: "", x: 0, y: 0, width: 100, height: 100, pageWidth: 1240, pageHeight: 1754,
      };
      const next = [...current[segmentKey], nextSegment];
      setSegmentIndex(next.length - 1);
      return { ...current, [segmentKey]: next };
    });
  }

  function removeSegment(): void {
    setEditable((current) => {
      if (!current) return current;
      const next = current[segmentKey].filter((_, index) => index !== segmentIndex);
      setSegmentIndex(Math.max(0, Math.min(segmentIndex, next.length - 1)));
      return { ...current, [segmentKey]: next };
    });
  }

  function jumpToQuestion(): void {
    const numeric = Number(questionNumber);
    const target = chapter?.questions.find((item) => item.number === numeric);
    if (target) setQuestionId(target.id);
    else setError("本章找不到這個題號。");
  }

  function openChangedQuestion(questionIdToOpen: string): void {
    const matchedBank = catalog.find((candidate) => questionIdToOpen.startsWith(`${candidate.bankId}-`));
    const matchedChapter = matchedBank?.chapters.find((candidate) => questionIdToOpen.includes(`-${candidate.chapterSlug}-`));
    if (!matchedBank || !matchedChapter) {
      setError(`無法定位 ${questionIdToOpen}，請使用題號或科目選單前往。`);
      return;
    }
    pendingQuestionIdRef.current = questionIdToOpen;
    startTransition(() => {
      setBankId(matchedBank.bankId);
      setChapterId(matchedChapter.chapterId);
      if (matchedBank.bankId === bankId && matchedChapter.chapterId === chapterId) setQuestionId(questionIdToOpen);
    });
  }

  async function saveOverride(): Promise<void> {
    if (!editable) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/question-editor", {
        method: "POST",
        body: JSON.stringify({
          action: "save",
          questionId: editable.id,
          bankTitle: editable.bankTitle,
          chapterTitle: editable.chapterTitle,
          questionNumber: editable.number,
          answer: editable.answer,
          questionSegments: editable.questionSegments,
          explanationSegments: editable.explanationSegments,
        }),
      });
      const savedOverride = payload.override || {
        questionId: editable.id,
        bankTitle: editable.bankTitle,
        chapterTitle: editable.chapterTitle,
        questionNumber: editable.number,
        answer: editable.answer,
        questionSegments: editable.questionSegments,
        explanationSegments: editable.explanationSegments,
        updatedAt: new Date().toISOString(),
        updatedBy: "current-admin",
      };
      setDraftOverrideIds((current) => current.includes(editable.id) ? current : [...current, editable.id]);
      setDraftOverrides((current) => [...current.filter((item) => item.questionId !== editable.id), savedOverride]);
      setChapter((current) => current ? {
        ...current,
        questions: current.questions.map((item) => item.id === editable.id ? cloneQuestion(editable) : item),
      } : current);
      setMessage(payload.message || "題目修改已儲存。");
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "題目儲存失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function revertOverride(): Promise<void> {
    if (!editable || !window.confirm(`確定要移除第 ${editable.number} 題尚未發布的修改？`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/question-editor", {
        method: "POST",
        body: JSON.stringify({ action: "delete", questionId: editable.id }),
      });
      setDraftOverrideIds((current) => current.filter((item) => item !== editable.id));
      setDraftOverrides((current) => current.filter((item) => item.questionId !== editable.id));
      pendingQuestionIdRef.current = editable.id;
      setChapterReloadKey((value) => value + 1);
      setMessage(payload.message || "已移除這筆修改。");
    } catch (revertError) {
      setError(revertError instanceof Error ? revertError.message : "無法移除修改。");
    } finally {
      setBusy(false);
    }
  }

  async function publishCurrentChanges(): Promise<void> {
    if (!isPrimaryAdmin) {
      setError("只有主要管理員可以發布題庫。");
      return;
    }
    if (!draftOverrideIds.length) {
      setError("目前沒有尚未發布的修改。");
      return;
    }
    if (hasUnsavedChanges) {
      setError("目前題目還有未儲存調整，請先按「儲存修改」。");
      return;
    }
    if (!window.confirm(`確定發布本次 ${draftOverrideIds.length} 題修改？發布後所有使用者會立即讀取新版題庫。`)) return;
    setPublishBusy(true);
    setError("");
    setMessage("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/releases", {
        method: "POST",
        body: JSON.stringify({ action: "publish-current" }),
      });
      setDraftOverrideIds([]);
      setDraftOverrides([]);
      setMessage(payload.message || `已發布 ${payload.publishedCount || 0} 題修改。`);
    } catch (publishError) {
      setError(publishError instanceof Error ? publishError.message : "題庫發布失敗。");
    } finally {
      setPublishBusy(false);
    }
  }

  return (
    <div className="admin-tool-pane question-editor-pane question-editor-v797" role="tabpanel">
      <div className="question-editor-selectors">
        <label>科目<select value={bankId} onChange={(event) => setBankId(event.target.value)}>{catalog.map((item) => <option key={item.bankId} value={item.bankId}>{item.bankTitle}</option>)}</select></label>
        <label>章節<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>{(bank?.chapters || []).map((item) => <option key={item.chapterId} value={item.chapterId}>{item.chapterTitle}</option>)}</select></label>
        <label>題目<select value={questionId} disabled={chapterLoading} onChange={(event) => setQuestionId(event.target.value)}>{(chapter?.questions || []).map((item) => <option key={item.id} value={item.id}>第 {item.number} 題・答案 {item.answer}{overrideIds.has(item.id) ? "・已修改" : ""}</option>)}</select></label>
        <label>跳到題號<div className="question-jump-control"><input inputMode="numeric" value={questionNumber} onChange={(event) => setQuestionNumber(event.target.value)} /><button type="button" onClick={jumpToQuestion}>前往</button></div></label>
      </div>

      <div className="question-editor-workflow-bar">
        <details className="question-change-menu">
          <summary><span>本次修改</span><strong>{draftOverrideIds.length} 題</strong></summary>
          <div className="question-change-list">
            {draftOverrideIds.length ? draftOverrideIds.map((changedId) => {
              const override = draftOverrideMap.get(changedId);
              return (
                <button key={changedId} type="button" onClick={() => openChangedQuestion(changedId)}>
                  <strong>{override?.bankTitle || changedId}</strong>
                  <span>{override?.chapterTitle ? `${override.chapterTitle} · ` : ""}{override?.questionNumber ? `第 ${override.questionNumber} 題` : "已儲存修改"}</span>
                </button>
              );
            }) : <p>目前沒有尚未發布的修改。</p>}
          </div>
        </details>
        <div className="question-editor-publish-copy">
          <strong>{draftOverrideIds.length ? `已儲存 ${draftOverrideIds.length} 題修改` : "題庫目前沒有待發布修改"}</strong>
          <span>{isPrimaryAdmin ? "確認修改內容後，可直接發布到線上題庫。" : "只有主要管理員可以執行發布。"}</span>
        </div>
        <GlassButton variant="primary" disabled={publishBusy || !isPrimaryAdmin || !draftOverrideIds.length || hasUnsavedChanges} onClick={() => void publishCurrentChanges()}>
          <ShieldCheck size={18} />{publishBusy ? "發布中" : "發布題庫"}
        </GlassButton>
      </div>

      {loading ? <p className="admin-tool-loading">載入題庫目錄中…</p> : null}
      {chapterLoading ? <p className="admin-tool-loading is-inline">載入 {chapterSummary?.chapterTitle || "章節"}…</p> : null}

      {editable ? (
        <>
          <div className="question-editor-focus-header">
            <div className="question-editor-summary question-editor-summary-compact">
              <div><strong>{editable.bankTitle}／{editable.chapterTitle}／第 {editable.number} 題</strong><span>{editable.id}</span></div>
              <label>正確答案<select value={editable.answer} onChange={(event) => setEditable({ ...editable, answer: event.target.value as NumericAnswer })}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
            </div>
            <div className="question-editor-header-actions">
              <GlassButton variant="secondary" disabled={!cropUndoStack.length || cropBusy} onClick={undoCropAction}>復原</GlassButton>
              <GlassButton variant="primary" disabled={busy || !hasUnsavedChanges} onClick={() => void saveOverride()}><Save size={18} />{busy ? "儲存中" : "儲存修改"}</GlassButton>
            </div>
          </div>

          <div className="question-editor-focus-toolbar" aria-label="裁切快速工具列">
            <div className="question-editor-mode-tabs">
              <button type="button" className={mode === "question" ? "is-active" : ""} onClick={() => { setMode("question"); setSegmentIndex(0); }}>題目</button>
              <button type="button" className={mode === "explanation" ? "is-active" : ""} onClick={() => { setMode("explanation"); setSegmentIndex(0); }}>解析</button>
            </div>
            <label className="question-editor-toolbar-select">段落<select value={segmentIndex} onChange={(event) => setSegmentIndex(Number(event.target.value))}>{segments.map((_, index) => <option key={index} value={index}>段落 {index + 1}</option>)}</select><span>{segments.length} 段</span></label>
            <label className="question-editor-toolbar-select">步長<select value={cropStep} onChange={(event) => setCropStep(Number(event.target.value))}><option value={1}>1 px</option><option value={5}>5 px</option><option value={10}>10 px</option><option value={20}>20 px</option></select></label>
            <button type="button" className="question-editor-toolbar-action" disabled={!segment || cropBusy} onClick={() => void autoTrimActiveSegment()}>{cropBusy ? "分析中…" : "自動裁白邊"}</button>
            <button type="button" className="question-editor-toolbar-action is-primary" disabled={cropBusy || segmentIndex < 1} onClick={() => void autoCompressPreviousSeam()}>自動壓縮接縫</button>
          </div>

          <div className="question-editor-workspace question-editor-focus-workspace">
            <aside className="question-editor-fields question-editor-focus-controls" aria-label="裁切控制">
              {segment ? (
                <>
                  <section className="focus-control-section"><div className="focus-control-heading"><strong>上下位置</strong><span>移動整個截圖</span></div><div className="focus-control-grid"><button type="button" onClick={() => updateActiveSegment((current) => movePdfCropSegment(current, 0, -cropStep))}>上移 {cropStep}</button><button type="button" onClick={() => updateActiveSegment((current) => movePdfCropSegment(current, 0, cropStep))}>下移 {cropStep}</button></div></section>
                  <section className="focus-control-section is-crop-primary"><div className="focus-control-heading"><strong>裁掉空白</strong><span>保留另一側內容</span></div><div className="focus-control-grid"><button type="button" className="crop-edge-button" onClick={() => updateActiveSegment((current) => trimPdfCropEdge(current, "top", cropStep))}>裁上 {cropStep}</button><button type="button" className="crop-edge-button" onClick={() => updateActiveSegment((current) => trimPdfCropEdge(current, "bottom", cropStep))}>裁下 {cropStep}</button><button type="button" className="crop-size-button" onClick={() => updateActiveSegment((current) => resizePdfCropSegment(current, 0, -cropStep))}>減高 {cropStep}</button><button type="button" className="crop-size-button" onClick={() => updateActiveSegment((current) => resizePdfCropSegment(current, 0, cropStep))}>加高 {cropStep}</button></div></section>
                  {segmentIndex > 0 ? (
                    <section className="focus-control-section is-seam-primary"><div className="focus-control-heading"><strong>跨頁接縫</strong><span>前段底部＋本段頂部</span></div><button type="button" className="focus-wide-action" disabled={cropBusy} onClick={() => applyCropAction((items, activeIndex) => { const next = [...items]; const previousItem = next[activeIndex - 1]; const currentItem = next[activeIndex]; if (!previousItem || !currentItem) return next; const [previousSegment, currentSegment] = compressPdfCropSeam(previousItem, currentItem, cropStep); next[activeIndex - 1] = previousSegment; next[activeIndex] = currentSegment; return next; }, `前段底部與本段頂部各裁除 ${cropStep}px。`)}>接縫兩側各裁 {cropStep}</button><button type="button" className="focus-wide-action is-primary" disabled={cropBusy} onClick={() => void autoCompressPreviousSeam()}>{cropBusy ? "分析中…" : "自動貼合前段接縫"}</button></section>
                  ) : <p className="focus-seam-hint">切換到段落 2 後即可使用跨頁接縫工具。</p>}
                  {cropMessage ? <p className="segment-crop-message" role="status">{cropMessage}</p> : null}
                  <details className="question-editor-advanced"><summary>進階設定</summary><div className="question-editor-advanced-body"><div className="segment-toolbar segment-management-toolbar"><strong>段落管理</strong><div><button type="button" onClick={addSegment}>新增／複製</button><button type="button" className="is-danger" disabled={!segment} onClick={removeSegment}>移除</button></div></div><SegmentFields segment={segment} onChange={updateSegment} /><section className="segment-control-group"><strong>左右與寬度微調</strong><div className="segment-nudges"><button type="button" onClick={() => updateActiveSegment((current) => movePdfCropSegment(current, -cropStep, 0))}>左移 {cropStep}</button><button type="button" onClick={() => updateActiveSegment((current) => movePdfCropSegment(current, cropStep, 0))}>右移 {cropStep}</button><button type="button" onClick={() => updateActiveSegment((current) => trimPdfCropEdge(current, "left", cropStep))}>裁左 {cropStep}</button><button type="button" onClick={() => updateActiveSegment((current) => trimPdfCropEdge(current, "right", cropStep))}>裁右 {cropStep}</button><button type="button" onClick={() => updateActiveSegment((current) => resizePdfCropSegment(current, -cropStep, 0))}>減寬 {cropStep}</button><button type="button" onClick={() => updateActiveSegment((current) => resizePdfCropSegment(current, cropStep, 0))}>加寬 {cropStep}</button></div></section><div className="question-editor-advanced-actions">{overrideIds.has(editable.id) ? <GlassButton variant="danger" disabled={busy} onClick={() => void revertOverride()}><Trash2 size={17} />移除未發布修改</GlassButton> : null}<GlassButton variant="secondary" disabled={busy || loading || chapterLoading} onClick={() => setChapterReloadKey((value) => value + 1)}><RefreshCcw size={17} />重新載入章節</GlassButton></div></div></details>
                </>
              ) : <div className="question-editor-empty-segment"><p>目前沒有段落。</p><button type="button" onClick={addSegment}>新增第一個段落</button></div>}
            </aside>
            <section className="question-editor-preview question-editor-focus-preview" aria-label="草稿成品與原頁裁切預覽">
              <div className="question-preview-head">
                <div><strong>草稿與裁切定位</strong><span>同步查看題目、解析成品，以及目前段落在原頁的位置。</span></div>
                {previewSegment ? <span className="question-preview-page">第 {previewSegment.page} 頁</span> : null}
              </div>
              {!previewReady ? <div className="question-editor-preview-skeleton" aria-live="polite">準備預覽中…</div> : <div className="question-editor-preview-scroll">
                <div className="question-editor-draft-previews" aria-label="草稿成品預覽">
                  <DraftOutputPreview
                    title="草稿題目"
                    active={mode === "question"}
                    segments={previewEditable!.questionSegments}
                    label={`第 ${previewEditable!.number} 題草稿題目`}
                    onEdit={() => { setMode("question"); setSegmentIndex(0); }}
                  />
                  <DraftOutputPreview
                    title="草稿解析"
                    active={mode === "explanation"}
                    segments={previewEditable!.explanationSegments}
                    label={`第 ${previewEditable!.number} 題草稿解析`}
                    onEdit={() => { setMode("explanation"); setSegmentIndex(0); }}
                  />
                </div>
                <div className="question-page-context-section">
                  <div className="question-page-context-head">
                    <div><strong>原頁裁切定位</strong><span>紅框即為目前欲裁切的範圍；可先掌握整頁內容，再進行微調。</span></div>
                    <span className="question-page-context-legend"><i aria-hidden="true" />欲裁切位置</span>
                  </div>
                  {previewSegment ? (
                    <PdfPageCropContext
                      segment={previewSegment}
                      segments={previewSegments}
                      activeIndex={segmentIndex}
                      label={`第 ${previewEditable!.number} 題第 ${previewSegment.page} 頁裁切定位`}
                    />
                  ) : <div className="question-page-context-empty">目前沒有可定位的裁切段落。</div>}
                </div>
              </div>}
            </section>
          </div>
        </>
      ) : null}
      <ToolMessages message={message} error={error} />
    </div>
  );
}

const DraftOutputPreview = memo(function DraftOutputPreview({
  title,
  active,
  segments,
  label,
  onEdit,
}: {
  title: string;
  active: boolean;
  segments: PdfCropSegment[];
  label: string;
  onEdit: () => void;
}) {
  return (
    <section className={`question-draft-preview-card${active ? " is-active" : ""}`}>
      <div className="question-draft-preview-head">
        <div><strong>{title}</strong><span>{segments.length} 段</span></div>
        <button type="button" onClick={onEdit}>{active ? "編輯中" : "切換編輯"}</button>
      </div>
      <div className="question-draft-preview-canvas">
        {segments.length ? <PdfSegmentStack segments={segments} label={label} priority={active ? "high" : "low"} /> : <p>尚未建立截圖段落。</p>}
      </div>
    </section>
  );
});

const PdfPageCropContext = memo(function PdfPageCropContext({
  segment,
  segments,
  activeIndex,
  label,
}: {
  segment: PdfCropSegment;
  segments: PdfCropSegment[];
  activeIndex: number;
  label: string;
}) {
  const pageSegments = segments
    .map((item, index) => ({ item, index }))
    .filter(({ item }) => item.page === segment.page && item.src === segment.src);
  const pageStyle: CSSProperties = { aspectRatio: `${segment.pageWidth} / ${segment.pageHeight}` };

  return (
    <div className="question-page-context-canvas" aria-label={label}>
      <div className="question-page-context-page" style={pageStyle}>
        <img src={pdfImageUrl(segment.src)} alt="" loading="lazy" decoding="async" fetchPriority="low" />
        {pageSegments.map(({ item, index }) => {
          const boxStyle: CSSProperties = {
            left: `${item.x / Math.max(1, item.pageWidth) * 100}%`,
            top: `${item.y / Math.max(1, item.pageHeight) * 100}%`,
            width: `${item.width / Math.max(1, item.pageWidth) * 100}%`,
            height: `${item.height / Math.max(1, item.pageHeight) * 100}%`,
          };
          return (
            <div
              key={`${item.src}-${item.page}-${index}`}
              className={`question-page-crop-box${index === activeIndex ? " is-active" : ""}`}
              style={boxStyle}
              aria-hidden="true"
            >
              <span>{index === activeIndex ? "目前裁切" : `段落 ${index + 1}`}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
});

function SegmentFields({ segment, onChange }: { segment: PdfCropSegment; onChange: (patch: Partial<PdfCropSegment>) => void }) {
  const numericFields: { key: keyof PdfCropSegment; label: string; min: number }[] = [
    { key: "page", label: "頁碼", min: 1 }, { key: "x", label: "X", min: 0 }, { key: "y", label: "Y", min: 0 },
    { key: "width", label: "寬度", min: 1 }, { key: "height", label: "高度", min: 1 },
    { key: "pageWidth", label: "原頁寬", min: 1 }, { key: "pageHeight", label: "原頁高", min: 1 },
  ];
  return (
    <div className="segment-field-grid">
      <label className="segment-src-field">圖片路徑<input value={segment.src} onChange={(event) => onChange({ src: event.target.value })} /></label>
      {numericFields.map((field) => (
        <label key={field.key}>{field.label}<input type="number" min={field.min} value={Number(segment[field.key])} onChange={(event) => onChange({ [field.key]: Number(event.target.value) })} /></label>
      ))}
    </div>
  );
}

function loadCropAnalysisImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("無法載入原始頁面圖片，請確認圖片路徑後再試。"));
    image.src = src;
  });
}

function ToolMessages({ message, error }: { message: string; error: string }) {
  return <>{message ? <p className="form-success">{message}</p> : null}{error ? <p className="form-error">{error}</p> : null}</>;
}

function questionEditSignature(question: ImageQuizQuestion): string {
  return JSON.stringify({
    answer: question.answer,
    questionSegments: question.questionSegments,
    explanationSegments: question.explanationSegments,
  });
}

function cloneQuestion(question: ImageQuizQuestion): ImageQuizQuestion {
  return {
    ...question,
    questionSegments: question.questionSegments.map((segment) => ({ ...segment })),
    explanationSegments: question.explanationSegments.map((segment) => ({ ...segment })),
    answerMask: question.answerMask ? { ...question.answerMask } : null,
  };
}

