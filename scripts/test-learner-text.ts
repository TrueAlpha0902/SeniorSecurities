import assert from "node:assert/strict";
import { readFile, readdir } from "node:fs/promises";
import { formatAnswerKey, formatLearnerText } from "../src/lib/learnerText";

assert.equal(formatAnswerKey("1"), "（1）");
assert.equal(formatLearnerText("下列何者正確?"), "下列何者正確？");
assert.equal(formatLearnerText("(1) 甲公司,乙公司;何者正確?"), "（1） 甲公司，乙公司；何者正確？");
assert.equal(formatLearnerText('所謂"風險"是指什麼?'), "所謂「風險」是指什麼？");
assert.equal(formatLearnerText("報酬率為3.25%,金額為1,000元."), "報酬率為3.25％，金額為1,000元。");
assert.equal(formatLearnerText("負債與權益比為1:2,何者正確?"), "負債與權益比為1：2，何者正確？");
assert.equal(formatLearnerText("詳見https://example.com/a?b=1"), "詳見https://example.com/a?b=1");
assert.equal(formatLearnerText("CAPM: E(Ri)=Rf+βi[E(Rm)-Rf]"), "CAPM： E（Ri）=Rf+βi［E（Rm）-Rf］");
assert.equal(formatLearnerText("甲.風險;乙.報酬"), "甲．風險；乙．報酬");
assert.equal(formatLearnerText("甲...乙"), "甲……乙");
assert.equal(formatLearnerText("Managers' Index"), "Managers’ Index");
assert.equal(formatLearnerText("甲/乙&丙~丁"), "甲／乙＆丙～丁");

const disallowedDisplayPunctuation = /[(),;:?!%\u005B\u005D{}]/;
const protectedValuePattern = /https?:\/\/[^\s]+|[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}|\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b|\b\d+\.\d+\b/gi;

function assertLearnerText(value: string, label: string): void {
  const formatted = formatLearnerText(value);
  const learnerVisibleLines = formatted
    .split("\n")
    .filter((line) => !/^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line));
  const withoutProtectedValues = learnerVisibleLines
    .join("\n")
    .replace(protectedValuePattern, "");
  assert.equal(
    disallowedDisplayPunctuation.test(withoutProtectedValues),
    false,
    `${label} still contains half-width learner punctuation: ${formatted}`,
  );
}

const securitiesRaw = await readFile(
  new URL("../build-data/securities-text-final.json", import.meta.url),
  "utf8",
);
const securities = JSON.parse(securitiesRaw) as {
  items: Array<{
    id: string;
    question: string;
    options: Record<string, string>;
    explanation: string;
  }>;
};

let fieldCount = 0;
for (const question of securities.items) {
  assertLearnerText(question.question, `${question.id} question`);
  fieldCount += 1;
  for (const [answer, option] of Object.entries(question.options)) {
    assertLearnerText(option, `${question.id} option ${answer}`);
    fieldCount += 1;
  }
  assertLearnerText(question.explanation, `${question.id} explanation`);
  fieldCount += 1;
}

const fxDirectory = new URL("../api/_data/foreign-exchange/", import.meta.url);
for (const fileName of (await readdir(fxDirectory)).filter((name) => /^\d{2}-(?:remittance|trade)\.json$/.test(name))) {
  const raw = await readFile(new URL(fileName, fxDirectory), "utf8");
  const questions = JSON.parse(raw) as Array<{
    id: string;
    question: string;
    options: Record<string, string>;
    explanation: string;
  }>;
  for (const question of questions) {
    assertLearnerText(question.question, `${question.id} question`);
    fieldCount += 1;
    for (const [answer, option] of Object.entries(question.options)) {
      assertLearnerText(option, `${question.id} option ${answer}`);
      fieldCount += 1;
    }
    assertLearnerText(question.explanation, `${question.id} explanation`);
    fieldCount += 1;
  }
}

console.log(`Learner text typography contracts passed for ${fieldCount.toLocaleString("en-US")} fields.`);
