import { createHash } from "node:crypto";
import { listQuestionOverrides, type QuestionOverride } from "../_questionOverrides.js";
import {
  HttpError,
  requireAdminUser,
  sendError,
  sendJson,
  writeAdminAudit,
  requestIpAddress,
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
  const fallback = `v${new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14)}`;
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
      .limit(40),
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
    const admin = await requireAdminUser(req, {
      roles: ["primary_admin", "admin"],
      requireAal2: ["approve", "publish", "rollback"].includes(action),
    });
    const { supabase, user, isPrimaryAdmin } = admin;

    if (action === "create-draft") {
      const overrides = await listQuestionOverrides(supabase, { bypassCache: true });
      if (!overrides.length) throw new HttpError("目前沒有題目草稿可建立發布批次。", 400);
      const version = releaseVersion(body.version);
      const title = String(body.title || `題庫發布 ${version}`).trim().slice(0, 160);
      const notes = String(body.notes || "").trim().slice(0, 1200) || null;
      const { data: batch, error } = await supabase.from("question_release_batches").insert({
        version,
        title,
        notes,
        status: "draft",
        created_by: user.id,
      }).select("id").single();
      if (error) throw error;
      const items = overrides.map((override) => ({
        release_id: batch.id,
        question_id: override.questionId,
        payload: override,
        payload_hash: payloadHash(override),
      }));
      const { error: itemError } = await supabase.from("question_release_items").insert(items);
      if (itemError) throw itemError;
      await writeAdminAudit({ supabase, actor: user, req, action: "question_release.create", metadata: { releaseId: batch.id, version, itemCount: items.length } });
      sendJson(res, 200, { ok: true, message: `已建立 ${version} 草稿，共 ${items.length} 題。` });
      return;
    }

    const releaseId = idValue(body.releaseId);
    const { data: release, error: releaseError } = await supabase.from("question_release_batches").select("*").eq("id", releaseId).single();
    if (releaseError || !release) throw new HttpError("找不到發布批次。", 404);

    if (action === "submit-review") {
      if (release.status !== "draft") throw new HttpError("只有草稿可以送審。", 400);
      const { error } = await supabase.from("question_release_batches").update({ status: "in_review", reviewed_by: user.id, reviewed_at: new Date().toISOString() }).eq("id", releaseId).eq("status", "draft");
      if (error) throw error;
    } else if (action === "approve") {
      if (release.status !== "in_review") throw new HttpError("只有審核中的批次可以核准。", 400);
      if (release.created_by === user.id) throw new HttpError("雙人覆核規則：建立者不可核准自己的發布批次。", 400);
      const { error } = await supabase.from("question_release_batches").update({ status: "approved", approved_by: user.id, approved_at: new Date().toISOString() }).eq("id", releaseId).eq("status", "in_review");
      if (error) throw error;
    } else if (action === "publish") {
      if (!isPrimaryAdmin) throw new HttpError("只有主要管理員可以正式發布題庫。", 403);
      if (release.status !== "approved") throw new HttpError("發布前必須完成雙人核准。", 400);
      const { error: publishError } = await supabase.rpc("publish_question_release_v75", {
        p_release_id: releaseId,
        p_actor_user_id: user.id,
        p_actor_email: user.email || user.id,
        p_ip_address: requestIpAddress(req),
      });
      if (publishError) throw publishError;
    } else if (action === "rollback") {
      if (!isPrimaryAdmin) throw new HttpError("只有主要管理員可以回滾題庫。", 403);
      const { error: rollbackError } = await supabase.rpc("rollback_question_release_v75", {
        p_release_id: releaseId,
        p_actor_user_id: user.id,
        p_actor_email: user.email || user.id,
        p_ip_address: requestIpAddress(req),
      });
      if (rollbackError) throw rollbackError;
    } else {
      throw new HttpError("未知的發布操作。", 400);
    }

    if (action !== "publish" && action !== "rollback") {
      await writeAdminAudit({ supabase, actor: user, req, action: `question_release.${action}`, metadata: { releaseId, version: release.version } });
    }
    sendJson(res, 200, { ok: true, message: "發布流程狀態已更新。" });
  } catch (error) {
    console.error("/api/admin/releases failed:", error);
    sendError(res, error);
  }
}
