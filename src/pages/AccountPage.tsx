import { Cloud, Clock, KeyRound, LockKeyhole, LogOut, QrCode, Shield, ShieldCheck, Smartphone, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import {
  getSyncedRecordSummary,
  syncLocalRecordsToCloud,
  type CloudSyncSummary,
} from "../lib/db";
import { supabase } from "../lib/supabase";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

export function AccountPage() {
  return (
    <ProtectedRoute requireActivation={false}>
      <AccountContent />
    </ProtectedRoute>
  );
}

function AccountContent() {
  const navigate = useNavigate();
  const { access, loading, session, signOut, user } = useAuth();
  const configuredClientAdminEmails = new Set(
    (import.meta.env.VITE_ADMIN_EMAILS ?? "").split(",")
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const clientAdminFallback = Boolean(user?.email && configuredClientAdminEmails.has(user.email.toLowerCase()));
  const [adminAccessState, setAdminAccessState] = useState<"checking" | "allowed" | "denied" | "unavailable">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncSummary, setSyncSummary] = useState<CloudSyncSummary | null>(null);

  const loadSyncSummary = useCallback(async () => {
    if (!user) {
      setSyncSummary(null);
      return;
    }
    setSyncSummary(await getSyncedRecordSummary());
  }, [user]);

  useEffect(() => {
    void loadSyncSummary().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "讀取同步資料失敗。 ");
    });
  }, [loadSyncSummary]);

  useEffect(() => {
    const token = session?.access_token || "";
    if (!user || !token) {
      setAdminAccessState("denied");
      return;
    }

    const controller = new AbortController();
    setAdminAccessState("checking");
    void fetch("/api/admin/tools?tool=access", {
      cache: "no-store",
      signal: controller.signal,
      headers: { Authorization: `Bearer ${token}` },
    }).then((response) => {
      if (response.ok) {
        setAdminAccessState("allowed");
        return;
      }
      if (response.status === 401 || response.status === 403) {
        setAdminAccessState(clientAdminFallback ? "allowed" : "denied");
        return;
      }
      setAdminAccessState(clientAdminFallback ? "allowed" : "unavailable");
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setAdminAccessState(clientAdminFallback ? "allowed" : "unavailable");
    });

    return () => controller.abort();
  }, [clientAdminFallback, session?.access_token, user]);

  if (loading) return <LoadingState label="載入帳號" />;

  async function handleSignOut(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      navigate("/", { replace: true });
    } catch (signOutError: unknown) {
      setError(signOutError instanceof Error ? signOutError.message : "登出失敗。 ");
    } finally {
      setBusy(false);
    }
  }

  async function handleSyncRecords(): Promise<void> {
    setSyncBusy(true);
    setError(null);
    setSyncMessage(null);
    try {
      const summary = await syncLocalRecordsToCloud();
      setSyncSummary(summary);
      setSyncMessage("學習紀錄已完成同步。");
    } catch (syncError: unknown) {
      setError(syncError instanceof Error ? syncError.message : "同步學習紀錄失敗。請確認已執行 Supabase SQL。 ");
    } finally {
      setSyncBusy(false);
    }
  }

  return (
    <div className="page-stack account-page">
      <GlassCard className="auth-card account-card-polished">
        <p className="eyebrow">My Account</p>
        <h1>我的帳號</h1>
        <p>{user?.email}</p>

        <div className="account-status-grid">
          <StatusItem
            icon={<ShieldCheck aria-hidden="true" size={24} />}
            label="完整題庫"
            value={access.hasEntitlement ? "已開通 / 永久" : "尚未開通"}
          />
          <StatusItem
            icon={<KeyRound aria-hidden="true" size={24} />}
            label="方案"
            value={access.plan ?? "未開通"}
          />
        </div>

        {access.error ? <p className="form-error">{access.error}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}
        {syncMessage ? <p className="form-success">{syncMessage}</p> : null}


        <MfaSecuritySection />

        <section className="account-device-section account-sync-compact" aria-labelledby="account-sync-title">
          <div className="account-section-header">
            <div>
              <p className="eyebrow">Cloud Sync</p>
              <h2 id="account-sync-title">學習紀錄同步</h2>
            </div>
            <GlassButton variant="secondary" disabled={syncBusy} onClick={() => void handleSyncRecords()}>
              <Cloud aria-hidden="true" size={18} />
              <span>{syncBusy ? "同步中" : "立即同步"}</span>
            </GlassButton>
          </div>
          <div className="account-sync-inline" role="list" aria-label="同步狀態">
            <div role="listitem"><Cloud aria-hidden="true" size={21} /><span>雲端狀態</span><strong>{syncSummary?.cloudAvailable ? "已啟用" : "尚未啟用"}</strong></div>
            <div role="listitem"><Clock aria-hidden="true" size={21} /><span>最後同步</span><strong>{formatDate(syncSummary?.syncedAt)}</strong></div>
          </div>
          {syncSummary?.error ? <p className="form-error">{syncSummary.error}</p> : null}
        </section>

        <div className="button-row">
          {adminAccessState !== "denied" ? (
            <GlassLinkButton to="/admin" variant="primary">
              <Shield aria-hidden="true" size={18} />
              <span>{adminAccessState === "checking" ? "檢查管理權限…" : "管理後台"}</span>
            </GlassLinkButton>
          ) : null}
          {!access.hasEntitlement ? <GlassLinkButton to="/activate" variant="primary">輸入啟用碼</GlassLinkButton> : null}
          <GlassButton variant="danger" disabled={busy} onClick={() => void handleSignOut()}>
            <LogOut aria-hidden="true" size={18} />
            <span>登出</span>
          </GlassButton>
        </div>
      </GlassCard>
    </div>
  );
}


type MfaFactorRow = {
  id: string;
  friendlyName: string;
  status: string;
  createdAt: string | null;
};

function MfaSecuritySection() {
  const [factors, setFactors] = useState<MfaFactorRow[]>([]);
  const [aal, setAal] = useState<"aal1" | "aal2" | null>(null);
  const [pendingFactorId, setPendingFactorId] = useState<string | null>(null);
  const [qrCode, setQrCode] = useState("");
  const [secret, setSecret] = useState("");
  const [verificationCode, setVerificationCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [mfaError, setMfaError] = useState<string | null>(null);

  const loadMfa = useCallback(async () => {
    if (!supabase) return;
    const [factorResult, aalResult] = await Promise.all([
      supabase.auth.mfa.listFactors(),
      supabase.auth.mfa.getAuthenticatorAssuranceLevel(),
    ]);
    if (factorResult.error) throw factorResult.error;
    if (aalResult.error) throw aalResult.error;
    setFactors(factorResult.data.totp.map((factor) => ({
      id: factor.id,
      friendlyName: factor.friendly_name || "驗證器",
      status: factor.status,
      createdAt: factor.created_at || null,
    })));
    const currentLevel = aalResult.data.currentLevel;
    setAal(currentLevel === "aal2" ? "aal2" : currentLevel === "aal1" ? "aal1" : null);
  }, []);

  useEffect(() => {
    void loadMfa().catch((loadError: unknown) => {
      setMfaError(loadError instanceof Error ? loadError.message : "讀取 MFA 狀態失敗。");
    });
  }, [loadMfa]);

  async function startEnrollment(): Promise<void> {
    if (!supabase) return;
    setBusy(true);
    setMfaError(null);
    setMessage(null);
    try {
      if (pendingFactorId) {
        await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
      }
      const { data, error } = await supabase.auth.mfa.enroll({
        factorType: "totp",
        friendlyName: `SeniorSecurities ${new Date().toLocaleDateString("zh-TW")}`,
      });
      if (error) throw error;
      setPendingFactorId(data.id);
      setQrCode(data.totp.qr_code);
      setSecret(data.totp.secret);
      setVerificationCode("");
      setMessage("請用驗證器 App 掃描 QR Code，再輸入 6 位數驗證碼。");
    } catch (enrollError: unknown) {
      setMfaError(enrollError instanceof Error ? enrollError.message : "無法開始 MFA 設定。");
    } finally {
      setBusy(false);
    }
  }

  async function verifyFactor(factorId: string): Promise<void> {
    if (!supabase) return;
    const code = verificationCode.replace(/\D/g, "").slice(0, 6);
    if (code.length !== 6) {
      setMfaError("請輸入驗證器顯示的 6 位數驗證碼。");
      return;
    }
    setBusy(true);
    setMfaError(null);
    setMessage(null);
    try {
      const { error } = await supabase.auth.mfa.challengeAndVerify({ factorId, code });
      if (error) throw error;
      setPendingFactorId(null);
      setQrCode("");
      setSecret("");
      setVerificationCode("");
      setMessage("MFA 驗證成功，目前工作階段已提升為 AAL2。");
      await loadMfa();
    } catch (verifyError: unknown) {
      setMfaError(verifyError instanceof Error ? verifyError.message : "MFA 驗證失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function cancelEnrollment(): Promise<void> {
    if (!supabase || !pendingFactorId) return;
    setBusy(true);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId: pendingFactorId });
      if (error) throw error;
      setPendingFactorId(null);
      setQrCode("");
      setSecret("");
      setVerificationCode("");
      setMessage("已取消本次 MFA 設定。");
      await loadMfa();
    } catch (cancelError: unknown) {
      setMfaError(cancelError instanceof Error ? cancelError.message : "取消 MFA 設定失敗。");
    } finally {
      setBusy(false);
    }
  }

  async function removeFactor(factorId: string): Promise<void> {
    if (!supabase) return;
    if (aal !== "aal2") {
      setMfaError("移除已驗證的 MFA 前，請先輸入驗證碼將目前工作階段提升為 AAL2。");
      return;
    }
    if (!window.confirm("確定要移除這個驗證器嗎？移除後管理員操作可能暫時無法使用。")) return;
    setBusy(true);
    setMfaError(null);
    try {
      const { error } = await supabase.auth.mfa.unenroll({ factorId });
      if (error) throw error;
      setMessage("驗證器已移除。");
      await loadMfa();
    } catch (removeError: unknown) {
      setMfaError(removeError instanceof Error ? removeError.message : "移除驗證器失敗。");
    } finally {
      setBusy(false);
    }
  }

  const verifiedFactor = factors.find((factor) => factor.status === "verified") ?? null;

  return (
    <section className="account-device-section account-mfa-section" aria-labelledby="account-mfa-title">
      <div className="account-section-header">
        <div>
          <p className="eyebrow">Account Security</p>
          <h2 id="account-mfa-title">多因素驗證（MFA）</h2>
          <p>使用驗證器的一次性密碼保護管理員與帳號敏感操作。</p>
        </div>
        <span className={`account-mfa-badge${aal === "aal2" ? " is-verified" : ""}`}>
          <LockKeyhole aria-hidden="true" size={17} />
          {aal === "aal2" ? "AAL2 已驗證" : verifiedFactor ? "等待本次驗證" : "尚未設定"}
        </span>
      </div>

      {mfaError ? <p className="form-error">{mfaError}</p> : null}
      {message ? <p className="form-success">{message}</p> : null}

      {pendingFactorId ? (
        <div className="account-mfa-enrollment">
          <div className="account-mfa-qr">
            {qrCode ? <img src={qrCode} alt="MFA 驗證器 QR Code" /> : <QrCode aria-hidden="true" size={88} />}
          </div>
          <div className="account-mfa-steps">
            <strong>完成驗證器綁定</strong>
            <ol>
              <li>使用 Google Authenticator、Microsoft Authenticator 或其他 TOTP App 掃描 QR Code。</li>
              <li>輸入 App 顯示的 6 位數驗證碼。</li>
              <li>驗證成功後，目前登入狀態會升級為 AAL2。</li>
            </ol>
            {secret ? <label className="account-mfa-secret">無法掃描時手動輸入密鑰<input readOnly value={secret} onFocus={(event) => event.currentTarget.select()} /></label> : null}
            <div className="account-mfa-code-row">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="6 位數驗證碼"
                aria-label="MFA 6 位數驗證碼"
              />
              <GlassButton variant="primary" disabled={busy} onClick={() => void verifyFactor(pendingFactorId)}>
                <ShieldCheck aria-hidden="true" size={18} />完成啟用
              </GlassButton>
              <GlassButton variant="secondary" disabled={busy} onClick={() => void cancelEnrollment()}>取消</GlassButton>
            </div>
          </div>
        </div>
      ) : verifiedFactor ? (
        <div className="account-mfa-factor">
          <div><Smartphone aria-hidden="true" size={24} /><div><strong>{verifiedFactor.friendlyName}</strong><span>已綁定 · {formatDate(verifiedFactor.createdAt)}</span></div></div>
          {aal !== "aal2" ? (
            <div className="account-mfa-code-row">
              <input
                inputMode="numeric"
                autoComplete="one-time-code"
                value={verificationCode}
                onChange={(event) => setVerificationCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
                placeholder="輸入驗證碼以升級 AAL2"
                aria-label="MFA 6 位數驗證碼"
              />
              <GlassButton variant="primary" disabled={busy} onClick={() => void verifyFactor(verifiedFactor.id)}>驗證</GlassButton>
            </div>
          ) : (
            <GlassButton variant="danger" disabled={busy} onClick={() => void removeFactor(verifiedFactor.id)}>
              <Trash2 aria-hidden="true" size={17} />移除驗證器
            </GlassButton>
          )}
        </div>
      ) : (
        <div className="account-mfa-empty">
          <div><QrCode aria-hidden="true" size={28} /><span>目前帳號尚未綁定驗證器。</span></div>
          <GlassButton variant="primary" disabled={busy || !supabase} onClick={() => void startEnrollment()}>
            <ShieldCheck aria-hidden="true" size={18} />設定驗證器
          </GlassButton>
        </div>
      )}
    </section>
  );
}

function StatusItem({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="account-status-item">
      {icon}
      <div>
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
    </div>
  );
}
