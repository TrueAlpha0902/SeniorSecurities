import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");
const [
  studyPlan,
  home,
  fxHome,
  catalog,
  bankPage,
  imageQuiz,
  fxPractice,
  settings,
  imageQuizData,
  timer,
  currentTheme,
  premiumTheme,
] = await Promise.all([
  read("src/lib/studyPlan.ts"),
  read("src/pages/HomePage.tsx"),
  read("src/pages/ForeignExchangeHomePage.tsx"),
  read("src/pages/ExamCatalogPage.tsx"),
  read("src/pages/BankPage.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("src/components/SettingsPanel.tsx"),
  read("src/lib/imageQuiz.ts"),
  read("src/components/QuizTimer.tsx"),
  read("src/styles/theme-current.css"),
  read("src/styles/theme-v90.css"),
]);

assert.ok(studyPlan.includes('type StudyPlanExamId = "senior-securities" | "junior-foreign-exchange"'));
assert.ok(studyPlan.includes('const STUDY_PLAN_KEY_PREFIX = "quizpwa:study-plan:v4:"'));
assert.ok(studyPlan.includes('getStudyPlanConfigForExam("senior-securities")'));
assert.ok(studyPlan.includes('getStudyPlanConfigForExam("junior-foreign-exchange")'));
assert.ok(studyPlan.includes("getStudyPlanConfigsByExam"));
assert.ok(studyPlan.includes("setStudyPlanConfigForExam"));
assert.ok(studyPlan.includes("clearStoredDailyPlansForExam"));

assert.ok(imageQuizData.includes("three official exam subjects"));
assert.ok(home.includes('subtitle="穩紮穩打，累積實力！"'));
assert.ok(home.includes('getStudyPlanConfigForExam("senior-securities")'));
assert.ok(home.includes('planScopeId: "senior-securities"'));
assert.ok(home.includes('"securities-laws-practice"'));
assert.equal(home.includes('"securities-trading-regulations"'), false);
assert.equal(home.includes('"securities-trading-practice"'), false);
assert.equal(home.includes("4題庫"), false);
assert.equal(home.includes("answerAccuracy"), false);
assert.ok(home.includes("ExamStudyPlanDialog"));

assert.ok(fxHome.includes('getStudyPlanConfigForExam("junior-foreign-exchange")'));
assert.ok(fxHome.includes("ExamHomeHero"));
assert.ok(fxHome.includes("ExamQuickActions"));
assert.ok(fxHome.includes("ExamSubjectPath"));
assert.equal(fxHome.includes("summary.accuracy"), false);
assert.ok(fxHome.includes("mode=random&subject=${subject.id}"));

assert.equal(catalog.includes("共6,776題"), false);
assert.equal(catalog.includes("正確率"), false);
assert.ok(catalog.includes('subjectCount: "3考科"'));

assert.equal(bankPage.includes("ExamStudyPlanDialog"), false);
assert.equal(bankPage.includes("共同考試計畫"), false);
assert.ok(bankPage.includes("Regulations and practice are one official subject"));
assert.equal(bankPage.includes("regulationChapters"), false);
assert.equal(bankPage.includes("practiceChapters"), false);

assert.ok(settings.includes("每個題庫共用一個考試日期與每日讀書時間"));
assert.ok(settings.includes('openPlanEditor("senior-securities")'));
assert.ok(settings.includes('openPlanEditor("junior-foreign-exchange")'));
assert.equal(settings.includes('openPlanEditor("investment")'), false);
assert.equal(settings.includes('openPlanEditor("fx-remittance")'), false);

const securitiesTimerUsages = imageQuiz.match(/<QuizTimer\b/g) ?? [];
assert.equal(securitiesTimerUsages.length, 1, "Securities should render exactly one mock-only timer.");
assert.ok(imageQuiz.includes('mode === "random" && !isSubmittedReview'));

const fxTimerUsages = fxPractice.match(/<QuizTimer\b/g) ?? [];
assert.equal(fxTimerUsages.length, 1, "FX should render exactly one mock-only timer.");
assert.ok(fxPractice.includes("isMock && !submitted ?"));
assert.ok(fxPractice.includes('mode="countdown"'));
assert.equal(timer.includes("練習時間"), false);
assert.equal(timer.includes("onTogglePause"), false);

const combinedTheme = `${currentTheme}\n${premiumTheme}`;
assert.match(combinedTheme, /position:\s*static\s*!important/);
assert.ok(premiumTheme.includes("safe-area-inset-bottom"));
assert.equal(/\.theme-v90 \.v90-bottom-controls[\s\S]{0,300}position:\s*fixed/.test(premiumTheme), false);

console.log("v86 exam-level plans, three official subjects, mock-only timers and mobile flow contracts passed.");
