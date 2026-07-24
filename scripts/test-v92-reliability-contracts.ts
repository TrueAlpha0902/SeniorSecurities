import { readFile, stat } from "node:fs/promises";
import { resolve } from "node:path";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return readFile(resolve(root, relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const [
  handwrittenAsset,
  theme,
  homeSections,
  questionBankApi,
  imageQuiz,
  foreignExchange,
  questionSearch,
  adminClient,
  questionsApi,
  securitiesApiData,
  useAsync,
  errorState,
  homePage,
  bankPage,
  imageQuizPage,
  randomPracticePage,
  answerDrillPage,
  similarQuestionsPage,
  fxPracticePage,
  migration,
  postdeploy,
  viteConfig,
  vercelConfig,
  packageJsonSource,
] = await Promise.all([
  read("src/components/HandwrittenAsset.tsx"),
  read("src/styles/theme-v91.css"),
  read("src/components/ExamHomeSections.tsx"),
  read("src/lib/questionBankApi.ts"),
  read("src/lib/imageQuiz.ts"),
  read("src/lib/foreignExchange.ts"),
  read("src/lib/questionSearch.ts"),
  read("api/_adminClient.ts"),
  read("api/questions.ts"),
  read("api/_securitiesQuestions.ts"),
  read("src/hooks/useAsync.ts"),
  read("src/components/ErrorState.tsx"),
  read("src/pages/HomePage.tsx"),
  read("src/pages/BankPage.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/RandomPracticePage.tsx"),
  read("src/pages/AnswerDrillPage.tsx"),
  read("src/pages/SimilarQuestionsPage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("supabase/migrations/20260724190000_question_bank_access_repair_v92.sql"),
  read("scripts/post-deploy-health-check.ts"),
  read("vite.config.ts"),
  read("vercel.json"),
  read("package.json"),
]);

assert(
  !handwrittenAsset.includes('<span className="sr-only">{text}</span>'),
  "Handwritten assets must not render a second visible label.",
);
assert(
  handwrittenAsset.includes('role: "img"')
    && handwrittenAsset.includes('"aria-label": text'),
  "Handwritten labels must preserve one accessible name.",
);
assert(
  theme.includes(".sr-only")
    && theme.includes("clip-path: inset(50%)"),
  "The global visually-hidden utility is missing.",
);
assert(
  homeSections.includes('"fx-international" : "securities"')
    && !homeSections.includes('"foreign-exchange-brand" : "securities-brand"'),
  "The home hero must use text-free art instead of repeating the title.",
);

assert(
  questionBankApi.includes("refreshSession()")
    && questionBankApi.includes("response.status === 401")
    && questionBankApi.includes("retryable"),
  "Question-bank client must refresh expired sessions and retry transient failures.",
);
assert(
  imageQuiz.includes("rememberRecoverable")
    && imageQuiz.includes("resetImageQuizCaches"),
  "Securities question promises must evict rejected cache entries.",
);
assert(
  foreignExchange.includes("resetForeignExchangeQuestionCache")
    && foreignExchange.includes("requestQuestionBankJson"),
  "Foreign-exchange loading must use the shared reliable API client.",
);
assert(
  questionSearch.includes("requestQuestionBankJson"),
  "Question search must use the reliable authenticated API client.",
);

assert(
  adminClient.includes("VITE_SUPABASE_PUBLISHABLE_KEY")
    && adminClient.includes("getAuthenticatedQuestionClient")
    && adminClient.includes("usingServiceRole"),
  "Question authentication must fall back to the publishable key when service-role is unavailable.",
);
assert(
  questionsApi.includes('"health"')
    && questionsApi.includes("handleHealth")
    && questionsApi.includes("user_entitlements")
    && questionsApi.includes("examEntitlementTableAvailable"),
  "Question API must expose health diagnostics and support legacy securities entitlements.",
);
assert(
  questionsApi.includes("MOCK_EXAM_SIGNING_SECRET")
    && adminClient.includes("題庫伺服器缺少"),
  "Question API must report missing server configuration clearly.",
);
assert(
  securitiesApiData.includes("manifestPromise === promise")
    && securitiesApiData.includes("shardCache.delete"),
  "Server question-file caches must recover after a failed read.",
);

assert(
  useAsync.includes("retry: () => void")
    && useAsync.includes("retryRevision"),
  "Async page loading must expose a retry action.",
);
assert(
  errorState.includes("onRetry")
    && errorState.includes("重新載入"),
  "ErrorState must provide a reusable retry button.",
);
for (const [name, source] of [
  ["HomePage", homePage],
  ["BankPage", bankPage],
  ["ImageQuizPage", imageQuizPage],
  ["RandomPracticePage", randomPracticePage],
  ["AnswerDrillPage", answerDrillPage],
  ["SimilarQuestionsPage", similarQuestionsPage],
] as const) {
  assert(
    source.includes("resetImageQuizCaches") && source.includes("onRetry"),
    `${name} must clear rejected caches before retrying.`,
  );
}
assert(
  fxPracticePage.includes("resetForeignExchangeQuestionCache")
    && fxPracticePage.includes("setLoadRevision"),
  "ForeignExchangePracticePage must offer a real reload action.",
);

assert(
  migration.includes("create table if not exists public.user_exam_entitlements")
    && migration.includes("Users can read their own exam entitlements")
    && migration.includes("from public.user_entitlements")
    && migration.includes("select pg_notify('pgrst', 'reload schema')"),
  "The repair migration must recreate exam entitlements, RLS, legacy backfill, and reload PostgREST.",
);
assert(
  postdeploy.includes("/api/questions?resource=health")
    && postdeploy.includes("HEALTHCHECK_ACCESS_TOKEN")
    && postdeploy.includes("assertAuthenticatedQuestionFlows")
    && postdeploy.includes("mock-start"),
  "Post-deploy health checks must verify bundled data and authenticated question flows.",
);
assert(
  viteConfig.includes('cacheName: "question-bank-metadata-v92"')
    && viteConfig.includes('handler: "NetworkFirst"')
    && viteConfig.includes('"**/data/question-release-manifest.json"'),
  "Critical question metadata must bypass stale precache entries and use NetworkFirst.",
);
const parsedVercel = JSON.parse(vercelConfig) as {
  headers?: Array<{ source?: string; headers?: Array<{ key?: string; value?: string }> }>;
};
for (const source of [
  "/data/question-release-manifest.json",
  "/data/pdf-image-quiz-summary.json",
  "/data/pdf-image-quiz-plan-index.json",
  "/data/pdf-image-quiz-trial.json",
  "/data/similar-question-groups.json",
]) {
  const rule = parsedVercel.headers?.find((candidate) => candidate.source === source);
  assert(
    rule?.headers?.some(
      (header) =>
        header.key === "Cache-Control"
        && /no-cache.*no-store/i.test(header.value || ""),
    ),
    `Missing no-store metadata header for ${source}.`,
  );
}

const packageJson = JSON.parse(packageJsonSource) as {
  scripts?: Record<string, string>;
};
assert(
  packageJson.scripts?.["test:v92-contracts"] ===
    "tsx scripts/test-v92-reliability-contracts.ts",
  "package.json is missing test:v92-contracts.",
);
assert(
  packageJson.scripts?.verify?.includes("npm run test:v92-contracts"),
  "npm run verify must include the v91.2.2 reliability contracts.",
);

const assetPaths = [
  "public/handwritten-ui/icons/securities.png",
  "public/handwritten-ui/icons/fx-international.png",
  "public/handwritten-ui/labels/home.png",
  "public/handwritten-ui/labels/bank.png",
  "public/handwritten-ui/labels/mock.png",
  "public/handwritten-ui/labels/wrong-review.png",
  "public/handwritten-ui/labels/favorite.png",
  "public/handwritten-ui/labels/settings.png",
  "public/handwritten-ui/states/correct-chip.png",
  "public/handwritten-ui/states/wrong-chip.png",
];
for (const relativePath of assetPaths) {
  const info = await stat(resolve(root, relativePath));
  assert(info.isFile() && info.size > 0, `Missing handwritten asset: ${relativePath}`);
}

console.log(
  "v91.2.2 reliability contracts passed: UI labels, question API, retries, migration, and post-deploy smoke checks.",
);
