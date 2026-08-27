import { AlertTriangle, ShieldCheck, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import { createEphemeralAuthClient } from "../lib/supabase";
import { GlassButton } from "./GlassButton";
import { V93InlineNotice } from "./V93InteractionPrimitives";

type DeleteMemberRequest = {
  operationId: string;
  accessToken: string;
};

type DeleteMemberImpact = {
  answered: number;
  wrong: number | null;
  favorites: number | null;
  devices: number;
  entitlements: number;
};

type AdminDeleteMemberDialogProps = {
  open: boolean;
  email: string;
  adminId: string;
  adminEmail: string;
  impact: DeleteMemberImpact;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (request: DeleteMemberRequest) => Promise<void>;
};

function newOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

export function AdminDeleteMemberDialog({
  open,
  email,
  adminId,
  adminEmail,
  impact,
  busy,
  error,
  onCancel,
  onConfirm,
}: AdminDeleteMemberDialogProps) {
  const titleId = useId();
  const warningId = useId();
  const passwordHelpId = useId();
  const dialogRef = useRef<HTMLFormElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [currentPassword, setCurrentPassword] = useState("");
  const [verificationError, setVerificationError] = useState<string | null>(null);
  const [verifying, setVerifying] = useState(false);
  const [operationId, setOperationId] = useState(newOperationId);
  const pending = busy || verifying;
  const pendingRef = useRef(pending);
  const onCancelRef = useRef(onCancel);
  const portalTarget = typeof document === "undefined" ? null : document.body;

  pendingRef.current = pending;
  onCancelRef.current = onCancel;

  const cancelDialog = useCallback(() => {
    if (pendingRef.current) return;
    onCancelRef.current();
  }, []);

  useDialogFocusTrap(
    open && portalTarget !== null,
    dialogRef,
    closeRef,
    pending ? undefined : cancelDialog,
  );

  useEffect(() => {
    if (!open) return;
    setCurrentPassword("");
    setVerificationError(null);
    setVerifying(false);
    setOperationId(newOperationId());
  }, [open]);

  async function submitDeletion(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const password = currentPassword;
    if (!password || pending) return;

    const proofClient = createEphemeralAuthClient();
    if (!proofClient || !adminId || !adminEmail) {
      setVerificationError("目前無法連線至身分驗證服務，請重新整理後再試。");
      return;
    }

    setVerifying(true);
    setVerificationError(null);
    try {
      const { data, error: signInError } = await proofClient.auth.signInWithPassword({
        email: adminEmail,
        password,
      });
      if (signInError || !data.user || !data.session?.access_token) {
        throw new Error("管理員密碼不正確，請重新輸入目前密碼。");
      }
      if (
        data.user.id !== adminId
        || data.user.email?.trim().toLowerCase() !== adminEmail.trim().toLowerCase()
      ) {
        throw new Error("密碼驗證帳號與目前主要管理員不一致，已停止刪除。");
      }

      setCurrentPassword("");
      await onConfirm({ operationId, accessToken: data.session.access_token });
    } catch (verificationFailure) {
      const message = verificationFailure instanceof Error
        ? verificationFailure.message
        : "管理員密碼驗證失敗，請重新輸入。";
      setVerificationError(message);
      announceInteractionFeedback(message, "error", 4800);
    } finally {
      const { error: signOutError } = await proofClient.auth.signOut({ scope: "local" });
      if (signOutError) console.error("Failed to revoke temporary administrator proof session.");
      setVerifying(false);
    }
  }

  if (!open || !portalTarget) return null;

  return createPortal(
    <div className="theme-v93 theme-v90 admin-delete-member-backdrop" role="presentation">
      <form
        ref={dialogRef}
        className="admin-delete-member-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={`${warningId} ${passwordHelpId}`}
        aria-busy={pending || undefined}
        tabIndex={-1}
        onSubmit={(event) => void submitDeletion(event)}
      >
        <header>
          <span><UserDeleteIcon /></span>
          <div>
            <p className="eyebrow">Danger zone</p>
            <h2 id={titleId}>永久移除會員帳號</h2>
            <p>{email}</p>
          </div>
          <button ref={closeRef} type="button" disabled={pending} onClick={cancelDialog} aria-label="關閉永久刪除視窗">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="admin-delete-member-scroll">
          <div id={warningId}>
            <V93InlineNotice tone="error">
              此操作無法復原，會刪除登入帳號、權限、雲端學習紀錄、裝置、排行榜及頭像。啟用碼已使用次數不會回補。
            </V93InlineNotice>
          </div>

          <div className="admin-delete-impact-grid" aria-label="預計刪除內容">
            <div><strong>{impact.answered.toLocaleString("zh-TW")}</strong><span>作答紀錄</span></div>
            <div><strong>{impact.wrong ?? "—"}</strong><span>錯題</span></div>
            <div><strong>{impact.favorites ?? "—"}</strong><span>收藏</span></div>
            <div><strong>{impact.devices}</strong><span>裝置</span></div>
            <div><strong>{impact.entitlements}</strong><span>題庫授權</span></div>
          </div>

          <section className="admin-delete-security-step">
            <div className="admin-delete-step-title">
              <span><ShieldCheck size={19} aria-hidden="true" /></span>
              <div>
                <strong>輸入目前主要管理員密碼</strong>
                <small id={passwordHelpId}>密碼只會直接送往身分驗證服務，不會傳入管理 API、儲存或寫入操作紀錄。</small>
              </div>
            </div>
            <div className="admin-delete-reauth">
              <label htmlFor="admin-delete-current-password">目前管理員密碼</label>
              <input
                id="admin-delete-current-password"
                type="password"
                value={currentPassword}
                autoComplete="current-password"
                autoFocus
                disabled={pending}
                aria-invalid={Boolean(verificationError || error) || undefined}
                aria-describedby={passwordHelpId}
                onChange={(event) => {
                  setCurrentPassword(event.target.value);
                  setVerificationError(null);
                }}
              />
            </div>
            {verificationError ? <V93InlineNotice tone="error">{verificationError}</V93InlineNotice> : null}
          </section>

          {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
        </div>

        <footer>
          <GlassButton variant="secondary" disabled={pending} onClick={cancelDialog}>取消</GlassButton>
          <GlassButton
            type="submit"
            variant="danger"
            busy={pending}
            disabled={!currentPassword || pending || !adminId || !adminEmail}
          >
            <Trash2 size={17} aria-hidden="true" />驗證密碼並永久刪除
          </GlassButton>
        </footer>
      </form>
    </div>,
    portalTarget,
  );
}

function UserDeleteIcon() {
  return <AlertTriangle size={23} aria-hidden="true" />;
}

export type { DeleteMemberImpact, DeleteMemberRequest };
