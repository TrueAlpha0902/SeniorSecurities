import { KeyRound, ShieldCheck } from "lucide-react";
import { type FormEvent, useState } from "react";
import { Navigate, useLocation, useSearchParams } from "react-router-dom";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { V93InlineNotice } from "../components/V93InteractionPrimitives";
import { useAuth, type ExamId } from "../auth/AuthContext";
import { SupabaseSetupRequired } from "../auth/ProtectedRoute";
import { announceInteractionFeedback } from "../lib/interactionFeedback";

type ReturnState = { returnTo?: string };

const EXAM_LABELS: Record<ExamId, string> = {
  "senior-securities": "證券高業",
  "junior-foreign-exchange": "初階外匯",
};

function parseExamId(value: string | null): ExamId {
  return value === "junior-foreign-exchange" ? value : "senior-securities";
}

export function ActivatePage() {
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const examId = parseExamId(searchParams.get("exam"));
  const { getExamAccess, isConfigured, loading, redeemActivationCode, user } = useAuth();
  const access = getExamAccess(examId);
  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const returnTo = (location.state as ReturnState | null)?.returnTo ?? "/";

  if (!isConfigured) return <SupabaseSetupRequired />;
  if (loading) return <LoadingState label="檢查帳號" />;
  if (!user) return <Navigate to="/auth" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    const normalizedCode = code.trim().toUpperCase();
    if (!normalizedCode) {
      const nextError = "請輸入啟用碼。";
      setError(nextError);
      announceInteractionFeedback(nextError, "warning", 2800);
      return;
    }

    setSubmitting(true);
    setError(null);
    setMessage(null);
    try {
      await redeemActivationCode(normalizedCode);
      const nextMessage = `${EXAM_LABELS[examId]}已啟用。`;
      setMessage(nextMessage);
      setCode("");
      announceInteractionFeedback(nextMessage, "success", 3400);
    } catch (activationError: unknown) {
      const nextError = activationError instanceof Error
        ? activationError.message
        : "啟用失敗，請確認啟用碼。";
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4400);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="page-stack auth-page">
      <GlassCard className="auth-card">
        <h1>啟用{EXAM_LABELS[examId]}</h1>

        {access.hasEntitlement ? (
          <div className="activation-success-box">
            <ShieldCheck aria-hidden="true" size={28} />
            <div><h2>已開通</h2></div>
          </div>
        ) : (
          <form className="auth-form" aria-busy={submitting || undefined} onSubmit={(event) => void handleSubmit(event)}>
            <label>
              <span>啟用碼</span>
              <input
                type="text"
                value={code}
                required
                disabled={submitting}
                aria-invalid={Boolean(error) || undefined}
                aria-describedby={error ? "activation-error" : message ? "activation-success" : undefined}
                onChange={(event) => {
                  setCode(event.currentTarget.value.toUpperCase().slice(0, 64));
                  if (error) setError(null);
                }}
                placeholder={examId === "junior-foreign-exchange" ? "FOREX-XXXX-XXXX" : "SENIOR-XXXX-XXXX"}
                autoComplete="one-time-code"
              />
            </label>
            {error ? <V93InlineNotice id="activation-error" tone="error">{error}</V93InlineNotice> : null}
            {message ? <V93InlineNotice id="activation-success" tone="success">{message}</V93InlineNotice> : null}
            <GlassButton
              type="submit"
              variant="primary"
              busy={submitting}
              disabled={submitting || !code.trim()}
            >
              <KeyRound aria-hidden="true" size={18} />
              <span>{submitting ? "啟用中" : "啟用"}</span>
            </GlassButton>
          </form>
        )}

        <div className="button-row">
          <GlassLinkButton to={returnTo} variant="primary">返回</GlassLinkButton>
          <GlassLinkButton to="/" variant="secondary">所有題庫</GlassLinkButton>
        </div>
      </GlassCard>
    </div>
  );
}
