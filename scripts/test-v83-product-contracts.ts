import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");
async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(root, relativePath));
    return true;
  } catch {
    return false;
  }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const [
  catalog,
  home,
  fxHome,
  fxPractice,
  account,
  layout,
  imageQuizPage,
  imageQuizLib,
  viewport,
  currentTheme,
  premiumTheme,
  settings,
  studyPlan,
  bankPage,
  questionApi,
  vite,
  vercel,
  vercelIgnore,
] = await Promise.all([
  read("src/pages/ExamCatalogPage.tsx"),
  read("src/pages/HomePage.tsx"),
  read("src/pages/ForeignExchangeHomePage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("src/pages/AccountPage.tsx"),
  read("src/components/AppLayout.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/lib/imageQuiz.ts"),
  read("src/lib/quizViewport.ts"),
  read("src/styles/theme-current.css"),
  read("src/styles/theme-v90.css"),
  read("src/components/SettingsPanel.tsx"),
  read("src/lib/studyPlan.ts"),
  read("src/pages/BankPage.tsx"),
  read("api/questions.ts"),
  read("vite.config.ts"),
  read("vercel.json"),
  read(".vercelignore"),
]);

assert(!catalog.includes("共6,776題"), "Catalog must not show the combined question total.");
assert(!catalog.includes("正確率"), "Catalog must not use accuracy as a primary entry metric.");
assert(catalog.includes('subjectCount: "3考科"'), "Securities catalog must describe three official subjects.");
assert(!catalog.includes("繼續上次練習"), "Catalog must not restore continue-last-practice UI.");
assert(catalog.includes("學習進度"), "Catalog progress treatment is missing.");

assert(home.includes("ExamHomeHero") && home.includes("ExamQuickActions") && home.includes("ExamSubjectPath"), "Securities home must use the unified exam-home structure.");
assert(home.includes('getStudyPlanConfigForExam("senior-securities")'), "Securities home must use one exam-level plan.");
assert(home.includes('planScopeId: "senior-securities"') && home.includes('/image-quiz/daily?scope=all'), "Securities daily plan must be exam-scoped.");
assert(home.includes('"securities-laws-practice"'), "Law and practice must be one learner-facing subject.");
assert(!home.includes('"securities-trading-regulations"') && !home.includes('"securities-trading-practice"'), "Law and practice must not be separate learner-facing home cards.");
assert(!home.includes("4題庫") && !home.includes("answerAccuracy"), "Securities home must not expose the old four-bank or accuracy summary.");
assert(home.includes("ExamStudyPlanDialog"), "Securities home must provide the shared exam-plan editor.");
assert(!home.includes("getRecentExamActivity") && !home.includes("繼續上次練習"), "Securities home must not restore continue-last-practice UI.");

assert(imageQuizLib.includes("three official exam subjects"), "Image quiz summaries must normalize to three official subjects.");
assert(imageQuizLib.includes("SECURITIES_COMBINED_BANK_ID"), "Combined law-and-practice data adapter is missing.");

assert(fxHome.includes("ExamHomeHero") && fxHome.includes("ExamQuickActions") && fxHome.includes("ExamSubjectPath"), "FX home must use the same unified exam-home structure.");
assert(fxHome.includes("歷屆試題") && fxHome.includes("第23至47屆"), "FX home must show the full archive range.");
assert(fxHome.includes('getStudyPlanConfigForExam("junior-foreign-exchange")'), "FX home must use one exam-level plan.");
assert(fxHome.includes("fx-random-count") && fxHome.includes('scopeId: "fx-remittance"') && fxHome.includes('scopeId: "fx-trade"'), "FX custom random count or subject routes are missing.");
for (const removed of ["現行新制", "近5屆", "制式", "subjectFilter", "setScope"]) {
  assert(!fxHome.includes(removed), `FX home must not expose the removed filter: ${removed}`);
}
assert(!fxHome.includes("summary.accuracy"), "FX home must not use accuracy as a primary dashboard metric.");

assert(layout.includes("V93BrandLockup") && layout.includes('label: "首頁"') && layout.includes('destination: "/securities"') && layout.includes('destination: "/foreign-exchange"'), "Global navigation must retain native, accessible home actions for both exams.");
assert(!layout.includes("recordRecentExamActivity"), "App layout must not write continue-last-practice state.");
assert(account.includes("loadExamProgress") && account.includes("學習進度"), "Account cards must show actual exam progress.");
for (const removed of ["方案", "開通時間", "最近練習", "getRecentExamActivity"]) {
  assert(!account.includes(removed), `Account card must not expose removed metadata: ${removed}`);
}

assert(imageQuizPage.includes("vibrateForAnswer") && imageQuizPage.includes("V93AnswerBadge"), "Securities answer feedback must remain option-led with native text feedback.");
assert(!imageQuizPage.includes("答對了") && !imageQuizPage.includes("答錯了") && !imageQuizPage.includes("answer-impact-banner"), "Duplicate answer summaries must remain removed.");
assert(!imageQuizPage.includes("retryQueue") && !imageQuizPage.includes("openNextQueuedRetry"), "Wrong answers must not be forced back into the same run.");
assert((imageQuizPage.match(/<QuizTimer\b/g) ?? []).length === 1 && imageQuizPage.includes('mode === "random" && !isSubmittedReview'), "Securities timer must appear only in mock exam mode.");
assert((fxPractice.match(/<QuizTimer\b/g) ?? []).length === 1 && fxPractice.includes("isMock && !submitted ?"), "FX timer must appear only in mock exam mode.");

assert(viewport.includes("Math.max(0, previousScrollY)") && viewport.includes("preventScroll: true"), "Question navigation must preserve the current viewport.");
const combinedTheme = `${currentTheme}\n${premiumTheme}`;
assert(combinedTheme.includes("answer-confirm") && combinedTheme.includes("answer-reject"), "Current full-answer feedback styles are missing.");
assert(combinedTheme.includes("position: static !important") && combinedTheme.includes("safe-area-inset-bottom"), "Mobile question navigation must stay in normal document flow.");

assert(settings.includes("每個題庫共用一個考試日期與每日讀書時間"), "Settings must describe exam-level plans.");
assert(settings.includes('openPlanEditor("senior-securities")') && settings.includes('openPlanEditor("junior-foreign-exchange")'), "Settings must expose exactly two exam-level plans.");
assert(!settings.includes('openPlanEditor("investment")') && !settings.includes('openPlanEditor("fx-remittance")'), "Settings must not expose subject-level plan editors.");
assert(studyPlan.includes("getStudyPlanConfigsByExam") && studyPlan.includes("setStudyPlanConfigForExam"), "Exam-level study-plan storage is missing.");
assert(!bankPage.includes("ExamStudyPlanDialog") && !bankPage.includes("共同考試計畫"), "Subject pages must not expose separate plan editors.");

assert(!await exists("api/admin/question-editor.ts"), "Question editor API must remain removed from production.");
assert(questionApi.includes("requireExamEntitlement") && questionApi.includes("verifyMockToken"), "Question API must retain entitlement and signed mock validation.");
assert(vercelIgnore.split(/\r?\n/).includes("public/pdf-pages"), "Source scans must remain excluded from Vercel upload.");
assert(vite.includes('resolve(outputDirectory, "pdf-pages")') && vite.includes('resolve(outputDirectory, "data", "question-shards")'), "Production must remove scans and paid static shards.");
assert(vercel.includes('"api/questions.ts"'), "Unified question function configuration is missing.");

console.log("v83 compatibility and current product convergence contracts passed.");
