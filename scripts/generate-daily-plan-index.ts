import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const sourcePath = resolve("public/data/pdf-image-quiz.json");
const outputPath = resolve("public/data/pdf-image-quiz-plan-index.json");
const checkOnly = process.argv.includes("--check");

type SourceQuestion = { id: string; bankId: string };
type SourceChapter = { questions?: SourceQuestion[] };
type SourceBank = { chapters?: SourceChapter[] };
type SourceData = { banks?: SourceBank[] };

const source = JSON.parse(await readFile(sourcePath, "utf8")) as SourceData;
const questions = (source.banks ?? []).flatMap((bank) =>
  (bank.chapters ?? []).flatMap((chapter) =>
    (chapter.questions ?? []).map((question) => ({
      id: question.id,
      bankId: question.bankId,
    })),
  ),
);

if (questions.some((question) => !question.id || !question.bankId)) {
  throw new Error("Daily plan index contains a question without id or bankId.");
}
if (new Set(questions.map((question) => question.id)).size !== questions.length) {
  throw new Error("Daily plan index contains duplicate question ids.");
}

const output = JSON.stringify({ version: 1, questions });
await mkdir(dirname(outputPath), { recursive: true });
let existing = "";
try {
  existing = await readFile(outputPath, "utf8");
} catch {
  // The first run creates the generated index.
}
if (existing !== output) {
  if (checkOnly) {
    throw new Error(
      "Daily plan index is stale. Run npm run generate:plan-index and commit the result.",
    );
  }
  await writeFile(outputPath, output, "utf8");
}
console.log(
  `Daily plan index ready: ${questions.length} questions, ${Buffer.byteLength(output).toLocaleString("en-US")} bytes`,
);
