import {
  HttpError,
  requireAuthenticatedUser,
  sendError,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "../_adminClient.js";
import {
  foreignExchangeManifest,
  foreignExchangeQuestions,
  type ForeignExchangeQuestionRecord,
  type ForeignExchangeSession,
  type ForeignExchangeSubjectId,
} from "../_data/foreign-exchange/index.js";

const EXAM_ID = "junior-foreign-exchange";
const MAX_IDS = 390;

type ClientQuestion = Pick<
  ForeignExchangeQuestionRecord,
  | "id"
  | "bankTitle"
  | "chapter"
  | "question"
  | "options"
  | "answer"
  | "explanation"
  | "session"
  | "subjectId"
  | "questionNumber"
  | "standardVersion"
>;

function queryValue(value: string | string[] | undefined): string {
  return Array.isArray(value) ? String(value[0] || "") : String(value || "");
}

function parseSession(value: string): ForeignExchangeSession | null {
  if (!value) return null;
  const parsed = Number(value);
  return parsed === 45 || parsed === 46 || parsed === 47 ? parsed : null;
}

function parseSubject(value: string): ForeignExchangeSubjectId | null {
  return value === "remittance" || value === "trade" ? value : null;
}

function parseIds(value: string): Set<string> | null {
  if (!value) return null;
  const ids = value.split(",").map((id) => id.trim()).filter(Boolean);
  if (ids.length > MAX_IDS) throw new HttpError("題目清單過長。", 400);
  if (ids.some((id) => !/^fx-(45|46|47)-(remittance|trade)-\d{3}$/.test(id))) {
    throw new HttpError("題目識別碼格式不正確。", 400);
  }
  return new Set(ids);
}

function isActiveEntitlement(row: { status?: unknown; expires_at?: unknown } | null): boolean {
  if (!row || row.status !== "active") return false;
  if (!row.expires_at) return true;
  const expiresAt = new Date(String(row.expires_at)).getTime();
  return Number.isFinite(expiresAt) && expiresAt > Date.now();
}

function toClientQuestion(question: ForeignExchangeQuestionRecord): ClientQuestion {
  return {
    id: question.id,
    bankTitle: question.bankTitle,
    chapter: question.chapter,
    question: question.question,
    options: question.options,
    answer: question.answer,
    explanation: question.explanation,
    session: question.session,
    subjectId: question.subjectId,
    questionNumber: question.questionNumber,
    standardVersion: question.standardVersion,
  };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const { supabase, user } = await requireAuthenticatedUser(req);
    const { data: entitlement, error: entitlementError } = await supabase
      .from("user_exam_entitlements")
      .select("status, expires_at")
      .eq("user_id", user.id)
      .eq("exam_id", EXAM_ID)
      .maybeSingle();

    if (entitlementError) {
      const message = String(entitlementError.message || "");
      if (message.includes("user_exam_entitlements") || message.includes("Could not find the table")) {
        throw new HttpError("初階外匯權限資料尚未部署。", 503);
      }
      throw entitlementError;
    }
    if (!isActiveEntitlement(entitlement)) {
      throw new HttpError("這個帳號尚未開通初階外匯題庫。", 403);
    }

    const sessionText = queryValue(req.query?.session);
    const subjectText = queryValue(req.query?.subject);
    const session = parseSession(sessionText);
    const subject = parseSubject(subjectText);
    if (sessionText && !session) throw new HttpError("屆次參數不正確。", 400);
    if (subjectText && !subject) throw new HttpError("科目參數不正確。", 400);
    const ids = parseIds(queryValue(req.query?.ids));

    const questions = foreignExchangeQuestions
      .filter((question) => (!session || question.session === session))
      .filter((question) => (!subject || question.subjectId === subject))
      .filter((question) => (!ids || ids.has(question.id)))
      .map(toClientQuestion);

    sendJson(res, 200, {
      examId: EXAM_ID,
      contentSignature: foreignExchangeManifest.contentSignature,
      questionCount: questions.length,
      questions,
    });
  } catch (error) {
    console.error("/api/foreign-exchange/questions failed:", error);
    sendError(res, error);
  }
}
