import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const dataDirectory = path.join(root, "api", "_data", "foreign-exchange");
const auditPath = path.join(root, "docs", "foreign-exchange-audit", "foreign-exchange-source-audit.json");
const answerKeys = ["A", "B", "C", "D"] as const;
const expectedShards = [
  { session: 45, subjectId: "remittance", count: 50 },
  { session: 45, subjectId: "trade", count: 80 },
  { session: 46, subjectId: "remittance", count: 50 },
  { session: 46, subjectId: "trade", count: 80 },
  { session: 47, subjectId: "remittance", count: 50 },
  { session: 47, subjectId: "trade", count: 80 },
] as const;

type AnswerKey = typeof answerKeys[number];
type QuestionRecord = {
  id: string;
  examId: string;
  bankTitle: string;
  question: string;
  options: Record<AnswerKey, string>;
  answer: AnswerKey;
  explanation: string;
  session: number;
  subjectId: string;
  questionNumber: number;
  sourceFile: string;
  sourcePage: number;
  sourceTextSha256: string;
  reviewStatus: string;
};

type Manifest = {
  examId: string;
  questionCount: number;
  contentSignature: string;
  files: Array<{ session: number; subjectId: string; path: string; questionCount: number; sha256: string }>;
  quality?: { ocrUsed?: boolean; verifiedTextFields?: number };
};

type Audit = {
  examId: string;
  questionCount: number;
  answerCount: number;
  explanationCount: number;
  verifiedTextFields: number;
  expectedTextFields: number;
  ocrUsed: boolean;
  humanDoubleEntryProofreading: boolean;
  questions: Array<{ id: string; answer: string; sourceTextSha256: string; explanationSha256: string }>;
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
      assert(Object.keys(record.options).length === 4, `${record.id}: expected four options.`);
      for (const key of answerKeys) {
        const option = record.options[key];
        assert(typeof option === "string" && option.trim() === option && option.length > 0, `${record.id}: missing option ${key}.`);
        assert(!hasUnsafeText(option), `${record.id}: invalid Unicode in option ${key}.`);
        assert(!hasChineseLineWrapArtifact(option), `${record.id}: Chinese line-wrap spacing leaked into option ${key}.`);
        assert(!/(請接續背面|題數與配分|台灣金融研訓院)/.test(option), `${record.id}: PDF header/footer leaked into option ${key}.`);
      }
      assert(typeof record.explanation === "string" && record.explanation.trim() === record.explanation, `${record.id}: explanation is empty or untrimmed.`);
      assert(record.explanation.length >= 20, `${record.id}: explanation is too short.`);
      assert(!hasUnsafeText(record.explanation), `${record.id}: invalid Unicode in explanation.`);
      assert(!/(待補|待確認|TODO|TBD|lorem ipsum)/i.test(record.explanation), `${record.id}: explanation contains a placeholder.`);
      assert(!/(SHA-?256|OCR|PDF頁碼|來源檔案|AI生成|機器辨識)/i.test(record.explanation), `${record.id}: technical provenance leaked into learner explanation.`);
      assert(/^[a-f0-9]{64}$/.test(record.sourceTextSha256), `${record.id}: invalid source text hash.`);
      assert(record.sourcePage === 1 || record.sourcePage === 2, `${record.id}: invalid source page.`);
      assert(/^[0-9]+-[0-9]+\.pdf$/.test(record.sourceFile), `${record.id}: invalid source file.`);
    });
    allQuestions.push(...questions);
  }

  assert(allQuestions.length === 390, `Expected 390 questions, got ${allQuestions.length}.`);
  assert(new Set(allQuestions.map((question) => question.id)).size === 390, "Question IDs are not unique.");
  assert(new Set(allQuestions.map((question) => question.explanation)).size === 390, "Every question must have an individually authored explanation.");
  assert(allQuestions.filter((question) => question.subjectId === "remittance").length === 150, "Remittance count must be 150.");
  assert(allQuestions.filter((question) => question.subjectId === "trade").length === 240, "Trade count must be 240.");

  assert(manifest.examId === "junior-foreign-exchange", "Manifest exam ID mismatch.");
  assert(manifest.questionCount === 390, "Manifest question count mismatch.");
  assert(manifest.quality?.ocrUsed === false, "Manifest must state that OCR was not used.");
  assert(manifest.quality?.verifiedTextFields === 1_950, "Manifest text-field verification count mismatch.");

  assert(audit.examId === "junior-foreign-exchange", "Audit exam ID mismatch.");
  assert(audit.questionCount === 390 && audit.answerCount === 390 && audit.explanationCount === 390, "Audit counts must all be 390.");
  assert(audit.verifiedTextFields === 1_950 && audit.expectedTextFields === 1_950, "Audit text-field count mismatch.");
  assert(audit.ocrUsed === false, "Audit must state that OCR was not used.");
  assert(audit.humanDoubleEntryProofreading === false, "Audit must not overstate human double-entry proofreading.");
  assert(audit.questions.length === 390, "Audit question list must contain 390 records.");

  const auditById = new Map(audit.questions.map((record) => [record.id, record]));
  for (const question of allQuestions) {
    const auditRecord = auditById.get(question.id);
    assert(auditRecord, `${question.id}: missing audit record.`);
    assert(auditRecord.answer === question.answer, `${question.id}: audit answer mismatch.`);
    assert(auditRecord.sourceTextSha256 === question.sourceTextSha256, `${question.id}: source hash mismatch.`);
    assert(auditRecord.explanationSha256 === sha256(question.explanation), `${question.id}: explanation hash mismatch.`);
  }

  console.log("Foreign-exchange validation passed: 390 questions, 390 official answers, 390 individual explanations, 1,950 verified source-text fields.");
}

await main();
