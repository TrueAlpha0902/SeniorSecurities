import { AlertTriangle, KeyRound, ShieldCheck, Smartphone, Trash2, X } from "lucide-react";
import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import { supabase } from "../lib/supabase";
import { GlassButton } from "./GlassButton";
import { V93InlineNotice } from "./V93InteractionPrimitives";

type DeleteMemberRequest = {
  confirmationEmail: string;
  confirmationPhrase: string;
  reason: string;
  operationId: string;
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
  impact: DeleteMemberImpact;
  busy: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: (request: DeleteMemberRequest) => void;
};

function newOperationId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (character) => {
    const random = Math.floor(Math.random() * 16);
    const value = character === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

async function cleanupEnrollmentFactor(factorId: string): Promise<boolean> {
  if (!supabase) return false;
  const { error } = await supabase.auth.mfa.unenroll({ factorId });
  if (error) {
    console.error("Failed to remove unfinished administrator MFA factor:", error);
    return false;
  }
  return true;
}

export function AdminDeleteMemberDialog({
  open,
  email,
  impact,
  busy,
  error,
  onCancel,
  onConfirm,
}: AdminDeleteMemberDialogProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const [confirmationEmail, setConfirmationEmail] = useState("");
  const [confirmationPhrase, setConfirmationPhrase] = useState("");
  const [reason, setReason] = useState("");
  const [understood, setUnderstood] = useState(false);
  const [securityLevel, setSecurityLevel] = useState<"loading" | "aal1" | "aal2" | "error">("loading");
  const [securityError, setSecurityError] = useState<string | null>(null);
  const [factorId, setFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState<string | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [adminEmail, setAdminEmail] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [securityBusy, setSecurityBusy] = useState(false);
  const [operationId, setOperationId] = useState(newOperationId);
  const enrollmentFactorRef = useRef<string | null>(null);
  const lifecycleGenerationRef = useRef(0);
  const isOpenRef = useRef(open);
  const busyRef = useRef(busy);
  const onCancelRef = useRef(onCancel);
  const portalTarget = typeof document === "undefined" ? null : document.body;

  isOpenRef.current = open;
  busyRef.current = busy;
  onCancelRef.current = onCancel;

  const cancelDialog = useCallback(() => {
    if (busyRef.current) return;
    lifecycleGenerationRef.current += 1;
    isOpenRef.current = false;
    const unfinishedFactorId = enrollmentFactorRef.current;
    enrollmentFactorRef.current = null;
    onCancelRef.current();
    if (unfinishedFactorId) void cleanupEnrollmentFactor(unfinishedFactorId);
  }, []);

  useDialogFocusTrap(
    open && portalTarget !== null,
    dialogRef,
    closeRef,
    busy ? undefined : cancelDialog,
  );

  const inspectSecurity = useCallback(async () => {
    const generation = lifecycleGenerationRef.current;
    const isCurrentDialog = () => isOpenRef.current && lifecycleGenerationRef.current === generation;
    if (!supabase) {
      if (isCurrentDialog()) {
        setSecurityLevel("error");
        setSecurityError("目前無法連線至身分驗證服務。");
      }
      return;
    }
    setSecurityLevel("loading");
    setSecurityError(null);
    const [assurance, factors, currentUser] = await Promise.all([
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
      supabase.auth.mfa.listFactors(),
      supabase.auth.getUser(),
    ]);
    if (!isCurrentDialog()) return;
    if (assurance.error || factors.error || currentUser.error || !currentUser.data.user?.email) {
      setSecurityLevel("error");
      setSecurityError(assurance.error?.message || factors.error?.message || currentUser.error?.message || "無法確認雙重驗證狀態。");
      return;
    }
    setAdminEmail(currentUser.data.user.email);
    const verifiedFactor = factors.data.totp.find((factor) => factor.status === "verified") || null;
    setFactorId(verifiedFactor?.id || null);
    setSecurityLevel(assurance.data.currentLevel === "aal2" ? "aal2" : "aal1");
  }, []);

  useEffect(() => {
    if (!open) {
      lifecycleGenerationRef.current += 1;
      isOpenRef.current = false;
      const unfinishedFactorId = enrollmentFactorRef.current;
      enrollmentFactorRef.current = null;
      if (unfinishedFactorId) void cleanupEnrollmentFactor(unfinishedFactorId);
      return;
    }
    lifecycleGenerationRef.current += 1;
    isOpenRef.current = true;
    setConfirmationEmail("");
    setConfirmationPhrase("");
    setReason("");
    setUnderstood(false);
    setMfaCode("");
    setReauthPassword("");
    setQrCode(null);
    setSecret(null);
    setSecurityBusy(false);
    setOperationId(newOperationId());
    void inspectSecurity();
  }, [inspectSecurity, open]);

  useEffect(() => () => {
    lifecycleGenerationRef.current += 1;
    isOpenRef.current = false;
    const unfinishedFactorId = enrollmentFactorRef.current;
    enrollmentFactorRef.current = null;
    if (unfinishedFactorId) void cleanupEnrollmentFactor(unfinishedFactorId);
  }, []);

  async function beginEnrollment(): Promise<void> {
    if (!supabase || !adminEmail || !reauthPassword || securityBusy) return;
    const generation = lifecycleGenerationRef.current;
    const isCurrentDialog = () => isOpenRef.current && lifecycleGenerationRef.current === generation;
    setSecurityBusy(true);
    setSecurityError(null);
    try {
      const reauthentication = await supabase.auth.signInWithPassword({
        email: adminEmail,
        password: reauthPassword,
      });
      if (reauthentication.error) throw new Error("管理員密碼驗證失敗，無法建立新的第二因素。");
      if (!isCurrentDialog()) return;
      const factors = await supabase.auth.mfa.listFactors();
      if (factors.error) throw factors.error;
      for (const factor of factors.data.all.filter((candidate) => candidate.factor_type === "totp" && candidate.status !== "verified")) {
        if (!isCurrentDialog()) return;
        const cleaned = await cleanupEnrollmentFactor(factor.id);
        if (!cleaned) throw new Error("無法清除先前未完成的驗證器設定，已停止建立新的第二因素。");
      }
      if (!isCurrentDialog()) return;
      const enrollment = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: "管理後台永久刪除驗證",
      });
      if (enrollment.error) throw enrollment.error;
      if (!isCurrentDialog()) {
        await cleanupEnrollmentFactor(enrollment.data.id);
        return;
      }
      enrollmentFactorRef.current = enrollment.data.id;
      setFactorId(enrollment.data.id);
      setQrCode(enrollment.data.totp.qr_code);
      setSecret(enrollment.data.totp.secret);
      setReauthPassword("");
    } catch (enrollmentError) {
      if (isCurrentDialog()) {
        setSecurityError(enrollmentError instanceof Error ? enrollmentError.message : "無法建立雙重驗證設定。");
      }
    } finally {
      if (isCurrentDialog()) setSecurityBusy(false);
    }
  }

  async function verifyMfa(): Promise<void> {
    if (!supabase || !factorId || !/^\d{6}$/.test(mfaCode) || securityBusy) return;
    const generation = lifecycleGenerationRef.current;
    const isCurrentDialog = () => isOpenRef.current && lifecycleGenerationRef.current === generation;
    const verifyingNewEnrollment = enrollmentFactorRef.current === factorId;
    setSecurityBusy(true);
    setSecurityError(null);
    try {
      const verification = await supabase.auth.mfa.challengeAndVerify({ factorId, code: mfaCode });
      if (verification.error) throw verification.error;
      if (!isCurrentDialog()) {
        if (verifyingNewEnrollment) await cleanupEnrollmentFactor(factorId);
        return;
      }
      setSecurityLevel("aal2");
      enrollmentFactorRef.current = null;
      setQrCode(null);
      setSecret(null);
      setMfaCode("");
      announceInteractionFeedback("管理員身分已完成雙重驗證。", "success", 3200);
    } catch (verificationError) {
      if (isCurrentDialog()) {
        setSecurityError(verificationError instanceof Error ? verificationError.message : "驗證碼不正確，請重新輸入。");
      }
    } finally {
      if (isCurrentDialog()) setSecurityBusy(false);
    }
  }

  if (!open || !portalTarget) return null;

  const normalizedTarget = email.trim().toLowerCase();
  const canDelete = securityLevel === "aal2"
    && confirmationEmail.trim().toLowerCase() === normalizedTarget
    && confirmationPhrase.trim() === "永久刪除"
    && reason.trim().length >= 3
    && understood
    && !busy;

  return createPortal(
    <div className="theme-v93 theme-v90 admin-delete-member-backdrop" role="presentation">
      <section
        ref={dialogRef}
        className="admin-delete-member-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-busy={busy || undefined}
        tabIndex={-1}
      >
        <header>
          <span><UserDeleteIcon /></span>
          <div>
            <p className="eyebrow">Danger zone</p>
            <h2 id={titleId}>永久移除會員帳號</h2>
            <p>{email}</p>
          </div>
          <button ref={closeRef} type="button" disabled={busy} onClick={cancelDialog} aria-label="關閉永久刪除視窗">
            <X size={20} aria-hidden="true" />
          </button>
        </header>

        <div className="admin-delete-member-scroll">
          <V93InlineNotice tone="error">
            此操作無法復原，會刪除登入帳號、權限、雲端學習紀錄、裝置、排行榜及頭像。啟用碼已使用次數不會回補。
          </V93InlineNotice>

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
              <div><strong>主要管理員雙重驗證</strong><small>永久刪除前必須將目前工作階段提升到 AAL2。</small></div>
            </div>
            {securityLevel === "loading" ? <p>正在確認驗證狀態…</p> : null}
            {securityLevel === "aal2" ? <V93InlineNotice tone="success">雙重驗證已完成，可以繼續最終確認。</V93InlineNotice> : null}
            {securityLevel === "aal1" && !factorId ? (
              <div className="admin-delete-mfa-enroll">
                <p>目前帳號尚未設定驗證器。為避免遭竊的登入狀態自行建立第二因素，必須先重新輸入主要管理員密碼。</p>
                {!qrCode ? (
                  <div className="admin-delete-reauth">
                    <label htmlFor="admin-delete-current-password">目前管理員密碼</label>
                    <input
                      id="admin-delete-current-password"
                      type="password"
                      value={reauthPassword}
                      autoComplete="current-password"
                      disabled={securityBusy}
                      onChange={(event) => setReauthPassword(event.target.value)}
                    />
                    <GlassButton variant="secondary" busy={securityBusy} disabled={securityBusy || reauthPassword.length < 8} onClick={() => void beginEnrollment()}>
                      <Smartphone size={17} aria-hidden="true" />驗證密碼並建立驗證器
                    </GlassButton>
                  </div>
                ) : null}
              </div>
            ) : null}
            {qrCode ? (
              <div className="admin-delete-mfa-qr">
                <img src={qrCode} alt="雙重驗證 QR Code" />
                <div><span>無法掃描時手動輸入</span><code>{secret}</code></div>
              </div>
            ) : null}
            {securityLevel === "aal1" && factorId ? (
              <div className="admin-delete-mfa-code">
                <label htmlFor="admin-delete-mfa-code">驗證器 6 位數代碼</label>
                <div>
                  <input
                    id="admin-delete-mfa-code"
                    value={mfaCode}
                    inputMode="numeric"
                    autoComplete="one-time-code"
                    maxLength={6}
                    placeholder="000000"
                    onChange={(event) => setMfaCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                  />
                  <GlassButton variant="primary" busy={securityBusy} disabled={securityBusy || !/^\d{6}$/.test(mfaCode)} onClick={() => void verifyMfa()}>
                    <KeyRound size={17} aria-hidden="true" />驗證身分
                  </GlassButton>
                </div>
              </div>
            ) : null}
            {securityError ? <V93InlineNotice tone="error">{securityError}</V93InlineNotice> : null}
          </section>

          <div className="admin-delete-member-fields">
            <label>
              <span>刪除原因（全文不會保存）</span>
              <textarea value={reason} maxLength={500} placeholder="例如：會員本人要求刪除帳號" disabled={busy} onChange={(event) => setReason(event.target.value)} />
            </label>
            <label>
              <span>輸入會員完整 Email</span>
              <input value={confirmationEmail} autoComplete="off" placeholder={email} disabled={busy} onChange={(event) => setConfirmationEmail(event.target.value)} />
            </label>
            <label>
              <span>輸入「永久刪除」</span>
              <input value={confirmationPhrase} autoComplete="off" placeholder="永久刪除" disabled={busy} onChange={(event) => setConfirmationPhrase(event.target.value)} />
            </label>
            <label className="admin-delete-understood">
              <input type="checkbox" checked={understood} disabled={busy} onChange={(event) => setUnderstood(event.target.checked)} />
              <span>我了解此會員的雲端帳號與資料將無法復原；離線裝置上既有的本機快取無法遠端抹除。</span>
            </label>
          </div>

          {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
        </div>

        <footer>
          <GlassButton variant="secondary" disabled={busy} onClick={cancelDialog}>取消</GlassButton>
          <GlassButton
            variant="danger"
            busy={busy}
            disabled={!canDelete}
            onClick={() => onConfirm({
              confirmationEmail: confirmationEmail.trim(),
              confirmationPhrase: confirmationPhrase.trim(),
              reason: reason.trim(),
              operationId,
            })}
          >
            <Trash2 size={17} aria-hidden="true" />永久刪除會員
          </GlassButton>
        </footer>
      </section>
    </div>,
    portalTarget,
  );
}

function UserDeleteIcon() {
  return <AlertTriangle size={23} aria-hidden="true" />;
}

export type { DeleteMemberImpact, DeleteMemberRequest };
