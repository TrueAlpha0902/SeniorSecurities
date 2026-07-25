import { ArrowLeft, MailCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { V93InlineNotice } from "../components/V93InteractionPrimitives";
import { useAuth } from "../auth/AuthContext";
import { SupabaseSetupRequired } from "../auth/ProtectedRoute";
import { announceInteractionFeedback } from "../lib/interactionFeedback";

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
    return "寄信服務目前已達限制。請稍後再試；若持續發生，請聯絡管理員確認 SMTP 設定。";
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
      const successMessage = "已寄出重設密碼信。請檢查收件匣與垃圾郵件。";
      setMessage(successMessage);
      announceInteractionFeedback(successMessage, "success", 4200);
    } catch (resetError: unknown) {
      const errorMessage = getFriendlyResetError(resetError);
      setError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 5000);
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

          {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
          {message ? <V93InlineNotice tone="success">{message}</V93InlineNotice> : null}

          <GlassButton type="submit" variant="primary" className="auth-submit-button" busy={submitting} disabled={submitting || !email.trim()}>
            <MailCheck aria-hidden="true" size={18} />
            <span>{submitting ? "寄送中" : "寄送重設密碼信"}</span>
          </GlassButton>
        </form>

        <button type="button" className="auth-admin-entry" disabled={submitting} onClick={() => navigate("/auth", { state: isAdmin ? { returnTo: "/admin" } : undefined })}>
          <ArrowLeft aria-hidden="true" size={18} />
          <span>回登入頁</span>
        </button>
      </GlassCard>
    </div>
  );
}
