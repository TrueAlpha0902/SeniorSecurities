import {
  ArrowLeft,
  Calculator,
  Home,
  Settings,
  UserRound,
} from "lucide-react";
import {
  Suspense,
  type ReactNode,
  useEffect,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import {
  OPEN_SETTINGS_EVENT,
  type OpenSettingsDetail,
} from "../lib/settingsNavigation";
import { ModalLoadingFallback } from "./ModalLoadingFallback";
import "../styles/theme-current.css";

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
  const [settingsRequest, setSettingsRequest] = useState<OpenSettingsDetail>({});
  const [settingsRequestKey, setSettingsRequestKey] = useState(0);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const { isConfigured, user } = useAuth();

  const isHome = ["/", "/securities", "/foreign-exchange"].includes(
    location.pathname,
  );
  const isQuizRoute =
    location.pathname.startsWith("/image-quiz") ||
    location.pathname.startsWith("/foreign-exchange/practice") ||
    location.pathname === "/trial";

  useEffect(() => {
    const handleOpenSettings = (event: Event) => {
      const detail = (event as CustomEvent<OpenSettingsDetail>).detail ?? {};
      void loadSettingsPanel();
      setSettingsRequest(detail);
      setSettingsRequestKey((value) => value + 1);
      setSettingsOpen(true);
    };

    window.addEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
    return () => window.removeEventListener(OPEN_SETTINGS_EVENT, handleOpenSettings);
  }, []);

  function navigateWithQuizGuard(continueNavigation: () => void): void {
    const event = new CustomEvent("quiz:navigation-attempt", {
      cancelable: true,
      detail: { continueNavigation },
    });
    if (window.dispatchEvent(event)) continueNavigation();
  }

  function openSettings(detail: OpenSettingsDetail = {}): void {
    void loadSettingsPanel();
    setSettingsRequest(detail);
    setSettingsRequestKey((value) => value + 1);
    setSettingsOpen(true);
  }

  return (
    <div className={`glass-page${isQuizRoute ? " image-quiz-layout" : ""}`}>
      <header className="glass-navbar" aria-label="主要導覽">
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
            onClick={() => openSettings()}
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

      <main className={`glass-shell${isQuizRoute ? " image-shell" : ""}`}>
        {children}
      </main>

      {settingsOpen ? (
        <Suspense fallback={<ModalLoadingFallback label="載入設定" />}>
          <LazySettingsPanel
            open={settingsOpen}
            onClose={() => setSettingsOpen(false)}
            initialSection={settingsRequest.section}
            initialPlanExamId={settingsRequest.planExamId}
            requestKey={settingsRequestKey}
          />
        </Suspense>
      ) : null}

      {calculatorOpen ? (
        <Suspense fallback={<ModalLoadingFallback label="載入計算機" />}>
          <LazyCalculatorModal
            open={calculatorOpen}
            onClose={() => setCalculatorOpen(false)}
          />
        </Suspense>
      ) : null}
    </div>
  );
}
