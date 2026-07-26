import {
  BookOpenCheck,
  Cloud,
  Clock3,
  LogOut,
  RefreshCcw,
  Shield,
  UserRound,
} from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { useAuth, type ExamId } from "../auth/AuthContext";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { ProgressBar } from "../components/ProgressBar";
import { V93InlineNotice } from "../components/V93InteractionPrimitives";
import {
  getSyncedRecordSummary,
  syncLocalRecordsToCloud,
  type CloudSyncSummary,
} from "../lib/db";
import {
  EXAM_QUESTION_COUNTS,
  loadExamProgress,
  type ExamProgressSummary,
} from "../lib/examProgress";
import { FOREIGN_EXCHANGE_PROGRESS_CHANGED } from "../lib/foreignExchangeProgress";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import { USER_STORAGE_SCOPE_CHANGED } from "../lib/userScopedStorage";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const EXAM_META: Record<ExamId, { title: string; path: string; activatePath: string }> = {
  "senior-securities": {
    title: "證券高業",
    path: "/securities",
    activatePath: "/activate?exam=senior-securities",
  },
  "junior-foreign-exchange": {
    title: "初階外匯",
    path: "/foreign-exchange",
    activatePath: "/activate?exam=junior-foreign-exchange",
  },
};

function formatDate(value: string | null | undefined): string {
  if (!value) return "尚未同步";
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
  const { examAccess, loading, session, signOut, user } = useAuth();
  const [adminAccessState, setAdminAccessState] = useState<"checking" | "allowed" | "denied" | "unavailable">("checking");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncMessage, setSyncMessage] = useState<string | null>(null);
  const [syncMessageTone, setSyncMessageTone] = useState<"success" | "warning">("success");
  const [syncSummary, setSyncSummary] = useState<CloudSyncSummary | null>(null);
  const [progress, setProgress] = useState<Record<ExamId, ExamProgressSummary> | null>(null);

  const loadAccountData = useCallback(async () => {
    if (!user) {
      setSyncSummary(null);
      setProgress(null);
      return;
    }
    const [summary, progressSummary] = await Promise.all([
      getSyncedRecordSummary(),
      loadExamProgress(),
    ]);
    setSyncSummary(summary);
    setProgress(progressSummary);
  }, [user]);

  useEffect(() => {
    void loadAccountData().catch((reason: unknown) => {
      const message = reason instanceof Error ? reason.message : "讀取會員資料失敗。";
      setError(message);
      announceInteractionFeedback(message, "error", 4200);
    });
  }, [loadAccountData]);

  useEffect(() => {
    const refresh = () => void loadAccountData().catch(() => undefined);
    window.addEventListener("records:changed", refresh);
    window.addEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener("records:changed", refresh);
      window.removeEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, [loadAccountData]);

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
      if (response.ok) setAdminAccessState("allowed");
      else if (response.status === 401 || response.status === 403) setAdminAccessState("denied");
      else setAdminAccessState("unavailable");
    }).catch((reason: unknown) => {
      if (reason instanceof DOMException && reason.name === "AbortError") return;
      setAdminAccessState("unavailable");
    });
    return () => controller.abort();
  }, [session?.access_token, user]);

  if (loading) return <LoadingState label="載入帳號" />;

  async function handleSignOut(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      await signOut();
      announceInteractionFeedback("已安全登出。", "success");
      navigate("/", { replace: true });
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "登出失敗。";
      setError(message);
      announceInteractionFeedback(message, "error", 4200);
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
      setProgress(await loadExamProgress());
      const message = summary.pendingMutations > 0 ? `同步完成，仍有 ${summary.pendingMutations} 筆待重試。` : "學習紀錄已完成同步。";
      setSyncMessage(message);
      setSyncMessageTone(summary.pendingMutations > 0 ? "warning" : "success");
      announceInteractionFeedback(message, summary.pendingMutations > 0 ? "warning" : "success", 3600);
    } catch (reason: unknown) {
      const message = reason instanceof Error ? reason.message : "同步學習紀錄失敗。";
      setError(message);
      announceInteractionFeedback(message, "error", 4600);
    } finally {
      setSyncBusy(false);
    }
  }

  const localRecordCount = syncSummary
    ? Object.values(syncSummary.local).reduce((sum, value) => sum + value, 0)
    : 0;

  return (
    <div className="page-stack product-account-page product-account-page-v84">
      <header className="product-account-heading">
        <div><p>會員中心</p><h1>我的帳號</h1><span>{user?.email}</span></div>
        <div className="product-account-avatar" aria-hidden="true"><UserRound size={28} /></div>
      </header>

      {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
      {syncMessage ? <V93InlineNotice tone={syncMessageTone}>{syncMessage}</V93InlineNotice> : null}

      <section aria-labelledby="account-banks-title">
        <div className="product-section-heading"><div><h2 id="account-banks-title">我的題庫</h2><p>查看各題庫的實際學習進度。</p></div></div>
        <div className="product-account-exam-grid">
          {(Object.keys(EXAM_META) as ExamId[]).map((examId) => {
            const meta = EXAM_META[examId];
            const access = examAccess[examId];
            const examProgress = progress?.[examId];
            const questionCount = EXAM_QUESTION_COUNTS[examId];
            return (
              <GlassCard key={examId} className="product-account-exam-card product-account-exam-card-v84">
                <div className="product-account-exam-head">
                  <BookOpenCheck aria-hidden="true" size={23} />
                  <div>
                    <h3>{meta.title}</h3>
                    <span className={`account-access-state${access.hasEntitlement ? " has-access" : ""}`}>
                      <i aria-hidden="true" />{access.hasEntitlement ? "已開通" : "尚未開通"}
                    </span>
                  </div>
                </div>
                <div className="account-exam-progress">
                  <div><span>學習進度</span><strong>{examProgress?.progressPercent ?? 0}%</strong></div>
                  <ProgressBar
                    value={examProgress?.answered ?? 0}
                    max={questionCount}
                    label={`已作答 ${(examProgress?.answered ?? 0).toLocaleString()} / ${questionCount.toLocaleString()} 題`}
                  />
                  <div className="account-exam-metrics">
                    <span>正確率 <strong>{examProgress?.accuracy ?? 0}%</strong></span>
                    <span>錯題 <strong>{examProgress?.wrong ?? 0}</strong></span>
                    <span>收藏 <strong>{examProgress?.favorites ?? 0}</strong></span>
                  </div>
                </div>
                {access.error ? <V93InlineNotice tone="error">{access.error}</V93InlineNotice> : null}
                <div className="button-row">
                  <GlassLinkButton to={access.hasEntitlement ? meta.path : meta.activatePath} variant="primary">
                    {access.hasEntitlement ? "進入題庫" : "啟用題庫"}
                  </GlassLinkButton>
                </div>
              </GlassCard>
            );
          })}
        </div>
      </section>

      <GlassCard className="product-account-section" as="section" aria-labelledby="account-sync-title">
        <div className="product-account-section-head">
          <div><h2 id="account-sync-title">學習資料</h2><p>兩套題庫的作答、錯題與收藏會依帳號隔離。</p></div>
          <GlassButton variant="secondary" busy={syncBusy} disabled={syncBusy} onClick={() => void handleSyncRecords()}>
            <RefreshCcw aria-hidden="true" size={17} />{syncBusy ? "同步中" : "立即同步"}
          </GlassButton>
        </div>
        <div className="product-account-sync-grid" role="list" aria-label="同步狀態">
          <div role="listitem"><Cloud aria-hidden="true" size={20} /><span>雲端狀態</span><strong>{syncSummary?.cloudAvailable ? "已啟用" : "尚未啟用"}</strong></div>
          <div role="listitem"><Clock3 aria-hidden="true" size={20} /><span>最後同步</span><strong>{formatDate(syncSummary?.syncedAt)}</strong></div>
          <div role="listitem"><BookOpenCheck aria-hidden="true" size={20} /><span>本機紀錄</span><strong>{localRecordCount.toLocaleString("zh-TW")}筆</strong></div>
          <div role="listitem"><RefreshCcw aria-hidden="true" size={20} /><span>待同步</span><strong>{syncSummary?.pendingMutations ?? 0}筆</strong></div>
        </div>
        {syncSummary?.error ? <V93InlineNotice tone="warning">{syncSummary.error}</V93InlineNotice> : null}
      </GlassCard>

      <GlassCard className="product-account-section" as="section" aria-labelledby="account-security-title">
        <div className="product-account-section-head"><div><h2 id="account-security-title">帳號與安全</h2><p>管理權限由伺服器角色確認。</p></div></div>
        <div className="product-account-security-row">
          <div><span>登入Email</span><strong>{user?.email}</strong></div>
          <div className="button-row">
            {adminAccessState === "allowed" ? (
              <GlassLinkButton to="/admin" variant="secondary"><Shield aria-hidden="true" size={17} />管理後台</GlassLinkButton>
            ) : null}
            {adminAccessState === "checking" ? <span className="form-hint">確認管理權限中…</span> : null}
            {adminAccessState === "unavailable" ? <span className="form-hint">暫時無法確認管理權限</span> : null}
            <GlassButton variant="danger" busy={busy} disabled={busy || syncBusy} onClick={() => void handleSignOut()}>
              <LogOut aria-hidden="true" size={17} />{busy ? "登出中" : "登出"}
            </GlassButton>
          </div>
        </div>
      </GlassCard>
    </div>
  );
}
