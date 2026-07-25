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
  imageQuiz,
  generator,
  scanContent,
  imageQuizPage,
  answerDrill,
  similarQuestions,
  searchPage,
  securitiesApi,
  css,
  vercelIgnore,
  reconcileScript,
] = await Promise.all([
  read("src/lib/imageQuiz.ts"),
  read("scripts/generate-question-shards.ts"),
  read("src/components/ScanDerivedQuestionContent.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/AnswerDrillPage.tsx"),
  read("src/pages/SimilarQuestionsPage.tsx"),
  read("src/pages/SearchPage.tsx"),
  read("api/_securitiesQuestions.ts"),
  read("src/styles/glass.css"),
  read(".vercelignore"),
  read("scripts/reconcile_securities_text.py"),
]);

assert(
  imageQuiz.includes("questionText?: string") &&
    imageQuiz.includes("optionTexts?: Record<NumericAnswer, string>") &&
    imageQuiz.includes("explanationText?: string") &&
    imageQuiz.includes('kind: "project-scan-pages-only"'),
  "Image quiz model must include scan-derived text fields and provenance.",
);
assert(
  imageQuiz.includes("questionText: keepsQuestionCrop ? question.questionText : undefined") &&
    imageQuiz.includes("explanationText: keepsExplanationCrop ? question.explanationText : undefined"),
  "Question-editor crop changes must invalidate stale scan-derived text.",
);
assert(
  generator.includes('"build-data"') &&
    generator.includes("securities-text-final.json") &&
    !generator.includes('"public",\n  "data",\n  "securities-text-final.json"') &&
    generator.includes("Securities scan-text data version is stale") &&
    generator.includes("Securities scan-text source must be project scans only") &&
    generator.includes("Expected 3,526 scan-text questions") &&
    generator.includes("questionText: record.question") &&
    generator.includes("optionTexts: record.options") &&
    generator.includes("explanationText: record.explanation"),
  "Question shards must merge every scan-derived text record.",
);
assert(
  vercelIgnore.split(/\r?\n/).includes("source-materials") &&
    reconcileScript.includes("source-materials/securities-text-ocr-candidates.json") &&
    reconcileScript.includes("build-data/securities-text-final.json"),
  "OCR candidates must stay out of the deployment and final text must be build-only data.",
);
assert(
  scanContent.includes("StructuredScanText") &&
    scanContent.includes("ScanTable") &&
    scanContent.includes("ScanTextUnavailable") &&
    !scanContent.includes("查看原始題圖") &&
    !scanContent.includes("查看原始解析圖") &&
    !scanContent.includes("OriginalScanDialog") &&
    !scanContent.includes("OriginalScanDetails"),
  "Learner text components must render text and tables without exposing original-scan controls or learner-facing scan fallback.",
);
assert(
  imageQuizPage.includes("ScanQuestionContent") &&
    imageQuizPage.includes("ScanOptionText") &&
    imageQuizPage.includes("ScanExplanationContent") &&
    imageQuizPage.includes("prominent") &&
    imageQuizPage.includes("questionFocusRef") &&
    !imageQuizPage.includes("quiz-source-button") &&
    !imageQuizPage.includes("OriginalScanDialog") &&
    !imageQuizPage.includes("originalQuestionOpen") &&
    !imageQuizPage.includes("查看原始題圖"),
  "Main practice and mock-exam pages must emphasize text, restore question focus, and expose no original-scan action.",
);
assert(
  answerDrill.includes("ScanStaticOptionList") &&
    answerDrill.includes("ScanExplanationContent"),
  "Answer-drill mode must use full text content.",
);
assert(
  similarQuestions.includes("ScanQuestionContent") &&
    similarQuestions.includes("ScanOptionText") &&
    similarQuestions.includes("ScanExplanationContent"),
  "Similar-question mode must use full text content.",
);
assert(
  securitiesApi.includes("searchSecuritiesQuestions") &&
    securitiesApi.includes("question.questionText") &&
    securitiesApi.includes('question.optionTexts?.["1"]') &&
    securitiesApi.includes("question.explanationText") &&
    searchPage.includes("searchQuestionBank") &&
    !searchPage.includes("loadImageQuizBanks") &&
    !searchPage.includes("explanationText") &&
    !searchPage.includes("optionTexts"),
  "Search must index scan-derived text server-side while returning only learner-safe result summaries.",
);
assert(
  css.includes(".scan-text-question") &&
    css.includes(".scan-text-question.is-prominent") &&
    css.includes(".scan-question-label") &&
    css.includes(".glass-explanation .scan-text-explanation") &&
    css.includes("background: #ffffff") &&
    css.includes(".answer-option-text") &&
    !css.includes(".quiz-source-button") &&
    !css.includes(".original-scan-dialog") &&
    !css.includes(".original-scan-details") &&
    !css.includes("border-left: 5px solid var(--primary)"),
  "Question and explanation surfaces must remain neutral white, text-first, and free of original-scan controls or strong accent treatments.",
);

console.log("Securities text-mode contracts passed: generation, crop invalidation, neutral white question and explanation surfaces, no original-scan controls, practice, answer drill, similar questions, search, and text-only learner rendering.");
