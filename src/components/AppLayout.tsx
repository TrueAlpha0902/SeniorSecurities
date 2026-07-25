import {
  ArrowLeft,
  BarChart3,
  BookOpen,
  Calculator,
  CalendarRange,
  ClipboardX,
  Home,
  LogOut,
  Menu,
  PieChart,
  Search,
  Settings2,
  Star,
  TimerReset,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  Suspense,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext";
import { lazyWithRetry } from "../lib/lazyWithRetry";
import { scrollToHashTarget } from "./HashScrollManager";
import {
  OPEN_SETTINGS_EVENT,
  type OpenSettingsDetail,
} from "../lib/settingsNavigation";
import { type ExamBrandKind } from "./ExamBrandMark";
import { V93BrandLockup } from "./V93VisualMaterials";
import { ModalLoadingFallback } from "./ModalLoadingFallback";
import { SketchPinnedNoteArt } from "./SketchIllustrations";
import "../styles/theme-current.css";
import "../styles/theme-v90.css";
import "../styles/theme-v91.css";
import "../styles/theme-v93.css";

const loadSettingsPanel = () => import("./SettingsPanel");
const loadCalculatorModal = () => import("./CalculatorModal");

const LazySettingsPanel = lazyWithRetry(() =>
  loadSettingsPanel().then((module) => ({ default: module.SettingsPanel })),
);
const LazyCalculatorModal = lazyWithRetry(() =>
  loadCalculatorModal().then((module) => ({ default: module.CalculatorModal })),
);

type AppLayoutProps = { children: ReactNode };
type ExamId = "senior-securities" | "junior-foreign-exchange";
type RouteContext = { title: string; parent?: string; examId?: ExamId };
type BrandCopy = {
  primary: string;
  secondary: string;
  menuTitle: string;
  menuSubtitle: string;
  ariaLabel: string;
  logoKind: ExamBrandKind;
};

type NavItem = {
  id: "home" | "bank" | "mock" | "wrong" | "favorites";
  label: string;
  destination: string;
  icon: LucideIcon;
};

const BANK_TITLES: Record<string, string> = {
  investment: "投資學",
  "financial-analysis": "財務分析",
  "securities-laws-practice": "證券相關法規與實務",
  "securities-trading-regulations": "證券相關法規與實務",
  "securities-trading-practice": "證券相關法規與實務",
};

function brandCopy(examId?: ExamId): BrandCopy {
  if (examId === "junior-foreign-exchange") {
    return {
      primary: "初階外匯",
      secondary: "測驗題庫",
      menuTitle: "初階外匯",
      menuSubtitle: "測驗題庫",
      ariaLabel: "初階外匯首頁",
      logoKind: "foreign-exchange",
    };
  }
  if (examId === "senior-securities") {
    return {
      primary: "證券高業",
      secondary: "測驗題庫",
      menuTitle: "證券高業",
      menuSubtitle: "測驗題庫",
      ariaLabel: "證券高業首頁",
      logoKind: "securities",
    };
  }
  return {
    primary: "金融證照",
    secondary: "學習中心",
    menuTitle: "金融證照",
    menuSubtitle: "學習中心",
    ariaLabel: "金融證照題庫首頁",
    logoKind: "certificate",
  };
}

function routeContext(pathname: string): RouteContext {
  if (pathname === "/") return { title: "金融證照題庫" };
  if (pathname === "/search") return { title: "搜尋題目" };
  if (pathname === "/account") return { title: "會員中心" };
  if (pathname === "/admin") return { title: "管理後台" };
  if (pathname.startsWith("/foreign-exchange/practice")) {
    return {
      title: "題目練習",
      parent: "初階外匯",
      examId: "junior-foreign-exchange",
    };
  }
  if (pathname.startsWith("/foreign-exchange")) {
    return { title: "初階外匯", examId: "junior-foreign-exchange" };
  }
  if (pathname.startsWith("/banks/")) {
    const bankId = decodeURIComponent(pathname.split("/")[2] || "");
    return {
      title: BANK_TITLES[bankId] || "科目章節",
      parent: "證券高業",
      examId: "senior-securities",
    };
  }
  if (pathname.startsWith("/image-quiz") || pathname === "/trial") {
    return {
      title: pathname.includes("random") ? "模擬考" : "題目練習",
      parent: "證券高業",
      examId: "senior-securities",
    };
  }
  if (
    pathname.startsWith("/random") ||
    pathname.startsWith("/similar") ||
    pathname.startsWith("/answer-drill") ||
    pathname.startsWith("/leaderboard")
  ) {
    return {
      title: pathname.startsWith("/random")
        ? "模擬考"
        : pathname.startsWith("/similar")
          ? "相似題"
          : pathname.startsWith("/leaderboard")
            ? "成績報表"
            : "正解練習",
      parent: "證券高業",
      examId: "senior-securities",
    };
  }
  if (pathname.startsWith("/securities")) {
    return { title: "證券高業", examId: "senior-securities" };
  }
  return { title: "金融證照題庫" };
}

function examNavigation(examId: ExamId): NavItem[] {
  if (examId === "junior-foreign-exchange") {
    return [
      { id: "home", label: "首頁", destination: "/foreign-exchange", icon: Home },
      { id: "bank", label: "題庫練習", destination: "/foreign-exchange#learning-path", icon: BookOpen },
      { id: "mock", label: "模擬考", destination: "/foreign-exchange#fx-history", icon: TimerReset },
      { id: "wrong", label: "我的錯題", destination: "/foreign-exchange/practice?mode=wrong", icon: ClipboardX },
      { id: "favorites", label: "收藏夾", destination: "/foreign-exchange/practice?mode=favorites", icon: Star },
    ];
  }
  return [
    { id: "home", label: "首頁", destination: "/securities", icon: Home },
    { id: "bank", label: "題庫練習", destination: "/securities#learning-path", icon: BookOpen },
    { id: "mock", label: "模擬考", destination: "/random", icon: TimerReset },
    { id: "wrong", label: "我的錯題", destination: "/image-quiz/wrong", icon: ClipboardX },
    { id: "favorites", label: "收藏夾", destination: "/image-quiz/favorites", icon: Star },
  ];
}


function activeNavItem(pathname: string, search: string): NavItem["id"] | null {
  if (pathname === "/securities" || pathname === "/foreign-exchange") return "home";
  if (pathname.startsWith("/banks/")) return "bank";
  if (pathname === "/random" || search.includes("mode=mock")) return "mock";
  if (pathname.includes("wrong") || search.includes("mode=wrong")) return "wrong";
  if (pathname.includes("favorites") || search.includes("mode=favorites")) return "favorites";
  return null;
}

export function AppLayout({ children }: AppLayoutProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [settingsRequest, setSettingsRequest] = useState<OpenSettingsDetail>({});
  const [settingsRequestKey, setSettingsRequestKey] = useState(0);
  const [calculatorOpen, setCalculatorOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [dailyTarget, setDailyTarget] = useState<{
    examId: ExamId;
    count: number;
    completed: number;
    planned: number;
  } | null>(null);
  const mobileMenuRef = useRef<HTMLDivElement>(null);
  const { isConfigured, user, signOut } = useAuth();
  const context = useMemo(() => routeContext(location.pathname), [location.pathname]);
  const brand = useMemo(() => brandCopy(context.examId), [context.examId]);
  const isTopLevel = ["/", "/securities", "/foreign-exchange"].includes(location.pathname);
  const isQuizRoute =
    location.pathname.startsWith("/image-quiz") ||
    location.pathname.startsWith("/foreign-exchange/practice") ||
    location.pathname === "/trial";
  const navigation = useMemo(
    () => (context.examId ? examNavigation(context.examId) : []),
    [context.examId],
  );
  const activeItem = activeNavItem(location.pathname, location.search);
  const accentClass = context.examId === "junior-foreign-exchange"
    ? "is-foreign-exchange"
    : context.examId === "senior-securities"
      ? "is-securities"
      : "is-neutral";
  const homeDestination = context.examId && navigation[0]
    ? navigation[0].destination
    : "/";

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

  useEffect(() => setMobileMenuOpen(false), [location.pathname, location.search]);

  useEffect(() => {
    const handleDailyTarget = (event: Event) => {
      const detail = (event as CustomEvent<{
        examId?: ExamId;
        count?: number;
        completed?: number;
        planned?: number;
      }>).detail;
      if (!detail?.examId || !Number.isFinite(detail.count)) return;
      const count = Math.max(0, Math.trunc(detail.count ?? 0));
      const planned = Math.max(count, Math.trunc(detail.planned ?? count));
      const completed = Math.min(planned, Math.max(0, Math.trunc(detail.completed ?? 0)));
      setDailyTarget({ examId: detail.examId, count, completed, planned });
    };
    window.addEventListener("exam-home:daily-target", handleDailyTarget);
    return () => window.removeEventListener("exam-home:daily-target", handleDailyTarget);
  }, []);

  useEffect(() => {
    if (!mobileMenuOpen) return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMobileMenuOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [mobileMenuOpen]);

  function navigateWithQuizGuard(continueNavigation: () => void): void {
    const event = new CustomEvent("quiz:navigation-attempt", {
      cancelable: true,
      detail: { continueNavigation },
    });
    if (window.dispatchEvent(event)) continueNavigation();
  }

  function go(destination: string): void {
    setMobileMenuOpen(false);
    navigateWithQuizGuard(() => {
      const targetUrl = new URL(destination, window.location.origin);
      const sameDocument =
        targetUrl.pathname === location.pathname &&
        targetUrl.search === location.search;

      if (sameDocument && targetUrl.hash) {
        if (location.hash === targetUrl.hash) {
          void scrollToHashTarget(targetUrl.hash);
        } else {
          navigate(destination);
        }
        return;
      }

      navigate(destination);
    });
  }

  function openSettings(detail: OpenSettingsDetail = {}): void {
    setMobileMenuOpen(false);
    void loadSettingsPanel();
    setSettingsRequest(detail);
    setSettingsRequestKey((value) => value + 1);
    setSettingsOpen(true);
  }

  function openCalculator(): void {
    setMobileMenuOpen(false);
    void loadCalculatorModal();
    setCalculatorOpen(true);
  }

  async function handleLogout(): Promise<void> {
    setMobileMenuOpen(false);
    await signOut();
    navigate("/auth", { replace: true });
  }

  const learningSummaryDestination = context.examId
    ? `${homeDestination}#learning-summary`
    : "/account";

  return (
    <div className={`glass-page product-app theme-v90 theme-v91 theme-v93 ${accentClass}${isQuizRoute ? " is-quiz-route" : ""}`}>
      {!isQuizRoute ? (
        <aside className="v88-sidebar v90-sidebar" aria-label="主要導覽">
          <button
            type="button"
            className="v88-sidebar-brand v90-sidebar-brand"
            onClick={() => go("/")}
            aria-label="金融證照學習中心"
          >
            <V93BrandLockup
              kind={brand.logoKind}
              title={brand.primary}
              subtitle={brand.secondary}
              className="v93-sidebar-brand"
            />
          </button>

          {navigation.length ? (
            <>
              <nav className="v88-sidebar-nav v90-sidebar-nav" aria-label="題庫功能">
                {navigation.map((item) => {
                  const Icon = item.icon;
                  return (
                    <button
                      key={item.id}
                      type="button"
                      className={activeItem === item.id ? "is-active" : ""}
                      onClick={() => go(item.destination)}
                    >
                      <Icon aria-hidden="true" size={20} className="v93-nav-icon" />
                      <span className="v93-nav-label">{item.label}</span>
                    </button>
                  );
                })}
                <button type="button" onClick={() => openSettings({ section: "plans" })}>
                  <CalendarRange aria-hidden="true" size={20} className="v93-nav-icon" /><span className="v93-nav-label">學習計畫</span>
                </button>
              </nav>

              <div className="v90-sidebar-rule" aria-hidden="true" />

              <nav className="v88-sidebar-utilities v90-sidebar-utilities" aria-label="實用工具">
                <button type="button" onClick={() => go("/search")}><Search aria-hidden="true" size={20} className="v93-nav-icon" /><span className="v93-nav-label">搜尋題目</span></button>
                <button type="button" onPointerEnter={() => void loadCalculatorModal()} onFocus={() => void loadCalculatorModal()} onClick={openCalculator}><Calculator aria-hidden="true" size={18} /><span>計算機</span></button>
              </nav>

              <div className="v90-sidebar-rule" aria-hidden="true" />

              <nav className="v88-sidebar-utilities v90-sidebar-utilities" aria-label="學習分析">
                <button type="button" onClick={() => go(context.examId === "senior-securities" ? "/leaderboard" : learningSummaryDestination)}><BarChart3 aria-hidden="true" size={18} /><span>成績報表</span></button>
                <button type="button" onClick={() => go(learningSummaryDestination)}><PieChart aria-hidden="true" size={18} /><span>學習分析</span></button>
              </nav>

              <div className="v90-sidebar-rule" aria-hidden="true" />

              <nav className="v88-sidebar-utilities v90-sidebar-utilities" aria-label="帳號與設定">
                <button type="button" className={settingsOpen ? "is-active" : ""} onPointerEnter={() => void loadSettingsPanel()} onFocus={() => void loadSettingsPanel()} onClick={() => openSettings()}><Settings2 aria-hidden="true" size={20} className="v93-nav-icon" /><span className="v93-nav-label">設定</span></button>
                {isConfigured ? <button type="button" onClick={() => go(user ? "/account" : "/auth")}><UserRound aria-hidden="true" size={18} /><span>{user ? "會員中心" : "會員登入"}</span></button> : null}
                {user ? <button type="button" onClick={() => void handleLogout()}><LogOut aria-hidden="true" size={18} /><span>登出</span></button> : null}
              </nav>
            </>
          ) : (
            <>
              <div className="v88-neutral-sidebar-copy v90-neutral-sidebar-copy">
                <strong>金融證照學習中心</strong>
                <span>選擇題庫、查看帳號，或搜尋已開通的學習內容。</span>
              </div>

              <div className="v90-sidebar-rule" aria-hidden="true" />

              <nav className="v88-sidebar-utilities v90-sidebar-utilities" aria-label="全站工具">
                <button type="button" onClick={() => go("/search")}>
                  <Search aria-hidden="true" size={20} className="v93-nav-icon" />
                  <span className="v93-nav-label">搜尋題目</span>
                </button>
                <button
                  type="button"
                  onPointerEnter={() => void loadCalculatorModal()}
                  onFocus={() => void loadCalculatorModal()}
                  onClick={openCalculator}
                >
                  <Calculator aria-hidden="true" size={20} className="v93-nav-icon" />
                  <span className="v93-nav-label">計算機</span>
                </button>
              </nav>

              <div className="v90-sidebar-rule" aria-hidden="true" />

              <nav className="v88-sidebar-utilities v90-sidebar-utilities" aria-label="帳號與設定">
                <button
                  type="button"
                  className={settingsOpen ? "is-active" : ""}
                  onPointerEnter={() => void loadSettingsPanel()}
                  onFocus={() => void loadSettingsPanel()}
                  onClick={() => openSettings()}
                >
                  <Settings2 aria-hidden="true" size={20} className="v93-nav-icon" />
                  <span className="v93-nav-label">設定</span>
                </button>
                {isConfigured ? (
                  <button type="button" onClick={() => go(user ? "/account" : "/auth")}>
                    <UserRound aria-hidden="true" size={20} className="v93-nav-icon" />
                    <span className="v93-nav-label">{user ? "會員中心" : "會員登入"}</span>
                  </button>
                ) : null}
                {user ? (
                  <button type="button" onClick={() => void handleLogout()}>
                    <LogOut aria-hidden="true" size={20} className="v93-nav-icon" />
                    <span className="v93-nav-label">登出</span>
                  </button>
                ) : null}
              </nav>
            </>
          )}

          {context.examId ? (
            <aside className="v90-sidebar-note" aria-label="今日學習目標">
              <span className="v90-note-pin" aria-hidden="true" />
              <small>今日學習目標</small>
              <strong>
                {dailyTarget?.examId === context.examId
                  ? dailyTarget.completed
                  : "—"}
                <em>／{dailyTarget?.examId === context.examId ? dailyTarget.planned : "—"} 題</em>
              </strong>
              <span className="v90-note-progress" aria-hidden="true">
                <i
                  style={{
                    width: dailyTarget?.examId === context.examId && dailyTarget.planned > 0
                      ? `${Math.min(100, (dailyTarget.completed / dailyTarget.planned) * 100)}%`
                      : "0%",
                  }}
                />
              </span>
              <span>穩定完成，讓進度留下痕跡</span>
              <SketchPinnedNoteArt />
            </aside>
          ) : null}
        </aside>
      ) : null}

      <div className="v88-app-stage v90-app-stage">
        <header className="v88-desktop-toolbar v90-desktop-toolbar" aria-label="頁面工具列">
          <div className="v88-desktop-context v90-desktop-context">
            {!isTopLevel ? (
              <button type="button" onClick={() => navigateWithQuizGuard(() => navigate(-1))} aria-label="上一頁">
                <ArrowLeft aria-hidden="true" size={19} />
              </button>
            ) : null}
            {!isTopLevel ? <div>{context.parent ? <small>{context.parent}</small> : null}<strong>{context.title}</strong></div> : null}
          </div>
          <div className="v88-toolbar-actions v90-toolbar-actions">
            {isConfigured ? (
              <button type="button" className="v90-member-button" onClick={() => go(user ? "/account" : "/auth")} aria-label={user ? "會員中心" : "會員登入"}>
                <UserRound aria-hidden="true" size={20} /><span>{user ? "會員中心" : "會員登入"}</span>
              </button>
            ) : null}
          </div>
        </header>

        <header className="v88-mobile-header v90-mobile-header" aria-label="行動版導覽">
          {isTopLevel ? (
            <button type="button" onClick={() => setMobileMenuOpen(true)} aria-label="開啟選單"><Menu aria-hidden="true" size={21} /></button>
          ) : (
            <button type="button" onClick={() => navigateWithQuizGuard(() => navigate(-1))} aria-label="上一頁"><ArrowLeft aria-hidden="true" size={21} /></button>
          )}
          <button type="button" className="v88-mobile-brand v90-mobile-brand" aria-label={`前往${brand.primary}首頁`} onClick={() => go(homeDestination)}>
            <V93BrandLockup
              kind={brand.logoKind}
              title={brand.primary}
              subtitle={context.parent ? context.title : brand.secondary}
              className="v93-mobile-brand"
              compact
            />
          </button>
          {isConfigured ? (
            <button type="button" onClick={() => go(user ? "/account" : "/auth")} aria-label={user ? "會員中心" : "會員登入"}><UserRound aria-hidden="true" size={20} /></button>
          ) : <span className="v88-mobile-header-spacer" aria-hidden="true" />}
        </header>

        <main className={`product-shell${isQuizRoute ? " product-quiz-shell" : ""}`}>{children}</main>
      </div>

      {!isQuizRoute && context.examId ? (
        <nav className="v88-mobile-bottom-nav v90-mobile-bottom-nav" aria-label="題庫快速導覽">
          {navigation.filter((item) => item.id !== "mock").slice(0, 4).map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} type="button" className={activeItem === item.id ? "is-active" : ""} onClick={() => go(item.destination)}>
                <Icon aria-hidden="true" size={21} className="v93-bottom-icon" />
                <span className="v93-bottom-label">{item.label.replace("我的", "")}</span>
              </button>
            );
          })}
          <button type="button" onClick={() => openSettings()} className={settingsOpen ? "is-active" : ""}><Settings2 aria-hidden="true" size={21} className="v93-bottom-icon" /><span className="v93-bottom-label">設定</span></button>
        </nav>
      ) : null}

      {mobileMenuOpen ? (
        <div ref={mobileMenuRef} className="v88-mobile-menu-backdrop v90-mobile-menu-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setMobileMenuOpen(false); }}>
          <section className="v88-mobile-menu v90-mobile-menu" role="dialog" aria-modal="true" aria-label="功能選單">
            <div className="v88-mobile-menu-head v90-mobile-menu-head">
              <V93BrandLockup
                kind={brand.logoKind}
                title={brand.menuTitle}
                subtitle={brand.menuSubtitle}
                className="v93-menu-brand"
              />
              <button type="button" onClick={() => setMobileMenuOpen(false)} aria-label="關閉選單"><X aria-hidden="true" size={20} /></button>
            </div>
            <nav className="v88-mobile-menu-nav v90-mobile-menu-nav" aria-label="其他功能">
              <button type="button" onClick={() => go("/")}><Home aria-hidden="true" size={19} /><span>金融證照首頁</span></button>
              <button type="button" onClick={() => go("/search")}><Search aria-hidden="true" size={19} /><span>搜尋題目</span></button>
              <button type="button" onClick={openCalculator}><Calculator aria-hidden="true" size={19} /><span>計算機</span></button>
              <button type="button" onClick={() => openSettings()}><Settings2 aria-hidden="true" size={21} className="v93-bottom-icon" /><span className="v93-bottom-label">設定</span></button>
              <button type="button" onClick={() => go(user ? "/account" : "/auth")}><UserRound aria-hidden="true" size={19} /><span>{user ? "會員中心" : "會員登入"}</span></button>
              {user ? <button type="button" onClick={() => void handleLogout()}><LogOut aria-hidden="true" size={19} /><span>登出</span></button> : null}
            </nav>
          </section>
        </div>
      ) : null}

      {settingsOpen ? (
        <Suspense fallback={<ModalLoadingFallback label="載入設定" />}>
          <LazySettingsPanel open={settingsOpen} onClose={() => setSettingsOpen(false)} initialSection={settingsRequest.section} initialPlanExamId={settingsRequest.planExamId} requestKey={settingsRequestKey} />
        </Suspense>
      ) : null}
      {calculatorOpen ? <Suspense fallback={<ModalLoadingFallback label="載入計算機" />}><LazyCalculatorModal open={calculatorOpen} onClose={() => setCalculatorOpen(false)} /></Suspense> : null}
    </div>
  );
}
