import { KeyRound, LogIn } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { V93InlineNotice, V93PasswordField } from "../components/V93InteractionPrimitives";
import { useAuth } from "../auth/AuthContext";
import { SupabaseSetupRequired } from "../auth/ProtectedRoute";
import { announceInteractionFeedback } from "../lib/interactionFeedback";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isConfigured, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [redirecting, setRedirecting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isAdmin = searchParams.get("admin") === "1";

  useEffect(() => {
    if (!redirecting) return;
    const timer = window.setTimeout(() => {
      navigate("/auth", { replace: true, state: isAdmin ? { returnTo: "/admin" } : undefined });
    }, 1100);
    return () => window.clearTimeout(timer);
  }, [isAdmin, navigate, redirecting]);

  if (!isConfigured) {
    return <SupabaseSetupRequired />;
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setMessage(null);
    setError(null);

    try {
      if (password !== confirmPassword) throw new Error("兩次輸入的新密碼不一致。");
      await updatePassword(password);
      const successMessage = "密碼已更新，正在回到登入頁。";
      setMessage(successMessage);
      setRedirecting(true);
      announceInteractionFeedback(successMessage, "success", 3200);
    } catch (resetError: unknown) {
      const errorMessage = resetError instanceof Error ? resetError.message : "更新密碼失敗。請確認你是從重設密碼信的連結進入。";
      setError(errorMessage);
      announceInteractionFeedback(errorMessage, "error", 4600);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack auth-page">
      <GlassCard className="auth-card auth-card-polished">
        <div className="auth-card-header">
          <div className="auth-page-icon" aria-hidden="true">
            <KeyRound size={24} />
          </div>
          <div>
            <p className="eyebrow">New Password</p>
            <h1>設定新密碼</h1>
            <p>請輸入新的密碼。完成後會回到登入頁。</p>
          </div>
        </div>

        <form className="auth-form" aria-busy={submitting || redirecting} onSubmit={(event) => void handleSubmit(event)}>
          <V93PasswordField label="新密碼" name="new-password" autoComplete="new-password" value={password} required minLength={6} disabled={submitting || redirecting} invalid={Boolean(error)} hint="至少 6 個字元；建議使用與其他網站不同的密碼。" onChange={(event) => setPassword(event.currentTarget.value)} placeholder="至少 6 個字元" />

          <V93PasswordField label="再次輸入新密碼" name="confirm-password" autoComplete="new-password" value={confirmPassword} required minLength={6} disabled={submitting || redirecting} invalid={Boolean(error) || Boolean(confirmPassword && password !== confirmPassword)} hint={confirmPassword && password !== confirmPassword ? "兩次輸入目前不一致。" : "請再輸入一次以確認。"} onChange={(event) => setConfirmPassword(event.currentTarget.value)} placeholder="再輸入一次新密碼" />

          {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
          {message ? <V93InlineNotice tone="success">{message}</V93InlineNotice> : null}

          <GlassButton type="submit" variant="primary" className="auth-submit-button" busy={submitting || redirecting} disabled={submitting || redirecting || password.length < 6 || password !== confirmPassword}>
            <KeyRound aria-hidden="true" size={18} />
            <span>{redirecting ? "即將返回登入頁" : submitting ? "更新中" : "更新密碼"}</span>
          </GlassButton>
        </form>

        <button type="button" className="auth-admin-entry" disabled={submitting || redirecting} onClick={() => navigate("/auth", { state: isAdmin ? { returnTo: "/admin" } : undefined })}>
          <LogIn aria-hidden="true" size={18} />
          <span>回登入頁</span>
        </button>
      </GlassCard>
    </div>
  );
}
