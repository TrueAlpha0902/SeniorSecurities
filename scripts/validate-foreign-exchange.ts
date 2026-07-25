import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDirectory = path.join(root, "api", "_data", "foreign-exchange");
const auditPath = path.join(root, "docs", "foreign-exchange-audit", "foreign-exchange-source-audit.json");
const answerKeys = ["A", "B", "C", "D"] as const;
const sessions = Array.from({ length: 25 }, (_, index) => index + 23);
const expectedShards = sessions.flatMap((session) => [
  { session, subjectId: "remittance", count: 50 },
  { session, subjectId: "trade", count: 80 },
]);
const specialScoringIds = new Set([
  "fx-28-remittance-048",
  "fx-31-trade-069",
  "fx-32-remittance-049",
  "fx-32-trade-074",
  "fx-35-remittance-048",
  "fx-38-remittance-001",
]);

type AnswerKey = typeof answerKeys[number];
type QuestionRecord = {
  id: string;
  examId: string;
  bankTitle: string;
  question: string;
  options: Record<AnswerKey, string>;
  answer: AnswerKey;
  acceptedAnswers: AnswerKey[];
  allAnsweredCredit: boolean;
  automaticCredit: boolean;
  answerNote: string | null;
  explanation: string;
  explanationKind: string;
  session: number;
  subjectId: string;
  questionNumber: number;
  sourceFile: string;
  sourcePath: string;
  sourcePdfSha256: string;
  sourcePage: number;
  sourceTextSha256: string;
  reviewStatus: string;
};

type Manifest = {
  schemaVersion: number;
  examId: string;
  questionCount: number;
  contentSignature: string;
  sessionRange: [number, number];
  files: Array<{ session: number; subjectId: string; path: string; questionCount: number; sha256: string }>;
  quality?: { ocrUsed?: boolean; verifiedTextFields?: number; specialScoringQuestionCount?: number };
};

type Audit = {
  schemaVersion: number;
  examId: string;
  sessionRange: [number, number];
  questionCount: number;
  answerCount: number;
  explanationCount: number;
  verifiedTextFields: number;
  expectedTextFields: number;
  specialScoringQuestionCount: number;
  ocrUsed: boolean;
  aiUsedForQuestionOrAnswerText: boolean;
  humanDoubleEntryProofreading: boolean;
  contentSignature: string;
  sourceFiles: Array<{ session: number; path: string; pages: number; sha256: string }>;
  questions: Array<{
    id: string;
    answer: string;
    acceptedAnswers: string[];
    allAnsweredCredit: boolean;
    automaticCredit: boolean;
    sourceTextSha256: string;
    sourcePdfSha256: string;
    explanationSha256: string;
  }>;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function sha256(data: string | Buffer): string {
  return createHash("sha256").update(data).digest("hex");
}

async function readJson<T>(filePath: string): Promise<T> {
  return JSON.parse(await readFile(filePath, "utf8")) as T;
}

function hasUnsafeText(value: string): boolean {
  return value.includes("\uFFFD") || value.includes("\0");
}

function hasChineseLineWrapArtifact(value: string): boolean {
  return /[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]\s+[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/u.test(value);
}

async function main(): Promise<void> {
  const manifest = await readJson<Manifest>(path.join(dataDirectory, "manifest.json"));
  const audit = await readJson<Audit>(auditPath);
  const allQuestions: QuestionRecord[] = [];
  const sourceByPath = new Map(audit.sourceFiles.map((source) => [source.path, source]));

  for (const shard of expectedShards) {
    const filename = `${shard.session}-${shard.subjectId}.json`;
    const filePath = path.join(dataDirectory, filename);
    const raw = await readFile(filePath);
    const questions = JSON.parse(raw.toString("utf8")) as QuestionRecord[];
    assert(questions.length === shard.count, `${filename}: expected ${shard.count} questions, got ${questions.length}.`);

    const manifestEntry = manifest.files.find(
      (entry) => entry.session === shard.session && entry.subjectId === shard.subjectId,
    );
    assert(manifestEntry, `${filename}: missing manifest entry.`);
    assert(manifestEntry.questionCount === shard.count, `${filename}: manifest count is stale.`);
    assert(manifestEntry.sha256 === sha256(raw), `${filename}: manifest SHA-256 is stale.`);

    questions.forEach((record, index) => {
      const questionNumber = index + 1;
      assert(record.id === `fx-${shard.session}-${shard.subjectId}-${String(questionNumber).padStart(3, "0")}`, `${filename} q${questionNumber}: invalid ID.`);
      assert(record.examId === "junior-foreign-exchange", `${record.id}: invalid examId.`);
      assert(record.session === shard.session, `${record.id}: session mismatch.`);
      assert(record.subjectId === shard.subjectId, `${record.id}: subject mismatch.`);
      assert(record.questionNumber === questionNumber, `${record.id}: question numbering is not continuous.`);
      assert(record.reviewStatus === "checked", `${record.id}: source text is not marked checked.`);
      assert(typeof record.question === "string" && record.question.trim() === record.question && record.question.length > 0, `${record.id}: empty or untrimmed stem.`);
      assert(!hasUnsafeText(record.question), `${record.id}: invalid Unicode in stem.`);
      assert(!hasChineseLineWrapArtifact(record.question), `${record.id}: Chinese line-wrap spacing leaked into stem.`);
      assert(!/(請接續背面|題數與配分|台灣金融研訓院)/.test(record.question), `${record.id}: PDF header/footer leaked into stem.`);
      assert(answerKeys.includes(record.answer), `${record.id}: invalid answer key.`);
      assert(Array.isArray(record.acceptedAnswers) && record.acceptedAnswers.length >= 1, `${record.id}: acceptedAnswers is empty.`);
      assert(new Set(record.acceptedAnswers).size === record.acceptedAnswers.length, `${record.id}: acceptedAnswers contains duplicates.`);
      assert(record.acceptedAnswers.every((answer) => answerKeys.includes(answer)), `${record.id}: acceptedAnswers contains an invalid key.`);
      assert(record.acceptedAnswers.includes(record.answer), `${record.id}: canonical answer must be accepted.`);
      assert(typeof record.allAnsweredCredit === "boolean", `${record.id}: allAnsweredCredit must be boolean.`);
      assert(typeof record.automaticCredit === "boolean", `${record.id}: automaticCredit must be boolean.`);
      assert(!(record.allAnsweredCredit && record.automaticCredit), `${record.id}: answered-only and automatic credit cannot both be enabled.`);
      if (record.allAnsweredCredit) {
        assert(record.acceptedAnswers.length === 4, `${record.id}: all-answered credit must accept all four choices.`);
      }
      if (record.automaticCredit) {
        assert(record.acceptedAnswers.length === 4, `${record.id}: automatic credit must retain all four accepted choices.`);
      }
      const hasSpecialScoring = record.automaticCredit || record.allAnsweredCredit || record.acceptedAnswers.length > 1;
      assert(hasSpecialScoring === specialScoringIds.has(record.id), `${record.id}: special scoring metadata mismatch.`);
      if (hasSpecialScoring) assert(Boolean(record.answerNote?.trim()), `${record.id}: special scoring note is missing.`);

      assert(Object.keys(record.options).length === 4, `${record.id}: expected four options.`);
      for (const key of answerKeys) {
        const option = record.options[key];
        assert(typeof option === "string" && option.trim() === option && option.length > 0, `${record.id}: missing option ${key}.`);
        assert(!hasUnsafeText(option), `${record.id}: invalid Unicode in option ${key}.`);
        assert(!hasChineseLineWrapArtifact(option), `${record.id}: Chinese line-wrap spacing leaked into option ${key}.`);
        assert(!/(請接續背面|題數與配分|台灣金融研訓院)/.test(option), `${record.id}: PDF header/footer leaked into option ${key}.`);
      }

      assert(typeof record.explanation === "string" && record.explanation.trim() === record.explanation, `${record.id}: explanation is empty or untrimmed.`);
      assert(record.explanation.length >= 12, `${record.id}: explanation is too short.`);
      assert(!hasUnsafeText(record.explanation), `${record.id}: invalid Unicode in explanation.`);
      assert(!/(待補|待確認|TODO|TBD|lorem ipsum)/i.test(record.explanation), `${record.id}: explanation contains a placeholder.`);
      assert(!/(SHA-?256|OCR|PDF頁碼|來源檔案|AI生成|機器辨識)/i.test(record.explanation), `${record.id}: technical provenance leaked into learner explanation.`);
      assert(["official-answer-based", "project-authored-detailed"].includes(record.explanationKind), `${record.id}: invalid explanation kind.`);
      assert(record.session <= 44 ? record.explanationKind === "official-answer-based" : record.explanationKind === "project-authored-detailed", `${record.id}: explanation provenance classification mismatch.`);

      assert(/^[a-f0-9]{64}$/.test(record.sourceTextSha256), `${record.id}: invalid source text hash.`);
      assert(/^[a-f0-9]{64}$/.test(record.sourcePdfSha256), `${record.id}: invalid source PDF hash.`);
      assert(record.sourcePage >= 1, `${record.id}: invalid source page.`);
      assert(record.sourcePath === `${record.session}/${record.sourceFile}`, `${record.id}: source path mismatch.`);
      assert(record.sourceFile.toLowerCase().endsWith(".pdf"), `${record.id}: source file must be a PDF.`);
      const source = sourceByPath.get(`source-materials/foreign-exchange-official-pdfs/${record.sourcePath}`);
      assert(source, `${record.id}: source PDF is missing from the audit.`);
      assert(source.sha256 === record.sourcePdfSha256, `${record.id}: source PDF hash mismatch.`);
      assert(record.sourcePage <= source.pages, `${record.id}: source page exceeds PDF page count.`);
    });
    allQuestions.push(...questions);
  }

  assert(allQuestions.length === 3_250, `Expected 3,250 questions, got ${allQuestions.length}.`);
  assert(new Set(allQuestions.map((question) => question.id)).size === 3_250, "Question IDs are not unique.");
  assert(allQuestions.filter((question) => question.subjectId === "remittance").length === 1_250, "Remittance count must be 1,250.");
  assert(allQuestions.filter((question) => question.subjectId === "trade").length === 2_000, "Trade count must be 2,000.");
  assert(allQuestions.filter((question) => question.automaticCredit || question.allAnsweredCredit || question.acceptedAnswers.length > 1).length === 6, "Special scoring count must be six.");
  assert(allQuestions.filter((question) => question.automaticCredit).map((question) => question.id).join(",") === "fx-38-remittance-001", "Only session 38 remittance question 1 may receive automatic credit.");
  assert(allQuestions.filter((question) => question.allAnsweredCredit).map((question) => question.id).sort().join(",") === "fx-31-trade-069,fx-32-remittance-049", "Answered-only credit metadata mismatch.");

  assert(manifest.schemaVersion === 3, "Manifest schema version mismatch.");
  assert(manifest.examId === "junior-foreign-exchange", "Manifest exam ID mismatch.");
  assert(manifest.questionCount === 3_250, "Manifest question count mismatch.");
  assert(manifest.files.length === 50, "Manifest must contain 50 subject shards.");
  assert(manifest.sessionRange[0] === 23 && manifest.sessionRange[1] === 47, "Manifest session range mismatch.");
  assert(/^[a-f0-9]{64}$/.test(manifest.contentSignature), "Manifest content signature is invalid.");
  assert(manifest.quality?.ocrUsed === false, "Manifest must state that OCR was not used.");
  assert(manifest.quality?.verifiedTextFields === 16_250, "Manifest text-field verification count mismatch.");
  assert(manifest.quality?.specialScoringQuestionCount === 6, "Manifest special-scoring count mismatch.");

  assert(audit.schemaVersion === 3, "Audit schema version mismatch.");
  assert(audit.examId === "junior-foreign-exchange", "Audit exam ID mismatch.");
  assert(audit.sessionRange[0] === 23 && audit.sessionRange[1] === 47, "Audit session range mismatch.");
  assert(audit.questionCount === 3_250 && audit.answerCount === 3_250 && audit.explanationCount === 3_250, "Audit counts must all be 3,250.");
  assert(audit.verifiedTextFields === 16_250 && audit.expectedTextFields === 16_250, "Audit text-field count mismatch.");
  assert(audit.specialScoringQuestionCount === 6, "Audit special-scoring count mismatch.");
  assert(audit.ocrUsed === false, "Audit must state that OCR was not used.");
  assert(audit.aiUsedForQuestionOrAnswerText === false, "Audit must state that question and answer text was not AI-generated.");
  assert(audit.humanDoubleEntryProofreading === false, "Audit must not overstate human double-entry proofreading.");
  assert(audit.questions.length === 3_250, "Audit question list must contain 3,250 records.");
  assert(audit.sourceFiles.length === 75, "Audit must contain all 75 official source PDFs.");
  assert(audit.contentSignature === manifest.contentSignature, "Manifest and audit signatures differ.");

  const auditById = new Map(audit.questions.map((record) => [record.id, record]));
  for (const question of allQuestions) {
    const auditRecord = auditById.get(question.id);
    assert(auditRecord, `${question.id}: missing audit record.`);
    assert(auditRecord.answer === question.answer, `${question.id}: audit answer mismatch.`);
    assert(JSON.stringify(auditRecord.acceptedAnswers) === JSON.stringify(question.acceptedAnswers), `${question.id}: accepted-answer audit mismatch.`);
    assert(auditRecord.allAnsweredCredit === question.allAnsweredCredit, `${question.id}: all-answered audit mismatch.`);
    assert(auditRecord.automaticCredit === question.automaticCredit, `${question.id}: automatic-credit audit mismatch.`);
    assert(auditRecord.sourceTextSha256 === question.sourceTextSha256, `${question.id}: source text hash mismatch.`);
    assert(auditRecord.sourcePdfSha256 === question.sourcePdfSha256, `${question.id}: source PDF hash mismatch.`);
    assert(auditRecord.explanationSha256 === sha256(question.explanation), `${question.id}: explanation hash mismatch.`);
  }

  console.log("Foreign-exchange validation passed: 3,250 questions, 3,250 official scoring records, 3,250 explanations and 16,250 verified source-text fields.");
}

await main();
