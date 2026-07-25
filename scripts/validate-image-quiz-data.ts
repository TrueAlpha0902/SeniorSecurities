import { createHash } from "node:crypto";
import { readFile, readdir, stat } from "node:fs/promises";
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
  mobileQuestionSegments?: Segment[];
  mobileExplanationSegments?: Segment[];
  mobileQuestionSegmentsVerification?: string;
  mobileExplanationSegmentsVerification?: string;
};

type SourceData = {
  banks: Array<{ chapters: Array<{ questions: Question[] }> }>;
};

type ReviewEvidence = {
  report: Record<string, unknown>;
  approvedFields: Map<string, string>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function normalizedSegments(segments: Segment[]): Segment[] {
  return segments.map((segment) => ({
    page: segment.page,
    src: segment.src,
    x: segment.x,
    y: segment.y,
    width: segment.width,
    height: segment.height,
    pageWidth: segment.pageWidth,
    pageHeight: segment.pageHeight,
  }));
}

function canonicalHash(value: unknown): string {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

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
  const imageContentHashes = new Map<string, string>();
  const evidenceDirectory = path.join(root, "docs", "review-evidence", "mobile-segments");
  const evidenceFiles = await readdir(evidenceDirectory, { withFileTypes: true }).catch(() => []);
  const parsedEvidenceByHash = new Map<string, Record<string, unknown>>();
  for (const entry of evidenceFiles) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const raw = await readFile(path.join(evidenceDirectory, entry.name));
    const hash = createHash("sha256").update(raw).digest("hex");
    try {
      const parsed: unknown = JSON.parse(raw.toString("utf8"));
      if (isRecord(parsed)) {
        parsedEvidenceByHash.set(hash, parsed);
      } else {
        errors.push(`${entry.name}: review evidence must be a JSON object`);
      }
    } catch {
      errors.push(`${entry.name}: invalid review evidence JSON`);
    }
  }
  const reviewEvidenceByHash = new Map<string, ReviewEvidence>();
  for (const [approvalHash, approval] of parsedEvidenceByHash) {
    if (approval.kind !== "mobile-segment-review-approval") continue;
    const candidateReportHash = String(approval.candidateReportSha256 || "");
    const report = parsedEvidenceByHash.get(candidateReportHash);
    const reviewedBy = String(approval.reviewedBy || "").trim();
    const reviewedAt = String(approval.reviewedAt || "");
    const approvedRows = Array.isArray(approval.approvedFields) ? approval.approvedFields : [];
    if (
      approval.schemaVersion !== 1 ||
      !/^[a-f0-9]{64}$/.test(candidateReportHash) ||
      !report ||
      report.mode !== "dry-run" ||
      report.reviewStatus !== "needs-review" ||
      report.previewPolicy !== "candidate-contact-sheet-sha256" ||
      !reviewedBy ||
      !Number.isFinite(Date.parse(reviewedAt)) ||
      approvedRows.length === 0
    ) {
      errors.push(`${approvalHash}: invalid mobile segment approval evidence`);
      continue;
    }
    const approvedFields = new Map<string, string>();
    for (const row of approvedRows) {
      if (!isRecord(row)) continue;
      const questionId = String(row.questionId || "");
      const field = String(row.field || "");
      const previewSha256 = String(row.previewSha256 || "");
      if (!questionId || !["question", "explanation"].includes(field) || !/^[a-f0-9]{64}$/.test(previewSha256)) {
        errors.push(`${approvalHash}: invalid approved mobile field`);
        continue;
      }
      approvedFields.set(`${questionId}:${field}`, previewSha256);
    }
    reviewEvidenceByHash.set(approvalHash, { report, approvedFields });
  }

  const imageContentHash = async (src: string): Promise<string> => {
    const imagePath = path.join(root, "public", src);
    let hash = imageContentHashes.get(imagePath);
    if (!hash) {
      hash = createHash("sha256").update(await readFile(imagePath)).digest("hex");
      imageContentHashes.set(imagePath, hash);
    }
    return hash;
  };

  const sourceSignature = async (segments: Segment[]): Promise<string> => {
    const normalized = normalizedSegments(segments);
    const sources = [...new Set(normalized.map((segment) => segment.src))].sort();
    const images = await Promise.all(sources.map(async (src) => ({
      src,
      sha256: await imageContentHash(src),
    })));
    return canonicalHash({ segments: normalized, images });
  };

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
          imageContentHashes.set(imagePath, createHash("sha256").update(buffer).digest("hex"));
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

  const validateMobileSegments = async (
    question: Question,
    label: string,
    evidenceField: "question" | "explanation",
    segments: Segment[] | undefined,
    sourceSegments: Segment[],
    verification: string | undefined,
  ) => {
    if (segments === undefined) {
      if (verification !== undefined) errors.push(`${question.id}: ${label} verification exists without segments`);
      return;
    }
    if (!Array.isArray(segments) || segments.length === 0 || segments.length > 64) {
      errors.push(`${question.id}: ${label} must contain 1-64 segments when present`);
      return;
    }
    const match = typeof verification === "string"
      ? /^pixel-and-visual-reviewed:v2:([a-f0-9]{64}):([a-f0-9]{64}):(\d{1,6}):([a-f0-9]{64})$/.exec(verification)
      : null;
    const expectedSourceSignature = await sourceSignature(sourceSegments);
    const expectedSegmentsSignature = canonicalHash(normalizedSegments(segments));
    const coverageUnits = Number(match?.[3]);
    const evidenceHash = match?.[4];
    const evidence = evidenceHash ? reviewEvidenceByHash.get(evidenceHash) : undefined;
    const approvedPreviewHash = evidence?.approvedFields.get(`${question.id}:${evidenceField}`);
    const reportQuestion = Array.isArray(evidence?.report.questions)
      ? evidence.report.questions.find((item) => isRecord(item) && item.questionId === question.id)
      : undefined;
    const reportField = isRecord(reportQuestion) && isRecord(reportQuestion[evidenceField])
      ? reportQuestion[evidenceField]
      : undefined;
    const reportCoverageUnits = isRecord(reportField)
      ? Math.round(Number(reportField.coverage) * 100_000)
      : Number.NaN;
    if (
      !match ||
      match[1] !== expectedSourceSignature ||
      match[2] !== expectedSegmentsSignature ||
      !Number.isInteger(coverageUnits) ||
      coverageUnits < 96_500 ||
      coverageUnits > 100_000 ||
      !evidence ||
      !approvedPreviewHash ||
      !isRecord(reportField) ||
      reportField.status !== "candidate" ||
      reportField.sourceSignature !== expectedSourceSignature ||
      reportField.segmentsSignature !== expectedSegmentsSignature ||
      reportCoverageUnits !== coverageUnits ||
      reportField.previewSha256 !== approvedPreviewHash
    ) {
      errors.push(`${question.id}: ${label} verification evidence does not match its source and segments`);
    }
    await validateSegments(question, label, segments);
    let previousOrder: [number, number, number] | undefined;
    for (const [index, segment] of segments.entries()) {
      const sourceIndex = sourceSegments.findIndex((source) => (
        source.page === segment.page &&
        source.src === segment.src &&
        source.pageWidth === segment.pageWidth &&
        source.pageHeight === segment.pageHeight &&
        segment.x >= source.x &&
        segment.y >= source.y &&
        segment.x + segment.width <= source.x + source.width &&
        segment.y + segment.height <= source.y + source.height
      ));
      if (sourceIndex < 0) {
        errors.push(`${question.id}: ${label}[${index}] must stay inside an original crop`);
        continue;
      }
      const order: [number, number, number] = [sourceIndex, segment.y, segment.x];
      if (previousOrder && (
        order[0] < previousOrder[0] ||
        (order[0] === previousOrder[0] && order[1] < previousOrder[1]) ||
        (order[0] === previousOrder[0] && order[1] === previousOrder[1] && order[2] < previousOrder[2])
      )) {
        errors.push(`${question.id}: ${label}[${index}] is out of source reading order`);
      }
      previousOrder = order;
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
    await validateMobileSegments(
      question,
      "mobileQuestion",
      "question",
      question.mobileQuestionSegments,
      question.questionSegments,
      question.mobileQuestionSegmentsVerification,
    );
    await validateMobileSegments(
      question,
      "mobileExplanation",
      "explanation",
      question.mobileExplanationSegments,
      question.explanationSegments,
      question.mobileExplanationSegmentsVerification,
    );
  }

  if (errors.length) {
    console.error(errors.slice(0, 100).join("\n"));
    throw new Error(`Image quiz validation failed with ${errors.length} error(s)`);
  }
  console.log(`Image quiz data verified: ${questions.length} questions, ${imageDimensions.size} source images`);
}

void main();
