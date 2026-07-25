import { createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const inputPath = path.join(root, "build-data", "securities-text-final.json");
const outputPath = path.join(root, "public", "data", "pdf-image-quiz-trial.json");
const checkOnly = process.argv.includes("--check");

const BANK_ORDER = [
  "investment",
  "financial-analysis",
  "securities-trading-regulations",
  "securities-trading-practice",
] as const;

const TAKE_PER_BANK: Record<(typeof BANK_ORDER)[number], number> = {
  investment: 3,
  "financial-analysis": 3,
  "securities-trading-regulations": 2,
  "securities-trading-practice": 2,
};

type AnswerKey = "1" | "2" | "3" | "4";

type TextRecord = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  number: number;
  answer: AnswerKey;
  question: string;
  options: Record<AnswerKey, string>;
  explanation: string;
};

type TextSource = {
  version: number;
  source: string;
  questionCount: number;
  items: TextRecord[];
};

type TrialQuestion = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  number: number;
  answer: AnswerKey;
  sourceFile: "";
  questionSegments: [];
  explanationSegments: [];
  answerMask: null;
  questionText: string;
  optionTexts: Record<AnswerKey, string>;
  explanationText: string;
};

type TrialChapter = {
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterSlug: string;
  sourceFile: "";
  questionCount: number;
  questions: TrialQuestion[];
};

type TrialBank = {
  bankId: string;
  bankTitle: string;
  chapters: TrialChapter[];
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function chapterSlug(record: TextRecord): string {
  const match = record.id.match(/-ch(\d{2})-pdf-/);
  if (!match?.[1]) throw new Error(`Cannot derive chapter slug for ${record.id}.`);
  return `ch${match[1]}`;
}

function selectTrialQuestions(items: TextRecord[]): TextRecord[] {
  const selected: TextRecord[] = [];
  for (const bankId of BANK_ORDER) {
    const matches = items
      .filter((item) => item.bankId === bankId)
      .sort((left, right) =>
        left.chapterId.localeCompare(right.chapterId, "zh-Hant") || left.number - right.number,
      )
      .slice(0, TAKE_PER_BANK[bankId]);
    assert(
      matches.length === TAKE_PER_BANK[bankId],
      `Trial source is missing enough questions for ${bankId}.`,
    );
    selected.push(...matches);
  }
  assert(selected.length === 10, `Trial question count must be 10, got ${selected.length}.`);
  return selected;
}

function toTrialQuestion(record: TextRecord): TrialQuestion {
  assert(record.question.trim(), `Trial question text is empty: ${record.id}`);
  assert(record.explanation.trim(), `Trial explanation is empty: ${record.id}`);
  for (const key of ["1", "2", "3", "4"] as const) {
    assert(record.options[key]?.trim(), `Trial option ${key} is empty: ${record.id}`);
  }
  return {
    id: record.id,
    bankId: record.bankId,
    bankTitle: record.bankTitle,
    chapterId: record.chapterId,
    chapterTitle: record.chapterTitle,
    number: record.number,
    answer: record.answer,
    sourceFile: "",
    questionSegments: [],
    explanationSegments: [],
    answerMask: null,
    questionText: record.question,
    optionTexts: record.options,
    explanationText: record.explanation,
  };
}

function buildTrialData(items: TextRecord[]): { banks: TrialBank[] } {
  const selected = selectTrialQuestions(items);
  const banks: TrialBank[] = [];
  for (const bankId of BANK_ORDER) {
    const bankQuestions = selected.filter((item) => item.bankId === bankId);
    const chapterMap = new Map<string, TrialChapter>();
    for (const record of bankQuestions) {
      const key = `${record.chapterId}:${chapterSlug(record)}`;
      let chapter = chapterMap.get(key);
      if (!chapter) {
        chapter = {
          bankId: record.bankId,
          bankTitle: record.bankTitle,
          chapterId: record.chapterId,
          chapterTitle: record.chapterTitle,
          chapterSlug: chapterSlug(record),
          sourceFile: "",
          questionCount: 0,
          questions: [],
        };
        chapterMap.set(key, chapter);
      }
      chapter.questions.push(toTrialQuestion(record));
      chapter.questionCount = chapter.questions.length;
    }
    banks.push({
      bankId,
      bankTitle: bankQuestions[0]?.bankTitle || bankId,
      chapters: [...chapterMap.values()],
    });
  }
  return { banks };
}

function validateSerializedTrial(serialized: string): void {
  assert(!serialized.includes("pdf-pages/"), "Trial data must not reference scan pages.");
  assert(!serialized.includes(".pdf"), "Trial data must not expose source PDF names.");
  const parsed = JSON.parse(serialized) as { banks?: TrialBank[] };
  const questions = (parsed.banks || []).flatMap((bank) =>
    bank.chapters.flatMap((chapter) => chapter.questions),
  );
  assert(questions.length === 10, `Serialized trial must contain 10 questions, got ${questions.length}.`);
  assert(
    questions.every(
      (question) =>
        question.sourceFile === "" &&
        question.questionSegments.length === 0 &&
        question.explanationSegments.length === 0 &&
        Boolean(question.questionText) &&
        Boolean(question.explanationText),
    ),
    "Serialized trial contains scan metadata or incomplete learner text.",
  );
}

async function main(): Promise<void> {
  const source = JSON.parse(await readFile(inputPath, "utf8")) as TextSource;
  assert(source.items.length === source.questionCount, "Securities text source count is inconsistent.");
  const serialized = `${JSON.stringify(buildTrialData(source.items))}\n`;
  validateSerializedTrial(serialized);
  const hash = createHash("sha256").update(serialized).digest("hex");

  if (checkOnly) {
    const current = await readFile(outputPath, "utf8");
    if (current !== serialized) throw new Error("Text-only trial data is stale. Run npm run generate:trial.");
    console.log(`Text-only trial verified: 10 questions, SHA-256 ${hash}.`);
    return;
  }

  await writeFile(outputPath, serialized, "utf8");
  console.log(`Text-only trial generated: 10 questions, SHA-256 ${hash}.`);
}

void main();
