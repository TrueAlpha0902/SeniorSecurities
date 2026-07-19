import { ArrowLeft, Calculator, Home, Settings, UserRound } from "lucide-react";
import { Suspense, type ReactNode, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import "../styles/theme-current.css";
import { lazyWithRetry } from "../lib/lazyWithRetry";


const loadSettingsPanel = () => import("./SettingsPanel");
const loadCalculatorModal = () => import("./CalculatorModal");

const LazySettingsPanel = lazyWithRetry(() =>
  loadSettingsPanel().then((module) => ({ default: module.SettingsPanel })),
);
const LazyCalculatorModal = lazyWithRetry(() =>
  loadCalculatorModal().then((module) => ({ default: module.CalculatorModal })),
);

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
  const isImageQuiz =
    location.pathname.startsWith("/image-quiz") ||
    location.pathname === "/trial";

  function navigateWithQuizGuard(continueNavigation: () => void): void {
    const event = new CustomEvent("quiz:navigation-attempt", {
      cancelable: true,
      detail: { continueNavigation },
    });
    const shouldContinue = window.dispatchEvent(event);
    if (shouldContinue) continueNavigation();
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
              aria-label="上一頁"
              title="上一頁"
            >
              <ArrowLeft aria-hidden="true" size={22} />
            </button>
          ) : null}
          <button
            type="button"
            className="nav-icon-button"
            onClick={() => navigateWithQuizGuard(() => navigate("/"))}
            aria-label="首頁"
            title="首頁"
          >
            <Home aria-hidden="true" size={22} />
          </button>
          <button
            type="button"
            className="nav-icon-button"
            onPointerEnter={() => void loadCalculatorModal()}
            onFocus={() => void loadCalculatorModal()}
            onClick={() => setCalculatorOpen(true)}
            aria-label="計算機"
            title="計算機"
          >
            <Calculator aria-hidden="true" size={22} />
          </button>
          <button
            type="button"
            className="nav-icon-button"
            onPointerEnter={() => void loadSettingsPanel()}
            onFocus={() => void loadSettingsPanel()}
            onClick={() => setSettingsOpen(true)}
            aria-label="設定"
            title="設定"
          >
            <Settings aria-hidden="true" size={22} />
          </button>
          {isConfigured ? (
            <button
              type="button"
              className="nav-icon-button nav-member-button"
              onClick={() =>
                navigateWithQuizGuard(() =>
                  navigate(user ? "/account" : "/auth"),
                )
              }
              aria-label={user ? "會員中心" : "會員登入"}
              title={user ? "會員中心" : "會員登入"}
            >
              <UserRound aria-hidden="true" size={22} />
            </button>
          ) : null}
        </div>
        <button
          type="button"
          className="brand-link"
          onClick={() => navigateWithQuizGuard(() => navigate("/"))}
        >
          金融證照題庫
        </button>
      </header>
      <main className={`glass-shell ${isImageQuiz ? "image-shell" : ""}`}>
        {children}
      </main>
      {settingsOpen ? (
        <Suspense fallback={null}>
          <LazySettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
          />
        </Suspense>
      ) : null}
      {calculatorOpen ? (
        <Suspense fallback={null}>
          <LazyCalculatorModal
            open={calculatorOpen}
            onClose={() => setCalculatorOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
