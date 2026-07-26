import { ArrowLeft, MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { useAuth } from "../auth/AuthContext";
import { SupabaseSetupRequired } from "../auth/ProtectedRoute";

const DEFAULT_SITE_ORIGIN = "https://senior-securities.vercel.app";

function trimTrailingSlash(value: string): string {
  return value.trim().replace(/\/+$/, "");
}

function getPasswordResetRedirectTo(isAdmin: boolean): string {
  const explicitRedirect = trimTrailingSlash(String(import.meta.env.VITE_PASSWORD_RESET_REDIRECT_URL || ""));
  const siteOrigin = trimTrailingSlash(String(import.meta.env.VITE_PUBLIC_SITE_URL || import.meta.env.VITE_SITE_URL || DEFAULT_SITE_ORIGIN));
  const baseUrl = explicitRedirect || `${siteOrigin}/reset-password`;
  return isAdmin ? `${baseUrl}${baseUrl.includes("?") ? "&" : "?"}admin=1` : baseUrl;
}

function getFriendlyResetError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  const normalized = message.toLowerCase();

  if (normalized.includes("rate limit")) {
    return "Supabase 內建寄信服務已達到限制。請約 1 小時後再試；正式上線建議設定自訂 SMTP，才不會被每小時 2 封的內建寄信限制卡住。";
  }

  return message || "寄送重設密碼信失敗，請稍後再試。";
}

export function ForgotPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isConfigured, requestPasswordReset } = useAuth();
  const [email, setEmail] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = searchParams.get("admin") === "1";

  if (!isConfigured) {
    return <SupabaseSetupRequired />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      await requestPasswordReset(email, getPasswordResetRedirectTo(isAdmin));
      setMessage("已寄出重設密碼信。請到信箱點擊連結後設定新密碼，也請檢查垃圾郵件。 ");
    } catch (resetError: unknown) {
      setError(getFriendlyResetError(resetError));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack auth-page">
      <GlassCard className="auth-card auth-card-polished">
        <div className="auth-card-header">
          <div className="auth-page-icon" aria-hidden="true">
            <MailCheck size={24} />
          </div>
          <div>
            <p className="eyebrow">Password Reset</p>
            <h1>{isAdmin ? "管理員忘記密碼" : "忘記密碼"}</h1>
            <p>輸入帳號 Email，系統會寄送一封重設密碼信。你不用知道原本的密碼。</p>
          </div>
        </div>

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>Email</span>
            <input
              type="email"
              autoComplete="email"
              value={email}
              required
              onChange={(event) => setEmail(event.currentTarget.value)}
              placeholder="you@example.com"
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="form-success">{message}</p> : null}

          <GlassButton type="submit" variant="primary" className="auth-submit-button" disabled={submitting}>
            <MailCheck aria-hidden="true" size={18} />
            <span>{submitting ? "寄送中" : "寄送重設密碼信"}</span>
          </GlassButton>
        </form>

        <button type="button" className="auth-admin-entry" onClick={() => navigate("/auth", { state: isAdmin ? { returnTo: "/admin" } : undefined })}>
          <ArrowLeft aria-hidden="true" size={18} />
          <span>回登入頁</span>
        </button>
      </GlassCard>
    </div>
  );
}
