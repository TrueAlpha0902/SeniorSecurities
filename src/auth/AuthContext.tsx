import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase, type AuthUser } from "../lib/supabase";
import {
  finalizeLearningResetExternalCleanup,
  syncLocalRecordsToCloud,
  synchronizeUserLearningResetState,
} from "../lib/db";
import { flushPracticeSecondsToCloud } from "../lib/practiceTime";
import { setActiveUserStorageScope } from "../lib/userScopedStorage";
import { initializeLearningStore } from "../lib/learningStateStore";
import {
  hydrateForeignExchangeProgressFromSyncedRecords,
  prepareForeignExchangeCloudSync,
} from "../lib/foreignExchangeProgress";
import {
  LEARNING_RESET_APPLIED_EVENT,
  type LearningResetMode,
} from "../lib/learningResetGeneration";
import { performLearningResetExternalCleanup } from "../lib/resetExternalCleanup";

export const EXAM_IDS = ["senior-securities", "junior-foreign-exchange"] as const;
export type ExamId = typeof EXAM_IDS[number];

export type AccessStatus = {
  hasEntitlement: boolean;
  plan: string | null;
  redeemedAt: string | null;
  error: string | null;
};

export type ExamAccessMap = Record<ExamId, AccessStatus>;

type AuthContextValue = {
  isConfigured: boolean;
  loading: boolean;
  session: Session | null;
  user: AuthUser | null;
  examAccess: ExamAccessMap;
  access: AccessStatus;
  isActivated: boolean;
  hasExamAccess: (examId: ExamId) => boolean;
  getExamAccess: (examId: ExamId) => AccessStatus;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  redeemActivationCode: (code: string, expectedExamId: ExamId) => Promise<void>;
  requestPasswordReset: (email: string, redirectTo?: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
  refreshAccess: () => Promise<void>;
};

const defaultAccess: AccessStatus = {
  hasEntitlement: false,
  plan: null,
  redeemedAt: null,
  error: null,
};

function emptyExamAccess(): ExamAccessMap {
  return {
    "senior-securities": { ...defaultAccess },
    "junior-foreign-exchange": { ...defaultAccess },
  };
}

const localPreviewEnabled = import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_ACCESS === "1";
const LOCAL_PREVIEW_AUTH_STATE_KEY = "truealpha:v93:e2e-auth-state";

function localPreviewShouldAuthenticate(): boolean {
  if (typeof window === "undefined") return true;
  return window.localStorage.getItem(LOCAL_PREVIEW_AUTH_STATE_KEY) !== "signed-out";
}

const localPreviewUser = {
  id: "local-preview-user",
  email: "preview@example.com",
  aud: "authenticated",
  role: "authenticated",
  created_at: new Date(0).toISOString(),
  app_metadata: {},
  user_metadata: {},
} as AuthUser;

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

async function sendAuthAudit(session: Session | null, eventType: "sign_in" | "sign_up" | "session_seen" | "sign_out"): Promise<void> {
  if (!session?.access_token) return;
  try {
    await fetch("/api/auth/log-login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${session.access_token}`,
      },
      body: JSON.stringify({ event_type: eventType }),
    });
  } catch {
    // Audit delivery is best-effort and must not block authentication.
  }
}

let activeCloudSync: { userId: string; promise: Promise<void> } | null = null;

async function initializeLearningForUser(userId: string): Promise<void> {
  const resets = await synchronizeUserLearningResetState(userId);
  for (const reset of resets) {
    await performLearningResetExternalCleanup(reset.examId, reset.mode);
    await finalizeLearningResetExternalCleanup({
      userId,
      examId: reset.examId,
      dataGeneration: reset.dataGeneration,
      wrongGeneration: reset.wrongGeneration,
      favoriteGeneration: reset.favoriteGeneration,
    });
  }
  await initializeLearningStore(userId);
}

async function triggerCloudRecordSync(userId: string): Promise<void> {
  if (activeCloudSync?.userId === userId) return activeCloudSync.promise;
  const promise = (async () => {
    await initializeLearningStore(userId);
    try {
      await prepareForeignExchangeCloudSync();
    } catch (error) {
      console.warn("Foreign-exchange local progress could not be prepared for sync", error);
    }
    const results = await Promise.allSettled([
      syncLocalRecordsToCloud(),
      flushPracticeSecondsToCloud(true),
    ]);
    for (const result of results) {
      if (result.status === "rejected") console.warn("Cloud learning-record sync failed", result.reason);
    }
    try {
      await hydrateForeignExchangeProgressFromSyncedRecords();
    } catch (error) {
      console.warn("Foreign-exchange synced progress could not be hydrated", error);
    }
  })().finally(() => {
    if (activeCloudSync?.userId === userId) activeCloudSync = null;
  });
  activeCloudSync = { userId, promise };
  return promise;
}

async function sendPresenceHeartbeat(userId: string): Promise<void> {
  if (!supabase || !userId || localPreviewEnabled) return;
  try {
    const { error } = await supabase.rpc("touch_user_presence");
    if (!error) return;
    const fallback = await supabase.from("user_presence").upsert({
      user_id: userId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (fallback.error) throw fallback.error;
  } catch (error) {
    console.warn("Presence heartbeat failed", error);
  }
}

function activeStatus(row: {
  plan?: string | null;
  status?: string | null;
  granted_at?: string | null;
  expires_at?: string | null;
} | null | undefined): AccessStatus {
  const expiresAt = row?.expires_at ? new Date(row.expires_at).getTime() : null;
  const hasEntitlement = Boolean(row && row.status === "active" && (expiresAt === null || expiresAt > Date.now()));
  return {
    hasEntitlement,
    plan: row?.plan ?? null,
    redeemedAt: row?.granted_at ?? null,
    error: null,
  };
}

function isMissingExamEntitlementTable(message: string): boolean {
  return message.includes("user_exam_entitlements") || message.includes("Could not find the table") || message.includes("relation") && message.includes("does not exist");
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [examAccess, setExamAccess] = useState<ExamAccessMap>(emptyExamAccess);
  const hasLoggedSessionSeen = useRef(false);
  const verifiedAccessUserId = useRef<string | null>(null);

  useEffect(() => {
    const handleAppliedReset = (event: Event) => {
      const detail = (event as CustomEvent<{
        examId?: string;
        mode?: LearningResetMode | null;
        userId?: string;
        dataGeneration?: number;
        wrongGeneration?: number;
        favoriteGeneration?: number;
      }>).detail;
      const examId = detail?.examId;
      if (
        examId !== "senior-securities" &&
        examId !== "junior-foreign-exchange"
      ) return;
      const mode = detail.mode === "wrong" || detail.mode === "complete"
        ? detail.mode
        : "restart";
      void (async () => {
        await performLearningResetExternalCleanup(examId, mode);
        if (
          detail.userId &&
          Number.isFinite(detail.dataGeneration) &&
          Number.isFinite(detail.wrongGeneration) &&
          Number.isFinite(detail.favoriteGeneration)
        ) {
          await finalizeLearningResetExternalCleanup({
            userId: detail.userId,
            examId,
            dataGeneration: Number(detail.dataGeneration),
            wrongGeneration: Number(detail.wrongGeneration),
            favoriteGeneration: Number(detail.favoriteGeneration),
          });
        }
      })().catch((error) => {
        console.warn("Reset external cleanup will retry on next initialization", error);
      });
    };
    window.addEventListener(LEARNING_RESET_APPLIED_EVENT, handleAppliedReset);
    return () => {
      window.removeEventListener(LEARNING_RESET_APPLIED_EVENT, handleAppliedReset);
    };
  }, []);

  const refreshAccessForUser = useCallback(async (currentUser: AuthUser | null) => {
    if (localPreviewEnabled) {
      if (!currentUser) {
        verifiedAccessUserId.current = null;
        setExamAccess(emptyExamAccess());
        return;
      }
      verifiedAccessUserId.current = localPreviewUser.id;
      setExamAccess({
        "senior-securities": { hasEntitlement: true, plan: "preview", redeemedAt: null, error: null },
        "junior-foreign-exchange": { hasEntitlement: true, plan: "preview", redeemedAt: null, error: null },
      });
      return;
    }

    if (!supabase || !currentUser) {
      verifiedAccessUserId.current = null;
      setExamAccess(emptyExamAccess());
      return;
    }

    const { data, error } = await supabase
      .from("user_exam_entitlements")
      .select("exam_id, plan, status, granted_at, expires_at")
      .eq("user_id", currentUser.id);

    if (error) {
      const message = String(error.message || "");
      if (isMissingExamEntitlementTable(message)) {
        const legacy = await supabase
          .from("user_entitlements")
          .select("plan, status, granted_at, expires_at")
          .eq("user_id", currentUser.id)
          .maybeSingle();
        if (legacy.error) {
          const next = emptyExamAccess();
          next["senior-securities"].error = legacy.error.message;
          next["junior-foreign-exchange"].error = "初階外匯權限資料尚未部署。";
          setExamAccess(next);
          return;
        }
        verifiedAccessUserId.current = currentUser.id;
        setExamAccess({
          "senior-securities": activeStatus(legacy.data),
          "junior-foreign-exchange": { ...defaultAccess, error: "初階外匯權限資料尚未部署。" },
        });
        return;
      }

      setExamAccess((previous) => {
        const next = verifiedAccessUserId.current === currentUser.id ? { ...previous } : emptyExamAccess();
        for (const examId of EXAM_IDS) next[examId] = { ...next[examId], error: message };
        return next;
      });
      return;
    }

    const rows = new Map((data || []).map((row) => [String(row.exam_id), row]));
    verifiedAccessUserId.current = currentUser.id;
    setExamAccess({
      "senior-securities": activeStatus(rows.get("senior-securities")),
      "junior-foreign-exchange": activeStatus(rows.get("junior-foreign-exchange")),
    });
  }, []);

  const refreshAccess = useCallback(async () => {
    await refreshAccessForUser(user);
  }, [refreshAccessForUser, user]);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      if (localPreviewEnabled) {
        if (!localPreviewShouldAuthenticate()) {
          setActiveUserStorageScope(null);
          setSession(null);
          setUser(null);
          await refreshAccessForUser(null);
          if (mounted) setLoading(false);
          return;
        }
        setActiveUserStorageScope(localPreviewUser.id);
        setUser(localPreviewUser);
        await refreshAccessForUser(localPreviewUser);
        if (mounted) setLoading(false);
        return;
      }

      if (!supabase) {
        setActiveUserStorageScope(null);
        if (mounted) setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;
      if (error) {
        const next = emptyExamAccess();
        for (const examId of EXAM_IDS) next[examId].error = error.message;
        setExamAccess(next);
      }

      const nextSession = data.session ?? null;
      setActiveUserStorageScope(nextSession?.user.id ?? null);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) await initializeLearningForUser(nextSession.user.id);
      await refreshAccessForUser(nextSession?.user ?? null);
      if (nextSession?.user) void triggerCloudRecordSync(nextSession.user.id);
      if (nextSession && !hasLoggedSessionSeen.current) {
        hasLoggedSessionSeen.current = true;
        void sendAuthAudit(nextSession, "session_seen");
      }
      if (mounted) setLoading(false);
    }

    void initializeAuth();

    if (!supabase || localPreviewEnabled) {
      return () => { mounted = false; };
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setActiveUserStorageScope(nextSession?.user.id ?? null);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      void refreshAccessForUser(nextSession?.user ?? null);
      if (nextSession?.user) void initializeLearningForUser(nextSession.user.id).then(() => triggerCloudRecordSync(nextSession.user.id));
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshAccessForUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (localPreviewEnabled) {
      window.localStorage.removeItem(LOCAL_PREVIEW_AUTH_STATE_KEY);
      setActiveUserStorageScope(localPreviewUser.id);
      setUser(localPreviewUser);
      await refreshAccessForUser(localPreviewUser);
      return;
    }
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setActiveUserStorageScope(data.user?.id ?? null);
    setSession(data.session ?? null);
    setUser(data.user ?? null);
    if (data.user) await initializeLearningForUser(data.user.id);
    await refreshAccessForUser(data.user ?? null);
    if (data.user) void triggerCloudRecordSync(data.user.id);
    void sendAuthAudit(data.session ?? null, "sign_in");
  }, [refreshAccessForUser]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (localPreviewEnabled) {
      window.localStorage.removeItem(LOCAL_PREVIEW_AUTH_STATE_KEY);
      setActiveUserStorageScope(localPreviewUser.id);
      setUser(localPreviewUser);
      await refreshAccessForUser(localPreviewUser);
      return null;
    }
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    setActiveUserStorageScope(data.user?.id ?? null);
    setSession(data.session ?? null);
    setUser(data.user ?? null);
    if (data.user) await initializeLearningForUser(data.user.id);
    await refreshAccessForUser(data.user ?? null);
    if (data.user) void triggerCloudRecordSync(data.user.id);
    void sendAuthAudit(data.session ?? null, "sign_up");
    return data.session ? null : "註冊成功。請先到信箱完成驗證，再回來登入。";
  }, [refreshAccessForUser]);

  const signOut = useCallback(async () => {
    if (localPreviewEnabled) {
      window.localStorage.setItem(LOCAL_PREVIEW_AUTH_STATE_KEY, "signed-out");
      setActiveUserStorageScope(null);
      setSession(null);
      setUser(null);
      setExamAccess(emptyExamAccess());
      return;
    }
    if (!supabase) return;
    void sendAuthAudit(session, "sign_out");
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setActiveUserStorageScope(null);
    setSession(null);
    setUser(null);
    setExamAccess(emptyExamAccess());
  }, [session]);

  const redeemActivationCode = useCallback(async (code: string, expectedExamId: ExamId) => {
    if (localPreviewEnabled) return;
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。");
    const normalizedCode = code.trim();
    if (!normalizedCode) throw new Error("請輸入啟用碼。");
    const { error } = await supabase.rpc("redeem_exam_activation_code_v94", {
      p_code: normalizedCode,
      p_expected_exam_id: expectedExamId,
    });
    if (error) throw error;
    const { data } = await supabase.auth.getUser();
    await refreshAccessForUser(data.user ?? null);
  }, [refreshAccessForUser]);

  const requestPasswordReset = useCallback(async (email: string, redirectTo?: string) => {
    if (localPreviewEnabled) return;
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。");
    const normalizedEmail = email.trim();
    if (!normalizedEmail) throw new Error("請輸入 Email。");
    const options = redirectTo ? { redirectTo } : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, options);
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (localPreviewEnabled) return;
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。");
    if (password.trim().length < 6) throw new Error("新密碼至少需要 6 個字元。");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  useEffect(() => {
    if (!user?.id || localPreviewEnabled) return;
    let heartbeatInFlight = false;
    let lastHeartbeatAt = 0;
    const heartbeat = (force = false) => {
      if (!navigator.onLine) return;
      const now = Date.now();
      if (heartbeatInFlight || (!force && now - lastHeartbeatAt < 30_000)) return;
      heartbeatInFlight = true;
      lastHeartbeatAt = now;
      void sendPresenceHeartbeat(user.id).finally(() => { heartbeatInFlight = false; });
    };
    heartbeat(true);
    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") heartbeat();
    }, 60_000);
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    window.addEventListener("focus", handleVisibilityChange);
    window.addEventListener("online", handleVisibilityChange);
    window.addEventListener("pageshow", handleVisibilityChange);
    return () => {
      window.clearInterval(heartbeatTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.removeEventListener("focus", handleVisibilityChange);
      window.removeEventListener("online", handleVisibilityChange);
      window.removeEventListener("pageshow", handleVisibilityChange);
    };
  }, [user?.id]);

  useEffect(() => {
    if (!user || localPreviewEnabled) return;
    let refreshInFlight = false;
    const revalidateAccess = () => {
      if (refreshInFlight || document.visibilityState !== "visible") return;
      refreshInFlight = true;
      void refreshAccessForUser(user).finally(() => { refreshInFlight = false; });
    };
    const timer = window.setInterval(revalidateAccess, 5 * 60_000);
    document.addEventListener("visibilitychange", revalidateAccess);
    window.addEventListener("focus", revalidateAccess);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", revalidateAccess);
      window.removeEventListener("focus", revalidateAccess);
    };
  }, [refreshAccessForUser, user]);

  const hasExamAccess = useCallback((examId: ExamId) => examAccess[examId].hasEntitlement, [examAccess]);
  const getExamAccess = useCallback((examId: ExamId) => examAccess[examId], [examAccess]);
  const access = examAccess["senior-securities"];

  const value = useMemo<AuthContextValue>(() => ({
    isConfigured: isSupabaseConfigured || localPreviewEnabled,
    loading,
    session,
    user,
    examAccess,
    access,
    isActivated: access.hasEntitlement,
    hasExamAccess,
    getExamAccess,
    signIn,
    signUp,
    signOut,
    redeemActivationCode,
    requestPasswordReset,
    updatePassword,
    refreshAccess,
  }), [access, examAccess, getExamAccess, hasExamAccess, loading, refreshAccess, redeemActivationCode, requestPasswordReset, session, signIn, signOut, signUp, updatePassword, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
