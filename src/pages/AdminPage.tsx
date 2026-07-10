import { MailCheck, RefreshCcw, ShieldCheck, ShieldOff, Trash2, Trophy, X } from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import { AdminToolsPanel } from "../components/AdminToolsPanel";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { formatTotalPracticeTime } from "../lib/practiceTime";
import "../styles/admin-leaderboard-v42.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

type AdminUserRow = {
  id: string;
  email: string;
  createdAt: string | null;
  lastSignInAt: string | null;
  entitlementStatus: "active" | "revoked" | "none" | string;
  plan: string | null;
  grantedAt: string | null;
  expiresAt: string | null;
  activationCode: string | null;
  lastEventAt: string | null;
  lastIp: string | null;
  loginEventCount: number;
  practicedQuestionCount?: number;
  totalPracticeSeconds?: number;
  isOnline?: boolean;
  lastSeenAt?: string | null;
};

type LeaderboardAdminEntry = {
  rank: number;
  userId: string;
  email: string;
  displayName: string;
  bestCorrectStreak: number;
  currentCorrectStreak: number;
  totalAnswered: number;
  totalCorrect: number;
  totalPracticeSeconds?: number;
  updatedAt: string | null;
};

type UsersResponse = {
  users?: AdminUserRow[];
  error?: string;
};

type LeaderboardResponse = {
  entries?: LeaderboardAdminEntry[];
  error?: string;
};

type ActionResponse = {
  ok?: boolean;
  message?: string;
  error?: string;
};

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function statusLabel(status: string): string {
  if (status === "active") return "已開通";
  if (status === "revoked") return "已取消";
  return "未開通";
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();

  if (!contentType.includes("application/json")) {
    const isLocalViteFallback = text.includes("/@vite/client") || text.includes("import") || text.includes("<!doctype html");
    if (isLocalViteFallback) {
      throw new Error("管理後台需要 Vercel API。請用 npm run dev:admin 測試，或部署到 Vercel 後再開 /admin。");
    }
    throw new Error(text.trim().slice(0, 240) || "伺服器沒有回傳 JSON，請檢查 API 設定。");
  }

  try {
    return JSON.parse(text) as T;
  } catch {
    throw new Error("伺服器回傳格式異常，請重新整理後再試。");
  }
}

export function AdminPage() {
  return (
    <ProtectedRoute requireActivation={false}>
      <AdminContent />
    </ProtectedRoute>
  );
}

function AdminContent() {
  const { session, user } = useAuth();
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardAdminEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [busyUserId, setBusyUserId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [leaderboardQuery, setLeaderboardQuery] = useState("");
  const [leaderboardMode, setLeaderboardMode] = useState<"streak" | "practice">("streak");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    if (!normalizedQuery) return users;
    return users.filter((row) =>
      [row.email, row.lastIp, row.entitlementStatus, row.activationCode]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [query, users]);

  const filteredLeaderboardEntries = useMemo(() => {
    const sortedEntries = [...leaderboardEntries].sort((a, b) => {
      if (leaderboardMode === "practice") {
        return (
          (b.totalPracticeSeconds ?? 0) - (a.totalPracticeSeconds ?? 0) ||
          b.totalAnswered - a.totalAnswered ||
          b.bestCorrectStreak - a.bestCorrectStreak
        );
      }
      return (
        b.bestCorrectStreak - a.bestCorrectStreak ||
        b.totalCorrect - a.totalCorrect ||
        (b.totalPracticeSeconds ?? 0) - (a.totalPracticeSeconds ?? 0)
      );
    });

    const normalizedQuery = leaderboardQuery.trim().toLowerCase();
    if (!normalizedQuery) return sortedEntries;
    return sortedEntries.filter((entry) =>
      [entry.displayName, entry.email]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(normalizedQuery)),
    );
  }, [leaderboardEntries, leaderboardMode, leaderboardQuery]);

  const loadUsers = useCallback(async () => {
    if (!session?.access_token) return;
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/admin/users", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await readJsonResponse<UsersResponse>(response);
      if (!response.ok) throw new Error(payload.error || "讀取使用者失敗。");
      setUsers(payload.users || []);
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "讀取使用者失敗。");
    } finally {
      setLoading(false);
    }
  }, [session?.access_token]);

  const loadLeaderboard = useCallback(async () => {
    if (!session?.access_token) return;
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const response = await fetch("/api/admin/leaderboard", {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });
      const payload = await readJsonResponse<LeaderboardResponse>(response);
      if (!response.ok) throw new Error(payload.error || "讀取排行榜失敗。");
      setLeaderboardEntries(payload.entries || []);
    } catch (loadError: unknown) {
      setLeaderboardError(loadError instanceof Error ? loadError.message : "讀取排行榜失敗。");
    } finally {
      setLeaderboardLoading(false);
    }
  }, [session?.access_token]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  async function runAction(
    action: "revoke" | "restore" | "send-password-reset",
    target: AdminUserRow,
  ): Promise<void> {
    if (!session?.access_token) return;

    const actionText = action === "revoke" ? "取消權限" : action === "restore" ? "恢復權限" : "寄送重設密碼信";
    if (!window.confirm(`確定要對 ${target.email} 執行「${actionText}」？`)) return;

    setBusyUserId(target.id);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action, userId: target.id, email: target.email }),
      });
      const payload = await readJsonResponse<ActionResponse>(response);
      if (!response.ok) throw new Error(payload.error || "操作失敗。");
      setMessage(payload.message || "操作完成。");
      await loadUsers();
    } catch (actionError: unknown) {
      setError(actionError instanceof Error ? actionError.message : "操作失敗。");
    } finally {
      setBusyUserId(null);
    }
  }

  async function deleteLeaderboardEntry(entry: LeaderboardAdminEntry): Promise<void> {
    if (!session?.access_token) return;
    if (!window.confirm(`確定要刪除「${entry.displayName}」的排行榜紀錄？\n對應 Email：${entry.email}\n\n這只會清除排行榜資料，不會刪除帳號或作答紀錄。`)) return;

    setBusyUserId(entry.userId);
    setMessage(null);
    setLeaderboardError(null);
    try {
      const response = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
        body: JSON.stringify({ action: "delete-leaderboard", userId: entry.userId, email: entry.email }),
      });
      const payload = await readJsonResponse<ActionResponse>(response);
      if (!response.ok) throw new Error(payload.error || "刪除排行榜紀錄失敗。");
      setMessage(payload.message || "已刪除排行榜紀錄。");
      await Promise.all([loadUsers(), loadLeaderboard()]);
    } catch (actionError: unknown) {
      setLeaderboardError(actionError instanceof Error ? actionError.message : "刪除排行榜紀錄失敗。");
    } finally {
      setBusyUserId(null);
    }
  }

  function openLeaderboardManager(): void {
    setLeaderboardOpen(true);
    void loadLeaderboard();
  }

  if (loading && users.length === 0) return <LoadingState label="載入管理頁" />;

  return (
    <div className="page-stack admin-page">
      {session?.access_token ? <AdminToolsPanel accessToken={session.access_token} /> : null}
      <GlassCard className="admin-card">
        <div className="admin-header">
          <div>
            <p className="eyebrow">Admin</p>
            <h1>管理後台</h1>
            <p>目前管理員：{user?.email}</p>
          </div>
          <div className="admin-header-actions">
            <GlassButton variant="secondary" disabled={leaderboardLoading} onClick={openLeaderboardManager}>
              <Trophy aria-hidden="true" size={18} />
              <span>排行榜管理</span>
            </GlassButton>
            <GlassButton variant="secondary" disabled={loading} onClick={() => void loadUsers()}>
              <RefreshCcw aria-hidden="true" size={18} />
              <span>重新整理</span>
            </GlassButton>
          </div>
        </div>

        <div className="admin-toolbar">
          <input
            className="glass-input admin-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="搜尋 Email、IP、啟用碼或狀態"
          />
          <div className="admin-summary">
            <span>總帳號：{users.length}</span>
            <span>顯示：{filteredUsers.length}</span>
          </div>
        </div>

        {message ? <p className="form-success">{message}</p> : null}
        {error ? <p className="form-error">{error}</p> : null}

        <div className="admin-user-list">
          {filteredUsers.length === 0 ? (
            <div className="admin-empty-cell">
              {error ? "目前沒有可顯示資料。請先修正上方錯誤後重新整理。" : "目前沒有使用者資料。"}
            </div>
          ) : (
            filteredUsers.map((row) => (
              <article className="admin-user-card" key={row.id}>
                <div className="admin-user-card-main">
                  <section className="admin-user-identity">
                    <strong className="admin-user-email">{row.email || "—"}</strong>
                    <span className={`admin-status admin-status-${row.entitlementStatus}`}>{statusLabel(row.entitlementStatus)}</span>
                    {row.entitlementStatus === "active" && row.activationCode ? (
                      <span className="admin-activation-code">啟用碼：{row.activationCode}</span>
                    ) : null}
                    <span className={`admin-online-pill ${row.isOnline ? "is-online" : "is-offline"}`}>
                      <span className="admin-online-dot" aria-hidden="true" />
                      {row.isOnline ? "Online" : "Offline"}
                    </span>
                  </section>

                  <section className="admin-info-grid admin-info-grid-clean" aria-label={`${row.email} 的帳號資訊`}>
                    <div className="admin-info-item admin-info-item-practice admin-info-item-center">
                      <span className="admin-info-label">已練習</span>
                      <strong className="admin-practice-count">{row.practicedQuestionCount ?? 0}</strong>
                      <span className="admin-muted">題</span>
                    </div>
                    <div className="admin-info-item admin-info-item-practice admin-info-item-center">
                      <span className="admin-info-label">累積時間</span>
                      <strong>{formatTotalPracticeTime(row.totalPracticeSeconds ?? 0)}</strong>
                    </div>
                    <div className="admin-info-item admin-info-item-login">
                      <span className="admin-info-label">最後登入</span>
                      <strong>{formatDate(row.lastEventAt || row.lastSignInAt)}</strong>
                      <span className="admin-muted">IP：{row.lastIp || "尚未記錄"}</span>
                    </div>
                    <div className="admin-info-item admin-info-item-created">
                      <span className="admin-info-label">建立時間</span>
                      <span>{formatDate(row.createdAt)}</span>
                    </div>
                  </section>
                </div>

                <aside className="admin-card-actions">
                  {row.entitlementStatus === "active" ? (
                    <GlassButton
                      variant="danger"
                      disabled={busyUserId === row.id}
                      onClick={() => void runAction("revoke", row)}
                    >
                      <ShieldOff aria-hidden="true" size={16} />
                      <span>取消權限</span>
                    </GlassButton>
                  ) : (
                    <GlassButton
                      variant="primary"
                      disabled={busyUserId === row.id}
                      onClick={() => void runAction("restore", row)}
                    >
                      <ShieldCheck aria-hidden="true" size={16} />
                      <span>恢復權限</span>
                    </GlassButton>
                  )}
                  <GlassButton
                    variant="secondary"
                    disabled={busyUserId === row.id || !row.email}
                    onClick={() => void runAction("send-password-reset", row)}
                  >
                    <MailCheck aria-hidden="true" size={16} />
                    <span>重設密碼信</span>
                  </GlassButton>
                </aside>
              </article>
            ))
          )}
        </div>
      </GlassCard>

      {leaderboardOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setLeaderboardOpen(false);
        }}>
          <GlassCard className="admin-leaderboard-modal" role="dialog" aria-modal="true" aria-label="排行榜管理">
            <div className="admin-modal-header">
              <div>
                <p className="eyebrow">Leaderboard</p>
                <h2>排行榜管理</h2>
                <p>查看排行榜名稱對應的 Email，可切換連續答對與累積時數排行，並刪除指定紀錄。</p>
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setLeaderboardOpen(false)} aria-label="關閉排行榜管理">
                <X size={22} aria-hidden="true" />
              </button>
            </div>

            <div className="admin-leaderboard-toolbar">
              <input
                className="glass-input admin-search-input"
                value={leaderboardQuery}
                onChange={(event) => setLeaderboardQuery(event.target.value)}
                placeholder="搜尋排行榜名稱或 Email"
              />
              <GlassButton variant="secondary" disabled={leaderboardLoading} onClick={() => void loadLeaderboard()}>
                <RefreshCcw aria-hidden="true" size={18} />
                <span>重新整理</span>
              </GlassButton>
            </div>

            <div className="admin-leaderboard-tabs" role="tablist" aria-label="排行榜類型">
              <button
                type="button"
                className={leaderboardMode === "streak" ? "is-active" : ""}
                onClick={() => setLeaderboardMode("streak")}
              >
                連續答對排行
              </button>
              <button
                type="button"
                className={leaderboardMode === "practice" ? "is-active" : ""}
                onClick={() => setLeaderboardMode("practice")}
              >
                累積時數排行
              </button>
            </div>

            {leaderboardError ? <p className="form-error">{leaderboardError}</p> : null}

            <div className="admin-leaderboard-list">
              {leaderboardLoading && leaderboardEntries.length === 0 ? (
                <LoadingState label="載入排行榜" />
              ) : filteredLeaderboardEntries.length === 0 ? (
                <div className="admin-empty-cell">目前沒有排行榜資料。</div>
              ) : (
                filteredLeaderboardEntries.map((entry, index) => (
                  <article className="admin-leaderboard-row" key={entry.userId}>
                    <div className="admin-leaderboard-rank">#{index + 1}</div>
                    <div className="admin-leaderboard-player">
                      <strong>{entry.displayName}</strong>
                      <span>{entry.email}</span>
                    </div>
                    <div className="admin-leaderboard-stats">
                      {leaderboardMode === "practice" ? (
                        <>
                          <div className="admin-leaderboard-time-stat admin-leaderboard-time-main">
                            <span>累積時數</span>
                            <strong>{formatTotalPracticeTime(entry.totalPracticeSeconds ?? 0)}</strong>
                          </div>
                        </>
                      ) : (
                        <>
                          <div><span>最高連對</span><strong>{entry.bestCorrectStreak}</strong></div>
                          <div><span>目前連對</span><strong>{entry.currentCorrectStreak}</strong></div>
                          <div><span>總答對</span><strong>{entry.totalCorrect}</strong></div>
                          <div><span>總作答</span><strong>{entry.totalAnswered}</strong></div>
                        </>
                      )}
                    </div>
                    <div className="admin-leaderboard-updated">
                      <span>更新時間</span>
                      <strong>{formatDate(entry.updatedAt)}</strong>
                    </div>
                    <GlassButton
                      variant="danger"
                      disabled={busyUserId === entry.userId}
                      onClick={() => void deleteLeaderboardEntry(entry)}
                    >
                      <Trash2 aria-hidden="true" size={16} />
                      <span>刪除</span>
                    </GlassButton>
                  </article>
                ))
              )}
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
