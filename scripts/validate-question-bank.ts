import fs from "node:fs/promises";
import path from "node:path";
import { getPositionalArg } from "./lib/args";
import { readProductionData, readQuestionFiles, writeJsonFile } from "./lib/data-files";
import { validateQuestionSet } from "./lib/validation";

async function main() {
  const target = path.resolve(process.cwd(), getPositionalArg(process.argv.slice(2), "public/data"));
  const banksPath = path.join(target, "banks.json");
  const hasBanksFile = await exists(banksPath);
  const { banks, questions } = hasBanksFile
    ? await readProductionData(target)
    : { banks: [], questions: await readQuestionFiles(target) };
  const report = validateQuestionSet(questions, target, banks);

  if (!hasBanksFile) {
    await writeJsonFile(path.join(target, "reports", "validation.json"), report);
  }

  console.log(`Validation scope: ${target}`);
  console.log(`Banks: ${report.totalBanks}`);
  console.log(`Chapters: ${report.totalChapters}`);
  console.log(`Questions: ${report.totalQuestions}`);
  console.log(`Valid: ${report.validQuestions}`);
  console.log(`Invalid: ${report.invalidQuestions}`);
  console.log(`Duplicate ids: ${report.duplicateIds.length}`);
  console.log(`Possible duplicate questions: ${report.possibleDuplicateQuestions.length}`);
  console.log(`Missing explanations: ${report.missingExplanations.length}`);
  console.log(`Missing option groups: ${report.missingOptions.length}`);
  console.log(`Invalid answers: ${report.invalidAnswers.length}`);
  console.log(`Needs manual review: ${report.questionsNeedingManualReview.length}`);

  if (!report.passed) {
    console.error("Validation failed.");
    process.exitCode = 1;
  }
}

async function exists(filePath: string): Promise<boolean> {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
