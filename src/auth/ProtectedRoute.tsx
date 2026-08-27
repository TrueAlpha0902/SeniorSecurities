import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { ActivationSupport } from "../components/ActivationSupport";
import { useAuth, type ExamId } from "./AuthContext";

type ProtectedRouteProps = {
  children: ReactNode;
  requireActivation?: boolean;
  examId?: ExamId;
};

export function ProtectedRoute({
  children,
  requireActivation = true,
  examId = "senior-securities",
}: ProtectedRouteProps) {
  const location = useLocation();
  const { getExamAccess, isConfigured, loading, user } = useAuth();
  const access = getExamAccess(examId);

  if (!isConfigured) return <SupabaseSetupRequired />;
  if (loading) return <LoadingState label="檢查會員狀態" />;
  if (!user) return <Navigate to="/auth" replace state={{ returnTo: `${location.pathname}${location.search}` }} />;

  if (requireActivation && access.error) {
    return (
      <AccessState
        title="無法確認題庫權限"
        message={access.error}
        actionLabel="前往啟用"
        actionTo={`/activate?exam=${examId}`}
      />
    );
  }

  if (requireActivation && !access.hasEntitlement) {
    return (
      <Navigate
        to={`/activate?exam=${examId}`}
        replace
        state={{ returnTo: `${location.pathname}${location.search}` }}
      />
    );
  }

  return <>{children}</>;
}

export function SupabaseSetupRequired() {
  return (
    <div className="page-stack">
      <GlassCard className="state-card auth-state-card">
        <p className="eyebrow">Setup Required</p>
        <h1>尚未設定 Supabase</h1>
        <p>請先設定 VITE_SUPABASE_URL 與 VITE_SUPABASE_PUBLISHABLE_KEY。</p>
        <GlassLinkButton to="/" variant="secondary">回首頁</GlassLinkButton>
      </GlassCard>
    </div>
  );
}

function AccessState({ title, message, actionLabel, actionTo }: { title: string; message: string; actionLabel: string; actionTo: string }) {
  return (
    <div className="page-stack">
      <GlassCard className="state-card auth-state-card">
        <h1>{title}</h1>
        <p>{message}</p>
        <ActivationSupport />
        <GlassLinkButton to={actionTo} variant="primary">{actionLabel}</GlassLinkButton>
      </GlassCard>
    </div>
  );
}
