import { Activity, Clipboard, KeyRound, RefreshCcw, ShieldCheck, Trash2, UsersRound, X } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";
import { V93ConfirmDialog, V93InlineNotice } from "./V93InteractionPrimitives";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import "../styles/admin-tools.css";

type ToolId = "activation" | "admins" | "health";
type ExamId = "senior-securities" | "junior-foreign-exchange";

type CreatedActivationCode = {
  code: string;
  examId: ExamId;
};

const EXAM_LABELS: Record<ExamId, string> = {
  "senior-securities": "證券高業",
  "junior-foreign-exchange": "初階外匯",
};

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
  exam_id: ExamId;
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
  examId?: ExamId;
  admins?: AdminAccountRow[];
  primaryEmails?: string[];
  activationCodes?: ActivationCodeRow[];
  isPrimaryAdmin?: boolean;
  role?: string;
  health?: SystemHealthPayload;
};


const TOOL_TABS: { id: ToolId; label: string; description: string; primaryOnly?: boolean }[] = [
  { id: "activation", label: "啟用碼", description: "建立與查看啟用碼" },
  { id: "admins", label: "管理員", description: "新增、恢復或停用管理員", primaryOnly: true },
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
  const [examId, setExamId] = useState<ExamId>("senior-securities");
  const [customCode, setCustomCode] = useState("");
  const [note, setNote] = useState("");
  const [maxUses, setMaxUses] = useState(1);
  const [createdCode, setCreatedCode] = useState<CreatedActivationCode | null>(null);
  const [rows, setRows] = useState<ActivationCodeRow[]>([]);
  const [isPrimaryAdmin, setIsPrimaryAdmin] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [pendingDeleteCode, setPendingDeleteCode] = useState<ActivationCodeRow | null>(null);

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
        body: JSON.stringify({ action: "create-activation-code", examId, code: customCode, note, maxUses }),
      });
      if (!payload.code || (payload.examId !== "senior-securities" && payload.examId !== "junior-foreign-exchange")) {
        throw new Error("伺服器未回傳完整的啟用碼題庫資訊。");
      }
      setCreatedCode({ code: payload.code, examId: payload.examId });
      const successMessage = payload.message || "啟用碼已建立。";
      setMessage(successMessage);
      announceInteractionFeedback(successMessage, "success");
      setCustomCode("");
      setNote("");
      await loadRows();
    } catch (createError) {
      const errorMessage = createError instanceof Error ? createError.message : "無法建立啟用碼。";
      setError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4200);
    } finally {
      setBusy(false);
    }
  }

  async function copyCode(code: string): Promise<void> {
    try {
      await navigator.clipboard.writeText(code);
      setMessage("啟用碼已複製。");
      setError("");
      announceInteractionFeedback("啟用碼已複製。", "success");
    } catch {
      const errorMessage = "無法存取剪貼簿，請手動選取啟用碼。";
      setError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4200);
    }
  }

  function requestDeleteCode(row: ActivationCodeRow): void {
    if (!isPrimaryAdmin) {
      const errorMessage = "只有主要管理員可以刪除啟用碼。";
      setError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4200);
      return;
    }
    setPendingDeleteCode(row);
  }

  async function deleteCode(): Promise<void> {
    const row = pendingDeleteCode;
    if (!row) return;
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/tools", {
        method: "POST",
        body: JSON.stringify({ action: "delete-activation-code", activationCodeId: row.id }),
      });
      const successMessage = payload.message || "啟用碼已刪除。";
      setMessage(successMessage);
      announceInteractionFeedback(successMessage, "success");
      setPendingDeleteCode(null);
      await loadRows();
    } catch (deleteError) {
      const errorMessage = deleteError instanceof Error ? deleteError.message : "無法刪除啟用碼。";
      setError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4200);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="admin-tool-pane" role="tabpanel">
      <div className="admin-tool-form-grid">
        <fieldset className="admin-activation-scope admin-tool-wide">
          <legend>啟用碼適用題庫</legend>
          <div className="admin-activation-scope-options">
            <label className={`admin-activation-scope-option${examId === "senior-securities" ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="activation-exam-id"
                value="senior-securities"
                checked={examId === "senior-securities"}
                disabled={busy}
                onChange={() => setExamId("senior-securities")}
              />
              <span><strong>證券高業啟用碼</strong><small>只開通證券高業，不會開通初階外匯</small></span>
            </label>
            <label className={`admin-activation-scope-option${examId === "junior-foreign-exchange" ? " is-selected" : ""}`}>
              <input
                type="radio"
                name="activation-exam-id"
                value="junior-foreign-exchange"
                checked={examId === "junior-foreign-exchange"}
                disabled={busy}
                onChange={() => setExamId("junior-foreign-exchange")}
              />
              <span><strong>初階外匯啟用碼</strong><small>只開通初階外匯，不會開通證券高業</small></span>
            </label>
          </div>
          <p>每組啟用碼只能開通一個題庫；若兩個題庫都需要，請分別建立兩組啟用碼。</p>
        </fieldset>
        <label>可使用次數<input type="number" min={1} max={999} value={maxUses} onChange={(event) => setMaxUses(Number(event.target.value))} /></label>
        <label className="admin-tool-wide">自訂啟用碼（可留空，不需連字號）<input value={customCode} onChange={(event) => setCustomCode(event.target.value)} placeholder={examId === "junior-foreign-exchange" ? "FOREXXXXXXXX" : "SENIORXXXXXXXX"} /></label>
        <label className="admin-tool-wide">備註<input value={note} onChange={(event) => setNote(event.target.value)} placeholder="例如：2026 夏季班" /></label>
      </div>
      <div className="admin-tool-actions">
        <GlassButton variant="primary" busy={busy} disabled={busy} onClick={() => void createCode()}><KeyRound size={18} />建立{EXAM_LABELS[examId]}啟用碼</GlassButton>
        <GlassButton variant="secondary" disabled={busy} onClick={() => void loadRows()}><RefreshCcw size={18} />重新整理</GlassButton>
      </div>
      {createdCode ? (
        <div className="admin-created-code">
          <div>
            <small>只顯示這一次，關閉後無法再次查看完整啟用碼。</small>
            <span className="admin-created-code-scope">僅適用：{EXAM_LABELS[createdCode.examId]}</span>
            <strong>{createdCode.code}</strong>
            <small>此碼只會開通{EXAM_LABELS[createdCode.examId]}，另一題庫需另外建立啟用碼。</small>
          </div>
          <GlassButton variant="secondary" onClick={() => void copyCode(createdCode.code)}><Clipboard size={16} />複製</GlassButton>
        </div>
      ) : null}
      <ToolMessages message={message} error={error} />
      <div className="admin-tool-list">
        {rows.map((row) => {
          const visibleCode = row.code_preview;
          return (
            <article key={row.id}>
              <div><strong>{visibleCode}</strong><span>{EXAM_LABELS[row.exam_id] || "題庫"} · {row.note || "無備註"}</span></div>
              <div><span>{row.use_count} / {row.max_uses} 次</span><span>{row.is_active ? "啟用" : "停用"}</span></div>
              <div className="admin-inline-actions">
                {isPrimaryAdmin ? (
                  <button type="button" className="is-danger" disabled={busy} onClick={() => requestDeleteCode(row)}><Trash2 size={14} />刪除</button>
                ) : null}
              </div>
            </article>
          );
        })}
      </div>
      <V93ConfirmDialog
        open={Boolean(pendingDeleteCode)}
        title="永久刪除啟用碼"
        message={pendingDeleteCode
          ? `確定永久刪除啟用碼 ${pendingDeleteCode.code_preview}？已使用紀錄仍會保留，但無法復原此啟用碼。`
          : ""}
        confirmLabel="永久刪除"
        busy={busy}
        onCancel={() => setPendingDeleteCode(null)}
        onConfirm={() => void deleteCode()}
      />
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
  const [pendingAdminAction, setPendingAdminAction] = useState<{
    action: "disable-admin" | "delete-admin";
    targetEmail: string;
  } | null>(null);

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

  function requestRun(
    action: "upsert-admin" | "disable-admin" | "delete-admin",
    targetEmail = email,
  ): void {
    if (action === "disable-admin" || action === "delete-admin") {
      setPendingAdminAction({ action, targetEmail });
      return;
    }
    void run(action, targetEmail);
  }

  async function run(
    action: "upsert-admin" | "disable-admin" | "delete-admin",
    targetEmail = email,
  ): Promise<void> {
    setBusy(true);
    setMessage("");
    setError("");
    try {
      const payload = await adminRequest(accessToken, "/api/admin/tools", {
        method: "POST",
        body: JSON.stringify({ action, email: targetEmail, note, role: "admin" }),
      });
      const successMessage = payload.message || "操作完成。";
      setMessage(successMessage);
      announceInteractionFeedback(successMessage, "success");
      setEmail("");
      setNote("");
      setPendingAdminAction(null);
      await loadRows();
    } catch (actionError) {
      const errorMessage = actionError instanceof Error ? actionError.message : "管理員操作失敗。";
      setError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4200);
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
        <GlassButton variant="primary" disabled={busy || !email.trim()} onClick={() => requestRun("upsert-admin")}><UsersRound size={18} />加入／恢復管理員</GlassButton>
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
                {!row.is_active ? <button type="button" disabled={busy} onClick={() => requestRun("upsert-admin", row.email)}>恢復</button> : null}
                {!isPrimary && row.is_active ? <button type="button" disabled={busy} onClick={() => requestRun("disable-admin", row.email)}>停用</button> : null}
                {!isPrimary ? <button type="button" className="is-danger" disabled={busy} onClick={() => requestRun("delete-admin", row.email)}><Trash2 size={14} />刪除</button> : null}
              </div>
            </article>
          );
        })}
      </div>
      <V93ConfirmDialog
        open={Boolean(pendingAdminAction)}
        title={pendingAdminAction?.action === "delete-admin" ? "刪除管理員" : "停用管理員"}
        message={pendingAdminAction
          ? `確定要${pendingAdminAction.action === "delete-admin" ? "刪除" : "停用"}管理員 ${pendingAdminAction.targetEmail}？`
          : ""}
        confirmLabel={pendingAdminAction?.action === "delete-admin" ? "確認刪除" : "確認停用"}
        busy={busy}
        onCancel={() => setPendingAdminAction(null)}
        onConfirm={() => {
          if (pendingAdminAction) {
            void run(pendingAdminAction.action, pendingAdminAction.targetEmail);
          }
        }}
      />
    </div>
  );
}

function ToolMessages({ message, error }: { message: string; error: string }) {
  return (
    <>
      {message ? <V93InlineNotice tone="success">{message}</V93InlineNotice> : null}
      {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
    </>
  );
}
