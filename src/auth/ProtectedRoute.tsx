import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { useAuth } from "./AuthContext";

type ProtectedRouteProps = {
  children: ReactNode;
  requireActivation?: boolean;
};

export function ProtectedRoute({ children, requireActivation = true }: ProtectedRouteProps) {
  const location = useLocation();
  const { access, isConfigured, loading, user } = useAuth();

  if (!isConfigured) {
    return <SupabaseSetupRequired />;
  }

  if (loading) {
    return <LoadingState label="檢查會員狀態" />;
  }

  if (!user) {
    return <Navigate to="/auth" replace state={{ returnTo: location.pathname }} />;
  }

  if (access.error) {
    return <AccessState title="無法確認會員權限" message={access.error} actionLabel="前往啟用" actionTo="/activate" />;
  }

  if (requireActivation && !access.hasEntitlement) {
    return <Navigate to="/activate" replace state={{ returnTo: location.pathname }} />;
  }

  return <>{children}</>;
}

export function SupabaseSetupRequired() {
  return (
    <div className="page-stack">
      <GlassCard className="state-card auth-state-card">
        <p className="eyebrow">Setup Required</p>
        <h1>尚未設定 Supabase</h1>
        <p>
          這個版本已加入登入與啟用碼。請先建立 Supabase 專案，然後在本機與 Vercel 設定
          <code> VITE_SUPABASE_URL </code> 和 <code> VITE_SUPABASE_PUBLISHABLE_KEY </code>。
        </p>
        <GlassLinkButton to="/" variant="secondary">回首頁</GlassLinkButton>
      </GlassCard>
    </div>
  );
}

function AccessState({ title, message, actionLabel, actionTo }: { title: string; message: string; actionLabel: string; actionTo: string }) {
  return (
    <div className="page-stack">
      <GlassCard className="state-card auth-state-card">
        <p className="eyebrow">Access Control</p>
        <h1>{title}</h1>
        <p>{message}</p>
        <GlassLinkButton to={actionTo} variant="primary">{actionLabel}</GlassLinkButton>
      </GlassCard>
    </div>
  );
}
