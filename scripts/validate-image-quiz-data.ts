import { readFile, stat } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const sourcePath = path.join(root, "public", "data", "pdf-image-quiz.json");

type Segment = {
  page: number;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
};

type Question = {
  id: string;
  bankId: string;
  chapterId: string;
  number: number;
  answer: string;
  questionSegments: Segment[];
  explanationSegments: Segment[];
};

type SourceData = {
  banks: Array<{ chapters: Array<{ questions: Question[] }> }>;
};

function readUInt24LE(buffer: Buffer, offset: number): number {
  return buffer[offset]! | (buffer[offset + 1]! << 8) | (buffer[offset + 2]! << 16);
}

function webpDimensions(buffer: Buffer): { width: number; height: number } | null {
  if (buffer.length < 30 || buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WEBP") return null;
  let offset = 12;
  while (offset + 8 <= buffer.length) {
    const chunk = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const data = offset + 8;
    if (chunk === "VP8X" && data + 10 <= buffer.length) {
      return { width: 1 + readUInt24LE(buffer, data + 4), height: 1 + readUInt24LE(buffer, data + 7) };
    }
    if (chunk === "VP8 " && data + 10 <= buffer.length && buffer[data + 3] === 0x9d && buffer[data + 4] === 0x01 && buffer[data + 5] === 0x2a) {
      return { width: buffer.readUInt16LE(data + 6) & 0x3fff, height: buffer.readUInt16LE(data + 8) & 0x3fff };
    }
    if (chunk === "VP8L" && data + 5 <= buffer.length && buffer[data] === 0x2f) {
      const bits = buffer.readUInt32LE(data + 1);
      return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    offset = data + size + (size % 2);
  }
  return null;
}

async function main(): Promise<void> {
  const data = JSON.parse(await readFile(sourcePath, "utf8")) as SourceData;
  const questions = data.banks.flatMap((bank) => bank.chapters.flatMap((chapter) => chapter.questions));
  const errors: string[] = [];
  const ids = new Set<string>();
  const numberKeys = new Set<string>();
  const imageDimensions = new Map<string, { width: number; height: number }>();

  const validateSegments = async (question: Question, label: string, segments: Segment[]) => {
    if (!Array.isArray(segments) || segments.length === 0) {
      errors.push(`${question.id}: ${label} segments are empty`);
      return;
    }
    for (const [index, segment] of segments.entries()) {
      const prefix = `${question.id}: ${label}[${index}]`;
      if (!Number.isInteger(segment.page) || segment.page < 1) errors.push(`${prefix}: invalid page`);
      for (const key of ["x", "y", "width", "height", "pageWidth", "pageHeight"] as const) {
        if (!Number.isFinite(segment[key]) || segment[key] < 0) errors.push(`${prefix}: invalid ${key}`);
      }
      if (segment.width <= 0 || segment.height <= 0) errors.push(`${prefix}: crop must have positive size`);
      if (segment.x + segment.width > segment.pageWidth || segment.y + segment.height > segment.pageHeight) {
        errors.push(`${prefix}: crop exceeds declared page bounds`);
      }
      const imagePath = path.join(root, "public", segment.src);
      try {
        await stat(imagePath);
        let dimensions = imageDimensions.get(imagePath);
        if (!dimensions) {
          const buffer = await readFile(imagePath);
          dimensions = webpDimensions(buffer) ?? undefined;
          if (dimensions) imageDimensions.set(imagePath, dimensions);
        }
        if (!dimensions) errors.push(`${prefix}: unable to read WebP dimensions for ${segment.src}`);
        else if (dimensions.width !== segment.pageWidth || dimensions.height !== segment.pageHeight) {
          errors.push(`${prefix}: declared ${segment.pageWidth}x${segment.pageHeight}, actual ${dimensions.width}x${dimensions.height}`);
        }
      } catch {
        errors.push(`${prefix}: missing image ${segment.src}`);
      }
    }
  };

  for (const question of questions) {
    if (!question.id || ids.has(question.id)) errors.push(`${question.id || "<empty>"}: duplicate or empty id`);
    ids.add(question.id);
    const numberKey = `${question.bankId}:${question.chapterId}:${question.number}`;
    if (numberKeys.has(numberKey)) errors.push(`${question.id}: duplicate question number ${numberKey}`);
    numberKeys.add(numberKey);
    if (!["1", "2", "3", "4"].includes(question.answer)) errors.push(`${question.id}: invalid answer ${question.answer}`);
    await validateSegments(question, "question", question.questionSegments);
    await validateSegments(question, "explanation", question.explanationSegments);
  }

  if (errors.length) {
    console.error(errors.slice(0, 100).join("\n"));
    throw new Error(`Image quiz validation failed with ${errors.length} error(s)`);
  }
  console.log(`Image quiz data verified: ${questions.length} questions, ${imageDimensions.size} source images`);
}

void main();
