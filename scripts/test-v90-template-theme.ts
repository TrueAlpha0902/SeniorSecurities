import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");
const assert: (condition: unknown, message: string) => asserts condition = (condition, message) => {
  if (!condition) throw new Error(message);
};

const [layout, homeSections, illustrations, home, fxHome, securitiesQuiz, fxQuiz, theme] = await Promise.all([
  read("src/components/AppLayout.tsx"),
  read("src/components/ExamHomeSections.tsx"),
  read("src/components/SketchIllustrations.tsx"),
  read("src/pages/HomePage.tsx"),
  read("src/pages/ForeignExchangeHomePage.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("src/styles/theme-v90.css"),
]);

assert(layout.includes('import "../styles/theme-v90.css"'), "AppLayout must load the v90 exact-template stylesheet.");
assert(layout.includes("theme-v90"), "Application root must carry the theme-v90 class.");
assert(layout.includes("金融證照") && layout.includes("學習中心"), "Desktop rail must use the approved Chinese neutral brand.");
assert(layout.includes("SketchPinnedNoteArt"), "Desktop rail must include the pinned study-target note.");
assert(layout.includes('section: "plans"'), "Study-plan navigation must open the plans section.");
assert(layout.includes("v90-note-progress"), "Pinned study note must show actual daily completion progress.");
assert(layout.includes("!isQuizRoute"), "Quiz routes must omit the global desktop and mobile navigation rails.");

assert(homeSections.includes("v90-overview-grid"), "Home overview must use the three-card template row.");
assert(homeSections.includes("v90-quick-grid"), "Home learning shortcuts are missing.");
assert(homeSections.includes("v90-subject-path"), "Subject learning-path cards are missing.");
assert(homeSections.includes("v90-learning-summary"), "Lower learning summary panel is missing.");
assert(homeSections.includes("v90-exam-info-card"), "Exam information card is missing.");
assert(homeSections.includes("共同考試日期"), "Every exam must keep one shared exam date.");

assert(illustrations.includes("SketchSecuritiesHero"), "Securities hand-drawn chart illustration is missing.");
assert(illustrations.includes("SketchForeignExchangeHero"), "Foreign-exchange globe illustration is missing.");
assert(illustrations.includes("SketchLearningChart"), "Hand-drawn learning chart is missing.");
assert(illustrations.includes("feDisplacementMap"), "Illustrations must keep a lightly hand-drawn stroke.");

assert(home.includes("ExamLearningSummary") && home.includes("ExamQuickActions"), "Securities home must use the complete approved template.");
assert(fxHome.includes("ExamLearningSummary") && fxHome.includes("ExamQuickActions"), "Foreign-exchange home must use the complete approved template.");
assert(home.includes("securities-laws-practice"), "Securities law and practice must remain one learner-facing subject.");
assert(fxHome.includes("第23至47屆"), "Foreign-exchange history range must remain visible.");

assert(securitiesQuiz.includes("v90-quiz-topline") && securitiesQuiz.includes("v90-question-list-trigger"), "Securities quiz must use the approved mobile top and bottom controls.");
assert(fxQuiz.includes("v90-quiz-topline") && fxQuiz.includes("v90-quiz-meta-row"), "Foreign-exchange quiz must share the approved quiz shell.");
assert(securitiesQuiz.includes("<Star") && fxQuiz.includes("<Star"), "Both quiz pages must use the reference star favorite action.");

for (const required of [
  "--v90-paper: #f8f5ee",
  '"DFKai-SB"',
  ".v90-sidebar",
  ".v90-sidebar-note",
  ".v90-hero-banner",
  ".v90-overview-grid",
  ".v90-quick-grid",
  ".v90-subject-path",
  ".v90-learning-summary",
  ".v90-exam-info-card",
  ".v90-quiz-topline",
  ".v90-explanation-disclosure",
  "repeating-linear-gradient",
  "position: static !important",
  "env(safe-area-inset-bottom)",
]) {
  assert(theme.includes(required), `v90 stylesheet is missing required template detail: ${required}`);
}

assert(!theme.includes("linear-gradient(135deg"), "The exact paper template must not revert to a glossy dashboard gradient.");
assert(!`${layout}
${homeSections}
${illustrations}
${theme}`.includes("v89-"), "v90 must not retain legacy v89 theme class names.");

console.log("v90 exact paper-template theme contracts passed.");
