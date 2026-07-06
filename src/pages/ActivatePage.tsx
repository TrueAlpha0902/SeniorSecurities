import { KeyRound, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { useAuth } from "../auth/AuthContext";
import { SupabaseSetupRequired } from "../auth/ProtectedRoute";

type ReturnState = {
  returnTo?: string;
};

export function ActivatePage() {
  const location = useLocation();
  const { isActivated, isConfigured, loading, redeemActivationCode, user } = useAuth();
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const returnTo = (location.state as ReturnState | null)?.returnTo ?? "/";

  if (!isConfigured) return <SupabaseSetupRequired />;
  if (loading) return <LoadingState label="檢查帳號" />;
  if (!user) return <Navigate to="/auth" replace state={{ returnTo: "/activate" }} />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    setMessage(null);

    try {
      await redeemActivationCode(code);
      setMessage("啟用成功，完整題庫已綁定到你的帳號。");
      setCode("");
    } catch (activationError: unknown) {
      setError(activationError instanceof Error ? activationError.message : "啟用失敗，請確認啟用碼是否正確。 ");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack auth-page">
      <GlassCard className="auth-card">
        <p className="eyebrow">Activation</p>
        <h1>啟用完整題庫</h1>
        <p>輸入你收到的啟用碼。啟用後為永久授權，可在不同裝置登入同一帳號使用。</p>

        {isActivated ? (
          <div className="activation-success-box">
            <ShieldCheck aria-hidden="true" size={28} />
            <div>
              <h2>這個帳號已開通</h2>
              <p>完整題庫權限已綁定到這個帳號。</p>
            </div>
          </div>
        ) : (
          <form className="auth-form" onSubmit={(event) => void handleSubmit(event)}>
            <label>
              <span>啟用碼</span>
              <input
                type="text"
                value={code}
                required
                onChange={(event) => setCode(event.currentTarget.value.toUpperCase())}
                placeholder="SENIOR-XXXX-XXXX"
                autoComplete="one-time-code"
              />
            </label>
            {error ? <p className="form-error">{error}</p> : null}
            {message ? <p className="form-success">{message}</p> : null}
            <GlassButton type="submit" variant="primary" disabled={submitting}>
              <KeyRound aria-hidden="true" size={18} />
              <span>{submitting ? "啟用中" : "啟用帳號"}</span>
            </GlassButton>
          </form>
        )}

        <div className="button-row">
          <GlassLinkButton to={returnTo} variant="primary">回到原頁面</GlassLinkButton>
          <GlassLinkButton to="/account" variant="secondary">查看帳號</GlassLinkButton>
        </div>
      </GlassCard>
    </div>
  );
}
