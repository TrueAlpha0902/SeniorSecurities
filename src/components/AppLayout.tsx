import { ArrowLeft, Calculator, Home, Settings, UserRound } from "lucide-react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { SettingsPanel } from "./SettingsPanel";
import { CalculatorModal } from "./CalculatorModal";
import { useAuth } from "../auth/AuthContext";

import "../styles/premium-liquid-v67.css";
import "../styles/premium-navy-v68.css";
import "../styles/premium-navy-v69.css";

type AppLayoutProps = {
  children: ReactNode;
};

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const isHome = location.pathname === "/";
  const { isConfigured, user } = useAuth();
  const isImageQuiz = location.pathname.startsWith("/image-quiz") || location.pathname === "/trial";

  function navigateWithQuizGuard(continueNavigation: () => void): void {
    const event = new CustomEvent("quiz:navigation-attempt", {
      cancelable: true,
      detail: { continueNavigation },
    });
    const shouldContinue = window.dispatchEvent(event);
    if (shouldContinue) {
      continueNavigation();
    }
  }

  return (
    <div className={`glass-page ${isImageQuiz ? "image-quiz-layout" : ""}`}>
      <header className="glass-navbar">
        <div className="nav-actions">
          {!isHome ? (
            <button
              type="button"
              className="nav-icon-button"
              onClick={() => navigateWithQuizGuard(() => navigate(-1))}
              aria-label={"\u4e0a\u4e00\u9801"}
              title={"\u4e0a\u4e00\u9801"}
            >
              <ArrowLeft aria-hidden="true" size={22} />
            </button>
          ) : null}
          <button
            type="button"
            className="nav-icon-button"
            onClick={() => navigateWithQuizGuard(() => navigate("/"))}
            aria-label={"\u9996\u9801"}
            title={"\u9996\u9801"}
          >
            <Home aria-hidden="true" size={22} />
          </button>
          <button
            type="button"
            className="nav-icon-button"
            onClick={() => setCalculatorOpen(true)}
            aria-label="計算機"
            title="計算機"
          >
            <Calculator aria-hidden="true" size={22} />
          </button>
          <button
            type="button"
            className="nav-icon-button"
            onClick={() => setSettingsOpen(true)}
            aria-label={"\u8a2d\u5b9a"}
            title={"\u8a2d\u5b9a"}
          >
            <Settings aria-hidden="true" size={22} />
          </button>
          {isConfigured ? (
            <button
              type="button"
              className="nav-icon-button nav-member-button"
              onClick={() => navigateWithQuizGuard(() => navigate(user ? "/account" : "/auth"))}
              aria-label={user ? "會員中心" : "會員登入"}
              title={user ? "會員中心" : "會員登入"}
            >
              <UserRound aria-hidden="true" size={22} />
            </button>
          ) : null}
        </div>
        <button type="button" className="brand-link" onClick={() => navigateWithQuizGuard(() => navigate("/"))}>
          {"\u8b49\u5238\u9ad8\u696d"}
        </button>
      </header>
      <main className={`glass-shell ${isImageQuiz ? "image-shell" : ""}`}>{children}</main>
      <SettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} />
      <CalculatorModal open={calculatorOpen} onClose={() => setCalculatorOpen(false)} />
    </div>
  );
}
