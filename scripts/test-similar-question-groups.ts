import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const raw = await readFile(
  new URL("../public/data/similar-question-groups.json", import.meta.url),
  "utf8",
);
const payload = JSON.parse(raw) as {
  version: number;
  method: string;
  groupCount: number;
  groups: Array<{
    id: string;
    bankId: string;
    chapterId: string;
    similarity?: number;
    reviewed?: boolean;
    reason?: string;
    contrastTerms?: string[];
    questionIds: string[];
  }>;
};

assert.equal(payload.version, 4);
assert.equal(payload.method, "manually-reviewed-high-precision-pairs-v4");
assert.equal(payload.groupCount, payload.groups.length);
assert.ok(payload.groupCount >= 15, "Expected a useful reviewed comparison set.");

const usedQuestionIds = new Set<string>();
for (const group of payload.groups) {
  assert.equal(group.reviewed, true, `${group.id} must be manually reviewed.`);
  assert.equal(group.questionIds.length, 2, `${group.id} must remain a focused pair.`);
  assert.ok((group.similarity ?? 0) >= 0.8, `${group.id} fell below the structural threshold.`);
  assert.ok((group.reason ?? "").length >= 12, `${group.id} needs a concrete comparison reason.`);
  assert.ok((group.contrastTerms?.length ?? 0) >= 2, `${group.id} needs explicit comparison conditions.`);
  for (const questionId of group.questionIds) {
    assert.equal(
      usedQuestionIds.has(questionId),
      false,
      `${questionId} must not appear in more than one comparison pair.`,
    );
    usedQuestionIds.add(questionId);
  }
}

const source = await readFile(
  new URL("../scripts/build_similar_question_groups.py", import.meta.url),
  "utf8",
);
assert.ok(source.includes("complete question and four options inspected"));
assert.ok(source.includes("Identical questions with no meaningful condition or option difference are excluded"));
assert.equal(source.includes("TfidfVectorizer"), false, "Image/layout similarity must not drive the reviewed index.");

console.log(
  `Similar-question contracts passed: ${payload.groupCount} manually reviewed pairs, ${usedQuestionIds.size} unique questions.`,
);
