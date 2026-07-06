import { Cloud, Clock, KeyRound, LogOut, Shield, ShieldCheck } from "lucide-react";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { getSyncedRecordSummary, syncLocalRecordsToCloud, type CloudSyncSummary } from "../lib/db";

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
  const { access, loading, signOut, user } = useAuth();
  const adminEmails = new Set(
    ["true.alpha0902@gmail.com", ...(import.meta.env.VITE_ADMIN_EMAILS ?? "").split(",")]
      .map((email) => email.trim().toLowerCase())
      .filter(Boolean),
  );
  const isAdminAccount = Boolean(user?.email && adminEmails.has(user.email.toLowerCase()));
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
    const summary = await getSyncedRecordSummary();
    setSyncSummary(summary);
  }, [user]);

  useEffect(() => {
    void loadSyncSummary().catch((loadError: unknown) => {
      setError(loadError instanceof Error ? loadError.message : "讀取同步資料失敗。 ");
    });
  }, [loadSyncSummary]);

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
      const summary = await syncLocalRecordsToCloud({ forceUpload: true });
      setSyncSummary(summary);
      setSyncMessage("學習紀錄已同步。你在其他裝置登入同一帳號後，會自動帶入錯題、收藏、作答與進度紀錄。 ");
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


        <section className="account-device-section" aria-labelledby="account-sync-title">
          <div className="account-section-header">
            <div>
              <p className="eyebrow">Cloud Sync</p>
              <h2 id="account-sync-title">學習紀錄同步</h2>
              <p>登入同一帳號時，錯題、收藏、作答紀錄、測驗進度與測驗結果會同步到其他裝置。</p>
            </div>
            <GlassButton variant="secondary" disabled={syncBusy} onClick={() => void handleSyncRecords()}>
              <Cloud aria-hidden="true" size={18} />
              <span>{syncBusy ? "同步中" : "立即同步"}</span>
            </GlassButton>
          </div>
          <div className="account-status-grid">
            <StatusItem icon={<Cloud aria-hidden="true" size={24} />} label="雲端狀態" value={syncSummary?.cloudAvailable ? "已啟用" : "尚未啟用"} />
            <StatusItem icon={<ShieldCheck aria-hidden="true" size={24} />} label="錯題 / 收藏" value={`${syncSummary?.cloud.wrong ?? 0} / ${syncSummary?.cloud.favorites ?? 0}`} />
            <StatusItem icon={<Clock aria-hidden="true" size={24} />} label="最後同步" value={formatDate(syncSummary?.syncedAt)} />
          </div>
          {syncSummary?.error ? <p className="form-error">{syncSummary.error}</p> : null}
        </section>

        <div className="button-row">
          {isAdminAccount ? (
            <GlassLinkButton to="/admin" variant="primary">
              <Shield aria-hidden="true" size={18} />
              <span>管理後台</span>
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
