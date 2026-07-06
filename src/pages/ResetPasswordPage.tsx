import { KeyRound, LogIn } from "lucide-react";
import { type FormEvent, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { useAuth } from "../auth/AuthContext";
import { SupabaseSetupRequired } from "../auth/ProtectedRoute";

export function ResetPasswordPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const { isConfigured, updatePassword } = useAuth();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
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
      if (password !== confirmPassword) throw new Error("兩次輸入的新密碼不一致。");
      await updatePassword(password);
      setMessage("密碼已更新。請用新密碼重新登入。 ");
      setTimeout(() => {
        navigate("/auth", { replace: true, state: isAdmin ? { returnTo: "/admin" } : undefined });
      }, 900);
    } catch (resetError: unknown) {
      setError(resetError instanceof Error ? resetError.message : "更新密碼失敗。請確認你是從重設密碼信的連結進入。 ");
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

        <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>新密碼</span>
            <input
              type="password"
              autoComplete="new-password"
              value={password}
              required
              minLength={6}
              onChange={(event) => setPassword(event.currentTarget.value)}
              placeholder="至少 6 個字元"
            />
          </label>

          <label>
            <span>再次輸入新密碼</span>
            <input
              type="password"
              autoComplete="new-password"
              value={confirmPassword}
              required
              minLength={6}
              onChange={(event) => setConfirmPassword(event.currentTarget.value)}
              placeholder="再輸入一次新密碼"
            />
          </label>

          {error ? <p className="form-error">{error}</p> : null}
          {message ? <p className="form-success">{message}</p> : null}

          <GlassButton type="submit" variant="primary" className="auth-submit-button" disabled={submitting}>
            <KeyRound aria-hidden="true" size={18} />
            <span>{submitting ? "更新中" : "更新密碼"}</span>
          </GlassButton>
        </form>

        <button type="button" className="auth-admin-entry" onClick={() => navigate("/auth", { state: isAdmin ? { returnTo: "/admin" } : undefined })}>
          <LogIn aria-hidden="true" size={18} />
          <span>回登入頁</span>
        </button>
      </GlassCard>
    </div>
  );
}
