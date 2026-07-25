import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

const [
  layout,
  questionBankApi,
  searchPage,
  indexHtml,
  viteConfig,
  appSmoke,
  appInteractions,
  learnerFeedback,
  testHelpers,
  settingsPanel,
  examHomeSections,
  visualMaterials,
  randomPractice,
  themeV93,
  progressBar,
  packageJsonSource,
] = await Promise.all([
  read("src/components/AppLayout.tsx"),
  read("src/lib/questionBankApi.ts"),
  read("src/pages/SearchPage.tsx"),
  read("index.html"),
  read("vite.config.ts"),
  read("tests/e2e/app-smoke.spec.ts"),
  read("tests/e2e/app-interactions-v93.spec.ts"),
  read("tests/e2e/learner-feedback-v93.spec.ts"),
  read("tests/e2e/v93-test-helpers.ts"),
  read("src/components/SettingsPanel.tsx"),
  read("src/components/ExamHomeSections.tsx"),
  read("src/components/V93VisualMaterials.tsx"),
  read("src/pages/RandomPracticePage.tsx"),
  read("src/styles/theme-v93.css"),
  read("src/components/ProgressBar.tsx"),
  read("package.json"),
]);

assert(
  layout.includes('aria-label="全站工具"')
    && layout.includes('onClick={openCalculator}')
    && layout.includes('onClick={() => openSettings()}'),
  "The neutral catalog shell must expose working calculator and settings controls on desktop.",
);

assert(
  questionBankApi.includes(
    'const RUNTIME_ENV = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;',
  )
    && questionBankApi.includes(
      'RUNTIME_ENV?.DEV && RUNTIME_ENV.VITE_LOCAL_PREVIEW_ACCESS === "1"',
    )
    && questionBankApi.includes('token: "local-preview-token"')
    && questionBankApi.includes('if (localPreviewEnabled) return localPreviewAccess;'),
  "Question-bank requests must use a Node-safe, development-only local preview identity.",
);

assert(
  searchPage.includes('aria-label="搜尋題目"'),
  "The question search input must have an explicit accessible name.",
);

assert(
  indexHtml.includes('class="app-boot-fallback"')
    && indexHtml.includes('role="status"')
    && indexHtml.includes("離線時會保留此安全畫面"),
  "The initial HTML shell must remain non-empty when JavaScript cannot mount offline.",
);

assert(
  viteConfig.includes("loadSecuritiesPreviewQuestions")
    && viteConfig.includes("loadForeignExchangePreviewQuestions")
    && viteConfig.includes("securitiesQuestionsPromise")
    && viteConfig.includes("foreignExchangeQuestionsPromise"),
  "The local preview API must cache its private question data across parallel browser tests.",
);

assert(
  testHelpers.includes("clickGlobalUtility")
    && testHelpers.includes("expectHashTargetInUsefulViewport")
    && testHelpers.includes('getByRole("dialog", { name: "功能選單" })'),
  "Desktop/mobile utility and hash-position helpers are missing.",
);

assert(
  appSmoke.includes('getByRole("region", { name: "證券高業學習概況" })')
    && appSmoke.includes('getByRole("heading", { name: "歷屆試題" })')
    && appSmoke.includes('getByRole("spinbutton", { name: "隨機題數" })')
    && appSmoke.includes('/選擇 [（(]1[）)]/'),
  "Smoke tests must follow the v93 semantic interface instead of obsolete v86 classes or labels.",
);

for (const staleSelector of [
  ".exam-dashboard-hero-v86",
  ".exam-subject-card-v86",
  'name: "全部歷屆"',
  'getByLabel("自訂題數")',
  '/選擇 \\(1\\)/',
]) {
  assert(!appSmoke.includes(staleSelector), `Obsolete E2E selector remains: ${staleSelector}`);
}

assert(
  appInteractions.includes("expectHashTargetInUsefulViewport")
    && appInteractions.includes('clickGlobalUtility(page, "設定")')
    && appInteractions.includes('clickGlobalUtility(page, "計算機")')
    && appInteractions.includes('filter({ hasText: "前往題目" })'),
  "Interaction tests must use the responsive utility helper and semantic search-result link.",
);

assert(
  learnerFeedback.includes('clickGlobalUtility(page, "設定")')
    && learnerFeedback.includes('clickGlobalUtility(page, "計算機")'),
  "Feedback tests must open utilities through the active desktop or mobile navigation surface.",
);

assert(
  learnerFeedback.includes('getByRole("dialog", { name: "重設學習資料" })'),
  "The destructive reset flow must target its dedicated dialog after leaving the settings menu.",
);

assert(
  settingsPanel.includes('className="settings-plan-subjects"')
    && settingsPanel.includes('subjects={["投資學", "財務分析", "證券相關法規與實務"]}')
    && settingsPanel.includes('subjects={["國外匯兌業務", "進出口外匯業務"]}'),
  "Study-plan subjects must remain individually readable and accessible.",
);

assert(
  examHomeSections.includes("<h3>{item.title}</h3>"),
  "Subject learning-path cards must expose heading semantics.",
);

assert(
  visualMaterials.includes(
    'className={`answer-result-label v93-answer-badge is-${status}`}',
  ),
  "Answer feedback must preserve the semantic compatibility class.",
);

assert(
  randomPractice.includes("countAnsweredQuestionsForBank")
    && randomPractice.includes('"securities-trading-regulations"')
    && randomPractice.includes("Math.max(0, total - answeredCount)"),
  "Mock availability must be calculated from answer bank ids, not redacted summary question arrays.",
);

assert(
  themeV93.includes(".theme-v93.theme-v90 :where(")
    && themeV93.includes(".v90-app-stage,")
    && themeV93.includes(".v90-path-content,")
    && themeV93.includes(".settings-section-panel > header,"),
  "The v93 dark theme must outrank legacy paper selectors on major app surfaces.",
);

assert(
  appSmoke.includes('expectDarkSurface(page, ".v90-app-stage")')
    && appSmoke.includes('expectDarkSurface(page, ".settings-section-panel")')
    && appSmoke.includes('expectDarkSurface(page, ".v90-path-content")'),
  "Browser smoke tests must guard the actual dark surfaces seen by learners.",
);

assert(
  appSmoke.includes("evaluateAll((elements)")
    && appSmoke.match(/\.answer-result-label"\)\.first\(\)/g)?.length === 2,
  "Browser smoke tests must support repeated dark surfaces and intentional answer badges.",
);

assert(
  progressBar.includes('role="progressbar"')
    && progressBar.includes("aria-label={label}")
    && progressBar.includes("aria-valuetext={label}"),
  "Every rendered progressbar must carry its accessible name on the progressbar role.",
);

assert(
  themeV93.includes(".exam-card-status-v84.has-access")
    && themeV93.includes(".product-exam-meta,")
    && themeV93.includes(".product-exam-card .progress-label"),
  "Catalog status, metadata and progress labels must keep accessible dark-theme contrast.",
);

assert(
  themeV93.includes("--secondary: var(--v93-muted);")
    && themeV93.includes("--product-muted: var(--v93-muted);"),
  "The active v93 theme must locally rebind legacy secondary and product-muted tokens.",
);

const packageJson = JSON.parse(packageJsonSource) as {
  scripts?: Record<string, string>;
};
assert(
  packageJson.scripts?.["test:v93-e2e-regressions"] ===
    "tsx scripts/test-v93-e2e-regressions.ts",
  "package.json is missing test:v93-e2e-regressions.",
);
assert(
  packageJson.scripts?.verify?.includes("npm run test:v93-e2e-regressions"),
  "npm run verify must include the v93 E2E regression gate.",
);
assert(
  packageJson.scripts?.["test:e2e:v93"]?.includes("--workers=1")
    && packageJson.scripts?.["test:e2e:v93"]?.includes("--reporter=line")
    && packageJson.scripts?.["test:e2e:v93"]?.includes("--project=desktop")
    && packageJson.scripts?.["test:e2e:v93"]?.includes("--project=mobile"),
  "The focused v93 browser suite must run serially with a non-blocking reporter.",
);

console.log(
  "v93 E2E regression contracts passed: scoped dark tokens, accessible catalog progress, repeated surfaces, answer feedback, mock availability, responsive utilities, and browser selectors are protected.",
);
