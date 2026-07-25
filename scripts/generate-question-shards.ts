import { createHash } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "public", "data", "pdf-image-quiz.json");
const textSourcePath = path.join(
  root,
  "build-data",
  "securities-text-final.json",
);
const outputRoot = path.join(root, "public", "data", "question-shards");
const manifestPath = path.join(
  root,
  "public",
  "data",
  "question-release-manifest.json",
);
const generatedReleasePath = path.join(
  root,
  "src",
  "generated",
  "questionRelease.ts",
);
const checkOnly = process.argv.includes("--check");
const answerKeys = ["1", "2", "3", "4"] as const;

type NumericAnswer = (typeof answerKeys)[number];

type Question = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  number: number;
  answer: NumericAnswer;
  questionText?: string;
  optionTexts?: Record<NumericAnswer, string>;
  explanationText?: string;
  textSource?: TextRecord["source"];
  [key: string]: unknown;
};

type Chapter = {
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterSlug: string;
  sourceFile: string;
  questionCount: number;
  questions: Question[];
};

type Bank = { bankId: string; bankTitle: string; chapters: Chapter[] };
type SourceData = { banks: Bank[] };

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
    kind: "project-scan-pages-only";
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

type Manifest = {
  schemaVersion: 3;
  releaseId: string;
  sourceHash: string;
  generatedAt: string;
  totalQuestions: number;
  questionIndex: Record<string, string>;
  banks: Array<{
    bankId: string;
    bankTitle: string;
    questionCount: number;
    chapters: Array<{
      chapterId: string;
      chapterTitle: string;
      chapterSlug: string;
      sourceFile: string;
      questionCount: number;
      path: string;
      hash: string;
      bytes: number;
    }>;
  }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function stableJson(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

function sha256(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}

function safeSegment(value: string): string {
  return (
    value.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "") || "chapter"
  );
}

function validateTextRecord(record: TextRecord): void {
  assert(record.id.length > 0, "Securities text record has an empty ID.");
  assert(record.question.trim() === record.question && record.question.length > 0, `${record.id}: invalid question text.`);
  assert(record.explanation.trim() === record.explanation && record.explanation.length > 0, `${record.id}: invalid explanation text.`);
  assert(answerKeys.includes(record.answer), `${record.id}: invalid answer.`);
  assert(Object.keys(record.options).length === 4, `${record.id}: expected four text options.`);
  for (const key of answerKeys) {
    const value = record.options[key];
    assert(typeof value === "string" && value.trim() === value && value.length > 0, `${record.id}: missing text option ${key}.`);
  }
  const combined = [record.question, record.explanation, ...Object.values(record.options)].join(" ");
  assert(!combined.includes("\uFFFD") && !combined.includes("\0"), `${record.id}: unsafe Unicode in scan text.`);
  assert(record.source.kind === "project-scan-pages-only", `${record.id}: invalid scan text source.`);
  assert(/^[a-f0-9]{64}$/.test(record.source.questionSegmentsSha256), `${record.id}: invalid question crop hash.`);
  assert(/^[a-f0-9]{64}$/.test(record.source.explanationSegmentsSha256), `${record.id}: invalid explanation crop hash.`);
}

function mergeText(question: Question, record: TextRecord): Question {
  assert(record.bankId === question.bankId, `${question.id}: text bank mismatch.`);
  assert(record.bankTitle === question.bankTitle, `${question.id}: text bank title mismatch.`);
  assert(record.chapterId === question.chapterId, `${question.id}: text chapter mismatch.`);
  assert(record.chapterTitle === question.chapterTitle, `${question.id}: text chapter title mismatch.`);
  assert(record.number === question.number, `${question.id}: text question number mismatch.`);
  assert(record.answer === question.answer, `${question.id}: text answer mismatch.`);
  return {
    ...question,
    questionText: record.question,
    optionTexts: record.options,
    explanationText: record.explanation,
    textSource: record.source,
  };
}

async function build(): Promise<{
  manifest: Manifest;
  files: Map<string, string>;
}> {
  const [raw, rawText] = await Promise.all([
    readFile(sourcePath),
    readFile(textSourcePath),
  ]);
  const data = JSON.parse(raw.toString("utf8")) as SourceData;
  const textData = JSON.parse(rawText.toString("utf8")) as TextData;
  assert(textData.version >= 4, "Securities scan-text data version is stale.");
  assert(
    textData.source.includes("project-scan-pages-only"),
    "Securities scan-text source must be project scans only.",
  );
  assert(textData.questionCount === 3_526, `Expected 3,526 scan-text questions, got ${textData.questionCount}.`);
  assert(textData.items.length === textData.questionCount, "Scan-text count is stale.");
  const textById = new Map<string, TextRecord>();
  for (const record of textData.items) {
    validateTextRecord(record);
    assert(!textById.has(record.id), `Duplicate scan-text ID: ${record.id}`);
    textById.set(record.id, record);
  }

  const sourceHash = sha256(Buffer.concat([raw, Buffer.from("\0"), rawText]));
  const files = new Map<string, string>();
  let totalQuestions = 0;
  const questionIndex: Record<string, string> = {};
  const consumedTextIds = new Set<string>();

  const banks = data.banks.map((bank) => {
    let bankQuestionCount = 0;
    const chapters = bank.chapters.map((chapter) => {
      const questions = chapter.questions.map((question) => {
        const record = textById.get(question.id);
        assert(record, `${question.id}: missing scan-derived text.`);
        consumedTextIds.add(question.id);
        return mergeText(question, record);
      });
      const mergedChapter = { ...chapter, questions };
      const payload = {
        bankId: bank.bankId,
        bankTitle: bank.bankTitle,
        chapter: mergedChapter,
      };
      const content = stableJson(payload);
      const relativePath = `data/question-shards/${safeSegment(bank.bankId)}/${safeSegment(chapter.chapterSlug || chapter.chapterId)}.json`;
      files.set(relativePath, content);
      for (const question of questions) {
        if (!question.id || questionIndex[question.id]) {
          throw new Error(
            `Duplicate or empty question id: ${question.id || "<empty>"}`,
          );
        }
        questionIndex[question.id] = relativePath;
      }
      const questionCount = questions.length;
      assert(chapter.questionCount === questionCount, `${bank.bankId}/${chapter.chapterId}: source question count is stale.`);
      bankQuestionCount += questionCount;
      totalQuestions += questionCount;
      return {
        chapterId: chapter.chapterId,
        chapterTitle: chapter.chapterTitle,
        chapterSlug: chapter.chapterSlug,
        sourceFile: chapter.sourceFile,
        questionCount,
        path: relativePath,
        hash: sha256(content),
        bytes: Buffer.byteLength(content),
      };
    });
    return {
      bankId: bank.bankId,
      bankTitle: bank.bankTitle,
      questionCount: bankQuestionCount,
      chapters,
    };
  });

  assert(totalQuestions === 3_526, `Expected 3,526 questions, got ${totalQuestions}.`);
  assert(consumedTextIds.size === textById.size, `Found ${textById.size - consumedTextIds.size} orphan scan-text records.`);

  const manifest: Manifest = {
    schemaVersion: 3,
    releaseId: sourceHash.slice(0, 16),
    sourceHash,
    generatedAt: new Date(0).toISOString(),
    totalQuestions,
    questionIndex: Object.fromEntries(
      Object.entries(questionIndex).sort(([left], [right]) =>
        left.localeCompare(right),
      ),
    ),
    banks,
  };
  return { manifest, files };
}

async function verifyFile(filePath: string, expected: string): Promise<void> {
  const actual = await readFile(filePath, "utf8").catch(() => "");
  if (actual !== expected)
    throw new Error(
      `Generated question shard is stale: ${path.relative(root, filePath)}`,
    );
}

async function main(): Promise<void> {
  const { manifest, files } = await build();
  const manifestContent = stableJson(manifest);
  const generatedReleaseContent = `// Generated by scripts/generate-question-shards.ts. Do not edit.\nexport const QUESTION_RELEASE_ID = ${JSON.stringify(manifest.releaseId)};\n`;

  if (checkOnly) {
    await verifyFile(manifestPath, manifestContent);
    await verifyFile(generatedReleasePath, generatedReleaseContent);
    for (const [relativePath, content] of files)
      await verifyFile(path.join(root, "public", relativePath), content);
    console.log(
      `Question shard manifest verified: ${manifest.totalQuestions} questions, ${files.size} chapter shards, all scan-text fields present`,
    );
    return;
  }

  await rm(outputRoot, { recursive: true, force: true });
  for (const [relativePath, content] of files) {
    const target = path.join(root, "public", relativePath);
    await mkdir(path.dirname(target), { recursive: true });
    await writeFile(target, content, "utf8");
  }
  await writeFile(manifestPath, manifestContent, "utf8");
  await mkdir(path.dirname(generatedReleasePath), { recursive: true });
  await writeFile(generatedReleasePath, generatedReleaseContent, "utf8");
  console.log(
    `Question shards generated: ${manifest.totalQuestions} questions, ${files.size} chapter shards, release ${manifest.releaseId}, full scan text included`,
  );
}

void main();
