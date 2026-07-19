import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getImageQuizSegments, type ImageQuizQuestion, type PdfCropSegment } from "../src/lib/imageQuiz";

const original: PdfCropSegment = { page: 1, src: "pdf-pages/test/page-01.webp", x: 10, y: 20, width: 900, height: 100, pageWidth: 1000, pageHeight: 1400 };
const mobile: PdfCropSegment = { ...original, width: 450 };
const reviewedVerification = `pixel-and-visual-reviewed:v2:${"a".repeat(64)}:${"b".repeat(64)}:100000:${"c".repeat(64)}` as const;
const question = {
  questionSegments: [original],
  explanationSegments: [original],
  mobileQuestionSegments: [mobile],
  mobileExplanationSegments: [mobile],
  mobileQuestionSegmentsVerification: reviewedVerification,
  mobileExplanationSegmentsVerification: reviewedVerification,
} as ImageQuizQuestion;

assert.equal(getImageQuizSegments(question, "question", false), question.questionSegments, "desktop must keep the original question crop");
assert.equal(getImageQuizSegments(question, "explanation", false), question.explanationSegments, "desktop must keep the original explanation crop");
assert.equal(getImageQuizSegments(question, "question", true), question.mobileQuestionSegments, "mobile should use a reviewed question alternate");
assert.equal(getImageQuizSegments(question, "explanation", true), question.mobileExplanationSegments, "mobile should use a reviewed explanation alternate");

const withoutAlternate = { ...question, mobileQuestionSegments: undefined };
assert.equal(getImageQuizSegments(withoutAlternate, "question", true), withoutAlternate.questionSegments, "missing mobile data must safely fall back");
const emptyAlternate = { ...question, mobileExplanationSegments: [] };
assert.equal(getImageQuizSegments(emptyAlternate, "explanation", true), emptyAlternate.explanationSegments, "empty mobile data must safely fall back");
const unverifiedAlternate = { ...question, mobileQuestionSegmentsVerification: undefined };
assert.equal(getImageQuizSegments(unverifiedAlternate, "question", true), unverifiedAlternate.questionSegments, "unverified mobile data must safely fall back");
const malformedVerification = {
  ...question,
  mobileQuestionSegmentsVerification: "pixel-and-visual-reviewed" as ImageQuizQuestion["mobileQuestionSegmentsVerification"],
};
assert.equal(getImageQuizSegments(malformedVerification, "question", true), malformedVerification.questionSegments, "malformed review evidence must safely fall back");
const outsideSource = {
  ...question,
  mobileQuestionSegments: [{ ...mobile, x: original.x - 1 }],
};
assert.equal(getImageQuizSegments(outsideSource, "question", true), outsideSource.questionSegments, "mobile crops outside the reviewed source must safely fall back");
const reversedOrder = {
  ...question,
  mobileQuestionSegments: [
    { ...mobile, y: original.y + 20 },
    { ...mobile, y: original.y + 10 },
  ],
};
assert.equal(getImageQuizSegments(reversedOrder, "question", true), reversedOrder.questionSegments, "out-of-order mobile crops must safely fall back");

const generator = readFileSync("scripts/generate-mobile-segment-candidates.py", "utf8");
assert.match(generator, /All-bank approval is forbidden/, "the generator must forbid unreviewed all-bank apply");
assert.match(generator, /candidate-contact-sheet-sha256/, "approved candidates must bind the reviewed preview contact sheet");
assert.match(generator, /mobile-segment-review-approval/, "approved candidates must emit persistent review evidence");
assert.match(generator, /--reject-field/, "visual review must be able to reject an unsafe candidate");

console.log("Mobile image segment selection tests passed.");
