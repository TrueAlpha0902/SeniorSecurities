import { KeyRound, LogIn, ShieldCheck, UserPlus } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { V93InlineNotice, V93PasswordField } from "../components/V93InteractionPrimitives";
import { useAuth } from "../auth/AuthContext";
import { SupabaseSetupRequired } from "../auth/ProtectedRoute";
import { announceInteractionFeedback } from "../lib/interactionFeedback";

type AuthMode = "signIn" | "signUp";

const REMEMBERED_EMAIL_KEY = "truealpha:remembered-login-email";

type ReturnState = {
  returnTo?: string;
};

export function AuthPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { access, isActivated, isConfigured, loading: authLoading, signIn, signUp, user } = useAuth();
  const [mode, setMode] = useState<AuthMode>("signIn");
  const [email, setEmail] = useState(() => {
    if (typeof window === "undefined") return "";
    return window.localStorage.getItem(REMEMBERED_EMAIL_KEY) ?? "";
  });
  const [password, setPassword] = useState("");
  const [rememberEmail, setRememberEmail] = useState(() => {
    if (typeof window === "undefined") return false;
    return Boolean(window.localStorage.getItem(REMEMBERED_EMAIL_KEY));
  });
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const returnTo = (location.state as ReturnState | null)?.returnTo ?? "/";
  const isSignIn = mode === "signIn";
  const isAdminReturn = returnTo.startsWith("/admin");

  useEffect(() => {
    if (authLoading || !user) return;

    if (isAdminReturn) {
      navigate(returnTo, { replace: true });
      return;
    }

    if (isActivated) {
      navigate(returnTo, { replace: true });
      return;
    }

    if (!access.hasEntitlement) {
      navigate("/activate", { replace: true, state: { returnTo } });
    }
  }, [access.hasEntitlement, authLoading, isActivated, isAdminReturn, navigate, returnTo, user]);

  if (!isConfigured) {
    return <SupabaseSetupRequired />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      if (isSignIn) {
        const normalizedEmail = email.trim();
        await signIn(normalizedEmail, password);
        if (rememberEmail) {
          window.localStorage.setItem(REMEMBERED_EMAIL_KEY, normalizedEmail);
        } else {
          window.localStorage.removeItem(REMEMBERED_EMAIL_KEY);
        }
        const successMessage = isAdminReturn ? "登入成功，正在前往管理後台。" : "登入成功，正在檢查會員權限。";
        setMessage(successMessage);
        announceInteractionFeedback(successMessage, "success");
      } else {
        const signUpMessage = await signUp(email.trim(), password);
        const successMessage = signUpMessage ?? "帳號建立成功，正在前往啟用頁。";
        setMessage(successMessage);
        announceInteractionFeedback(successMessage, "success", 3600);
      }
    } catch (authError: unknown) {
      const errorMessage = authError instanceof Error ? authError.message : "登入或註冊失敗，請稍後再試。";
      setError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4200);
    } finally {
      setSubmitting(false);
    }
  }

  function goAdminLogin(): void {
    setMode("signIn");
    setError(null);
    setMessage(null);
    navigate("/auth", { state: { returnTo: "/admin" } });
  }

  return (
    <div className="page-stack auth-page">
      <GlassCard className="auth-card auth-card-polished">
        <div className="auth-card-header">
          <div className="auth-page-icon" aria-hidden="true">
            <KeyRound size={24} />
          </div>
          <div>
            <p className="eyebrow">{isAdminReturn ? "Admin Login" : "Member Account"}</p>
            <h1>{isAdminReturn ? "管理員登入" : isSignIn ? "會員登入" : "建立會員帳號"}</h1>
            <p>{isAdminReturn ? "請用管理員 Email 登入。" : "登入後輸入啟用碼即可永久開通完整題庫。未開通帳號仍可使用 10 題試用。"}</p>
          </div>
        </div>

        {!isAdminReturn ? (
          <div className="auth-mode-toggle" role="tablist" aria-label="切換登入或註冊">
            <button
              type="button"
              role="tab"
              aria-selected={isSignIn}
              tabIndex={isSignIn ? 0 : -1}
              className={isSignIn ? "is-selected" : ""}
              disabled={submitting}
              onClick={() => {
                setMode("signIn");
                setError(null);
                setMessage(null);
              }}
            >
              登入
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={!isSignIn}
              tabIndex={!isSignIn ? 0 : -1}
              className={!isSignIn ? "is-selected" : ""}
              disabled={submitting}
              onClick={() => {
                setMode("signUp");
                setError(null);
                setMessage(null);
              }}
            >
              註冊
            </button>
          </div>
        ) : null}

        <form className="auth-form" aria-busy={submitting} onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              required
              disabled={submitting}
              aria-invalid={Boolean(error) || undefined}
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@example.com"
            />
          </label>

          <V93PasswordField
            label="密碼"
            name="password"
            autoComplete={isSignIn ? "current-password" : "new-password"}
            value={password}
            required
            minLength={6}
            disabled={submitting}
            invalid={Boolean(error)}
            hint={!isSignIn ? "至少 6 個字元；請避免使用其他網站相同的密碼。" : undefined}
            onChange={(event) => setPassword(event.currentTarget.value)}
            placeholder="至少 6 個字元"
          />

          {isSignIn ? (
            <label className="remember-account-row">
              <input
                type="checkbox"
                checked={rememberEmail}
                disabled={submitting}
                onChange={(event) => setRememberEmail(event.currentTarget.checked)}
              />
              <span>記住帳號</span>
            </label>
          ) : null}

          {isSignIn ? (
            <button
              type="button"
              className="auth-forgot-link"
              disabled={submitting}
              onClick={() => navigate(isAdminReturn ? "/forgot-password?admin=1" : "/forgot-password")}
            >
              忘記密碼？
            </button>
          ) : null}

          {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
          {message ? <V93InlineNotice tone="success">{message}</V93InlineNotice> : null}

          <GlassButton type="submit" variant="primary" className="auth-submit-button" busy={submitting} disabled={submitting || !email.trim() || password.length < 6}>
            {isSignIn ? <LogIn aria-hidden="true" size={18} /> : <UserPlus aria-hidden="true" size={18} />}
            <span>{submitting ? "處理中" : isSignIn ? isAdminReturn ? "登入管理後台" : "登入帳號" : "建立帳號"}</span>
          </GlassButton>
        </form>

        {!isAdminReturn ? (
          <button type="button" className="auth-admin-entry" disabled={submitting} onClick={goAdminLogin}>
            <ShieldCheck aria-hidden="true" size={18} />
            <span>管理員登入</span>
          </button>
        ) : null}
      </GlassCard>
    </div>
  );
}
