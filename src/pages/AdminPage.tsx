import {
  Activity,
  BarChart3,
  BookOpenCheck,
  ChevronRight,
  ClipboardList,
  Clock3,
  KeyRound,
  LogIn,
  MailCheck,
  MonitorSmartphone,
  RefreshCcw,
  Search,
  ShieldCheck,
  ShieldOff,
  Target,
  Trash2,
  Trophy,
  UsersRound,
  Wrench,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ProtectedRoute } from "../auth/ProtectedRoute";
import { useAuth } from "../auth/AuthContext";
import { AdminToolsPanel } from "../components/AdminToolsPanel";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { formatTotalPracticeTime } from "../lib/practiceTime";
import "../styles/admin-leaderboard-v42.css";
import "../styles/admin-premium-v65.css";

const DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const SHORT_DATE_FORMATTER = new Intl.DateTimeFormat("zh-TW", {
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
  lastEventType?: string | null;
  lastIp: string | null;
  loginEventCount: number;
  practicedQuestionCount: number;
  totalPracticeSeconds: number;
  totalAnswered: number;
  totalCorrect: number;
  currentCorrectStreak: number;
  bestCorrectStreak: number;
  isOnline: boolean;
  lastSeenAt: string | null;
  lastActivityAt: string | null;
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

type LoginEvent = {
  id: string;
  eventType: string;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string | null;
};

type UserDevice = {
  id: string;
  label: string;
  fingerprintPreview: string | null;
  firstSeenAt: string | null;
  lastSeenAt: string | null;
  revokedAt: string | null;
};

type RecentAnswer = {
  questionId: string;
  selectedAnswer: string | null;
  correctAnswer: string | null;
  isCorrect: boolean;
  answeredAt: string | null;
  bankId: string | null;
  chapter: string | null;
};

type RecentSession = {
  sessionId: string;
  mode: string | null;
  startedAt: string | null;
  finishedAt: string | null;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
};

type UserDetail = {
  user: {
    id: string;
    email: string;
    createdAt: string | null;
    lastSignInAt: string | null;
    emailConfirmedAt: string | null;
    phone: string | null;
    lastSeenAt: string | null;
    lastActivityAt: string | null;
    isOnline: boolean;
  };
  entitlement: {
    plan: string | null;
    status: string;
    grantedAt: string | null;
    expiresAt: string | null;
    activationCode: {
      code_preview?: string | null;
      max_uses?: number;
      use_count?: number;
      is_active?: boolean;
      note?: string | null;
      created_at?: string | null;
      redeemed_at?: string | null;
    } | null;
  } | null;
  learning: {
    totalAnswered: number;
    totalCorrect: number;
    accuracy: number;
    currentCorrectStreak: number;
    bestCorrectStreak: number;
    totalPracticeSeconds: number;
    practicedQuestionCount: number;
    wrongQuestionCount: number | null;
    favoriteQuestionCount: number | null;
  };
  loginEvents: LoginEvent[];
  devices: UserDevice[];
  recentAnswers: RecentAnswer[];
  recentSessions: RecentSession[];
};

type AdminAuditEvent = {
  id: string;
  actorUserId: string | null;
  actorEmail: string;
  targetUserId: string | null;
  targetEmail: string | null;
  action: string;
  metadata: Record<string, unknown>;
  ipAddress: string | null;
  createdAt: string | null;
};

type UsersResponse = { users?: AdminUserRow[]; pagination?: { page: number; perPage: number; hasMore: boolean }; error?: string };
type UserDetailResponse = Partial<UserDetail> & { error?: string };
type LeaderboardResponse = { entries?: LeaderboardAdminEntry[]; error?: string };
type AuditResponse = { events?: AdminAuditEvent[]; error?: string };
type ActionResponse = { ok?: boolean; message?: string; error?: string };
type UserFilter = "all" | "active" | "inactive";
type UserAction = "revoke" | "restore" | "send-password-reset" | "reset-devices" | "revoke-device";

function formatDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return DATE_FORMATTER.format(date);
}

function formatShortDate(value: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return SHORT_DATE_FORMATTER.format(date);
}

function relativeActivity(value: string | null): string {
  if (!value) return "尚無活動";
  const timestamp = new Date(value).getTime();
  if (Number.isNaN(timestamp)) return formatShortDate(value);
  const seconds = Math.max(0, Math.floor((Date.now() - timestamp) / 1000));
  if (seconds < 60) return "剛剛";
  if (seconds < 3600) return Math.floor(seconds / 60) + " 分鐘前";
  if (seconds < 86400) return Math.floor(seconds / 3600) + " 小時前";
  if (seconds < 604800) return Math.floor(seconds / 86400) + " 天前";
  return formatShortDate(value);
}

function statusLabel(status: string): string {
  if (status === "active") return "已開通";
  if (status === "revoked") return "已取消";
  return "未開通";
}

function eventLabel(eventType: string): string {
  if (eventType === "sign_in") return "登入";
  if (eventType === "sign_up") return "建立帳號";
  if (eventType === "sign_out") return "登出";
  return "工作階段";
}

function actionLabel(action: UserAction): string {
  if (action === "revoke") return "取消完整題庫權限";
  if (action === "restore") return "恢復完整題庫權限";
  if (action === "send-password-reset") return "寄送重設密碼信";
  if (action === "reset-devices") return "封存全部有效裝置紀錄（不會強制登出）";
  return "封存這台裝置紀錄（不會強制登出）";
}

function auditActionLabel(action: string): string {
  const labels: Record<string, string> = {
    "user.entitlement.revoke": "取消使用者完整題庫權限",
    "user.entitlement.restore": "恢復使用者完整題庫權限",
    "user.devices.archive_all": "封存使用者全部裝置",
    "user.device.archive": "封存使用者裝置",
    "user.password_reset.send": "寄送密碼重設信",
    "leaderboard.entry.delete": "刪除排行榜紀錄",
    "activation_code.create": "建立啟用碼",
    "activation_code.delete": "刪除啟用碼",
    "question_release.create": "建立題庫發布批次",
    "question_release.submit-review": "題庫批次送審",
    "question_release.approve": "核准題庫發布批次",
    "question_release.publish": "發布題庫版本",
    "question_release.publish_direct": "主要管理員直接發布題庫",
    "question_release.rollback": "回復上一題庫版本",
    "admin_account.upsert": "新增或恢復管理員",
    "admin_account.disable": "停用管理員",
    "admin_account.delete": "刪除管理員",
    "question_override.save": "儲存題目線上修改",
    "question_override.delete": "移除題目線上修改",
  };
  return labels[action] || action;
}

function auditTarget(event: AdminAuditEvent): string {
  if (event.targetEmail) return event.targetEmail;
  const questionId = event.metadata.questionId;
  if (typeof questionId === "string" && questionId) return "題目 " + questionId;
  return "系統設定";
}

async function readJsonResponse<T>(response: Response): Promise<T> {
  const contentType = response.headers.get("content-type") || "";
  const text = await response.text();
  if (!contentType.includes("application/json")) {
    const isLocalViteFallback = text.includes("/@vite/client") || text.includes("<!doctype html");
    if (isLocalViteFallback) {
      throw new Error("管理後台需要 Vercel API。請用 npm run dev:admin 測試。");
    }
    throw new Error(text.trim().slice(0, 240) || "伺服器沒有回傳 JSON。");
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
  const { session } = useAuth();
  const accessToken = session?.access_token || "";
  const [users, setUsers] = useState<AdminUserRow[]>([]);
  const [userPage, setUserPage] = useState(1);
  const [hasMoreUsers, setHasMoreUsers] = useState(false);
  const [leaderboardEntries, setLeaderboardEntries] = useState<LeaderboardAdminEntry[]>([]);
  const [auditEvents, setAuditEvents] = useState<AdminAuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [leaderboardLoading, setLeaderboardLoading] = useState(false);
  const [leaderboardOpen, setLeaderboardOpen] = useState(false);
  const [auditOpen, setAuditOpen] = useState(false);
  const [toolsOpen, setToolsOpen] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [userDetail, setUserDetail] = useState<UserDetail | null>(null);
  const [userDetailLoading, setUserDetailLoading] = useState(false);
  const [userDetailError, setUserDetailError] = useState<string | null>(null);
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [userFilter, setUserFilter] = useState<UserFilter>("all");
  const [leaderboardQuery, setLeaderboardQuery] = useState("");
  const [leaderboardMode, setLeaderboardMode] = useState<"streak" | "practice">("streak");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [leaderboardError, setLeaderboardError] = useState<string | null>(null);
  const [auditLoading, setAuditLoading] = useState(false);
  const [auditError, setAuditError] = useState<string | null>(null);
  const userDetailRequest = useRef<{ sequence: number; controller: AbortController | null }>({
    sequence: 0,
    controller: null,
  });

  const selectedUser = useMemo(
    () => users.find((row) => row.id === selectedUserId) || null,
    [selectedUserId, users],
  );

  const summary = useMemo(() => ({
    total: users.length,
    active: users.filter((row) => row.entitlementStatus === "active").length,
    online: users.filter((row) => row.isOnline).length,
    practiced: users.reduce((sum, row) => sum + (row.totalAnswered || row.practicedQuestionCount || 0), 0),
    practiceSeconds: users.reduce((sum, row) => sum + (row.totalPracticeSeconds || 0), 0),
  }), [users]);

  const filteredUsers = useMemo(() => {
    const normalizedQuery = query.trim().toLowerCase();
    return users
      .filter((row) => {
        if (userFilter === "active" && row.entitlementStatus !== "active") return false;
        if (userFilter === "inactive" && row.entitlementStatus === "active") return false;
        if (!normalizedQuery) return true;
        return [row.email, row.lastIp, row.entitlementStatus, row.activationCode, row.plan]
          .filter(Boolean)
          .some((value) => String(value).toLowerCase().includes(normalizedQuery));
      })
      .sort((a, b) => {
        if (a.isOnline !== b.isOnline) return a.isOnline ? -1 : 1;
        return new Date(b.lastActivityAt || 0).getTime() - new Date(a.lastActivityAt || 0).getTime();
      });
  }, [query, userFilter, users]);

  const filteredLeaderboardEntries = useMemo(() => {
    const sortedEntries = [...leaderboardEntries].sort((a, b) => {
      if (leaderboardMode === "practice") {
        return (b.totalPracticeSeconds || 0) - (a.totalPracticeSeconds || 0) || b.totalAnswered - a.totalAnswered;
      }
      return b.bestCorrectStreak - a.bestCorrectStreak || b.totalCorrect - a.totalCorrect;
    });
    const normalizedQuery = leaderboardQuery.trim().toLowerCase();
    if (!normalizedQuery) return sortedEntries;
    return sortedEntries.filter((entry) =>
      [entry.displayName, entry.email].some((value) => value.toLowerCase().includes(normalizedQuery)),
    );
  }, [leaderboardEntries, leaderboardMode, leaderboardQuery]);

  const loadUsers = useCallback(async (background = false) => {
    if (!accessToken) return;
    if (background) setRefreshing(true);
    else setLoading(true);
    setError(null);
    try {
      const response = await fetch(`/api/admin/users?page=${userPage}&perPage=50`, {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const payload = await readJsonResponse<UsersResponse>(response);
      if (!response.ok) throw new Error(payload.error || "讀取使用者失敗。");
      setUsers(payload.users || []);
      setHasMoreUsers(Boolean(payload.pagination?.hasMore));
    } catch (loadError: unknown) {
      setError(loadError instanceof Error ? loadError.message : "讀取使用者失敗。");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [accessToken, userPage]);

  const loadUserDetail = useCallback(async (background = false) => {
    if (!accessToken || !selectedUserId) return;
    const requestedUserId = selectedUserId;
    userDetailRequest.current.controller?.abort();
    const controller = new AbortController();
    const sequence = userDetailRequest.current.sequence + 1;
    userDetailRequest.current = { sequence, controller };
    if (!background) setUserDetailLoading(true);
    setUserDetailError(null);
    try {
      const response = await fetch("/api/admin/user-detail?userId=" + encodeURIComponent(requestedUserId), {
        cache: "no-store",
        signal: controller.signal,
        headers: { Authorization: "Bearer " + accessToken },
      });
      const payload = await readJsonResponse<UserDetailResponse>(response);
      if (!response.ok) throw new Error(payload.error || "讀取使用者活動失敗。");
      if (payload.user?.id && payload.user.id !== requestedUserId) {
        throw new Error("使用者明細回應不一致，請重新整理後再試。");
      }
      if (userDetailRequest.current.sequence === sequence) {
        setUserDetail(payload as UserDetail);
      }
    } catch (detailError: unknown) {
      if (detailError instanceof Error && detailError.name === "AbortError") return;
      if (userDetailRequest.current.sequence === sequence) {
        setUserDetailError(detailError instanceof Error ? detailError.message : "讀取使用者活動失敗。");
      }
    } finally {
      if (userDetailRequest.current.sequence === sequence) {
        userDetailRequest.current.controller = null;
        setUserDetailLoading(false);
      }
    }
  }, [accessToken, selectedUserId]);

  const loadLeaderboard = useCallback(async () => {
    if (!accessToken) return;
    setLeaderboardLoading(true);
    setLeaderboardError(null);
    try {
      const response = await fetch("/api/admin/leaderboard", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const payload = await readJsonResponse<LeaderboardResponse>(response);
      if (!response.ok) throw new Error(payload.error || "讀取排行榜失敗。");
      setLeaderboardEntries(payload.entries || []);
    } catch (loadError: unknown) {
      setLeaderboardError(loadError instanceof Error ? loadError.message : "讀取排行榜失敗。");
    } finally {
      setLeaderboardLoading(false);
    }
  }, [accessToken]);

  const loadAuditEvents = useCallback(async () => {
    if (!accessToken) return;
    setAuditLoading(true);
    setAuditError(null);
    try {
      const response = await fetch("/api/admin/audit-events", {
        cache: "no-store",
        headers: { Authorization: "Bearer " + accessToken },
      });
      const payload = await readJsonResponse<AuditResponse>(response);
      if (!response.ok) throw new Error(payload.error || "讀取操作紀錄失敗。");
      setAuditEvents(payload.events || []);
    } catch (loadError: unknown) {
      setAuditError(loadError instanceof Error ? loadError.message : "讀取操作紀錄失敗。");
    } finally {
      setAuditLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    void loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    if (!accessToken) return;
    const refreshWhenVisible = () => {
      if (document.visibilityState === "visible") void loadUsers(true);
    };
    document.addEventListener("visibilitychange", refreshWhenVisible);
    window.addEventListener("focus", refreshWhenVisible);
    return () => {
      document.removeEventListener("visibilitychange", refreshWhenVisible);
      window.removeEventListener("focus", refreshWhenVisible);
    };
  }, [accessToken, loadUsers]);

  useEffect(() => {
    if (!selectedUserId) {
      userDetailRequest.current.controller?.abort();
      userDetailRequest.current = {
        sequence: userDetailRequest.current.sequence + 1,
        controller: null,
      };
      setUserDetail(null);
      setUserDetailError(null);
      setUserDetailLoading(false);
      return;
    }
    setUserDetail(null);
    void loadUserDetail();
  }, [loadUserDetail, selectedUserId]);

  useEffect(() => () => {
    userDetailRequest.current.controller?.abort();
  }, []);

  useEffect(() => {
    const hasOverlay = Boolean(selectedUserId || toolsOpen || leaderboardOpen || auditOpen);
    if (!hasOverlay) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const closeTopOverlay = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (toolsOpen) setToolsOpen(false);
      else if (leaderboardOpen) setLeaderboardOpen(false);
      else if (auditOpen) setAuditOpen(false);
      else setSelectedUserId(null);
    };
    window.addEventListener("keydown", closeTopOverlay);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", closeTopOverlay);
    };
  }, [auditOpen, leaderboardOpen, selectedUserId, toolsOpen]);

  async function runUserAction(
    action: UserAction,
    target: AdminUserRow,
    deviceId?: string,
    deviceLabel?: string,
  ): Promise<void> {
    if (!accessToken) return;
    const targetLabel = deviceLabel ? target.email + " 的「" + deviceLabel + "」" : target.email;
    if (!window.confirm("確定要對 " + targetLabel + " 執行「" + actionLabel(action) + "」？")) return;

    const key = action + ":" + (deviceId || target.id);
    setBusyKey(key);
    setMessage(null);
    setError(null);
    try {
      const response = await fetch("/api/admin/action", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: "Bearer " + accessToken,
        },
        body: JSON.stringify({ action, userId: target.id, email: target.email, deviceId }),
      });
      const payload = await readJsonResponse<ActionResponse>(response);
      if (!response.ok) throw new Error(payload.error || "操作失敗。");
      setMessage(payload.message || "操作完成。");
      await loadUsers(true);
      if (selectedUserId === target.id) await loadUserDetail(true);
    } catch (actionError: unknown) {
      const actionMessage = actionError instanceof Error ? actionError.message : "操作失敗。";
      setError(actionMessage);
      setUserDetailError(actionMessage);
    } finally {
      setBusyKey(null);
    }
  }

  async function deleteLeaderboardEntry(entry: LeaderboardAdminEntry): Promise<void> {
    if (!accessToken) return;
    if (!window.confirm("確定要刪除「" + entry.displayName + "」的排行榜紀錄？這不會刪除帳號或作答紀錄。")) return;
    setBusyKey("leaderboard:" + entry.userId);
    setLeaderboardError(null);
    try {
      const response = await fetch("/api/admin/action", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer " + accessToken },
        body: JSON.stringify({ action: "delete-leaderboard", userId: entry.userId, email: entry.email }),
      });
      const payload = await readJsonResponse<ActionResponse>(response);
      if (!response.ok) throw new Error(payload.error || "刪除排行榜紀錄失敗。");
      setMessage(payload.message || "已刪除排行榜紀錄。");
      await Promise.all([loadUsers(true), loadLeaderboard()]);
    } catch (actionError: unknown) {
      setLeaderboardError(actionError instanceof Error ? actionError.message : "刪除排行榜紀錄失敗。");
    } finally {
      setBusyKey(null);
    }
  }

  function openLeaderboardManager(): void {
    setLeaderboardOpen(true);
    void loadLeaderboard();
  }

  function openAuditLog(): void {
    setAuditOpen(true);
    void loadAuditEvents();
  }

  if (loading && users.length === 0) return <LoadingState label="載入管理後台" />;

  return (
    <div className="page-stack admin-page admin-premium-page">
      <GlassCard className="admin-premium-hero">
        <div className="admin-premium-hero-top">
          <div className="admin-premium-title">
            <span className="admin-premium-emblem"><ShieldCheck size={22} aria-hidden="true" /></span>
            <div>
              <p className="eyebrow">Operations Center</p>
              <h1>管理控制中心</h1>
              <p>用一個畫面掌握會員、授權、學習活動與營運狀態。</p>
            </div>
          </div>
          <div className="admin-premium-command">
            <div className="admin-premium-actions">
              <GlassButton variant="primary" onClick={() => setToolsOpen(true)}>
                <Wrench size={18} aria-hidden="true" />
                <span>管理工具</span>
              </GlassButton>
              <GlassButton variant="secondary" disabled={auditLoading} onClick={openAuditLog}>
                <ClipboardList size={18} aria-hidden="true" />
                <span>操作紀錄</span>
              </GlassButton>
              <GlassButton variant="secondary" disabled={leaderboardLoading} onClick={openLeaderboardManager}>
                <Trophy size={18} aria-hidden="true" />
                <span>排行榜</span>
              </GlassButton>
              <GlassButton variant="secondary" disabled={refreshing} onClick={() => void loadUsers(true)}>
                <RefreshCcw className={refreshing ? "is-spinning" : ""} size={18} aria-hidden="true" />
                <span>{refreshing ? "同步中" : "同步資料"}</span>
              </GlassButton>
            </div>
          </div>
        </div>

        <div className="admin-overview-strip" aria-label="營運摘要">
          <div><span><UsersRound size={18} /></span><small>全部帳號</small><strong>{summary.total}</strong></div>
          <div className="is-live"><span><Activity size={18} /></span><small>目前在線</small><strong>{summary.online}</strong></div>
          <div><span><BookOpenCheck size={18} /></span><small>累積作答</small><strong>{summary.practiced.toLocaleString("zh-TW")}</strong></div>
          <div className="is-duration"><span><Clock3 size={18} /></span><small>練習投入</small><strong>{formatTotalPracticeTime(summary.practiceSeconds)}</strong></div>
        </div>
      </GlassCard>

      <GlassCard className="admin-premium-directory">
        <div className="admin-directory-heading">
          <div>
            <p className="eyebrow">Member Intelligence</p>
            <h2>使用者與活動</h2>
            <p>以精簡清單掌握核心學習狀態，點選任一會員查看完整明細。</p>
          </div>
          <div className="admin-directory-heading-meta">
            <span className="admin-directory-count"><UsersRound size={16} />{filteredUsers.length} 位會員</span>
          </div>
        </div>

        <div className="admin-premium-toolbar">
          <label className="admin-premium-search">
            <Search size={18} aria-hidden="true" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜尋 Email、IP、啟用碼或方案"
            />
          </label>
          <div className="admin-filter-tabs" role="group" aria-label="使用者篩選">
            {([
              ["all", "全部", summary.total],
              ["active", "已開通", summary.active],
              ["inactive", "未啟用", summary.total - summary.active],
            ] as const).map(([filter, label, count]) => (
              <button
                key={filter}
                type="button"
                className={userFilter === filter ? "is-active" : ""}
                aria-pressed={userFilter === filter}
                onClick={() => setUserFilter(filter)}
              >
                {label}<span>{count}</span>
              </button>
            ))}
          </div>
        </div>

        {message ? <p className="form-success admin-premium-notice">{message}</p> : null}
        {error ? <p className="form-error admin-premium-notice">{error}</p> : null}

        <div className="admin-member-table">
          <div className="admin-member-table-head" aria-hidden="true">
            <span>使用者</span><span>學習成效</span><span>練習投入</span><span>最近活動</span><span>授權</span><span />
          </div>
          {filteredUsers.length === 0 ? (
            <div className="admin-premium-empty">
              <Search size={24} aria-hidden="true" />
              <strong>沒有符合條件的使用者</strong>
              <span>調整搜尋文字或篩選條件後再試一次。</span>
            </div>
          ) : filteredUsers.map((row) => {
            const answered = row.totalAnswered || row.practicedQuestionCount || 0;
            const accuracy = row.totalAnswered > 0 ? Math.round(row.totalCorrect / row.totalAnswered * 100) : 0;
            return (
              <button
                type="button"
                className="admin-member-row"
                key={row.id}
                onClick={() => setSelectedUserId(row.id)}
                aria-label={"查看 " + row.email + " 的活動資料"}
              >
                <span className="admin-member-user">
                  <span className={"admin-user-avatar " + (row.isOnline ? "is-online" : "")}>
                    {(row.email[0] || "U").toUpperCase()}
                    {row.isOnline ? <i aria-label="正在使用" /> : null}
                  </span>
                  <span><strong>{row.email || "未命名帳號"}</strong><small>點擊查看帳號、裝置與活動明細</small></span>
                </span>
                <span className="admin-member-cell"><strong>{answered.toLocaleString("zh-TW")} 題</strong><small>{row.totalAnswered > 0 ? accuracy + "% 正確率" : "尚無完整統計"}</small></span>
                <span className="admin-member-cell"><strong>{formatTotalPracticeTime(row.totalPracticeSeconds || 0)}</strong><small>累積練習時間</small></span>
                <span className="admin-member-cell"><strong>{row.isOnline ? "正在使用" : relativeActivity(row.lastActivityAt)}</strong><small>{formatShortDate(row.lastActivityAt || row.lastEventAt || row.lastSignInAt)}</small></span>
                <span className={"admin-status admin-status-" + row.entitlementStatus}>{statusLabel(row.entitlementStatus)}</span>
                <ChevronRight className="admin-member-chevron" size={20} aria-hidden="true" />
              </button>
            );
          })}
        </div>
        <div className="admin-pagination" aria-label="使用者分頁">
          <GlassButton variant="secondary" disabled={userPage <= 1 || loading} onClick={() => setUserPage((page) => Math.max(1, page - 1))}>上一頁</GlassButton>
          <span>第 {userPage} 頁 · 每頁最多 50 位</span>
          <GlassButton variant="secondary" disabled={!hasMoreUsers || loading} onClick={() => setUserPage((page) => page + 1)}>下一頁</GlassButton>
        </div>
      </GlassCard>

      {selectedUserId && selectedUser ? (
        <div className="admin-modal-backdrop admin-drawer-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setSelectedUserId(null);
        }}>
          <aside className="admin-user-drawer" role="dialog" aria-modal="true" aria-labelledby="admin-user-detail-title">
            <header className="admin-drawer-header">
              <div className="admin-drawer-user">
                <span className={"admin-user-avatar is-large " + (selectedUser.isOnline ? "is-online" : "")}>
                  {(selectedUser.email[0] || "U").toUpperCase()}
                  {selectedUser.isOnline ? <i aria-label="在線" /> : null}
                </span>
                <div>
                  <p className="eyebrow">Member Profile</p>
                  <h2 id="admin-user-detail-title">{selectedUser.email}</h2>
                  <div className="admin-drawer-badges">
                    <span className={"admin-status admin-status-" + selectedUser.entitlementStatus}>{statusLabel(selectedUser.entitlementStatus)}</span>
                  </div>
                </div>
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setSelectedUserId(null)} aria-label="關閉使用者詳情" autoFocus>
                <X size={22} aria-hidden="true" />
              </button>
            </header>

            <div className="admin-drawer-scroll">
              <div className="admin-detail-actions">
                {selectedUser.entitlementStatus === "active" ? (
                  <GlassButton
                    variant="danger"
                    disabled={busyKey === "revoke:" + selectedUser.id}
                    onClick={() => void runUserAction("revoke", selectedUser)}
                  >
                    <ShieldOff size={17} />取消權限
                  </GlassButton>
                ) : (
                  <GlassButton
                    variant="primary"
                    disabled={busyKey === "restore:" + selectedUser.id}
                    onClick={() => void runUserAction("restore", selectedUser)}
                  >
                    <ShieldCheck size={17} />恢復權限
                  </GlassButton>
                )}
                <GlassButton
                  variant="secondary"
                  disabled={busyKey === "send-password-reset:" + selectedUser.id}
                  onClick={() => void runUserAction("send-password-reset", selectedUser)}
                >
                  <MailCheck size={17} />重設密碼
                </GlassButton>
                <GlassButton
                  variant="secondary"
                  disabled={busyKey === "reset-devices:" + selectedUser.id}
                  onClick={() => void runUserAction("reset-devices", selectedUser)}
                >
                  <MonitorSmartphone size={17} />封存裝置
                </GlassButton>
                <GlassButton variant="secondary" disabled={userDetailLoading} onClick={() => void loadUserDetail()}>
                  <RefreshCcw size={17} />更新明細
                </GlassButton>
              </div>

              {userDetailError ? <p className="form-error admin-premium-notice">{userDetailError}</p> : null}
              {userDetailLoading && !userDetail ? (
                <LoadingState label="載入活動與登入資料" />
              ) : userDetail ? (
                <>
                  <section className="admin-detail-section">
                    <div className="admin-detail-section-title">
                      <div><BarChart3 size={19} /><h3>學習概況</h3></div>
                      <span>最後活動 {relativeActivity(userDetail.user.lastActivityAt)}</span>
                    </div>
                    <div className="admin-detail-metrics">
                      <div><span>累積作答</span><strong>{userDetail.learning.totalAnswered.toLocaleString("zh-TW")}</strong><small>已練習題目</small></div>
                      <div><span>正確率</span><strong>{userDetail.learning.accuracy}%</strong><small>{userDetail.learning.totalCorrect} 題答對</small></div>
                      <div><span>累積時間</span><strong>{formatTotalPracticeTime(userDetail.learning.totalPracticeSeconds)}</strong><small>有效練習時數</small></div>
                      <div><span>最高連對</span><strong>{userDetail.learning.bestCorrectStreak}</strong><small>目前 {userDetail.learning.currentCorrectStreak} 題</small></div>
                    </div>
                    <div className="admin-detail-mini-stats">
                      <span><Target size={15} />錯題 {userDetail.learning.wrongQuestionCount ?? "—"}</span>
                      <span><BookOpenCheck size={15} />收藏 {userDetail.learning.favoriteQuestionCount ?? "—"}</span>
                      <span><Clock3 size={15} />最近連線 {formatDate(userDetail.user.lastSeenAt)}</span>
                    </div>
                  </section>

                  <section className="admin-detail-section">
                    <div className="admin-detail-section-title">
                      <div><ShieldCheck size={19} /><h3>帳號與授權</h3></div>
                    </div>
                    <div className="admin-account-grid">
                      <div><span>使用者 ID</span><strong>{userDetail.user.id}</strong></div>
                      <div><span>建立時間</span><strong>{formatDate(userDetail.user.createdAt)}</strong></div>
                      <div><span>Email 驗證</span><strong>{formatDate(userDetail.user.emailConfirmedAt)}</strong></div>
                      <div><span>最後登入</span><strong>{formatDate(userDetail.user.lastSignInAt)}</strong></div>
                      <div><span>授權方案</span><strong>{userDetail.entitlement?.plan || "未設定"}</strong></div>
                      <div><span>授權時間</span><strong>{formatDate(userDetail.entitlement?.grantedAt || null)}</strong></div>
                    </div>
                    {userDetail.entitlement?.activationCode ? (
                      <div className="admin-entitlement-code">
                        <KeyRound size={18} />
                        <div>
                          <span>啟用碼</span>
                          <strong>{userDetail.entitlement.activationCode.code_preview || "—"}</strong>
                          <small>{userDetail.entitlement.activationCode.note || "無備註"} · 已使用 {userDetail.entitlement.activationCode.use_count || 0}/{userDetail.entitlement.activationCode.max_uses || 1}</small>
                        </div>
                      </div>
                    ) : null}
                  </section>

                  <section className="admin-detail-section">
                    <div className="admin-detail-section-title">
                      <div><MonitorSmartphone size={19} /><h3>裝置紀錄</h3></div>
                      <span>{userDetail.devices.filter((device) => !device.revokedAt).length} 台有效裝置</span>
                    </div>
                    <div className="admin-detail-device-list">
                      {userDetail.devices.length === 0 ? <p className="admin-detail-empty">尚無裝置紀錄。</p> : userDetail.devices.map((device) => (
                        <article className={device.revokedAt ? "is-revoked" : ""} key={device.id}>
                          <span className="admin-detail-list-icon"><MonitorSmartphone size={18} /></span>
                          <div>
                            <strong>{device.label}</strong>
                            <span>{device.fingerprintPreview || "無裝置指紋"} · 最後使用 {formatDate(device.lastSeenAt)}</span>
                          </div>
                          {device.revokedAt ? (
                            <span className="admin-device-revoked">已封存</span>
                          ) : (
                            <button
                              type="button"
                              disabled={busyKey === "revoke-device:" + device.id}
                              onClick={() => void runUserAction("revoke-device", selectedUser, device.id, device.label)}
                            >
                              封存
                            </button>
                          )}
                        </article>
                      ))}
                    </div>
                  </section>

                  <div className="admin-detail-columns">
                    <section className="admin-detail-section">
                      <div className="admin-detail-section-title">
                        <div><Activity size={19} /><h3>近期作答</h3></div>
                      </div>
                      <div className="admin-detail-activity-list">
                        {userDetail.recentAnswers.length === 0 ? <p className="admin-detail-empty">尚無雲端作答紀錄。</p> : userDetail.recentAnswers.slice(0, 10).map((answer) => (
                          <article key={answer.questionId + (answer.answeredAt || "")}>
                            <span className={"admin-answer-result " + (answer.isCorrect ? "is-correct" : "is-wrong")}>
                              {answer.isCorrect ? "對" : "錯"}
                            </span>
                            <div>
                              <strong>{answer.chapter || answer.bankId || "題庫練習"}</strong>
                              <span>題號 {answer.questionId} · 作答 {answer.selectedAnswer || "—"} / 答案 {answer.correctAnswer || "—"}</span>
                            </div>
                            <time>{formatShortDate(answer.answeredAt)}</time>
                          </article>
                        ))}
                      </div>
                    </section>

                    <section className="admin-detail-section">
                      <div className="admin-detail-section-title">
                        <div><LogIn size={19} /><h3>登入紀錄</h3></div>
                      </div>
                      <div className="admin-detail-login-list">
                        {userDetail.loginEvents.length === 0 ? <p className="admin-detail-empty">尚無登入稽核紀錄。</p> : userDetail.loginEvents.slice(0, 10).map((event) => (
                          <article key={event.id}>
                            <span className="admin-detail-list-icon"><LogIn size={17} /></span>
                            <div>
                              <strong>{eventLabel(event.eventType)} · {event.ipAddress || "IP 未記錄"}</strong>
                              <span title={event.userAgent || ""}>{event.userAgent || "瀏覽器資訊未記錄"}</span>
                            </div>
                            <time>{formatShortDate(event.createdAt)}</time>
                          </article>
                        ))}
                      </div>
                    </section>
                  </div>

                  {userDetail.recentSessions.length > 0 ? (
                    <section className="admin-detail-section">
                      <div className="admin-detail-section-title">
                        <div><Trophy size={19} /><h3>最近完成的訓練</h3></div>
                      </div>
                      <div className="admin-session-grid">
                        {userDetail.recentSessions.slice(0, 6).map((practiceSession) => (
                          <article key={practiceSession.sessionId}>
                            <span>{practiceSession.mode || "練習"}</span>
                            <strong>{practiceSession.correctCount}/{practiceSession.totalQuestions} 題</strong>
                            <small>{Math.round(practiceSession.accuracy)}% · {formatDate(practiceSession.finishedAt)}</small>
                          </article>
                        ))}
                      </div>
                    </section>
                  ) : null}
                </>
              ) : null}
            </div>
          </aside>
        </div>
      ) : null}

      {toolsOpen && accessToken ? (
        <div className="admin-modal-backdrop admin-tools-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setToolsOpen(false);
        }}>
          <AdminToolsPanel accessToken={accessToken} onClose={() => setToolsOpen(false)} />
        </div>
      ) : null}

      {auditOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setAuditOpen(false);
        }}>
          <GlassCard className="admin-audit-modal" role="dialog" aria-modal="true" aria-label="管理員操作紀錄">
            <div className="admin-modal-header">
              <div>
                <p className="eyebrow">Admin Audit Trail</p>
                <h2>管理員操作紀錄</h2>
                <p>保留操作人、目標、來源 IP 與時間，方便多管理員環境追查重要異動。</p>
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setAuditOpen(false)} aria-label="關閉操作紀錄" autoFocus>
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className="admin-audit-toolbar">
              <span>最近 100 筆伺服器端紀錄</span>
              <GlassButton variant="secondary" disabled={auditLoading} onClick={() => void loadAuditEvents()}>
                <RefreshCcw className={auditLoading ? "is-spinning" : ""} size={18} />
                <span>{auditLoading ? "同步中" : "重新整理"}</span>
              </GlassButton>
            </div>
            {auditError ? <p className="form-error admin-premium-notice">{auditError}</p> : null}
            <div className="admin-audit-list">
              {auditLoading && auditEvents.length === 0 ? (
                <LoadingState label="載入管理員操作紀錄" />
              ) : auditEvents.length === 0 ? (
                <div className="admin-premium-empty">
                  <ClipboardList size={24} />
                  <strong>目前沒有操作紀錄</strong>
                  <span>新功能上線後的重要管理操作會顯示在這裡。</span>
                </div>
              ) : auditEvents.map((event) => (
                <article key={event.id}>
                  <span className="admin-audit-icon"><ClipboardList size={17} aria-hidden="true" /></span>
                  <div>
                    <strong>{auditActionLabel(event.action)}</strong>
                    <span>{event.actorEmail} → {auditTarget(event)}</span>
                  </div>
                  <div className="admin-audit-meta">
                    <time>{formatDate(event.createdAt)}</time>
                    <span>IP {event.ipAddress || "未記錄"}</span>
                  </div>
                </article>
              ))}
            </div>
          </GlassCard>
        </div>
      ) : null}

      {leaderboardOpen ? (
        <div className="admin-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setLeaderboardOpen(false);
        }}>
          <GlassCard className="admin-leaderboard-modal" role="dialog" aria-modal="true" aria-label="排行榜管理">
            <div className="admin-modal-header">
              <div>
                <p className="eyebrow">Leaderboard Control</p>
                <h2>排行榜管理</h2>
                <p>查看排行榜名稱與帳號對應關係，必要時可單獨清除榜單紀錄。</p>
              </div>
              <button type="button" className="admin-modal-close" onClick={() => setLeaderboardOpen(false)} aria-label="關閉排行榜管理" autoFocus>
                <X size={22} aria-hidden="true" />
              </button>
            </div>
            <div className="admin-leaderboard-toolbar">
              <label className="admin-premium-search">
                <Search size={18} />
                <input value={leaderboardQuery} onChange={(event) => setLeaderboardQuery(event.target.value)} placeholder="搜尋名稱或 Email" />
              </label>
              <GlassButton variant="secondary" disabled={leaderboardLoading} onClick={() => void loadLeaderboard()}>
                <RefreshCcw size={18} /><span>重新整理</span>
              </GlassButton>
            </div>
            <div className="admin-leaderboard-tabs" role="tablist" aria-label="排行榜類型">
              <button type="button" role="tab" aria-selected={leaderboardMode === "streak"} className={leaderboardMode === "streak" ? "is-active" : ""} onClick={() => setLeaderboardMode("streak")}>連續答對</button>
              <button type="button" role="tab" aria-selected={leaderboardMode === "practice"} className={leaderboardMode === "practice" ? "is-active" : ""} onClick={() => setLeaderboardMode("practice")}>累積時數</button>
            </div>
            {leaderboardError ? <p className="form-error">{leaderboardError}</p> : null}
            <div className="admin-leaderboard-list">
              {leaderboardLoading && leaderboardEntries.length === 0 ? (
                <LoadingState label="載入排行榜" />
              ) : filteredLeaderboardEntries.length === 0 ? (
                <div className="admin-empty-cell">目前沒有排行榜資料。</div>
              ) : filteredLeaderboardEntries.map((entry, index) => (
                <article className="admin-leaderboard-row" key={entry.userId}>
                  <div className="admin-leaderboard-rank">#{index + 1}</div>
                  <div className="admin-leaderboard-player"><strong>{entry.displayName}</strong><span>{entry.email}</span></div>
                  <div className="admin-leaderboard-stats">
                    {leaderboardMode === "practice" ? (
                      <div className="admin-leaderboard-time-stat"><span>累積時數</span><strong>{formatTotalPracticeTime(entry.totalPracticeSeconds || 0)}</strong></div>
                    ) : (
                      <>
                        <div><span>最高連對</span><strong>{entry.bestCorrectStreak}</strong></div>
                        <div><span>目前連對</span><strong>{entry.currentCorrectStreak}</strong></div>
                        <div><span>總答對</span><strong>{entry.totalCorrect}</strong></div>
                        <div><span>總作答</span><strong>{entry.totalAnswered}</strong></div>
                      </>
                    )}
                  </div>
                  <div className="admin-leaderboard-updated"><span>更新時間</span><strong>{formatDate(entry.updatedAt)}</strong></div>
                  <GlassButton
                    variant="danger"
                    disabled={busyKey === "leaderboard:" + entry.userId}
                    onClick={() => void deleteLeaderboardEntry(entry)}
                  >
                    <Trash2 size={16} /><span>刪除</span>
                  </GlassButton>
                </article>
              ))}
            </div>
          </GlassCard>
        </div>
      ) : null}
    </div>
  );
}
