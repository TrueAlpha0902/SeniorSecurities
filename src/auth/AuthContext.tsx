import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import { isSupabaseConfigured, supabase, type AuthUser } from "../lib/supabase";
import { syncLocalRecordsToCloud } from "../lib/db";
import { flushPracticeSecondsToCloud } from "../lib/practiceTime";
import { setActiveUserStorageScope } from "../lib/userScopedStorage";
import { initializeLearningStore } from "../lib/learningStateStore";

export type AccessStatus = {
  hasEntitlement: boolean;
  plan: string | null;
  redeemedAt: string | null;
  error: string | null;
};

type AuthContextValue = {
  isConfigured: boolean;
  loading: boolean;
  session: Session | null;
  user: AuthUser | null;
  access: AccessStatus;
  isActivated: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string) => Promise<string | null>;
  signOut: () => Promise<void>;
  redeemActivationCode: (code: string) => Promise<void>;
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
    // Local Vite dev server does not serve Vercel /api functions. Ignore logging failures.
  }
}



let activeCloudSync: { userId: string; promise: Promise<void> } | null = null;

async function triggerCloudRecordSync(userId: string): Promise<void> {
  if (activeCloudSync?.userId === userId) return activeCloudSync.promise;
  const promise = (async () => {
    await initializeLearningStore(userId);
    const results = await Promise.allSettled([
      syncLocalRecordsToCloud(),
      flushPracticeSecondsToCloud(true),
    ]);
    for (const result of results) {
      if (result.status === "rejected") {
        // Sync should never block login. The account page will show actionable errors if SQL is missing.
        console.warn("Cloud learning-record sync failed", result.reason);
      }
    }
  })().finally(() => {
    if (activeCloudSync?.userId === userId) activeCloudSync = null;
  });
  activeCloudSync = { userId, promise };
  return promise;
}

async function sendPresenceHeartbeat(userId: string): Promise<void> {
  if (!supabase || !userId) return;

  try {
    const { error } = await supabase.rpc("touch_user_presence");
    if (!error) return;

    // Fallback for projects that have not applied v46 SQL yet.
    const fallback = await supabase.from("user_presence").upsert({
      user_id: userId,
      last_seen_at: new Date().toISOString(),
    }, { onConflict: "user_id" });
    if (fallback.error) throw fallback.error;
  } catch (error) {
    // Presence is best-effort. It should not block the app if SQL has not been applied yet.
    console.warn("Presence heartbeat failed", error);
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true);
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<AuthUser | null>(null);
  const [access, setAccess] = useState<AccessStatus>(defaultAccess);
  const hasLoggedSessionSeen = useRef(false);
  const verifiedAccessUserId = useRef<string | null>(null);

  const refreshAccessForUser = useCallback(async (currentUser: AuthUser | null) => {
    if (!supabase || !currentUser) {
      verifiedAccessUserId.current = null;
      setAccess(defaultAccess);
      return;
    }

    const { data, error } = await supabase
      .from("user_entitlements")
      .select("plan, status, granted_at, expires_at")
      .eq("user_id", currentUser.id)
      .maybeSingle();

    if (error) {
      setAccess((previous) => verifiedAccessUserId.current === currentUser.id
        ? { ...previous, error: error.message }
        : { ...defaultAccess, error: error.message });
      return;
    }

    const isActive = Boolean(data && data.status === "active" && (!data.expires_at || new Date(data.expires_at).getTime() > Date.now()));
    verifiedAccessUserId.current = currentUser.id;
    setAccess({
      hasEntitlement: isActive,
      plan: data?.plan ?? null,
      redeemedAt: data?.granted_at ?? null,
      error: null,
    });
  }, []);

  const refreshAccess = useCallback(async () => {
    await refreshAccessForUser(user);
  }, [refreshAccessForUser, user]);

  useEffect(() => {
    let mounted = true;

    async function initializeAuth() {
      if (!supabase) {
        setActiveUserStorageScope(null);
        if (mounted) setLoading(false);
        return;
      }

      const { data, error } = await supabase.auth.getSession();
      if (!mounted) return;

      if (error) {
        setAccess({ ...defaultAccess, error: error.message });
      }

      const nextSession = data.session ?? null;
      setActiveUserStorageScope(nextSession?.user.id ?? null);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      if (nextSession?.user) await initializeLearningStore(nextSession.user.id);
      await refreshAccessForUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        void triggerCloudRecordSync(nextSession.user.id);
      }
      if (nextSession && !hasLoggedSessionSeen.current) {
        hasLoggedSessionSeen.current = true;
        void sendAuthAudit(nextSession, "session_seen");
      }
      if (mounted) setLoading(false);
    }

    void initializeAuth();

    if (!supabase) {
      return () => {
        mounted = false;
      };
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setActiveUserStorageScope(nextSession?.user.id ?? null);
      setSession(nextSession);
      setUser(nextSession?.user ?? null);
      void refreshAccessForUser(nextSession?.user ?? null);
      if (nextSession?.user) {
        void initializeLearningStore(nextSession.user.id).then(() => triggerCloudRecordSync(nextSession.user.id));
      }
    });

    return () => {
      mounted = false;
      subscription.unsubscribe();
    };
  }, [refreshAccessForUser]);

  const signIn = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。 ");
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw error;
    setActiveUserStorageScope(data.user?.id ?? null);
    setSession(data.session ?? null);
    setUser(data.user ?? null);
    if (data.user) await initializeLearningStore(data.user.id);
    await refreshAccessForUser(data.user ?? null);
    if (data.user) {
      void triggerCloudRecordSync(data.user.id);
    }
    void sendAuthAudit(data.session ?? null, "sign_in");
  }, [refreshAccessForUser]);

  const signUp = useCallback(async (email: string, password: string) => {
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。 ");
    const { data, error } = await supabase.auth.signUp({ email, password });
    if (error) throw error;
    setActiveUserStorageScope(data.user?.id ?? null);
    setSession(data.session ?? null);
    setUser(data.user ?? null);
    if (data.user) await initializeLearningStore(data.user.id);
    await refreshAccessForUser(data.user ?? null);
    if (data.user) {
      void triggerCloudRecordSync(data.user.id);
    }
    void sendAuthAudit(data.session ?? null, "sign_up");
    return data.session ? null : "註冊成功。請先到信箱完成驗證，再回來登入。";
  }, [refreshAccessForUser]);

  const signOut = useCallback(async () => {
    if (!supabase) return;
    void sendAuthAudit(session, "sign_out");
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    setActiveUserStorageScope(null);
    setSession(null);
    setUser(null);
    setAccess(defaultAccess);
  }, [session]);

  const redeemActivationCode = useCallback(async (code: string) => {
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。 ");
    const normalizedCode = code.trim();
    if (!normalizedCode) throw new Error("請輸入啟用碼。");
    const { error } = await supabase.rpc("redeem_activation_code", { p_code: normalizedCode });
    if (error) throw error;
    const { data } = await supabase.auth.getUser();
    await refreshAccessForUser(data.user ?? null);
  }, [refreshAccessForUser]);

  const requestPasswordReset = useCallback(async (email: string, redirectTo?: string) => {
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。 ");
    const normalizedEmail = email.trim();
    if (!normalizedEmail) throw new Error("請輸入 Email。");
    const options = redirectTo ? { redirectTo } : undefined;
    const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, options);
    if (error) throw error;
  }, []);

  const updatePassword = useCallback(async (password: string) => {
    if (!supabase) throw new Error("尚未設定 Supabase。請先建立 .env.local。 ");
    if (password.trim().length < 6) throw new Error("新密碼至少需要 6 個字元。");
    const { error } = await supabase.auth.updateUser({ password });
    if (error) throw error;
  }, []);

  useEffect(() => {
    if (!user?.id) return;

    let heartbeatInFlight = false;
    let lastHeartbeatAt = 0;
    const heartbeat = (force = false) => {
      if (!navigator.onLine) return;
      const now = Date.now();
      if (heartbeatInFlight || (!force && now - lastHeartbeatAt < 30_000)) return;
      heartbeatInFlight = true;
      lastHeartbeatAt = now;
      void sendPresenceHeartbeat(user.id).finally(() => {
        heartbeatInFlight = false;
      });
    };

    heartbeat(true);
    const heartbeatTimer = window.setInterval(() => {
      if (document.visibilityState === "visible") {
        heartbeat();
      }
    }, 60_000);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        heartbeat();
      }
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
    if (!user) return;

    let refreshInFlight = false;
    const revalidateAccess = () => {
      if (refreshInFlight || document.visibilityState !== "visible") return;
      refreshInFlight = true;
      void refreshAccessForUser(user).finally(() => {
        refreshInFlight = false;
      });
    };

    const revalidationTimer = window.setInterval(revalidateAccess, 5 * 60_000);
    document.addEventListener("visibilitychange", revalidateAccess);
    window.addEventListener("focus", revalidateAccess);
    return () => {
      window.clearInterval(revalidationTimer);
      document.removeEventListener("visibilitychange", revalidateAccess);
      window.removeEventListener("focus", revalidateAccess);
    };
  }, [refreshAccessForUser, user]);

  const value = useMemo<AuthContextValue>(() => ({
    isConfigured: isSupabaseConfigured,
    loading,
    session,
    user,
    access,
    isActivated: access.hasEntitlement,
    signIn,
    signUp,
    signOut,
    redeemActivationCode,
    requestPasswordReset,
    updatePassword,
    refreshAccess,
  }), [access, loading, refreshAccess, redeemActivationCode, requestPasswordReset, session, signIn, signOut, signUp, updatePassword, user]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used inside AuthProvider");
  }
  return context;
}
