import { createHash, createHmac, timingSafeEqual } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { QuestionOverride } from "./_questionOverrides.js";
import {
  getQuestionAuthConfiguration,
  HttpError,
  requireAuthenticatedUser,
  sendError,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "./_adminClient.js";
import {
  foreignExchangeManifest,
  foreignExchangeQuestions,
  type ForeignExchangeQuestionRecord,
  type ForeignExchangeSession,
  type ForeignExchangeSubjectId,
} from "./_data/foreign-exchange/index.js";
import {
  loadSecuritiesBankQuestions,
  loadSecuritiesManifest,
  loadSecuritiesQuestionsByIds,
  loadSecuritiesShard,
  searchSecuritiesQuestions,
  toSecuritiesClientChapter,
  toSecuritiesClientQuestion,
  type SecuritiesQuestionRecord,
} from "./_securitiesQuestions.js";

const SECURITIES_EXAM_ID = "senior-securities";
const FOREIGN_EXCHANGE_EXAM_ID = "junior-foreign-exchange";
const MAX_IDS = 3_526;
const MAX_RANDOM_COUNT = 300;
const MOCK_TOKEN_VERSION = 2;
const MOCK_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;
const FX_QUESTION_ID_PATTERN = /^fx-(2[3-9]|3\d|4[0-7])-(remittance|trade)-\d{3}$/;
const SECURITIES_QUESTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,120}-pdf-\d{4}$/;

type ExamId = typeof SECURITIES_EXAM_ID | typeof FOREIGN_EXCHANGE_EXAM_ID;
type Resource = "securities" | "foreign-exchange" | "overrides" | "health";
type JsonObject = Record<string, unknown>;

type MockTokenPayload = {
  v: 2;
  examId: ExamId;
  userId: string;
  contentVersion: string;
  questionIds: string[];
  issuedAt: number;
  expiresAt: number;
};

type ForeignExchangeClientQuestion = Pick<
  ForeignExchangeQuestionRecord,
  | "id"
  | "bankTitle"
  | "chapter"
  | "question"
  | "options"
  | "answer"
  | "acceptedAnswers"
  | "allAnsweredCredit"
  | "automaticCredit"
  | "answerNote"
  | "explanation"
  | "session"
  | "subjectId"
  | "questionNumber"
  | "standardVersion"
>;

type ForeignExchangeMockQuestion = Omit<
  ForeignExchangeClientQuestion,
  "answer" | "acceptedAnswers" | "allAnsweredCredit" | "automaticCredit" | "answerNote" | "explanation"
>;

function getQueryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function parseBody(req: ApiRequest): JsonObject {
  if (typeof req.body === "string") {
    try {
      const value: unknown = JSON.parse(req.body || "{}");
      return typeof value === "object" && value !== null && !Array.isArray(value)
        ? value as JsonObject
        : {};
    } catch {
      throw new HttpError("請求內容不是有效的JSON。", 400);
    }
  }
  return typeof req.body === "object" && req.body !== null && !Array.isArray(req.body)
    ? req.body as JsonObject
    : {};
}


function parseQueryBody(req: ApiRequest): JsonObject {
  const query = req.query || {};
  const output: JsonObject = {};
  for (const key of [
    "resource",
    "action",
    "path",
    "ids",
    "session",
    "subject",
    "randomCount",
    "bankId",
    "avoidIds",
    "mockToken",
    "query",
    "limit",
  ] as const) {
    const value = query[key];
    if (value !== undefined) output[key] = Array.isArray(value) ? value.join(",") : value;
  }
  return output;
}

function parseResource(req: ApiRequest, body: JsonObject): Resource {
  const raw = String(body.resource || getQueryValue(req.query?.resource) || "").trim();
  if (
    raw === "securities"
    || raw === "foreign-exchange"
    || raw === "overrides"
    || raw === "health"
  ) return raw;
  throw new HttpError("題庫資源不正確。", 400);
}

function databaseErrorCode(error: unknown): string {
  return typeof error === "object" && error !== null && "code" in error
    ? String((error as { code?: unknown }).code || "")
    : "";
}

function databaseErrorMessage(error: unknown): string {
  return typeof error === "object" && error !== null && "message" in error
    ? String((error as { message?: unknown }).message || "")
    : String(error || "");
}

function isMissingRelation(error: unknown, relation: string): boolean {
  const code = databaseErrorCode(error);
  const message = databaseErrorMessage(error);
  return code === "42P01"
    || code === "PGRST205"
    || message.includes(relation)
      && (
        message.includes("Could not find the table")
        || message.includes("does not exist")
        || message.includes("schema cache")
      );
}

function isPermissionDenied(error: unknown): boolean {
  const code = databaseErrorCode(error);
  const message = databaseErrorMessage(error);
  return code === "42501" || /permission denied/i.test(message);
}

function isActiveEntitlement(row: { status?: unknown; expires_at?: unknown } | null): boolean {
  if (!row || row.status !== "active") return false;
  if (!row.expires_at) return true;
  const expiresAt = new Date(String(row.expires_at)).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

async function requireExamEntitlement(
  req: ApiRequest,
  examId: ExamId,
): Promise<Awaited<ReturnType<typeof requireAuthenticatedUser>>> {
  const auth = await requireAuthenticatedUser(req);
  const examEntitlement = await auth.supabase
    .from("user_exam_entitlements")
    .select("plan, status, source_code_hash, granted_at, expires_at")
    .eq("user_id", auth.user.id)
    .eq("exam_id", examId)
    .maybeSingle();

  let examEntitlementTableAvailable = true;
  if (examEntitlement.error) {
    if (isMissingRelation(examEntitlement.error, "user_exam_entitlements")) {
      examEntitlementTableAvailable = false;
    } else if (isPermissionDenied(examEntitlement.error)) {
      throw new HttpError(
        "題庫權限資料尚未完成 RLS 或資料表授權部署。",
        503,
      );
    } else {
      throw examEntitlement.error;
    }
  } else if (isActiveEntitlement(examEntitlement.data)) {
    return auth;
  }

  // Older installations only have user_entitlements. Keep securities learners
  // working while the exam-scoped migration is being rolled out.
  if (examId === SECURITIES_EXAM_ID) {
    const legacy = await auth.supabase
      .from("user_entitlements")
      .select("plan, status, source_code_hash, granted_at, expires_at")
      .eq("user_id", auth.user.id)
      .maybeSingle();

    if (legacy.error) {
      if (
        !isMissingRelation(legacy.error, "user_entitlements")
        && !isPermissionDenied(legacy.error)
      ) {
        throw legacy.error;
      }
    } else if (isActiveEntitlement(legacy.data)) {
      if (auth.usingServiceRole && examEntitlementTableAvailable) {
        const { error: syncError } = await auth.supabase
          .from("user_exam_entitlements")
          .upsert({
            user_id: auth.user.id,
            exam_id: SECURITIES_EXAM_ID,
            plan: legacy.data?.plan || "full",
            status: "active",
            source_code_hash: legacy.data?.source_code_hash || null,
            granted_at: legacy.data?.granted_at || new Date().toISOString(),
            expires_at: legacy.data?.expires_at || null,
          }, { onConflict: "user_id,exam_id" });
        if (syncError) {
          console.warn("Unable to synchronize legacy securities entitlement", syncError);
        }
      }
      return auth;
    }
  }

  if (!examEntitlementTableAvailable) {
    throw new HttpError("題庫權限資料尚未部署。", 503);
  }

  throw new HttpError(
    `這個帳號尚未開通${
      examId === SECURITIES_EXAM_ID ? "證券高業" : "初階外匯"
    }題庫。`,
    403,
  );
}

function randomize<T>(items: readonly T[]): T[] {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(Math.random() * (index + 1));
    [output[index], output[swap]] = [output[swap] as T, output[index] as T];
  }
  return output;
}

function parseCount(value: unknown, fallback: number | null = null): number | null {
  if (value === undefined || value === null || value === "") return fallback;
  const count = Number(value);
  if (!Number.isInteger(count) || count < 1 || count > MAX_RANDOM_COUNT) {
    throw new HttpError(`題數必須介於1至${MAX_RANDOM_COUNT}題。`, 400);
  }
  return count;
}

function parseSearchLimit(value: unknown): number {
  if (value === undefined || value === null || value === "") return 80;
  const limit = Number(value);
  if (!Number.isInteger(limit) || limit < 1 || limit > 80) {
    throw new HttpError("搜尋筆數必須介於1至80筆。", 400);
  }
  return limit;
}

function parseSearchQuery(value: unknown): string {
  const query = String(value || "").trim();
  if (query.length < 2 || query.length > 80) {
    throw new HttpError("搜尋關鍵字必須介於2至80個字元。", 400);
  }
  return query;
}

function parseIds(value: unknown, pattern: RegExp): string[] {
  if (value === undefined || value === null || value === "") return [];
  const raw = Array.isArray(value) ? value : String(value).split(",");
  const ids = Array.from(new Set(raw.map((item) => String(item).trim()).filter(Boolean)));
  if (ids.length > MAX_IDS) throw new HttpError("題目清單過長。", 400);
  if (ids.some((id) => !pattern.test(id))) throw new HttpError("題目識別碼格式不正確。", 400);
  return ids;
}

function signingSecret(): string {
  const secret = String(
    process.env.MOCK_EXAM_SIGNING_SECRET
    || process.env.SUPABASE_SERVICE_ROLE_KEY
    || process.env.SUPABASE_SECRET_KEY
    || "",
  ).trim();
  if (!secret) {
    throw new HttpError(
      "模擬考簽章環境變數尚未設定；請設定 MOCK_EXAM_SIGNING_SECRET 後重新部署。",
      503,
    );
  }
  return secret;
}

function encodeBase64Url(source: string): string {
  return Buffer.from(source, "utf8").toString("base64url");
}

function signMockToken(payload: MockTokenPayload): string {
  const encoded = encodeBase64Url(JSON.stringify(payload));
  const signature = createHmac("sha256", signingSecret()).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

function verifyMockToken(
  token: unknown,
  expectedExamId: ExamId,
  expectedUserId: string,
): MockTokenPayload {
  const [encoded, providedSignature, extra] = String(token || "").split(".");
  if (!encoded || !providedSignature || extra) throw new HttpError("模擬考識別碼無效。", 400);
  const expectedSignature = createHmac("sha256", signingSecret()).update(encoded).digest();
  let provided: Buffer;
  try {
    provided = Buffer.from(providedSignature, "base64url");
  } catch {
    throw new HttpError("模擬考識別碼無效。", 400);
  }
  if (provided.length !== expectedSignature.length || !timingSafeEqual(provided, expectedSignature)) {
    throw new HttpError("模擬考識別碼驗證失敗。", 403);
  }
  let payload: MockTokenPayload;
  try {
    payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as MockTokenPayload;
  } catch {
    throw new HttpError("模擬考識別碼內容無效。", 400);
  }
  if (
    payload.v !== MOCK_TOKEN_VERSION ||
    payload.examId !== expectedExamId ||
    payload.userId !== expectedUserId ||
    typeof payload.contentVersion !== "string" ||
    payload.contentVersion.length < 1 ||
    payload.contentVersion.length > 160 ||
    !Array.isArray(payload.questionIds) ||
    payload.questionIds.length < 1 ||
    payload.questionIds.length > MAX_RANDOM_COUNT ||
    !Number.isFinite(payload.expiresAt) ||
    payload.expiresAt <= Date.now()
  ) throw new HttpError("模擬考已過期，請重新建立。", 410);
  return payload;
}

function assertMockContentVersion(payload: MockTokenPayload, expectedContentVersion: string): void {
  if (payload.contentVersion !== expectedContentVersion) {
    throw new HttpError("題庫版本已更新，請重新建立模擬考。", 409);
  }
}

function createMockToken(
  examId: ExamId,
  userId: string,
  contentVersion: string,
  questionIds: string[],
): string {
  const issuedAt = Date.now();
  return signMockToken({
    v: MOCK_TOKEN_VERSION,
    examId,
    userId,
    contentVersion,
    questionIds,
    issuedAt,
    expiresAt: issuedAt + MOCK_TOKEN_TTL_MS,
  });
}

function toFxClientQuestion(question: ForeignExchangeQuestionRecord): ForeignExchangeClientQuestion {
  return {
    id: question.id,
    bankTitle: question.bankTitle,
    chapter: question.chapter,
    question: question.question,
    options: question.options,
    answer: question.answer,
    acceptedAnswers: question.acceptedAnswers,
    allAnsweredCredit: question.allAnsweredCredit,
    automaticCredit: question.automaticCredit,
    answerNote: question.answerNote,
    explanation: question.explanation,
    session: question.session,
    subjectId: question.subjectId,
    questionNumber: question.questionNumber,
    standardVersion: question.standardVersion,
  };
}

function toFxMockQuestion(question: ForeignExchangeQuestionRecord): ForeignExchangeMockQuestion {
  return {
    id: question.id,
    bankTitle: question.bankTitle,
    chapter: question.chapter,
    question: question.question,
    options: question.options,
    session: question.session,
    subjectId: question.subjectId,
    questionNumber: question.questionNumber,
    standardVersion: question.standardVersion,
  };
}

function fxAnswerCorrect(question: ForeignExchangeQuestionRecord, selected: unknown): boolean {
  if (question.automaticCredit) return true;
  if (selected !== "A" && selected !== "B" && selected !== "C" && selected !== "D") return false;
  if (question.allAnsweredCredit) return true;
  const accepted = question.acceptedAnswers?.length ? question.acceptedAnswers : [question.answer];
  return accepted.includes(selected);
}

function parseFxSession(value: unknown): ForeignExchangeSession | null {
  if (value === undefined || value === null || value === "") return null;
  const session = Number(value);
  return Number.isInteger(session) && session >= 23 && session <= 47
    ? session as ForeignExchangeSession
    : null;
}

function parseFxSubject(value: unknown): ForeignExchangeSubjectId | null {
  if (value === undefined || value === null || value === "") return null;
  return value === "remittance" || value === "trade" ? value : null;
}

function filterFxQuestions(body: JsonObject): ForeignExchangeQuestionRecord[] {
  const session = parseFxSession(body.session);
  const subject = parseFxSubject(body.subject);
  if (body.session !== undefined && body.session !== null && body.session !== "" && !session) throw new HttpError("屆次參數不正確。", 400);
  if (body.subject !== undefined && body.subject !== null && body.subject !== "" && !subject) throw new HttpError("科目參數不正確。", 400);
  const ids = parseIds(body.ids, FX_QUESTION_ID_PATTERN);
  const idSet = ids.length ? new Set(ids) : null;
  let matches = foreignExchangeQuestions
    .filter((question) => !session || question.session === session)
    .filter((question) => !subject || question.subjectId === subject)
    .filter((question) => !idSet || idSet.has(question.id));
  const randomCount = parseCount(body.randomCount);
  if (randomCount) matches = randomize(matches).slice(0, randomCount);
  return matches;
}

async function handleForeignExchange(req: ApiRequest, res: ApiResponse, body: JsonObject): Promise<void> {
  const auth = await requireExamEntitlement(req, FOREIGN_EXCHANGE_EXAM_ID);
  const action = String(body.action || "questions");

  if (action === "search") {
    const query = parseSearchQuery(body.query);
    const limit = parseSearchLimit(body.limit);
    const normalized = query.toLowerCase().replace(/\s+/g, " ");
    const results = foreignExchangeQuestions
      .filter((question) => [
        question.bankTitle,
        `第${question.session}屆`,
        question.standardVersion,
        question.question,
        question.options.A,
        question.options.B,
        question.options.C,
        question.options.D,
        question.explanation,
      ].join(" ").toLowerCase().replace(/\s+/g, " ").includes(normalized))
      .slice(0, limit)
      .map((question) => ({
        examId: FOREIGN_EXCHANGE_EXAM_ID,
        id: question.id,
        session: question.session,
        subjectId: question.subjectId,
        bankTitle: question.bankTitle,
        questionNumber: question.questionNumber,
        question: question.question,
      }));
    sendJson(res, 200, { examId: FOREIGN_EXCHANGE_EXAM_ID, results });
    return;
  }

  if (action === "mock-resume" || action === "mock-submit") {
    const payload = verifyMockToken(body.mockToken, FOREIGN_EXCHANGE_EXAM_ID, auth.user.id);
    assertMockContentVersion(payload, foreignExchangeManifest.contentSignature);
    const byId = new Map(foreignExchangeQuestions.map((question) => [question.id, question]));
    const questions = payload.questionIds.map((id) => byId.get(id)).filter((question): question is ForeignExchangeQuestionRecord => Boolean(question));
    if (questions.length !== payload.questionIds.length) throw new HttpError("模擬考題目版本已變更，請重新建立。", 409);

    if (action === "mock-resume") {
      sendJson(res, 200, { examId: FOREIGN_EXCHANGE_EXAM_ID, mockToken: body.mockToken, questions: questions.map(toFxMockQuestion) });
      return;
    }

    const answerSource = typeof body.answers === "object" && body.answers !== null && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : {};
    const results = questions.map((question) => {
      const selectedAnswer = answerSource[question.id];
      return {
        ...toFxClientQuestion(question),
        selectedAnswer: selectedAnswer ?? null,
        isCorrect: fxAnswerCorrect(question, selectedAnswer),
      };
    });
    sendJson(res, 200, {
      examId: FOREIGN_EXCHANGE_EXAM_ID,
      questionCount: results.length,
      correctCount: results.filter((result) => result.isCorrect).length,
      results,
    });
    return;
  }

  const matches = filterFxQuestions(body);
  if (action === "mock-start") {
    if (!matches.length) throw new HttpError("找不到可建立模擬考的題目。", 404);
    const token = createMockToken(
      FOREIGN_EXCHANGE_EXAM_ID,
      auth.user.id,
      foreignExchangeManifest.contentSignature,
      matches.map((question) => question.id),
    );
    sendJson(res, 200, { examId: FOREIGN_EXCHANGE_EXAM_ID, mockToken: token, questions: matches.map(toFxMockQuestion) });
    return;
  }

  const questions = matches.map(toFxClientQuestion);
  sendJson(res, 200, {
    examId: FOREIGN_EXCHANGE_EXAM_ID,
    contentSignature: foreignExchangeManifest.contentSignature,
    totalQuestionCount: foreignExchangeManifest.questionCount,
    questionCount: questions.length,
    questions,
  });
}

function toSecuritiesMockQuestion(question: SecuritiesQuestionRecord) {
  const client = toSecuritiesClientQuestion(question);
  return {
    id: client.id,
    bankId: client.bankId,
    bankTitle: client.bankTitle,
    chapterId: client.chapterId,
    chapterTitle: client.chapterTitle,
    chapterTopic: client.chapterTopic,
    number: client.number,
    questionText: client.questionText,
    optionTexts: client.optionTexts,
    sourceFile: client.sourceFile,
    questionSegments: client.questionSegments,
    explanationSegments: client.explanationSegments,
    answerMask: client.answerMask,
  };
}

function selectProportionalSecuritiesQuestions(
  questions: SecuritiesQuestionRecord[],
  count: number,
  avoidIds: Set<string>,
): SecuritiesQuestionRecord[] {
  const available = questions.filter((question) => !avoidIds.has(question.id));
  const source = available.length ? available : questions;
  const byChapter = new Map<string, SecuritiesQuestionRecord[]>();
  for (const question of source) {
    const bucket = byChapter.get(question.chapterId) || [];
    bucket.push(question);
    byChapter.set(question.chapterId, bucket);
  }
  const buckets = Array.from(byChapter.values()).map(randomize);
  const drawTotal = Math.min(count, source.length);
  const quotas = buckets.map((bucket, index) => {
    const raw = drawTotal * bucket.length / source.length;
    return { bucket, index, count: Math.floor(raw), remainder: raw - Math.floor(raw) };
  });
  let allocated = quotas.reduce((sum, quota) => sum + quota.count, 0);
  for (const quota of [...quotas].sort((left, right) => right.remainder - left.remainder || right.bucket.length - left.bucket.length || left.index - right.index)) {
    if (allocated >= drawTotal) break;
    if (quota.count < quota.bucket.length) {
      quota.count += 1;
      allocated += 1;
    }
  }
  return randomize(quotas.flatMap((quota) => quota.bucket.slice(0, quota.count)));
}

function applyPublishedSecuritiesOverrides(
  questions: readonly SecuritiesQuestionRecord[],
  overrides: readonly QuestionOverride[],
): SecuritiesQuestionRecord[] {
  if (!overrides.length) return [...questions];
  const byId = new Map(overrides.map((override) => [override.questionId, override] as const));
  return questions.map((question) => {
    const override = byId.get(question.id);
    if (!override) return question;
    return {
      ...question,
      bankTitle: override.bankTitle?.trim() || question.bankTitle,
      chapterTitle: override.chapterTitle?.trim() || question.chapterTitle,
      number: Number.isInteger(override.questionNumber) && Number(override.questionNumber) > 0
        ? Number(override.questionNumber)
        : question.number,
      answer: override.answer,
    };
  });
}

function securitiesContentVersion(releaseId: string, overrideReleaseId: string | null): string {
  return `${releaseId}:${overrideReleaseId || "bundled"}`;
}

async function handleSecurities(req: ApiRequest, res: ApiResponse, body: JsonObject): Promise<void> {
  const auth = await requireExamEntitlement(req, SECURITIES_EXAM_ID);
  const action = String(body.action || "chapter");

  if (action === "search") {
    const query = parseSearchQuery(body.query);
    const limit = parseSearchLimit(body.limit);
    const questions = await searchSecuritiesQuestions(query, limit);
    const results = questions.map((question) => ({
      examId: SECURITIES_EXAM_ID,
      id: question.id,
      bankId: question.bankId,
      bankTitle: question.bankTitle,
      chapterId: question.chapterId,
      chapterTitle: [question.chapterTitle, question.chapterTopic].filter(Boolean).join(" "),
      questionNumber: question.number,
      question: question.questionText || "",
    }));
    sendJson(res, 200, { examId: SECURITIES_EXAM_ID, results });
    return;
  }

  if (action === "chapter") {
    const path = String(body.path || "").trim();
    if (!path) throw new HttpError("缺少章節路徑。", 400);
    const shard = await loadSecuritiesShard(path);
    sendJson(res, 200, {
      bankId: shard.bankId,
      bankTitle: shard.bankTitle,
      chapter: toSecuritiesClientChapter(shard),
    });
    return;
  }

  if (action === "ids") {
    const ids = parseIds(body.ids, SECURITIES_QUESTION_ID_PATTERN);
    const questions = await loadSecuritiesQuestionsByIds(ids);
    sendJson(res, 200, { questions: questions.map(toSecuritiesClientQuestion) });
    return;
  }

  if (action === "mock-resume" || action === "mock-submit") {
    const payload = verifyMockToken(body.mockToken, SECURITIES_EXAM_ID, auth.user.id);
    const [manifest, bundledQuestions, published] = await Promise.all([
      loadSecuritiesManifest(),
      loadSecuritiesQuestionsByIds(payload.questionIds),
      listPublishedOverrides(auth.supabase, payload.questionIds),
    ]);
    assertMockContentVersion(
      payload,
      securitiesContentVersion(manifest.releaseId, published.releaseId),
    );
    if (bundledQuestions.length !== payload.questionIds.length) {
      throw new HttpError("模擬考題目版本已變更，請重新建立。", 409);
    }
    const questions = applyPublishedSecuritiesOverrides(bundledQuestions, published.overrides);

    if (action === "mock-resume") {
      sendJson(res, 200, {
        examId: SECURITIES_EXAM_ID,
        mockToken: body.mockToken,
        questions: questions.map(toSecuritiesMockQuestion),
      });
      return;
    }

    const answerSource = typeof body.answers === "object" && body.answers !== null && !Array.isArray(body.answers)
      ? body.answers as Record<string, unknown>
      : {};
    const results = questions.map((question) => {
      const selectedAnswer = answerSource[question.id];
      const isValid = selectedAnswer === "1" || selectedAnswer === "2" || selectedAnswer === "3" || selectedAnswer === "4";
      return {
        ...toSecuritiesClientQuestion(question),
        selectedAnswer: isValid ? selectedAnswer : null,
        isCorrect: isValid && selectedAnswer === question.answer,
      };
    });
    sendJson(res, 200, {
      examId: SECURITIES_EXAM_ID,
      questionCount: results.length,
      correctCount: results.filter((result) => result.isCorrect).length,
      results,
    });
    return;
  }

  if (action === "mock-start") {
    const bankId = String(body.bankId || "").trim();
    if (!bankId) throw new HttpError("缺少模考科目。", 400);
    const count = parseCount(body.randomCount, 50) ?? 50;
    const avoidIds = new Set(parseIds(body.avoidIds, SECURITIES_QUESTION_ID_PATTERN));
    const [manifest, bankQuestions] = await Promise.all([
      loadSecuritiesManifest(),
      loadSecuritiesBankQuestions(bankId),
    ]);
    const selected = selectProportionalSecuritiesQuestions(bankQuestions, count, avoidIds);
    if (!selected.length) throw new HttpError("找不到可建立模擬考的題目。", 404);
    const published = await listPublishedOverrides(auth.supabase, selected.map((question) => question.id));
    const questions = applyPublishedSecuritiesOverrides(selected, published.overrides);
    const token = createMockToken(
      SECURITIES_EXAM_ID,
      auth.user.id,
      securitiesContentVersion(manifest.releaseId, published.releaseId),
      questions.map((question) => question.id),
    );
    sendJson(res, 200, {
      examId: SECURITIES_EXAM_ID,
      mockToken: token,
      questions: questions.map(toSecuritiesMockQuestion),
    });
    return;
  }

  throw new HttpError("證券題庫操作不正確。", 400);
}

function isUnavailableReleaseTable(error: unknown): boolean {
  const message = databaseErrorMessage(error);
  return isMissingRelation(error, "question_release_pointer")
    || isMissingRelation(error, "question_release_items")
    || isPermissionDenied(error)
    || message.includes("question_release_pointer")
    || message.includes("question_release_items");
}

async function listPublishedOverrides(supabase: SupabaseClient, questionIds: string[]): Promise<{ overrides: QuestionOverride[]; releaseId: string | null }> {
  const { data: pointer, error: pointerError } = await supabase
    .from("question_release_pointer")
    .select("active_release_id")
    .eq("singleton", true)
    .maybeSingle();
  if (pointerError) {
    if (isUnavailableReleaseTable(pointerError)) return { overrides: [], releaseId: null };
    throw pointerError;
  }
  if (!pointer?.active_release_id) return { overrides: [], releaseId: null };
  const overrides: QuestionOverride[] = [];
  const ids = questionIds;
  if (ids.length) {
    for (let index = 0; index < ids.length; index += 100) {
      const { data, error } = await supabase
        .from("question_release_items")
        .select("payload")
        .eq("release_id", pointer.active_release_id)
        .in("question_id", ids.slice(index, index + 100))
        .order("question_id", { ascending: true });
      if (error) {
        if (isUnavailableReleaseTable(error)) return { overrides: [], releaseId: null };
        throw error;
      }
      overrides.push(...(data || []).map((row) => row.payload as QuestionOverride));
    }
  } else {
    const pageSize = 500;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from("question_release_items")
        .select("payload")
        .eq("release_id", pointer.active_release_id)
        .order("question_id", { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) {
        if (isUnavailableReleaseTable(error)) return { overrides: [], releaseId: null };
        throw error;
      }
      const page = data || [];
      overrides.push(...page.map((row) => row.payload as QuestionOverride));
      if (page.length < pageSize) break;
      offset += pageSize;
    }
  }
  return { overrides, releaseId: pointer.active_release_id };
}

function toLearnerQuestionOverride(override: QuestionOverride) {
  return {
    questionId: override.questionId,
    bankTitle: override.bankTitle,
    chapterTitle: override.chapterTitle,
    questionNumber: override.questionNumber,
    answer: override.answer,
  };
}

async function handleOverrides(req: ApiRequest, res: ApiResponse, body: JsonObject): Promise<void> {
  const { supabase } = await requireExamEntitlement(req, SECURITIES_EXAM_ID);
  const idsValue = body.ids ?? getQueryValue(req.query?.ids);
  const questionIds = parseIds(idsValue, SECURITIES_QUESTION_ID_PATTERN);
  const published = await listPublishedOverrides(supabase, questionIds);
  const payload = {
    overrides: published.overrides.map(toLearnerQuestionOverride),
    releaseId: published.releaseId,
    releaseMode: published.releaseId ? "published" : "bundled-stable",
  };
  const etag = `"${createHash("sha256").update(JSON.stringify(payload)).digest("hex").slice(0, 24)}"`;
  res.setHeader("ETag", etag);
  sendJson(res, 200, payload);
}


async function handleHealth(res: ApiResponse): Promise<void> {
  const [manifest, firstShard] = await (async () => {
    const securitiesManifest = await loadSecuritiesManifest();
    const firstPath = securitiesManifest.banks
      .flatMap((bank) => bank.chapters)
      .map((chapter) => chapter.path)
      .find(Boolean);
    return [
      securitiesManifest,
      firstPath ? await loadSecuritiesShard(firstPath) : null,
    ] as const;
  })();

  const shardPaths = manifest.banks.flatMap((bank) =>
    bank.chapters.map((chapter) => chapter.path),
  );
  const auth = getQuestionAuthConfiguration();
  const countsReady = manifest.totalQuestions === 3_526
    && shardPaths.length === 40
    && foreignExchangeManifest.questionCount === 3_250
    && Boolean(firstShard?.chapter.questions.length);
  const ok = auth.questionAuthConfigured
    && auth.mockSigningSecretConfigured
    && countsReady;

  sendJson(res, ok ? 200 : 503, {
    ok,
    release: "v91.2.2-question-bank-reliability",
    auth,
    securities: {
      releaseId: manifest.releaseId,
      totalQuestions: manifest.totalQuestions,
      bankCount: manifest.banks.length,
      shardCount: shardPaths.length,
      firstShardQuestionCount: firstShard?.chapter.questions.length ?? 0,
    },
    foreignExchange: {
      contentSignature: foreignExchangeManifest.contentSignature,
      totalQuestions: foreignExchangeManifest.questionCount,
      sessionRange: foreignExchangeManifest.sessionRange,
    },
  });
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET" && req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }
  try {
    const body = req.method === "POST" ? parseBody(req) : parseQueryBody(req);
    const resource = parseResource(req, body);
    if (resource === "health") await handleHealth(res);
    else if (resource === "foreign-exchange") await handleForeignExchange(req, res, body);
    else if (resource === "securities") await handleSecurities(req, res, body);
    else await handleOverrides(req, res, body);
  } catch (error) {
    console.error("/api/questions failed:", error);
    sendError(res, error);
  }
}
