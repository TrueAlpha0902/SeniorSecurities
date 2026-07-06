import mammoth from "mammoth";
import type { AnswerKey } from "../../src/types";
import { answerKeys, isAnswerKey } from "../../src/lib/quiz";
import { getChapterSlug } from "./chapter";
import type { SourceFileMeta } from "./source-file";
import type { StagedQuestion } from "./types";

type WorkingQuestion = {
  number: number;
  sourceLines: string[];
  questionParts: string[];
  options: Record<AnswerKey, string[]>;
  answer: AnswerKey | "";
  explanationParts: string[];
  currentOption: AnswerKey | null;
  inExplanation: boolean;
};

const questionStartRegex = /^(?:\((\d+)\)|（(\d+)）|(\d+)[.、])\s*(.*)$/;
const optionStartRegex = /^(?:\(([A-D])\)|（([A-D])）|([A-D])[.、])\s*(.*)$/i;
const answerRegex = /^(?:答案|正解|解答|[《【](?:答案|正解|解答)[》】])\s*[:：]?\s*[(（]?([A-D1-4])?[)）]?\s*(.*)$/i;
const explanationRegex = /^(?:解析|說明|[《【](?:解析|說明)[》】])\s*[:：]?\s*(.*)$/;
const inlineExplanationRegex = /(?:解析|說明|[《【](?:解析|說明)[》】])\s*[:：]?\s*(.*)$/;
const inlineOptionRegex = /(\([1-4]\)|（[1-4]）|\([A-D]\)|（[A-D]）|[A-D][.、])/gi;

export async function extractDocxText(filePath: string): Promise<string> {
  const result = await mammoth.extractRawText({ path: filePath });
  return result.value;
}

export function parseQuestionsFromText(
  text: string,
  meta: SourceFileMeta,
  batchId: string,
  importedAt = new Date().toISOString()
): StagedQuestion[] {
  const lines = normalizeText(text)
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

  const questions: StagedQuestion[] = [];
  let working: WorkingQuestion | null = null;

  const finalize = () => {
    if (!working) {
      return;
    }
    questions.push(toQuestion(working, meta, batchId, importedAt, questions.length + 1));
    working = null;
  };

  for (const line of lines) {
    const questionMatch = line.match(questionStartRegex);
    if (questionMatch) {
      finalize();
      const questionText = questionMatch[4]?.trim() ?? "";
      working = createWorkingQuestion(Number(questionMatch[1] ?? questionMatch[2] ?? questionMatch[3] ?? questions.length + 1));
      working.sourceLines.push(line);
      if (questionText) {
        consumeContentLine(working, questionText);
      }
      continue;
    }

    if (!working) {
      continue;
    }

    working.sourceLines.push(line);

    const optionMatch = line.match(optionStartRegex);
    if (optionMatch) {
      const answerKey = (optionMatch[1] ?? optionMatch[2] ?? optionMatch[3] ?? "").toUpperCase();
      if (isAnswerKey(answerKey)) {
        working.currentOption = answerKey;
        working.inExplanation = false;
        const optionText = optionMatch[4]?.trim() ?? "";
        if (optionText) {
          working.options[answerKey].push(optionText);
        }
      }
      continue;
    }

    const answerMatch = line.match(answerRegex);
    if (answerMatch) {
      const rawAnswer = (answerMatch[1] ?? "").toUpperCase();
      const answerKey = toAnswerKey(rawAnswer);
      if (answerKey) {
        working.answer = answerKey;
      }
      working.currentOption = null;

      const rest = answerMatch[2]?.trim() ?? "";
      const inlineExplanation = rest.match(inlineExplanationRegex);
      if (inlineExplanation?.[1]) {
        working.inExplanation = true;
        working.explanationParts.push(inlineExplanation[1].trim());
      } else if (rest) {
        working.inExplanation = true;
        working.explanationParts.push(rest);
      }
      continue;
    }

    const explanationMatch = line.match(explanationRegex);
    if (explanationMatch) {
      working.currentOption = null;
      working.inExplanation = true;
      const explanationText = explanationMatch[1]?.trim() ?? "";
      if (explanationText) {
        working.explanationParts.push(explanationText);
      }
      continue;
    }

    if (working.currentOption && !working.inExplanation) {
      working.options[working.currentOption].push(line);
    } else if (working.inExplanation || working.answer) {
      working.explanationParts.push(line);
    } else {
      consumeContentLine(working, line);
    }
  }

  finalize();

  if (questions.length === 0 && text.trim()) {
    questions.push(createUnparsedQuestion(text, meta, batchId, importedAt));
  }

  return questions;
}

function normalizeText(text: string): string {
  return text
    .replace(/\r/g, "\n")
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/([^\n])\s+((?:\([A-D]\)|（[A-D]）|[A-D][.、]))/g, "$1\n$2")
    .replace(/([^\n])\s+((?:答案|正解|解答|解析|說明)\s*[:：])/g, "$1\n$2")
    .replace(/([^\n])\s+([《【](?:答案|正解|解答|解析|說明)[》】])/g, "$1\n$2");
}

function createWorkingQuestion(number: number): WorkingQuestion {
  return {
    number,
    sourceLines: [],
    questionParts: [],
    options: {
      A: [],
      B: [],
      C: [],
      D: []
    },
    answer: "",
    explanationParts: [],
    currentOption: null,
    inExplanation: false
  };
}

function toQuestion(
  working: WorkingQuestion,
  meta: SourceFileMeta,
  batchId: string,
  importedAt: string,
  sequence: number
): StagedQuestion {
  const options = {
    A: joinParts(working.options.A),
    B: joinParts(working.options.B),
    C: joinParts(working.options.C),
    D: joinParts(working.options.D)
  };
  const missingRequired =
    !joinParts(working.questionParts) ||
    answerKeys.some((answerKey) => !options[answerKey]) ||
    !working.answer ||
    !joinParts(working.explanationParts);

  return {
    id: `${meta.bankId}-${getChapterSlug(meta.chapter)}-${batchId}-${String(sequence).padStart(4, "0")}`,
    bankId: meta.bankId,
    bankTitle: meta.bankTitle,
    chapter: meta.chapter,
    question: joinParts(working.questionParts),
    options,
    answer: working.answer,
    explanation: joinParts(working.explanationParts),
    source: joinSourceLines(working.sourceLines),
    sourceFile: meta.sourceFile,
    batchId,
    importedAt,
    reviewStatus: missingRequired ? "needs_fix" : "raw"
  };
}

function createUnparsedQuestion(text: string, meta: SourceFileMeta, batchId: string, importedAt: string): StagedQuestion {
  return {
    id: `${meta.bankId}-${getChapterSlug(meta.chapter)}-${batchId}-0001`,
    bankId: meta.bankId,
    bankTitle: meta.bankTitle,
    chapter: meta.chapter,
    question: text.trim().slice(0, 1000),
    options: {
      A: "",
      B: "",
      C: "",
      D: ""
    },
    answer: "",
    explanation: "",
    source: text.trim(),
    sourceFile: meta.sourceFile,
    batchId,
    importedAt,
    reviewStatus: "needs_fix"
  };
}

function joinParts(parts: readonly string[]): string {
  return parts.join(" ").replace(/\s+/g, " ").trim();
}

function joinSourceLines(parts: readonly string[]): string {
  return parts.map((part) => part.trim()).filter(Boolean).join("\n");
}

function consumeContentLine(working: WorkingQuestion, line: string): void {
  const explanationMatch = line.match(inlineExplanationRegex);
  const beforeExplanation = explanationMatch?.index !== undefined ? line.slice(0, explanationMatch.index).trim() : line;
  const explanationText = explanationMatch?.[1]?.trim() ?? "";
  const optionMarkers = [...beforeExplanation.matchAll(inlineOptionRegex)];

  if (optionMarkers.length === 0) {
    if (explanationText) {
      const questionText = beforeExplanation.trim();
      if (questionText) {
        working.questionParts.push(questionText);
      }
      working.currentOption = null;
      working.inExplanation = true;
      working.explanationParts.push(explanationText);
      return;
    }
    working.questionParts.push(line);
    return;
  }

  const questionText = beforeExplanation.slice(0, optionMarkers[0]?.index ?? 0).trim();
  if (questionText) {
    working.questionParts.push(questionText);
  }

  for (let index = 0; index < optionMarkers.length; index += 1) {
    const marker = optionMarkers[index];
    if (!marker) {
      continue;
    }
    const nextMarker = optionMarkers[index + 1];
    const answerKey = toAnswerKey(marker[0]);
    if (!answerKey || marker.index === undefined) {
      continue;
    }
    const optionStart = marker.index + marker[0].length;
    const optionEnd = nextMarker?.index ?? beforeExplanation.length;
    const optionText = beforeExplanation.slice(optionStart, optionEnd).trim();
    if (optionText) {
      working.options[answerKey].push(optionText);
    }
    working.currentOption = answerKey;
  }

  if (explanationText) {
    working.currentOption = null;
    working.inExplanation = true;
    working.explanationParts.push(explanationText);
  }
}

function toAnswerKey(rawValue: string): AnswerKey | null {
  const normalized = rawValue.replace(/[()（）.、]/g, "").toUpperCase();
  if (isAnswerKey(normalized)) {
    return normalized;
  }
  if (normalized === "1") {
    return "A";
  }
  if (normalized === "2") {
    return "B";
  }
  if (normalized === "3") {
    return "C";
  }
  if (normalized === "4") {
    return "D";
  }
  return null;
}
