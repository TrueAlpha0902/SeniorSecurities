import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const [theme, imageQuiz, fxPractice, viewport] = await Promise.all([
  read("src/styles/theme-current.css"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("src/lib/quizViewport.ts"),
]);

assert(theme.includes("v86 unified exam dashboards"), "The current mobile contract must include the v86 flow-navigation layer.");
assert(
  theme.includes(".product-app.is-quiz-route .image-quiz-controls,.product-app.is-quiz-route .fx-quiz-actions{position:static"),
  "Previous/next actions must stay in normal document flow instead of covering answers.",
);
assert(
  theme.includes("padding:0 0 calc(8px + env(safe-area-inset-bottom))"),
  "Bottom navigation must retain iPhone safe-area spacing.",
);
assert(theme.includes("min-height:62px"), "Mobile answer options must use large tap targets.");
assert(theme.includes(".product-app.is-quiz-route .fx-quiz-side{display:none}"), "FX mobile layout must hide the desktop sidebar.");
assert(theme.includes(".product-app.is-quiz-route .product-shell"), "Quiz shell must use dedicated mobile spacing.");
assert(imageQuiz.includes("prepareQuestionNavigation") && fxPractice.includes("goToQuestion"), "Both question runners must use stable navigation helpers.");
assert(viewport.includes("Math.max(0, previousScrollY)") && viewport.includes('behavior: "auto"'), "Question focus must preserve the current scroll position without smooth scrolling.");
assert(imageQuiz.includes("V93AnswerBadge") && fxPractice.includes("V93AnswerBadge"), "Both question runners need native option-led text feedback.");

console.log("v84/v86 mobile navigation contracts passed.");
