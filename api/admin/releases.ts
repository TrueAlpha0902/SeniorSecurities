import { createHash } from "node:crypto";
import {
  deleteQuestionOverrides,
  listQuestionOverrides,
  type QuestionOverride,
} from "../_questionOverrides.js";
import {
  HttpError,
  requireAdminUser,
  requestIpAddress,
  sendError,
  sendJson,
  type ApiRequest,
  type ApiResponse,
} from "../_adminClient.js";

type JsonObject = Record<string, unknown>;

type ReleaseRow = {
  id: string;
  version: string;
  status: string;
  title: string;
  notes: string | null;
  created_by: string | null;
  reviewed_by: string | null;
  approved_by: string | null;
  published_by: string | null;
  created_at: string;
  reviewed_at: string | null;
  approved_at: string | null;
  published_at: string | null;
  rolled_back_at: string | null;
};

function parseBody(req: ApiRequest): JsonObject {
  const value: unknown = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  return typeof value === "object" && value !== null && !Array.isArray(value) ? value as JsonObject : {};
}

function idValue(value: unknown): string {
  const id = String(value || "").trim();
  if (!/^[0-9a-f-]{36}$/i.test(id)) throw new HttpError("發布批次識別碼不正確。", 400);
  return id;
}

function releaseVersion(value: unknown): string {
  const now = new Date();
  const fallback = `v${now.toISOString().slice(0, 10).replace(/-/g, ".")}.${now.toISOString().slice(11, 19).replace(/:/g, "")}`;
  const version = String(value || fallback).trim().slice(0, 80);
  if (!/^[A-Za-z0-9._-]{3,80}$/.test(version)) throw new HttpError("版本名稱只能使用英數字、點、底線與連字號。", 400);
  return version;
}

function payloadHash(payload: QuestionOverride): string {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

async function listReleases(supabase: Awaited<ReturnType<typeof requireAdminUser>>["supabase"]) {
  const [{ data: rows, error }, { data: pointer, error: pointerError }] = await Promise.all([
    supabase.from("question_release_batches")
      .select("id, version, status, title, notes, created_by, reviewed_by, approved_by, published_by, created_at, reviewed_at, approved_at, published_at, rolled_back_at")
      .order("created_at", { ascending: false })
      .limit(20),
    supabase.from("question_release_pointer").select("active_release_id, previous_release_id, updated_at").eq("singleton", true).maybeSingle(),
  ]);
  if (error) throw error;
  if (pointerError) throw pointerError;
  return { releases: (rows || []) as ReleaseRow[], pointer: pointer || null };
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  try {
    if (req.method === "GET") {
      const admin = await requireAdminUser(req, { roles: ["primary_admin", "admin"] });
      const result = await listReleases(admin.supabase);
      sendJson(res, 200, { ...result, role: admin.role, isPrimaryAdmin: admin.isPrimaryAdmin });
      return;
    }

    if (req.method !== "POST") {
      sendJson(res, 405, { error: "Method not allowed" });
      return;
    }

    const body = parseBody(req);
    const action = String(body.action || "");

    if (action === "publish-current") {
      const admin = await requireAdminUser(req, {
        roles: ["primary_admin"],
      });
      if (!admin.isPrimaryAdmin) throw new HttpError("只有主要管理員可以發布題庫。", 403);

      const overrides = await listQuestionOverrides(admin.supabase, { bypassCache: true });
      if (!overrides.length) throw new HttpError("目前沒有尚未發布的題目修改。", 400);

      const version = releaseVersion(body.version);
      const title = String(body.title || "題庫內容更新").trim().slice(0, 160) || "題庫內容更新";
      const notes = String(body.notes || `主要管理員直接發布，共 ${overrides.length} 題修改。`).trim().slice(0, 1200);
      const items = overrides.map((override) => ({
        questionId: override.questionId,
        payload: override,
        payloadHash: payloadHash(override),
      }));

      const { data, error } = await admin.supabase.rpc("publish_question_overrides_v797", {
        p_version: version,
        p_title: title,
        p_notes: notes || null,
        p_items: items,
        p_actor_user_id: admin.user.id,
        p_actor_email: admin.user.email || admin.user.id,
        p_ip_address: requestIpAddress(req),
      });
      if (error) throw error;

      let cleanupWarning = "";
      try {
        await deleteQuestionOverrides(admin.supabase, overrides.map((override) => override.questionId));
      } catch (cleanupError) {
        console.error("Published release but draft cleanup failed:", cleanupError);
        cleanupWarning = "發布已完成，但未發布清單清理失敗；重新整理後若仍顯示舊項目，可再次移除草稿。";
      }

      sendJson(res, 200, {
        ok: true,
        release: data,
        publishedCount: overrides.length,
        message: cleanupWarning || `已發布 ${overrides.length} 題修改，線上題庫已更新。`,
        cleanupWarning: cleanupWarning || undefined,
      });
      return;
    }

    if (action === "rollback") {
      const admin = await requireAdminUser(req, { roles: ["primary_admin"] });
      if (!admin.isPrimaryAdmin) throw new HttpError("只有主要管理員可以回滾題庫。", 403);
      const releaseId = idValue(body.releaseId);
      const { error } = await admin.supabase.rpc("rollback_question_release_v75", {
        p_release_id: releaseId,
        p_actor_user_id: admin.user.id,
        p_actor_email: admin.user.email || admin.user.id,
        p_ip_address: requestIpAddress(req),
      });
      if (error) throw error;
      sendJson(res, 200, { ok: true, message: "已回滾上一個題庫版本。" });
      return;
    }

    throw new HttpError("未知的發布操作。", 400);
  } catch (error) {
    console.error("/api/admin/releases failed:", error);
    sendError(res, error);
  }
}
