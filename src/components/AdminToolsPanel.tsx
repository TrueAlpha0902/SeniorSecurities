import { Activity, Clipboard, KeyRound, RefreshCcw, Save, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import type {
  ImageQuizBank,
  ImageQuizQuestion,
  ImageQuizQuestionOverride,
  NumericAnswer,
  PdfCropSegment,
} from "../lib/imageQuiz";
import { assetUrl } from "../lib/imageQuiz";
import { GlassButton } from "./GlassButton";
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
  mfaVerified: boolean;
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
  releases?: ReleaseRow[];
  pointer?: ReleasePointer | null;
  role?: string;
  health?: SystemHealthPayload;
};

type SourceQuestionData = { banks: ImageQuizBank[] };

type ReleaseRow = {
  id: string;
  version: string;
  status: "draft" | "in_review" | "approved" | "published" | "rolled_back";
  title: string;
  notes: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  published_by: string | null;
  created_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  rolled_back_at: string | null;
};

type ReleasePointer = {
  active_release_id: string | null;
  previous_release_id: string | null;
  updated_at: string;
};

const TOOL_TABS: { id: ToolId; label: string; description: string; primaryOnly?: boolean }[] = [
  { id: "activation", label: "啟用碼", description: "建立與查看啟用碼" },
  { id: "admins", label: "管理員", description: "新增、恢復或停用管理員", primaryOnly: true },
  { id: "questions", label: "題目編輯", description: "編輯、覆核與發布題庫" },
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
            <div><span>管理員驗證</span><strong>{health.role} · {health.mfaVerified ? "AAL2" : "AAL1"}</strong></div>
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
  const [mfaRequired, setMfaRequired] = useState(false);
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
        body: JSON.stringify({ action, email: targetEmail, note, role: "admin", mfaRequired }),
      });
      setMessage(payload.message || "操作完成。 ");
      setEmail("");
      setNote("");
      setMfaRequired(false);
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
        <label className="admin-mfa-toggle"><input type="checkbox" checked={mfaRequired} onChange={(event) => setMfaRequired(event.target.checked)} /><span><strong>此帳號強制 MFA</strong><small>未以 aal2 驗證時，後台 API 會拒絕操作。</small></span></label>
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
  const [banks, setBanks] = useState<ImageQuizBank[]>([]);
  const [overrideIds, setOverrideIds] = useState<Set<string>>(new Set());
  const [bankId, setBankId] = useState("");
  const [chapterId, setChapterId] = useState("");
  const [questionId, setQuestionId] = useState("");
  const [questionNumber, setQuestionNumber] = useState("");
  const [editable, setEditable] = useState<ImageQuizQuestion | null>(null);
  const [mode, setMode] = useState<"question" | "explanation">("question");
  const [segmentIndex, setSegmentIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadEditorData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [dataResponse, overrideResponse] = await Promise.all([
        fetch(`${assetUrl("data/pdf-image-quiz.json")}?editor=1`),
        fetch("/api/question-overrides", { cache: "no-store" }),
      ]);
      if (!dataResponse.ok) throw new Error("無法載入完整題庫。 ");
      const source = await dataResponse.json() as SourceQuestionData;
      const payload = overrideResponse.ok ? await overrideResponse.json() as ApiPayload : {};
      const overrideMap = new Map((payload.overrides || []).map((override) => [override.questionId, override]));
      const merged = source.banks.map((bank) => ({
        ...bank,
        chapters: bank.chapters.map((chapter) => ({
          ...chapter,
          questions: chapter.questions.map((question) => {
            const override = overrideMap.get(question.id);
            return override ? { ...question, answer: override.answer, questionSegments: override.questionSegments, explanationSegments: override.explanationSegments } : question;
          }),
        })),
      }));
      setBanks(merged);
      setOverrideIds(new Set(overrideMap.keys()));
      setBankId((current) => merged.some((bank) => bank.bankId === current) ? current : merged[0]?.bankId || "");
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "題目編輯器載入失敗。 ");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { void loadEditorData(); }, [loadEditorData]);

  const bank = useMemo(() => banks.find((item) => item.bankId === bankId), [bankId, banks]);
  const chapter = useMemo(() => bank?.chapters.find((item) => item.chapterId === chapterId), [bank, chapterId]);
  const question = useMemo(() => chapter?.questions.find((item) => item.id === questionId), [chapter, questionId]);

  useEffect(() => {
    if (!bank) return;
    if (!bank.chapters.some((item) => item.chapterId === chapterId)) setChapterId(bank.chapters[0]?.chapterId || "");
  }, [bank, chapterId]);

  useEffect(() => {
    if (!chapter) return;
    if (!chapter.questions.some((item) => item.id === questionId)) setQuestionId(chapter.questions[0]?.id || "");
  }, [chapter, questionId]);

  useEffect(() => {
    setEditable(question ? cloneQuestion(question) : null);
    setSegmentIndex(0);
  }, [question]);

  const segmentKey = mode === "question" ? "questionSegments" : "explanationSegments";
  const segments = editable?.[segmentKey] || [];
  const segment = segments[segmentIndex];

  function updateSegment(patch: Partial<PdfCropSegment>): void {
    setEditable((current) => {
      if (!current) return current;
      const next = [...current[segmentKey]];
      if (!next[segmentIndex]) return current;
      next[segmentIndex] = { ...next[segmentIndex], ...patch };
      return { ...current, [segmentKey]: next };
    });
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
    else setError("本章找不到這個題號。 ");
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
          answer: editable.answer,
          questionSegments: editable.questionSegments,
          explanationSegments: editable.explanationSegments,
        }),
      });
      setMessage(payload.message || "題目修改已儲存。 ");
      setOverrideIds((current) => new Set(current).add(editable.id));
      setBanks((current) => replaceQuestion(current, editable));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : "題目儲存失敗。 ");
    } finally {
      setBusy(false);
    }
  }

  async function revertOverride(): Promise<void> {
    if (!editable || !window.confirm(`確定要讓第 ${editable.number} 題恢復成部署版本？`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/question-editor", {
        method: "POST",
        body: JSON.stringify({ action: "delete", questionId: editable.id }),
      });
      setMessage(payload.message || "已恢復部署版本。 ");
      await loadEditorData();
    } catch (revertError) {
      setError(revertError instanceof Error ? revertError.message : "無法恢復部署版本。 ");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-tool-pane question-editor-pane" role="tabpanel">
      {loading ? <p className="admin-tool-loading">載入 3526 題題庫中…</p> : null}
      <div className="question-editor-selectors">
        <label>科目<select value={bankId} onChange={(event) => setBankId(event.target.value)}>{banks.map((item) => <option key={item.bankId} value={item.bankId}>{item.bankTitle}</option>)}</select></label>
        <label>章節<select value={chapterId} onChange={(event) => setChapterId(event.target.value)}>{(bank?.chapters || []).map((item) => <option key={item.chapterId} value={item.chapterId}>{item.chapterTitle}</option>)}</select></label>
        <label>題目<select value={questionId} onChange={(event) => setQuestionId(event.target.value)}>{(chapter?.questions || []).map((item) => <option key={item.id} value={item.id}>第 {item.number} 題・答案 {item.answer}{overrideIds.has(item.id) ? "・已修改" : ""}</option>)}</select></label>
        <label>跳到題號<div className="question-jump-control"><input inputMode="numeric" value={questionNumber} onChange={(event) => setQuestionNumber(event.target.value)} /><button type="button" onClick={jumpToQuestion}>前往</button></div></label>
      </div>

      {editable ? (
        <>
          <div className="question-editor-summary">
            <div><strong>{editable.bankTitle}／{editable.chapterTitle}／第 {editable.number} 題</strong><span>{editable.id}</span></div>
            <label>正確答案<select value={editable.answer} onChange={(event) => setEditable({ ...editable, answer: event.target.value as NumericAnswer })}><option value="1">1</option><option value="2">2</option><option value="3">3</option><option value="4">4</option></select></label>
          </div>

          <div className="question-editor-mode-tabs">
            <button type="button" className={mode === "question" ? "is-active" : ""} onClick={() => { setMode("question"); setSegmentIndex(0); }}>題目截圖</button>
            <button type="button" className={mode === "explanation" ? "is-active" : ""} onClick={() => { setMode("explanation"); setSegmentIndex(0); }}>解析截圖</button>
          </div>

          <div className="question-editor-workspace">
            <div className="question-editor-fields">
              <div className="segment-toolbar">
                <label>段落<select value={segmentIndex} onChange={(event) => setSegmentIndex(Number(event.target.value))}>{segments.map((_, index) => <option key={index} value={index}>段落 {index + 1}</option>)}</select></label>
                <button type="button" onClick={addSegment}>新增／複製</button>
                <button type="button" className="is-danger" disabled={!segment} onClick={removeSegment}>移除</button>
              </div>
              {segment ? <SegmentFields segment={segment} onChange={updateSegment} /> : <p>目前沒有段落，請先新增。</p>}
              {segment ? (
                <div className="segment-nudges">
                  <button type="button" onClick={() => updateSegment({ y: Math.max(0, segment.y - 5) })}>上移 5</button>
                  <button type="button" onClick={() => updateSegment({ y: segment.y + 5 })}>下移 5</button>
                  <button type="button" onClick={() => updateSegment({ x: Math.max(0, segment.x - 5) })}>左移 5</button>
                  <button type="button" onClick={() => updateSegment({ x: segment.x + 5 })}>右移 5</button>
                  <button type="button" onClick={() => updateSegment({ width: segment.width + 5 })}>加寬 5</button>
                  <button type="button" onClick={() => updateSegment({ height: segment.height + 5 })}>加高 5</button>
                </div>
              ) : null}
            </div>
            <div className="question-editor-preview">
              <p>App 實際顯示預覽</p>
              <PdfSegmentStack segments={segments} label={`第 ${editable.number} 題預覽`} priority="auto" />
            </div>
          </div>

          <div className="admin-tool-actions question-editor-save-actions">
            <GlassButton variant="primary" disabled={busy} onClick={() => void saveOverride()}><Save size={18} />儲存工作草稿</GlassButton>
            {overrideIds.has(editable.id) ? <GlassButton variant="danger" disabled={busy} onClick={() => void revertOverride()}><Trash2 size={17} />恢復部署版本</GlassButton> : null}
            <GlassButton variant="secondary" disabled={busy || loading} onClick={() => void loadEditorData()}><RefreshCcw size={17} />重新載入</GlassButton>
          </div>
        </>
      ) : null}
      <ToolMessages message={message} error={error} />
      <QuestionReleaseControls accessToken={accessToken} isPrimaryAdmin={isPrimaryAdmin} />
    </div>
  );
}


function QuestionReleaseControls({ accessToken, isPrimaryAdmin }: { accessToken: string; isPrimaryAdmin: boolean }) {
  const [rows, setRows] = useState<ReleaseRow[]>([]);
  const [pointer, setPointer] = useState<ReleasePointer | null>(null);
  const [version, setVersion] = useState(() => `v${new Date().toISOString().slice(0, 10).replace(/-/g, ".")}`);
  const [title, setTitle] = useState("題庫內容更新");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const loadRows = useCallback(async () => {
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/releases");
      setRows(payload.releases || []);
      setPointer(payload.pointer || null);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "無法載入發布流程。");
    }
  }, [accessToken]);

  useEffect(() => { void loadRows(); }, [loadRows]);

  async function run(action: "create-draft" | "submit-review" | "approve" | "publish" | "rollback", releaseId?: string): Promise<void> {
    const labels = { "create-draft": "建立發布草稿", "submit-review": "送交覆核", approve: "核准", publish: "正式發布", rollback: "回滾上一版" };
    if ((action === "publish" || action === "rollback") && !window.confirm(`確定要${labels[action]}？這會改變所有使用者看到的線上題庫。`)) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/releases", {
        method: "POST",
        body: JSON.stringify({ action, releaseId, version, title, notes }),
      });
      setMessage(payload.message || `${labels[action]}完成。`);
      await loadRows();
    } catch (actionError) {
      setError(actionError instanceof Error ? actionError.message : `${labels[action]}失敗。`);
    } finally {
      setBusy(false);
    }
  }

  const publishableRelease = rows.find((row) => row.status === "approved") || null;
  const activeRelease = rows.find((row) => pointer?.active_release_id === row.id) || null;

  return (
    <section className="question-release-section" aria-labelledby="question-release-title">
      <div className="question-release-heading">
        <div>
          <p className="eyebrow">Publish</p>
          <h3 id="question-release-title">題庫發布</h3>
          <p>工作草稿建立快照並完成覆核後，由主要管理員發布。</p>
        </div>
        {activeRelease ? <span className="release-live-badge">線上：{activeRelease.version}</span> : null}
      </div>

      <div className="admin-tool-form-grid question-release-form">
        <label>版本名稱<input value={version} onChange={(event) => setVersion(event.target.value)} placeholder="v2026.07.11" /></label>
        <label>發布標題<input value={title} onChange={(event) => setTitle(event.target.value)} /></label>
        <label className="admin-tool-wide">版本說明<input value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="本次修正內容與驗證方式" /></label>
      </div>

      <div className="admin-tool-actions">
        <GlassButton variant="secondary" disabled={busy} onClick={() => void run("create-draft")}><Save size={18} />建立版本快照</GlassButton>
        <GlassButton variant="secondary" disabled={busy} onClick={() => void loadRows()}><RefreshCcw size={18} />重新整理</GlassButton>
      </div>

      <ToolMessages message={message} error={error} />

      <div className="release-list compact-release-list">
        {rows.slice(0, 8).map((row) => {
          const isActive = pointer?.active_release_id === row.id;
          return (
            <article key={row.id} className={isActive ? "is-active-release" : ""}>
              <div className="release-row-main">
                <div>
                  <span className={`release-status status-${row.status}`}>{releaseStatusLabel(row.status)}</span>
                  {isActive ? <span className="release-live-badge">線上版本</span> : null}
                  <strong>{row.version} · {row.title}</strong>
                  <small>{row.notes || "無版本說明"}</small>
                </div>
                <time>{new Intl.DateTimeFormat("zh-TW", { dateStyle: "medium", timeStyle: "short" }).format(new Date(row.created_at))}</time>
              </div>
              <div className="release-row-actions">
                {row.status === "draft" ? <button disabled={busy} onClick={() => void run("submit-review", row.id)}>送交覆核</button> : null}
                {row.status === "in_review" ? <button disabled={busy} onClick={() => void run("approve", row.id)}>第二人核准</button> : null}
              </div>
            </article>
          );
        })}
        {!rows.length ? <p className="admin-tool-empty">尚無發布版本。先儲存工作草稿，再建立版本快照。</p> : null}
      </div>

      <div className="question-publish-footer">
        <div>
          <strong>{publishableRelease ? `${publishableRelease.version} 已可發布` : "尚無已核准版本"}</strong>
          <span>{isPrimaryAdmin ? "發布後將立即成為線上題庫版本。" : "只有主要管理員可以執行正式發布。"}</span>
        </div>
        <div className="question-publish-actions">
          {activeRelease && pointer?.previous_release_id && isPrimaryAdmin ? (
            <GlassButton variant="secondary" disabled={busy} onClick={() => void run("rollback", activeRelease.id)}>回滾上一版</GlassButton>
          ) : null}
          <GlassButton
            variant="primary"
            disabled={busy || !isPrimaryAdmin || !publishableRelease}
            onClick={() => publishableRelease ? void run("publish", publishableRelease.id) : undefined}
          >
            <ShieldCheck size={18} />
            發布題庫
          </GlassButton>
        </div>
      </div>
    </section>
  );
}

function releaseStatusLabel(status: ReleaseRow["status"]): string {
  if (status === "draft") return "草稿";
  if (status === "in_review") return "覆核中";
  if (status === "approved") return "已核准";
  if (status === "published") return "已發布";
  return "已回滾";
}

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

function ToolMessages({ message, error }: { message: string; error: string }) {
  return <>{message ? <p className="form-success">{message}</p> : null}{error ? <p className="form-error">{error}</p> : null}</>;
}

function cloneQuestion(question: ImageQuizQuestion): ImageQuizQuestion {
  return {
    ...question,
    questionSegments: question.questionSegments.map((segment) => ({ ...segment })),
    explanationSegments: question.explanationSegments.map((segment) => ({ ...segment })),
    answerMask: question.answerMask ? { ...question.answerMask } : null,
  };
}

function replaceQuestion(banks: ImageQuizBank[], replacement: ImageQuizQuestion): ImageQuizBank[] {
  return banks.map((bank) => ({
    ...bank,
    chapters: bank.chapters.map((chapter) => ({
      ...chapter,
      questions: chapter.questions.map((question) => question.id === replacement.id ? cloneQuestion(replacement) : question),
    })),
  }));
}
