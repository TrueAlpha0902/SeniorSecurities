import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { resetForeignExchangeProgressState } from "../src/lib/foreignExchangeProgress";
import type { ForeignExchangeProgress } from "../src/lib/foreignExchangeProgress";

const read = (path: string) => readFile(new URL(`../${path}`, import.meta.url), "utf8");

const [
  appSettings,
  settingsPanel,
  securitiesQuiz,
  fxQuiz,
  home,
  learnerText,
  similarPage,
  similarDataRaw,
  theme,
] = await Promise.all([
  read("src/lib/appSettings.ts"),
  read("src/components/SettingsPanel.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("src/pages/HomePage.tsx"),
  read("src/lib/learnerText.ts"),
  read("src/pages/SimilarQuestionsPage.tsx"),
  read("public/data/similar-question-groups.json"),
  read("src/styles/theme-current.css"),
]);

assert.ok(appSettings.includes("one global practice switch"));
assert.equal(appSettings.includes("AnswerModeExamId"), false);
assert.equal(settingsPanel.includes("answerModes["), false);
assert.equal(settingsPanel.includes('label="初階外匯"'), false, "Settings should not keep an empty FX tab.");
assert.ok(settingsPanel.includes('label="正解模式"'));
assert.ok(settingsPanel.includes('checked={answerModeEnabled}'));
assert.ok(settingsPanel.includes('onChange={handleAnswerModeChange}'));
assert.ok(fxQuiz.includes("getAnswerModeEnabled()"));
assert.ok(securitiesQuiz.includes("getAnswerModeEnabled()"));

for (const source of [securitiesQuiz, fxQuiz]) {
  assert.equal(source.includes("answer-impact-banner"), false, "Duplicate result summary must not render.");
  assert.equal(source.includes("你的答案"), false, "Learners should not see a repeated your-answer summary.");
  assert.equal(source.includes("正確答案"), false, "Learners should not see a repeated correct-answer summary.");
  assert.ok(source.includes("V93AnswerBadge"), "Native option-level result text is required.");
  assert.equal(source.includes("<Check"), false, "Option feedback must not use a check icon.");
  assert.equal(source.includes("<X"), false, "Option feedback must not use a cross icon.");
}
assert.ok(theme.includes("answer-confirm-full") && theme.includes("answer-reject-full"));
assert.ok(theme.includes("background: #16845f"));
assert.ok(theme.includes("background: #c9364e"));
assert.ok(theme.includes(".product-app .numeric-option-grid .glass-answer-button.glass-answer-correct,"));
assert.ok(theme.includes(".product-app .numeric-option-grid .glass-answer-button.glass-answer-wrong,"));
assert.ok(settingsPanel.includes("兩個題庫共用的練習偏好"));
assert.ok(settingsPanel.includes("一般練習直接顯示答案與解析"));

assert.equal(home.includes('to="/search"'), false, "Search must be removed from the home practice tools.");
assert.equal(home.includes('to="/image-quiz/today-wrong"'), false, "Today-wrong must be removed from the home practice tools.");

assert.ok(learnerText.includes("Traditional Chinese full-width punctuation"));
assert.ok(securitiesQuiz.includes("ScanQuestionContent") && securitiesQuiz.includes("ScanExplanationContent"));
assert.ok(fxQuiz.includes("formatLearnerText(currentQuestion.question)"));
assert.ok(fxQuiz.includes("formatLearnerText(currentQuestion.explanation"));

const similarPayload = JSON.parse(similarDataRaw) as {
  version: number;
  method: string;
  groups: Array<{ reviewed?: boolean; questionIds: string[] }>;
};
assert.equal(similarPayload.version, 4);
assert.equal(similarPayload.method, "manually-reviewed-high-precision-pairs-v4");
assert.ok(similarPayload.groups.length >= 15);
assert.ok(similarPayload.groups.every((group) => group.reviewed === true && group.questionIds.length === 2));
assert.ok(similarPage.includes("只保留題幹、四個選項與核心考點均完成核對的題組"));
assert.equal(similarPage.includes("相似度"), false);
assert.equal(similarPage.includes("MASTERY_KEY"), false);
assert.equal(similarPage.includes("NOTES_KEY"), false);

const progress: ForeignExchangeProgress = {
  version: 2,
  answers: {
    "fx-47-remittance-001": {
      selectedAnswer: "A",
      correctAnswer: "B",
      isCorrect: false,
      answeredAt: "2026-07-22T00:00:00.000Z",
    },
  },
  favorites: ["fx-47-remittance-001"],
  wrongReviewIds: ["fx-47-remittance-001"],
};
const wrongOnly = resetForeignExchangeProgressState(progress, "wrong");
assert.deepEqual(wrongOnly.answers, progress.answers);
assert.deepEqual(wrongOnly.favorites, progress.favorites);
assert.deepEqual(wrongOnly.wrongReviewIds, []);
const restart = resetForeignExchangeProgressState(progress, "restart");
assert.deepEqual(restart.answers, {});
assert.deepEqual(restart.favorites, progress.favorites);
assert.deepEqual(restart.wrongReviewIds, []);
const complete = resetForeignExchangeProgressState(progress, "complete");
assert.deepEqual(complete.answers, {});
assert.deepEqual(complete.favorites, []);
assert.deepEqual(complete.wrongReviewIds, []);

assert.ok(settingsPanel.includes("清空錯題清單"));
assert.ok(settingsPanel.includes("重新開始進度"));
assert.ok(settingsPanel.includes("刪除全部學習資料"));
assert.ok(settingsPanel.includes("clearAcknowledged"));
assert.ok(settingsPanel.includes("最後確認"));

assert.ok(theme.includes("v85.2 cleaner option labels and integrated timer"));
assert.ok(theme.includes(".answer-result-label"));
assert.ok(theme.includes("border-left: 1px solid rgba(71, 85, 105, 0.18)"));
console.log("v85.2 text-label feedback and integrated timer contracts passed.");
