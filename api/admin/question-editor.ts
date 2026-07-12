import {
  deleteQuestionOverride,
  listQuestionOverrides,
  saveQuestionOverride,
  type QuestionOverrideSegment,
} from "../_questionOverrides.js";
import {
  HttpError,
  requireAdminUser,
  sendError,
  sendJson,
  writeAdminAudit,
  type ApiRequest,
  type ApiResponse,
} from "../_adminClient.js";

type JsonObject = Record<string, unknown>;

function parseBody(req: ApiRequest): JsonObject {
  const parsed: unknown = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed) ? parsed as JsonObject : {};
}

function normalizeQuestionId(value: unknown): string {
  const id = String(value || "").trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9_-]{1,160}$/.test(id)) throw new HttpError("題目 ID 格式不正確。", 400);
  return id;
}

function normalizeAnswer(value: unknown): "1" | "2" | "3" | "4" {
  const answer = String(value || "");
  if (answer !== "1" && answer !== "2" && answer !== "3" && answer !== "4") {
    throw new HttpError("答案必須是 1、2、3 或 4。", 400);
  }
  return answer;
}

function normalizeSegments(value: unknown): QuestionOverrideSegment[] {
  if (!Array.isArray(value) || value.length > 12) throw new HttpError("每種截圖最多 12 個段落。", 400);
  return value.map((item, index) => {
    if (typeof item !== "object" || item === null) throw new HttpError(`第 ${index + 1} 個段落格式不正確。`, 400);
    const row = item as Record<string, unknown>;
    const segment: QuestionOverrideSegment = {
      page: Math.trunc(Number(row.page)),
      src: String(row.src || "").trim(),
      x: Math.round(Number(row.x)),
      y: Math.round(Number(row.y)),
      width: Math.round(Number(row.width)),
      height: Math.round(Number(row.height)),
      pageWidth: Math.round(Number(row.pageWidth)),
      pageHeight: Math.round(Number(row.pageHeight)),
    };
    if (!segment.src || !/^pdf-pages\/[A-Za-z0-9/_-]+\.webp$/i.test(segment.src)) {
      throw new HttpError(`第 ${index + 1} 個段落圖片路徑不正確。`, 400);
    }
    if (
      segment.page < 1 || segment.x < 0 || segment.y < 0 || segment.width < 1 || segment.height < 1 ||
      segment.pageWidth < 1 || segment.pageHeight < 1 || segment.x + segment.width > segment.pageWidth ||
      segment.y + segment.height > segment.pageHeight
    ) {
      throw new HttpError(`第 ${index + 1} 個段落的裁切範圍超出頁面。`, 400);
    }
    return segment;
  });
}

function optionalLabel(value: unknown, maxLength: number): string | undefined {
  const label = String(value || "").trim().slice(0, maxLength);
  return label || undefined;
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === "GET") {
      const admin = await requireAdminUser(req);
      const overrides = await listQuestionOverrides(admin.supabase, { bypassCache: true });
      sendJson(res, 200, { overrides, role: admin.role, isPrimaryAdmin: admin.isPrimaryAdmin });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const { supabase, user } = await requireAdminUser(req);
    const body = parseBody(req);
    const action = String(body.action || "save");
    const questionId = normalizeQuestionId(body.questionId);

    if (action === "delete") {
      await deleteQuestionOverride(supabase, questionId);
      await writeAdminAudit({ supabase, actor: user, req, action: "question_override.delete", metadata: { questionId } });
      sendJson(res, 200, { ok: true, message: "已移除這筆未發布修改。" });
      return;
    }

    const questionNumber = Math.trunc(Number(body.questionNumber));
    const override = {
      questionId,
      bankTitle: optionalLabel(body.bankTitle, 120),
      chapterTitle: optionalLabel(body.chapterTitle, 160),
      questionNumber: Number.isFinite(questionNumber) && questionNumber > 0 ? questionNumber : undefined,
      answer: normalizeAnswer(body.answer),
      questionSegments: normalizeSegments(body.questionSegments),
      explanationSegments: normalizeSegments(body.explanationSegments),
      updatedAt: new Date().toISOString(),
      updatedBy: user.email?.toLowerCase() || user.id,
    };
    await saveQuestionOverride(supabase, override);
    await writeAdminAudit({
      supabase,
      actor: user,
      req,
      action: "question_override.save",
      metadata: {
        questionId,
        answer: override.answer,
        questionSegments: override.questionSegments.length,
        explanationSegments: override.explanationSegments.length,
      },
    });
    sendJson(res, 200, { ok: true, override, message: "題目修改已儲存，確認本次修改清單後即可由主要管理員發布。" });
  } catch (error) {
    console.error("/api/admin/question-editor failed:", error);
    sendError(res, error);
  }
}
