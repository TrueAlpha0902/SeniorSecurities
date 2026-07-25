import { access, readFile, readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dist = path.join(root, "dist");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function exists(relativePath: string): Promise<boolean> {
  try {
    await access(path.join(dist, relativePath));
    return true;
  } catch {
    return false;
  }
}

async function listFiles(directory: string, prefix = ""): Promise<string[]> {
  const absolute = path.join(directory, prefix);
  const entries = await readdir(absolute, { withFileTypes: true });
  const nested = await Promise.all(
    entries.map(async (entry) => {
      const relative = path.join(prefix, entry.name);
      return entry.isDirectory() ? listFiles(directory, relative) : [relative.replaceAll("\\", "/")];
    }),
  );
  return nested.flat();
}

const forbiddenPaths = [
  "pdf-pages",
  "data/question-shards",
  "data/pdf-image-quiz.json",
  "data/banks.json",
  "data/banks",
] as const;

for (const relativePath of forbiddenPaths) {
  assert(!await exists(relativePath), `Paid or legacy authoring content leaked into dist/${relativePath}.`);
}

const trialPath = path.join(dist, "data", "pdf-image-quiz-trial.json");
const trialText = await readFile(trialPath, "utf8");
assert(!trialText.includes("pdf-pages/"), "Public trial still references removed scan pages.");
assert(!trialText.includes(".pdf"), "Public trial exposes source PDF names.");
const trial = JSON.parse(trialText) as {
  banks?: Array<{
    chapters?: Array<{
      sourceFile?: unknown;
      questions?: Array<{
        id?: unknown;
        answer?: unknown;
        sourceFile?: unknown;
        questionSegments?: unknown[];
        explanationSegments?: unknown[];
        questionText?: unknown;
        optionTexts?: Record<string, unknown>;
        explanationText?: unknown;
      }>;
    }>;
  }>;
};
const trialQuestions = (trial.banks || []).flatMap((bank) =>
  (bank.chapters || []).flatMap((chapter) => chapter.questions || []),
);
assert(trialQuestions.length === 10, `Public trial must contain 10 questions, got ${trialQuestions.length}.`);
for (const question of trialQuestions) {
  assert(typeof question.id === "string" && question.id.length > 0, "Trial question id is missing.");
  assert(["1", "2", "3", "4"].includes(String(question.answer || "")), `Trial answer is invalid: ${question.id}`);
  assert(question.sourceFile === "", `Trial sourceFile must be blank: ${question.id}`);
  assert(Array.isArray(question.questionSegments) && question.questionSegments.length === 0, `Trial question scan segments leaked: ${question.id}`);
  assert(Array.isArray(question.explanationSegments) && question.explanationSegments.length === 0, `Trial explanation scan segments leaked: ${question.id}`);
  assert(typeof question.questionText === "string" && question.questionText.trim().length > 0, `Trial question text is missing: ${question.id}`);
  assert(typeof question.explanationText === "string" && question.explanationText.trim().length > 0, `Trial explanation is missing: ${question.id}`);
  assert(
    ["1", "2", "3", "4"].every((key) => typeof question.optionTexts?.[key] === "string" && String(question.optionTexts[key]).trim().length > 0),
    `Trial options are incomplete: ${question.id}`,
  );
}

const dataFiles = (await listFiles(path.join(dist, "data"))).filter((file) => file.endsWith(".json"));
const trialRelative = "pdf-image-quiz-trial.json";
const forbiddenLearnerKeys = [
  '"questionText"',
  '"optionTexts"',
  '"explanationText"',
  '"questionSegments"',
  '"explanationSegments"',
  '"answerMask"',
] as const;
for (const relativePath of dataFiles) {
  if (relativePath === trialRelative) continue;
  const source = await readFile(path.join(dist, "data", relativePath), "utf8");
  for (const key of forbiddenLearnerKeys) {
    assert(!source.includes(key), `Public data/${relativePath} contains learner question field ${key}.`);
  }
}

const allDistFiles = await listFiles(dist);
assert(!allDistFiles.some((file) => /\.pdf$/i.test(file)), "Production dist contains source PDFs.");
assert(!allDistFiles.some((file) => file.startsWith("pdf-pages/") || file.includes("/pdf-pages/")), "Production dist contains source scan pages.");

const manifest = JSON.parse(
  await readFile(path.join(dist, "data", "question-release-manifest.json"), "utf8"),
) as { schemaVersion?: number; totalQuestions?: number; banks?: Array<{ chapters?: Array<{ path?: string }> }> };
assert(manifest.schemaVersion === 3, "Public question manifest schema is unexpected.");
assert(manifest.totalQuestions === 3_526, "Public question manifest count is unexpected.");
const privatePaths = (manifest.banks || []).flatMap((bank) =>
  (bank.chapters || []).map((chapter) => String(chapter.path || "")).filter(Boolean),
);
assert(privatePaths.length === 40, `Manifest must reference 40 private chapter shards, got ${privatePaths.length}.`);
for (const shardPath of privatePaths) {
  assert(!await exists(shardPath), `Private chapter shard was copied to dist/${shardPath}.`);
}

console.log(
  `Public content boundary passed: ${dataFiles.length} public JSON files, 10 text-only trial questions, 0 scans, 0 paid chapter shards, 0 legacy sample banks.`,
);
