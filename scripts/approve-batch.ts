import fs from "node:fs/promises";
import path from "node:path";
import type { QuizBank } from "../src/types";
import { requireFlagValue } from "./lib/args";
import { listJsonFiles, readJsonFile, readProductionData, writeJsonFile } from "./lib/data-files";
import { getChapterSlug } from "./lib/chapter";
import type { StagedQuestion, ValidationReport } from "./lib/types";
import { normalizeQuestionText, validateQuestionSet } from "./lib/validation";

async function main() {
  const args = process.argv.slice(2);
  const batchId = requireFlagValue(args, "--batch");
  const rootDir = process.cwd();
  const stagingDir = path.join(rootDir, "staging", batchId);
  const reportsDir = path.join(stagingDir, "reports");
  const publicDataDir = path.join(rootDir, "public", "data");

  await confirmReportsPassed(reportsDir);

  const stagingFiles = (await listJsonFiles(stagingDir)).filter((file) => !file.includes(`${path.sep}reports${path.sep}`));
  if (stagingFiles.length === 0) {
    throw new Error(`No staged question JSON files found in ${stagingDir}`);
  }

  const production = await readProductionData(publicDataDir);
  const mergedBanks = new Map<string, QuizBank>(production.banks.map((bank) => [bank.id, cloneBank(bank)]));

  for (const stagingFile of stagingFiles) {
    const questions = await readJsonFile<StagedQuestion[]>(stagingFile);
    if (questions.length === 0) {
      continue;
    }

    const firstQuestion = questions[0];
    if (!firstQuestion) {
      continue;
    }
    const bankId = firstQuestion.bankId;
    const bankTitle = firstQuestion.bankTitle;
    const chapter = firstQuestion.chapter;
    const productionChapterFile = `banks/${bankId}/${chapter}.json`;
    const productionChapterPath = path.join(publicDataDir, productionChapterFile);
    const existingQuestions = await readOptionalQuestions(productionChapterPath);
    const mergedQuestions = mergeQuestions(existingQuestions, questions);

    await writeJsonFile(productionChapterPath, mergedQuestions);

    const bank = mergedBanks.get(bankId) ?? {
      id: bankId,
      title: bankTitle,
      chapters: []
    };
    const chapterEntry = bank.chapters.find((entry) => entry.id === chapter);
    if (chapterEntry) {
      chapterEntry.questionCount = mergedQuestions.length;
      chapterEntry.file = productionChapterFile;
      chapterEntry.title = chapter;
    } else {
      bank.chapters.push({
        id: chapter,
        title: chapter,
        file: productionChapterFile,
        questionCount: mergedQuestions.length
      });
    }
    bank.chapters.sort((left, right) => getChapterSlug(left.id).localeCompare(getChapterSlug(right.id)));
    mergedBanks.set(bankId, bank);
  }

  const banks = [...mergedBanks.values()].sort((left, right) => left.title.localeCompare(right.title, "zh-Hant"));
  await writeJsonFile(path.join(publicDataDir, "banks.json"), banks);

  const mergedProduction = await readProductionData(publicDataDir);
  const report = validateQuestionSet(mergedProduction.questions, publicDataDir, mergedProduction.banks);
  if (!report.passed) {
    await writeJsonFile(path.join(stagingDir, "reports", "post-merge.validation.json"), report);
    throw new Error("Global validation failed after merge. See staging post-merge report.");
  }

  await writeJsonFile(path.join(stagingDir, "reports", "post-merge.validation.json"), report);
  console.log(`Approved ${batchId} into ${publicDataDir}`);
}

async function confirmReportsPassed(reportsDir: string): Promise<void> {
  const entries = await fs.readdir(reportsDir, { withFileTypes: true });
  const reportFiles = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".validation.json"))
    .map((entry) => path.join(reportsDir, entry.name));

  if (reportFiles.length === 0) {
    throw new Error(`No validation reports found in ${reportsDir}`);
  }

  const reports = await Promise.all(reportFiles.map((file) => readJsonFile<ValidationReport>(file)));
  const failed = reports.filter((report) => !report.passed);
  if (failed.length > 0) {
    throw new Error(`Cannot approve batch. Failed validation reports: ${failed.map((report) => report.scope).join(", ")}`);
  }
}

async function readOptionalQuestions(filePath: string): Promise<StagedQuestion[]> {
  try {
    return await readJsonFile<StagedQuestion[]>(filePath);
  } catch (error: unknown) {
    if (isNodeError(error) && error.code === "ENOENT") {
      return [];
    }
    throw error;
  }
}

function mergeQuestions(existingQuestions: readonly StagedQuestion[], newQuestions: readonly StagedQuestion[]): StagedQuestion[] {
  const byId = new Map(existingQuestions.map((question) => [question.id, question]));
  const seenContent = new Set(existingQuestions.map(questionContentKey));

  for (const question of newQuestions) {
    const contentKey = questionContentKey(question);
    if (byId.has(question.id) || seenContent.has(contentKey)) {
      continue;
    }
    byId.set(question.id, question);
    seenContent.add(contentKey);
  }

  return [...byId.values()];
}

function questionContentKey(question: StagedQuestion): string {
  return `${question.bankId}/${question.chapter}/${normalizeQuestionText(question.question)}/${question.answer}`;
}

function cloneBank(bank: QuizBank): QuizBank {
  return {
    ...bank,
    chapters: bank.chapters.map((chapter) => ({ ...chapter }))
  };
}

function isNodeError(error: unknown): error is NodeJS.ErrnoException {
  return error instanceof Error && "code" in error;
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
