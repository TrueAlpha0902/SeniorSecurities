import path from "node:path";
import type { AnswerKey } from "../src/types";
import { isAnswerKey } from "../src/lib/quiz";
import { getFlagValue } from "./lib/args";
import { readJsonFile, writeJsonFile } from "./lib/data-files";
import type { StagedQuestion } from "./lib/types";

type PdfAnswer = {
  number: number;
  answer: AnswerKey;
  score?: number;
  page?: number;
  y?: number;
  manualOverride?: boolean;
  note?: string;
};

type PdfAnswerReport = {
  sourcePdf?: string;
  totalAnswers?: number;
  answers: PdfAnswer[];
};

type MergeReport = {
  passed: boolean;
  generatedAt: string;
  stagingFile: string;
  answersFile: string;
  totalQuestions: number;
  answersInReport: number;
  applied: number;
  alreadyAnswered: number;
  noSourceQuestionNumber: string[];
  missingPdfAnswers: number[];
  manualOverrides: PdfAnswer[];
};

async function main() {
  const args = process.argv.slice(2);
  const positional = args.filter((arg) => !arg.startsWith("--"));
  const batchId = getFlagValue(args, "--batch") ?? positional[0];
  const bankId = getFlagValue(args, "--bank") ?? positional[1];
  const chapter = getFlagValue(args, "--chapter") ?? positional[2];
  if (!batchId || !bankId || !chapter) {
    throw new Error("Usage: npm run apply:pdf-answers -- --batch batch-001 --bank investment --chapter 第一章 --answers path/to/report.json");
  }
  const answersPath = path.resolve(
    process.cwd(),
    getFlagValue(args, "--answers") ?? positional[3] ?? path.join("staging", batchId, "reports", `${bankId}-${chapter}.pdf-answers.json`)
  );

  const stagingFile = path.join(process.cwd(), "staging", batchId, bankId, `${chapter}.json`);
  const questions = await readJsonFile<StagedQuestion[]>(stagingFile);
  const answerReport = await readJsonFile<PdfAnswerReport>(answersPath);
  const answersByNumber = new Map<number, PdfAnswer>();

  for (const answer of answerReport.answers) {
    if (!Number.isInteger(answer.number) || answer.number <= 0) {
      throw new Error(`Invalid answer number in ${answersPath}: ${answer.number}`);
    }
    if (!isAnswerKey(answer.answer)) {
      throw new Error(`Invalid answer key for question ${answer.number}: ${answer.answer}`);
    }
    answersByNumber.set(answer.number, answer);
  }

  let applied = 0;
  let alreadyAnswered = 0;
  const seenSourceNumbers = new Set<number>();
  const noSourceQuestionNumber: string[] = [];

  const updated = questions.map((question) => {
    const sourceNumber = parseSourceQuestionNumber(question.source);
    if (!sourceNumber) {
      noSourceQuestionNumber.push(question.id);
      return question;
    }

    seenSourceNumbers.add(sourceNumber);
    const pdfAnswer = answersByNumber.get(sourceNumber);
    if (!pdfAnswer) {
      return question;
    }

    if (question.answer === pdfAnswer.answer && question.reviewStatus !== "needs_fix") {
      alreadyAnswered += 1;
      return question;
    }

    applied += 1;
    const hasCompleteContent =
      Boolean(question.question.trim()) &&
      Boolean(question.options.A.trim()) &&
      Boolean(question.options.B.trim()) &&
      Boolean(question.options.C.trim()) &&
      Boolean(question.options.D.trim()) &&
      Boolean(question.explanation.trim());

    return {
      ...question,
      answer: pdfAnswer.answer,
      reviewStatus: hasCompleteContent ? "raw" : question.reviewStatus,
      tags: [...new Set([...(question.tags ?? []), "pdf-answer-applied"])]
    };
  });

  const missingPdfAnswers = [...seenSourceNumbers]
    .filter((sourceNumber) => !answersByNumber.has(sourceNumber))
    .sort((left, right) => left - right);

  await writeJsonFile(stagingFile, updated);

  const mergeReport: MergeReport = {
    passed: missingPdfAnswers.length === 0,
    generatedAt: new Date().toISOString(),
    stagingFile,
    answersFile: answersPath,
    totalQuestions: questions.length,
    answersInReport: answersByNumber.size,
    applied,
    alreadyAnswered,
    noSourceQuestionNumber,
    missingPdfAnswers,
    manualOverrides: answerReport.answers.filter((answer) => answer.manualOverride)
  };

  await writeJsonFile(
    path.join(process.cwd(), "staging", batchId, "reports", `${bankId}-${chapter}.pdf-answer-merge.json`),
    mergeReport
  );

  console.log(`Applied ${applied} PDF answer(s) to ${stagingFile}`);
  console.log(`Questions without source number: ${noSourceQuestionNumber.length}`);
  console.log(`Source questions missing PDF answers: ${missingPdfAnswers.length}`);

  if (!mergeReport.passed) {
    process.exitCode = 1;
  }
}

function parseSourceQuestionNumber(source: string | undefined): number | null {
  const match = source?.match(/^(\d+)\./);
  if (!match?.[1]) {
    return null;
  }
  return Number(match[1]);
}

main().catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(message);
  process.exitCode = 1;
});
