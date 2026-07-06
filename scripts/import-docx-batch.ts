import path from "node:path";
import { requireFlagValue } from "./lib/args";
import { listDocxFiles, writeJsonFile } from "./lib/data-files";
import { extractDocxText, parseQuestionsFromText } from "./lib/docx-parser";
import { parseSourceFileName } from "./lib/source-file";
import { validateQuestionSet } from "./lib/validation";

async function main() {
  const args = process.argv.slice(2);
  const batchId = requireFlagValue(args, "--batch");
  const rootDir = process.cwd();
  const sourceDir = path.join(rootDir, "source-docx", batchId);
  const stagingDir = path.join(rootDir, "staging", batchId);
  const reportDir = path.join(stagingDir, "reports");
  const docxFiles = await listDocxFiles(sourceDir);

  if (docxFiles.length === 0) {
    throw new Error(`No .docx files found in ${sourceDir}`);
  }

  console.log(`Importing ${docxFiles.length} DOCX file(s) from ${sourceDir}`);

  for (const docxFile of docxFiles) {
    const meta = parseSourceFileName(docxFile);
    const text = await extractDocxText(docxFile);
    const questions = parseQuestionsFromText(text, meta, batchId);
    const outputPath = path.join(stagingDir, meta.bankId, `${meta.chapter}.json`);
    const reportPath = path.join(reportDir, `${meta.sourceFile.replace(/\.docx$/i, "")}.validation.json`);
    const report = validateQuestionSet(questions, meta.sourceFile);

    await writeJsonFile(outputPath, questions);
    await writeJsonFile(reportPath, report);

    const status = report.passed ? "passed" : "needs review";
    console.log(`${meta.sourceFile}: ${questions.length} question(s), validation ${status}`);
  }

  console.log(`Staging output written to ${stagingDir}`);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
