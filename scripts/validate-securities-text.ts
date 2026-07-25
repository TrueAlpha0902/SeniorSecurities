import { createHash } from "node:crypto";
import { access, readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const textPath = path.join(root, "build-data", "securities-text-final.json");
const imageDataPath = path.join(root, "public", "data", "pdf-image-quiz.json");
const scanManifestPath = path.join(root, "docs", "securities-scan-manifest.json");
const reconciliationAuditPath = path.join(
  root,
  "docs",
  "securities-text-reconciliation-audit.json",
);
const manualOverridesPath = path.join(
  root,
  "docs",
  "securities-text-manual-overrides.json",
);
const reviewPath = path.join(root, "docs", "securities-text-full-review.json");
const answerKeys = ["1", "2", "3", "4"] as const;

async function fileExists(filePath: string): Promise<boolean> {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}
type NumericAnswer = (typeof answerKeys)[number];

type CropSegment = { src: string };
type ImageQuestion = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  number: number;
  answer: NumericAnswer;
  questionSegments: CropSegment[];
  explanationSegments: CropSegment[];
};
type ImageData = {
  banks: Array<{
    chapters: Array<{ questions: ImageQuestion[] }>;
  }>;
};
type TextRecord = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  number: number;
  answer: NumericAnswer;
  question: string;
  options: Record<NumericAnswer, string>;
  explanation: string;
  source: {
    kind: string;
    questionSegmentsSha256: string;
    explanationSegmentsSha256: string;
  };
};
type TextData = {
  version: number;
  source: string;
  questionCount: number;
  items: TextRecord[];
};
type ScanManifest = {
  version: number;
  source: string;
  fileCount: number;
  totalBytes: number;
  files: Array<{ path: string; bytes: number; sha256: string }>;
};
type ReconciliationAudit = {
  version: number;
  source: string;
  questionCount: number;
  questionAndExplanationTextFieldCount: number;
  optionTextFieldCount: number;
  learnerTextFieldCount: number;
  scanPageCount: number;
  changedQuestionCount: number;
  manualOverrideQuestionCount: number;
  finalVisualReviewQuestionCount: number;
  spotVisualReviewQuestionCount: number;
  secondSpotVisualReviewQuestionCount: number;
  totalVisualReviewQuestionCount: number;
  visualReviewChapterCount: number;
  visualReviewQuestionIds: string[];
  multiEngineConsensusQuestionCount: number;
  expandedReferenceExplanationCount: number;
  outputSha256: string;
  forbiddenExternalSourcesUsed: boolean;
};
type ManualOverrides = {
  source: string;
  items: Record<string, unknown>;
};
type ReviewData = {
  version: number;
  items: Array<{ id: string }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(data: Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function allLearnerText(record: TextRecord): string {
  return [
    record.question,
    record.explanation,
    ...answerKeys.map((key) => record.options[key]),
  ].join("\n");
}


function assertBalancedPunctuation(text: string, id: string, field: string): void {
  for (const [open, close] of [
    ["（", "）"],
    ["(", ")"],
    ["[", "]"],
    ["「", "」"],
    ["『", "』"],
    ["《", "》"],
  ] as const) {
    assert(
      [...text].filter((character) => character === open).length ===
        [...text].filter((character) => character === close).length,
      `${id}: unbalanced ${open}${close} in ${field}.`,
    );
  }
}

function assertMarkdownTables(text: string, id: string, field: string): void {
  if (!text.includes("|")) return;
  const lines = text.replace(/\r\n?/g, "\n").split("\n");
  const tableLineIndexes = lines
    .map((line, index) => (line.trim().startsWith("|") ? index : -1))
    .filter((index) => index >= 0);
  const first = tableLineIndexes[0];
  if (first === undefined) return;
  const previousLine = first > 0 ? (lines[first - 1] ?? "") : "";
  assert(
    first === 0 || previousLine.trim() === "",
    `${id}: ${field} table must begin in a separate block.`,
  );
  for (const index of tableLineIndexes) {
    const line = (lines[index] ?? "").trim();
    assert(line.endsWith("|"), `${id}: malformed ${field} table row.`);
  }
  const firstLine = lines[first] ?? "";
  const separator = (lines[first + 1] ?? "").trim();
  assert(
    /^\|(?:\s*:?-{3,}:?\s*\|)+$/.test(separator),
    `${id}: ${field} table separator is invalid.`,
  );
  const expectedCells = (firstLine.match(/\|/g) || []).length;
  for (const index of tableLineIndexes) {
    assert(
      (lines[index]?.match(/\|/g) || []).length === expectedCells,
      `${id}: ${field} table column count mismatch.`,
    );
  }
}

async function main(): Promise<void> {
  const [
    textRaw,
    textData,
    imageData,
    scanManifest,
    reconciliationAudit,
    manualOverrides,
    reviewData,
  ] = await Promise.all([
    readFile(textPath),
    readJson<TextData>(textPath),
    readJson<ImageData>(imageDataPath),
    readJson<ScanManifest>(scanManifestPath),
    readJson<ReconciliationAudit>(reconciliationAuditPath),
    readJson<ManualOverrides>(manualOverridesPath),
    readJson<ReviewData>(reviewPath),
  ]);
  const imageQuestions = imageData.banks.flatMap((bank) =>
    bank.chapters.flatMap((chapter) => chapter.questions),
  );
  assert(
    !(await fileExists(path.join(root, "public", "data", "securities-text.json"))) &&
      !(await fileExists(path.join(root, "public", "data", "securities-text-final.json"))),
    "Internal OCR source datasets must not be exposed from public/data.",
  );
  const imageById = new Map(
    imageQuestions.map((question) => [question.id, question]),
  );

  assert(textData.version >= 4, "Securities text data version is stale.");
  assert(
    textData.source.includes("project-scan-pages-only"),
    "Securities text source must be project scans only.",
  );
  assert(
    textData.questionCount === 3_526,
    `Expected 3,526 text questions, got ${textData.questionCount}.`,
  );
  assert(textData.items.length === 3_526, "Securities text item count is stale.");
  assert(
    imageQuestions.length === 3_526,
    `Expected 3,526 image questions, got ${imageQuestions.length}.`,
  );
  assert(
    new Set(textData.items.map((item) => item.id)).size === 3_526,
    "Securities text IDs are not unique.",
  );
  assert(
    new Set(imageQuestions.map((item) => item.id)).size === 3_526,
    "Image question IDs are not unique.",
  );

  const manualOverrideIds = new Set(Object.keys(manualOverrides.items));
  const reviewIds = new Set(reviewData.items.map((item) => item.id));
  assert(
    manualOverrides.source === "project scan crops only",
    "Manual override source must be project scan crops only.",
  );
  assert(reviewIds.size === 187, `Expected 187 high-risk review records, got ${reviewIds.size}.`);
  assert(
    [...reviewIds].every((id) => manualOverrideIds.has(id)),
    "Every high-risk OCR record must have a scan-verified override.",
  );

  assert(reconciliationAudit.version >= 2, "Securities reconciliation audit is stale.");
  assert(
    reconciliationAudit.source === "project-scan-pages-only",
    "Reconciliation audit source mismatch.",
  );
  assert(reconciliationAudit.questionCount === 3_526, "Audit question count mismatch.");
  assert(
    reconciliationAudit.questionAndExplanationTextFieldCount === 7_052,
    "Audit question/explanation field count mismatch.",
  );
  assert(
    reconciliationAudit.optionTextFieldCount === 14_104,
    "Audit option field count mismatch.",
  );
  assert(
    reconciliationAudit.learnerTextFieldCount === 21_156,
    "Audit learner-field count mismatch.",
  );
  assert(reconciliationAudit.scanPageCount === 818, "Audit scan-page count mismatch.");
  assert(
    reconciliationAudit.manualOverrideQuestionCount === manualOverrideIds.size,
    "Audit manual-override count mismatch.",
  );
  assert(
    reconciliationAudit.totalVisualReviewQuestionCount ===
      reconciliationAudit.finalVisualReviewQuestionCount +
        reconciliationAudit.spotVisualReviewQuestionCount +
        reconciliationAudit.secondSpotVisualReviewQuestionCount,
    "Audit visual-review count mismatch.",
  );
  assert(
    reconciliationAudit.visualReviewQuestionIds.length ===
      reconciliationAudit.totalVisualReviewQuestionCount &&
      new Set(reconciliationAudit.visualReviewQuestionIds).size ===
        reconciliationAudit.totalVisualReviewQuestionCount,
    "Audit visual-review ID list mismatch.",
  );
  assert(
    reconciliationAudit.visualReviewChapterCount === 40,
    "Every securities chapter must have a visual review sample.",
  );
  assert(
    reconciliationAudit.multiEngineConsensusQuestionCount +
      reconciliationAudit.manualOverrideQuestionCount ===
      3_526,
    "Audit review-strategy totals mismatch.",
  );
  assert(
    reconciliationAudit.forbiddenExternalSourcesUsed === false,
    "Forbidden external source was recorded.",
  );
  assert(
    reconciliationAudit.outputSha256 === sha256(textRaw),
    "Reconciled text SHA-256 does not match its audit.",
  );

  const visualReviewChapters = new Set(
    reconciliationAudit.visualReviewQuestionIds.map((id) => {
      const question = imageById.get(id);
      assert(question, `${id}: visual-review question is missing.`);
      return `${question.bankId}:${question.chapterId}`;
    }),
  );
  assert(
    visualReviewChapters.size === reconciliationAudit.visualReviewChapterCount,
    "Audit visual-review chapter coverage mismatch.",
  );

  const usedScanPaths = new Set<string>();
  for (const record of textData.items) {
    const imageQuestion = imageById.get(record.id);
    assert(imageQuestion, `${record.id}: no matching scan question.`);
    assert(record.bankId === imageQuestion.bankId, `${record.id}: bank mismatch.`);
    assert(
      record.bankTitle === imageQuestion.bankTitle,
      `${record.id}: bank title mismatch.`,
    );
    assert(
      record.chapterId === imageQuestion.chapterId,
      `${record.id}: chapter mismatch.`,
    );
    assert(
      record.chapterTitle === imageQuestion.chapterTitle,
      `${record.id}: chapter title mismatch.`,
    );
    assert(record.number === imageQuestion.number, `${record.id}: number mismatch.`);
    assert(record.answer === imageQuestion.answer, `${record.id}: answer mismatch.`);
    assert(answerKeys.includes(record.answer), `${record.id}: invalid answer.`);
    assert(
      record.question.trim() === record.question && record.question.length > 0,
      `${record.id}: empty or untrimmed question.`,
    );
    assert(
      record.explanation.trim() === record.explanation &&
        record.explanation.length > 0,
      `${record.id}: empty or untrimmed explanation.`,
    );
    assert(Object.keys(record.options).length === 4, `${record.id}: expected four options.`);
    for (const key of answerKeys) {
      const option = record.options[key];
      assert(
        typeof option === "string" &&
          option.trim() === option &&
          option.length > 0,
        `${record.id}: missing option ${key}.`,
      );
    }
    const learnerText = allLearnerText(record);
    assertBalancedPunctuation(record.question, record.id, "question");
    assertBalancedPunctuation(record.explanation, record.id, "explanation");
    for (const key of answerKeys) {
      assertBalancedPunctuation(record.options[key], record.id, `option ${key}`);
    }
    assertMarkdownTables(record.question, record.id, "question");
    assertMarkdownTables(record.explanation, record.id, "explanation");
    const normalizedOptions = answerKeys.map((key) =>
      record.options[key].replace(/\s+/g, ""),
    );
    const duplicateOptionCount =
      normalizedOptions.length - new Set(normalizedOptions).size;
    assert(
      duplicateOptionCount === 0 ||
        (record.id === "investment-ch07-pdf-0028" && duplicateOptionCount === 1),
      `${record.id}: unexpected duplicate option text.`,
    );
    assert(
      !learnerText.includes("\uFFFD") && !learnerText.includes("\0"),
      `${record.id}: unsafe Unicode.`,
    );
    assert(
      !/(?:組閤|適閤|另\+外|浮現值|銷貨收入浮額)/.test(learnerText),
      `${record.id}: known OCR artifact remains.`,
    );
    assert(
      !/(?:Coν|成本く淨變現價值|股東常會\s*4つ|IⅣ|資產週轉率次期股利|3\.5 \$2\.000\.000|\$1\.22 \$40×|分散 48 單一|是 24 否|有 0 時|認購權 24 利|十日前 33|將 46 應|二分 58 之一|至第三 0 他|\(共19項\): 440|直線 409 法)/.test(
        learnerText,
      ),
      `${record.id}: reviewed OCR contamination remains.`,
    );
    assert(
      !/[\u3040-\u30ff]/.test(learnerText),
      `${record.id}: Japanese OCR glyph remains.`,
    );
    assert(
      !/^同(?:上|前|第).{0,15}題解析/.test(record.explanation),
      `${record.id}: unresolved cross-reference explanation.`,
    );
    assert(
      !/^\s*\d{1,4}[.、]\s*/.test(record.question),
      `${record.id}: printed question number leaked into text.`,
    );
    assert(
      !/(?:OCR|SHA-?256|裁切座標|信心值|模型名稱|project-scan-pages-only)/i.test(
        learnerText,
      ),
      `${record.id}: internal audit details leaked into learner text.`,
    );
    assert(
      !/(?:JY電子檔|JY筆記|JY價值筆記)/i.test(learnerText),
      `${record.id}: forbidden external note source leaked into text.`,
    );
    assert(
      record.source.kind === "project-scan-pages-only",
      `${record.id}: invalid source kind.`,
    );
    assert(
      /^[a-f0-9]{64}$/.test(record.source.questionSegmentsSha256),
      `${record.id}: invalid question crop hash.`,
    );
    assert(
      /^[a-f0-9]{64}$/.test(record.source.explanationSegmentsSha256),
      `${record.id}: invalid explanation crop hash.`,
    );
    for (const segment of [
      ...imageQuestion.questionSegments,
      ...imageQuestion.explanationSegments,
    ]) {
      usedScanPaths.add(path.posix.join("public", segment.src));
    }
  }

  assert(scanManifest.version === 1, "Scan manifest version mismatch.");
  assert(
    scanManifest.source === "project-scan-pages-only",
    "Scan manifest source mismatch.",
  );
  assert(
    scanManifest.fileCount === 818,
    `Expected 818 scan pages, got ${scanManifest.fileCount}.`,
  );
  assert(scanManifest.files.length === 818, "Scan manifest file list is stale.");
  let verifiedBytes = 0;
  const manifestPaths = new Set(scanManifest.files.map((file) => file.path));
  for (const file of scanManifest.files) {
    const absolutePath = path.join(root, file.path);
    const [raw, fileStat] = await Promise.all([
      readFile(absolutePath),
      stat(absolutePath),
    ]);
    assert(fileStat.size === file.bytes, `${file.path}: scan byte size changed.`);
    assert(sha256(raw) === file.sha256, `${file.path}: scan SHA-256 changed.`);
    verifiedBytes += file.bytes;
  }
  assert(
    verifiedBytes === scanManifest.totalBytes,
    "Scan manifest total byte count is stale.",
  );
  for (const usedPath of usedScanPaths) {
    assert(manifestPaths.has(usedPath), `${usedPath}: referenced scan missing from manifest.`);
  }

  console.log(
    `Securities scan-text validation passed: 3,526 questions, 7,052 question/explanation fields, 14,104 option fields, 21,156 learner text fields, 187 high-risk records scan-overridden, ${reconciliationAudit.totalVisualReviewQuestionCount} final visual spot checks, and 818 immutable project scan pages (${verifiedBytes.toLocaleString()} bytes).`,
  );
}

await main();
