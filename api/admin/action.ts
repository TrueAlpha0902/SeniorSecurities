import { createHash } from "node:crypto";
import {
  getConfiguredAdminEmails,
  HttpError,
  requireAdminUser,
  sendError,
  sendJson,
  type ApiRequest,
  type ApiResponse,
  writeAdminAudit,
} from "../_adminClient.js";

const DEFAULT_PASSWORD_RESET_URL = "https://senior-securities.vercel.app/reset-password";
const EXPECTED_MIGRATION = "20260826145617_add_activation_redemption_ledger";
const EMAIL_LIMIT_PER_HOUR = Number(process.env.PASSWORD_RESET_EMAIL_LIMIT_PER_HOUR || 3);
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
type AdminClient = Awaited<ReturnType<typeof requireAdminUser>>["supabase"];
type JsonObject = Record<string, unknown>;
type ExamId = "senior-securities" | "junior-foreign-exchange";
type HealthCheck = { id: string; ok: boolean; message: string };

const EXAM_LABELS: Record<ExamId, string> = {
  "senior-securities": "證券高業",
  "junior-foreign-exchange": "初階外匯",
};

function normalizeExamId(value: unknown): ExamId {
  const examId = String(value || "senior-securities").trim().toLowerCase();
  if (examId === "senior-securities" || examId === "junior-foreign-exchange") return examId;
  throw new HttpError("題庫種類不正確。", 400);
}

function getEnv(name: string): string {
  return String(process.env[name] || "").trim();
}

async function findUserIdByEmail(supabase: AdminClient, email: string): Promise<string> {
  let page = 1;
  const perPage = 200;
  const normalizedEmail = email.trim().toLowerCase();

  while (true) {
    const { data, error } = await supabase.auth.admin.listUsers({ page, perPage });
    if (error) throw error;

    const found = (data.users || []).find((user) => user.email?.toLowerCase() === normalizedEmail);
    if (found?.id) return found.id;
    if ((data.users || []).length < perPage) break;
    page += 1;
  }

  throw new Error(`找不到使用者：${email}`);
}

function normalizePasswordResetUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, "");
  if (!trimmed) return "";
  return trimmed.endsWith("/reset-password") ? trimmed : `${trimmed}/reset-password`;
}

function getPasswordResetRedirectUrl(): string {
  const explicitUrl = normalizePasswordResetUrl(getEnv("PASSWORD_RESET_REDIRECT_URL"));
  if (explicitUrl) return explicitUrl;

  const siteUrl = normalizePasswordResetUrl(getEnv("SITE_URL") || getEnv("VITE_SITE_URL") || getEnv("VITE_PUBLIC_SITE_URL"));
  if (siteUrl) return siteUrl;

  const vercelUrl = (getEnv("VERCEL_PROJECT_PRODUCTION_URL") || getEnv("VERCEL_URL"))
    .replace(/^https?:\/\//, "")
    .replace(/\/+$/, "");
  if (vercelUrl) return `https://${vercelUrl}/reset-password`;

  return DEFAULT_PASSWORD_RESET_URL;
}

function parseBody(req: ApiRequest): JsonObject {
  const parsed: unknown = typeof req.body === "string" ? JSON.parse(req.body || "{}") : req.body;
  return typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)
    ? parsed as JsonObject
    : {};
}

async function countRecentPasswordResetRequests(supabase: AdminClient, email: string): Promise<number> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  const { count, error } = await supabase
    .from("password_reset_requests")
    .select("id", { count: "exact", head: true })
    .eq("email", email.trim().toLowerCase())
    .gte("created_at", since);

  if (error) {
    if (String(error.message || "").includes("password_reset_requests")) {
      throw new Error(`缺少 password_reset_requests 資料表。請先套用 ${EXPECTED_MIGRATION} migration。`);
    }
    throw error;
  }

  return count || 0;
}

async function recordPasswordResetRequest(supabase: AdminClient, args: {
  email: string;
  targetUserId: string;
  status: "sent" | "blocked" | "failed";
  errorMessage?: string;
}): Promise<void> {
  const { error } = await supabase.from("password_reset_requests").insert({
    email: args.email.trim().toLowerCase(),
    target_user_id: args.targetUserId,
    request_kind: "admin",
    status: args.status,
    error_message: args.errorMessage || null,
  });
  if (error) console.error("Failed to record admin password reset request:", error);
}

async function cleanupMemberEmailArtifacts(
  supabase: AdminClient,
  operationId: string,
  leaseToken: string,
  userId: string,
  normalizedEmail: string,
): Promise<"cleaned" | "email_reassigned"> {
  const { data, error } = await supabase.rpc("cleanup_member_email_artifacts_v95", {
    p_operation_id: operationId,
    p_lease_token: leaseToken,
    p_target_user_id: userId,
    p_target_email: normalizedEmail,
  });
  if (error) throw new Error(`無法清除會員 Email 關聯資料：${error.message}`);
  if (data === "cleaned" || data === "email_reassigned") return data;
  throw new HttpError("永久刪除操作 lease 已失效，已停止 Email 資料清理。", 409);
}

function normalizeEmail(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

function privacyFingerprint(value: string): string {
  return createHash("sha256").update(value.trim().toLowerCase()).digest("hex");
}

async function removeMemberAvatarObjects(
  supabase: AdminClient,
  userId: string,
  assertLease: () => Promise<void>,
): Promise<number> {
  const bucket = supabase.storage.from("leaderboard-avatars");

  async function listPaths(prefix: string, depth = 0): Promise<string[]> {
    if (depth > 12) throw new Error("會員頭像資料夾層級異常，已停止永久刪除。");
    const paths: string[] = [];
    let offset = 0;
    while (true) {
      const { data, error } = await bucket.list(prefix, {
        limit: 100,
        offset,
        sortBy: { column: "name", order: "asc" },
      });
      if (error) throw new Error(`無法檢查會員頭像：${error.message}`);
      const entries = data || [];
      for (const entry of entries) {
        if (!entry.name || entry.name === ".emptyFolderPlaceholder") continue;
        const path = `${prefix}/${entry.name}`;
        if (entry.id || entry.metadata) paths.push(path);
        else paths.push(...await listPaths(path, depth + 1));
      }
      if (entries.length < 100) break;
      offset += entries.length;
      if (offset > 10000) throw new Error("會員頭像物件超過安全清理上限，已停止永久刪除。");
    }
    return paths;
  }

  const paths = await listPaths(userId);
  for (let index = 0; index < paths.length; index += 100) {
    await assertLease();
    const { error } = await bucket.remove(paths.slice(index, index + 100));
    if (error) throw new Error(`無法移除會員頭像：${error.message}`);
  }
  const remaining = await listPaths(userId);
  if (remaining.length > 0) throw new Error("會員頭像尚未完全清除，已停止永久刪除。");
  return paths.length;
}

async function writeDeletionAuditBestEffort(args: Parameters<typeof writeAdminAudit>[0]): Promise<string | null> {
  try {
    await writeAdminAudit(args);
    return null;
  } catch (auditError) {
    console.error("Member deletion audit write failed:", auditError);
    return "audit-write";
  }
}

type DeletionClaim =
  | { state: "claimed"; operationId: string; leaseToken: string; resumed: boolean; authDeleteStarted: boolean }
  | { state: "completed"; operationId: string; result: JsonObject }
  | { state: "in_progress"; operationId: string }
  | { state: "conflict"; operationId: string };

function asJsonObject(value: unknown): JsonObject {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? value as JsonObject
    : {};
}

async function claimDeletionOperation(args: {
  supabase: AdminClient;
  operationId: string;
  actorUserId: string;
  targetUserId: string;
  targetFingerprint: string;
  targetEmailFingerprint: string;
}): Promise<DeletionClaim> {
  const { data, error } = await args.supabase.rpc("claim_member_deletion_operation_v95", {
    p_operation_id: args.operationId,
    p_actor_user_id: args.actorUserId,
    p_target_user_id: args.targetUserId,
    p_target_fingerprint: args.targetFingerprint,
    p_target_email_fingerprint: args.targetEmailFingerprint,
    p_lease_seconds: 600,
  });
  if (error) throw error;
  const row = asJsonObject(data);
  const state = String(row.state || "");
  const claimedOperationId = String(row.operationId || args.operationId);
  if (!UUID_PATTERN.test(claimedOperationId)) throw new Error("刪除操作 claim 回傳無效 operationId。");
  if (state === "completed") {
    return { state, operationId: claimedOperationId, result: asJsonObject(row.result) };
  }
  if (state === "in_progress" || state === "conflict") {
    return { state, operationId: claimedOperationId };
  }
  const leaseToken = String(row.leaseToken || "");
  if (state !== "claimed" || !UUID_PATTERN.test(leaseToken)) {
    throw new Error("無法取得永久刪除操作 lease。");
  }
  return {
    state,
    operationId: claimedOperationId,
    leaseToken,
    resumed: row.resumed === true,
    authDeleteStarted: row.authDeleteStarted === true,
  };
}

async function renewDeletionOperationLease(args: {
  supabase: AdminClient;
  operationId: string;
  leaseToken: string;
}): Promise<void> {
  const { data, error } = await args.supabase.rpc("renew_member_deletion_operation_v95", {
    p_operation_id: args.operationId,
    p_lease_token: args.leaseToken,
    p_lease_seconds: 600,
  });
  if (error) throw error;
  if (data !== true) throw new HttpError("永久刪除操作 lease 已被其他工作接管，已停止目前請求。", 409);
}

async function markDeletionAuthStarted(args: {
  supabase: AdminClient;
  operationId: string;
  leaseToken: string;
}): Promise<void> {
  const { data, error } = await args.supabase.rpc("mark_member_deletion_auth_started_v95", {
    p_operation_id: args.operationId,
    p_lease_token: args.leaseToken,
  });
  if (error) throw error;
  if (data !== true) throw new HttpError("永久刪除操作已被其他工作接管，未送出 Auth 刪除。", 409);
}

async function releaseDeletionForReconcileBestEffort(args: {
  supabase: AdminClient;
  operationId: string;
  leaseToken: string;
  result: JsonObject;
}): Promise<void> {
  try {
    const { data, error } = await args.supabase.rpc("release_member_deletion_for_reconcile_v95", {
      p_operation_id: args.operationId,
      p_lease_token: args.leaseToken,
      p_result: args.result,
    });
    if (error) throw error;
    if (data !== true) console.error("Member deletion reconcile state is owned by another worker.");
  } catch (operationError) {
    console.error("Member deletion reconcile state write failed:", operationError);
  }
}

async function settleDeletionOperation(args: {
  supabase: AdminClient;
  operationId: string;
  leaseToken: string;
  result: JsonObject;
  status: "completed" | "failed";
}): Promise<boolean> {
  const functionName = args.status === "completed"
    ? "complete_member_deletion_operation_v95"
    : "fail_member_deletion_operation_v95";
  const { data, error } = await args.supabase.rpc(functionName, {
    p_operation_id: args.operationId,
    p_lease_token: args.leaseToken,
    p_result: args.result,
  });
  if (error) throw error;
  return data === true;
}

async function failDeletionOperationBestEffort(args: {
  supabase: AdminClient;
  operationId: string;
  leaseToken: string;
  result: JsonObject;
}): Promise<void> {
  try {
    const settled = await settleDeletionOperation({ ...args, status: "failed" });
    if (!settled) console.error("Member deletion failure could not claim the current operation lease.");
  } catch (operationError) {
    console.error("Member deletion failure state write failed:", operationError);
  }
}

async function assertTargetIsNotAdmin(supabase: AdminClient, userId: string, normalizedEmail: string): Promise<void> {
  if (getConfiguredAdminEmails().includes(normalizedEmail)) {
    throw new HttpError("主要管理員帳號不可從會員管理中刪除。", 400);
  }
  const [{ data: roleAssignment, error: roleError }, { data: adminRecord, error: adminRecordError }] = await Promise.all([
    supabase.from("admin_role_assignments").select("user_id, role, is_active").eq("user_id", userId).maybeSingle(),
    supabase.from("admin_users").select("email, role, is_active").eq("email", normalizedEmail).maybeSingle(),
  ]);
  if (roleError) throw roleError;
  if (adminRecordError) throw adminRecordError;
  if (roleAssignment || adminRecord) {
    throw new HttpError("這個帳號具有或曾具有管理員紀錄，請先在管理員工具移除其管理權限。", 400);
  }
}

async function deleteMemberAccount(args: {
  supabase: AdminClient;
  user: { id: string; email?: string | null };
  req: ApiRequest;
  res: ApiResponse;
  body: JsonObject;
  userId: string;
  email: string;
}): Promise<void> {
  const { supabase, user, req, res, body, userId } = args;
  const normalizedEmail = normalizeEmail(args.email);
  const confirmationEmail = normalizeEmail(body.confirmationEmail);
  const confirmationPhrase = String(body.confirmationPhrase || "").trim();
  const reason = String(body.reason || "").trim().slice(0, 500);
  const requestedOperationId = String(body.operationId || "").trim();

  if (!UUID_PATTERN.test(userId)) throw new HttpError("會員識別碼不正確。", 400);
  if (!UUID_PATTERN.test(requestedOperationId)) throw new HttpError("永久刪除需要有效的 operationId，請重新開啟確認視窗。", 400);
  if (!normalizedEmail || confirmationEmail !== normalizedEmail) {
    throw new HttpError("請完整輸入會員 Email 以確認永久刪除。", 400);
  }
  if (confirmationPhrase !== "永久刪除") {
    throw new HttpError("請輸入「永久刪除」完成最終確認。", 400);
  }
  if (reason.length < 3) throw new HttpError("請填寫至少 3 個字的刪除原因。", 400);
  if (userId === user.id) throw new HttpError("不可刪除目前登入的管理員帳號。", 400);

  const targetFingerprint = privacyFingerprint(userId);
  const targetEmailFingerprint = privacyFingerprint(normalizedEmail);
  const claim = await claimDeletionOperation({
    supabase,
    operationId: requestedOperationId,
    actorUserId: user.id,
    targetUserId: userId,
    targetFingerprint,
    targetEmailFingerprint,
  });
  if (claim.state === "conflict") {
    throw new HttpError("刪除操作識別碼與目前目標不一致。", 409);
  }
  if (claim.state === "in_progress") {
    throw new HttpError("這個會員已有永久刪除操作正在執行，請稍候再重新整理。", 409);
  }
  if (claim.state === "completed") {
    sendJson(res, 200, {
      ok: true,
      message: "會員帳號已永久移除；這是同一目標刪除操作的安全重播。",
      operationId: claim.operationId,
      cleanupWarnings: Array.isArray(claim.result.cleanupWarnings) ? claim.result.cleanupWarnings : [],
      replayed: true,
    });
    return;
  }

  const operationId = claim.operationId;
  const leaseToken = claim.leaseToken;
  let authDeleteStarted = claim.authDeleteStarted;
  const recordDeletionFailure = async (result: JsonObject): Promise<void> => {
    if (authDeleteStarted) {
      await releaseDeletionForReconcileBestEffort({ supabase, operationId, leaseToken, result });
      return;
    }
    await failDeletionOperationBestEffort({ supabase, operationId, leaseToken, result });
  };

  const { data: targetData, error: targetError } = await supabase.auth.admin.getUserById(userId);
  const target = targetData?.user;
  const targetNotFound = !target && (
    !targetError
    || targetError.status === 404
    || targetError.code === "user_not_found"
  );
  if (targetError && !targetNotFound) {
    await recordDeletionFailure({ stage: "target-lookup" });
    throw targetError;
  }
  if (targetNotFound) {
    if (!authDeleteStarted) {
      await recordDeletionFailure({ stage: "target-not-found-before-auth-delete" });
      throw new HttpError("找不到這個會員，且沒有已送出 Auth 刪除的可復原紀錄。", 404);
    }
    let recoveryCleanup: "cleaned" | "email_reassigned";
    try {
      recoveryCleanup = await cleanupMemberEmailArtifacts(
        supabase,
        operationId,
        leaseToken,
        userId,
        normalizedEmail,
      );
    } catch (cleanupError) {
      await recordDeletionFailure({ stage: "post-auth-cleanup" });
      throw cleanupError;
    }
    const cleanupWarnings = ["reconciled-after-auth-delete"];
    if (recoveryCleanup === "email_reassigned") {
      cleanupWarnings.push("email-reassigned-skipped-email-sweep");
    }
    const auditWarning = await writeDeletionAuditBestEffort({
      supabase,
      actor: user,
      req,
      action: "user.account.delete_completed",
      metadata: { operationId, targetFingerprint, recovered: true, cleanupWarnings },
    });
    if (auditWarning) cleanupWarnings.push(auditWarning);
    const recoveredResult = { cleanupWarnings, recovered: true };
    try {
      const settled = await settleDeletionOperation({ supabase, operationId, leaseToken, result: recoveredResult, status: "completed" });
      if (!settled) cleanupWarnings.push("operation-lease-lost");
    } catch (operationError) {
      console.error("Recovered member deletion result write failed:", operationError);
      cleanupWarnings.push("operation-result-persistence");
    }
    sendJson(res, 200, {
      ok: true,
      message: "會員帳號已永久移除；伺服器已從先前未完成的回應中復原結果。",
      operationId,
      cleanupWarnings,
      replayed: true,
    });
    return;
  }
  if (!target) {
    await recordDeletionFailure({ stage: "target-lookup" });
    throw new HttpError("無法確認會員帳號狀態。", 503);
  }
  if (normalizeEmail(target.email) !== normalizedEmail) {
    await recordDeletionFailure({ stage: "target-changed" });
    throw new HttpError("會員資料已變更，請重新整理後再試。", 409);
  }

  try {
    await assertTargetIsNotAdmin(supabase, userId, normalizedEmail);
  } catch (adminGuardError) {
    await recordDeletionFailure({ stage: "admin-guard" });
    throw adminGuardError;
  }

  try {
    await writeAdminAudit({
      supabase,
      actor: user,
      req,
      action: "user.account.delete_requested",
      targetUserId: userId,
      metadata: { operationId, targetFingerprint, reasonProvided: true, reasonLength: reason.length },
    });
  } catch (requestedAuditError) {
    await recordDeletionFailure({ stage: "requested-audit" });
    throw requestedAuditError;
  }

  let removedAvatarCount = 0;
  let deletionStage = "pre-auth-cleanup";
  try {
    await renewDeletionOperationLease({ supabase, operationId, leaseToken });
    const preAuthCleanup = await cleanupMemberEmailArtifacts(
      supabase,
      operationId,
      leaseToken,
      userId,
      normalizedEmail,
    );
    if (preAuthCleanup !== "cleaned") {
      throw new HttpError("會員 Email 已屬於另一個 Auth 帳號，已停止永久刪除。", 409);
    }

    deletionStage = "storage-cleanup";
    removedAvatarCount = await removeMemberAvatarObjects(
      supabase,
      userId,
      () => renewDeletionOperationLease({ supabase, operationId, leaseToken }),
    );
    await renewDeletionOperationLease({ supabase, operationId, leaseToken });
    const latestActor = await requireAdminUser(req, { roles: ["primary_admin"], requireAal2: true });
    if (latestActor.user.id !== user.id) throw new HttpError("管理員工作階段已變更，已停止永久刪除。", 401);
    const { data: latestTargetData, error: latestTargetError } = await supabase.auth.admin.getUserById(userId);
    if (latestTargetError || !latestTargetData?.user) throw latestTargetError || new Error("會員帳號狀態已變更。");
    if (normalizeEmail(latestTargetData.user.email) !== normalizedEmail) {
      throw new HttpError("會員資料已變更，已停止永久刪除。", 409);
    }
    await assertTargetIsNotAdmin(supabase, userId, normalizedEmail);
    await renewDeletionOperationLease({ supabase, operationId, leaseToken });
    await markDeletionAuthStarted({ supabase, operationId, leaseToken });
    authDeleteStarted = true;
    deletionStage = "auth-delete";
    const { error: deleteError } = await supabase.auth.admin.deleteUser(userId, false);
    if (deleteError) throw deleteError;
    deletionStage = "post-auth-cleanup";
    await renewDeletionOperationLease({ supabase, operationId, leaseToken });
    const postAuthCleanup = await cleanupMemberEmailArtifacts(
      supabase,
      operationId,
      leaseToken,
      userId,
      normalizedEmail,
    );
    if (postAuthCleanup !== "cleaned") {
      throw new HttpError("會員 Email 已屬於另一個 Auth 帳號，已停止 Email 資料清理。", 409);
    }
  } catch (deleteError) {
    await recordDeletionFailure({ stage: deletionStage, removedAvatarCount });
    await writeDeletionAuditBestEffort({
      supabase,
      actor: user,
      req,
      action: "user.account.delete_failed",
      metadata: {
        operationId,
        targetFingerprint,
        removedAvatarCount,
        stage: deletionStage,
      },
    });
    throw deleteError;
  }

  const cleanupWarnings: string[] = [];
  const auditWarning = await writeDeletionAuditBestEffort({
    supabase,
    actor: user,
    req,
    action: "user.account.delete_completed",
    metadata: {
      operationId,
      targetFingerprint,
      removedAvatarCount,
      anonymousRedemptionsRetained: true,
      activationUsesRestored: false,
      cleanupWarnings,
    },
  });
  if (auditWarning) cleanupWarnings.push(auditWarning);

  const operationResult = {
    removedAvatarCount,
    anonymousRedemptionsRetained: true,
    activationUsesRestored: false,
    cleanupWarnings,
  };
  try {
    const settled = await settleDeletionOperation({
      supabase,
      operationId,
      leaseToken,
      result: operationResult,
      status: "completed",
    });
    if (!settled) cleanupWarnings.push("operation-lease-lost");
  } catch (operationError) {
    console.error("Member deletion completion state write failed:", operationError);
    cleanupWarnings.push("operation-result-persistence");
  }

  sendJson(res, 200, {
    ok: true,
    message: cleanupWarnings.length === 0
      ? "會員帳號與其個人資料已永久移除；啟用碼使用次數不會回補。"
      : "會員帳號與個人資料已永久移除；操作結果記錄出現警告，請依 operationId 複查。",
    operationId,
    cleanupWarnings,
  });
}

async function handleAuditEvents(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const { supabase } = await requireAdminUser(req);
    const { data, error } = await supabase
      .from("admin_audit_events")
      .select("id, actor_user_id, actor_email, target_user_id, target_email, action, metadata, ip_address, created_at")
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw error;
    sendJson(res, 200, {
      events: (data || []).map((row) => ({
        id: row.id,
        actorUserId: row.actor_user_id,
        actorEmail: row.actor_email,
        targetUserId: row.target_user_id,
        targetEmail: row.target_email,
        action: row.action,
        metadata: row.metadata || {},
        ipAddress: row.ip_address,
        createdAt: row.created_at,
      })),
    });
  } catch (error) {
    console.error("/api/admin/action audit-events failed:", error);
    sendError(res, error);
  }
}

async function handleHealthCheck(req: ApiRequest, res: ApiResponse): Promise<void> {
  try {
    const { supabase, role } = await requireAdminUser(req);
    const checks: HealthCheck[] = [];

    const { error: authError } = await supabase.auth.admin.listUsers({ page: 1, perPage: 1 });
    checks.push({
      id: "auth-admin",
      ok: !authError,
      message: authError ? `Auth Admin API：${authError.message}` : "Auth Admin API 可用",
    });

    const tableChecks = [
      ["tombstones", "user_record_tombstones", "record_key"],
      ["telemetry", "app_client_errors", "id"],
      ["image-sessions", "user_image_quiz_sessions", "session_id"],
      ["release-pointer", "question_release_pointer", "singleton"],
      ["release-batches", "question_release_batches", "id"],
      ["activation-codes", "activation_codes", "id"],
      ["activation-redemptions", "activation_code_redemptions", "id"],
      ["member-deletions", "admin_member_deletion_operations", "operation_id"],
      ["password-reset-throttle", "password_reset_requests", "id"],
      ["exam-entitlements", "user_exam_entitlements", "user_id"],
    ] as const;

    for (const [id, table, column] of tableChecks) {
      const { error } = await supabase.from(table).select(column, { head: true, count: "exact" }).limit(1);
      checks.push({
        id,
        ok: !error,
        message: error ? `${table}：${error.message}` : `${table} 可用`,
      });
    }

    const ok = checks.every((check) => check.ok);
    sendJson(res, 200, {
      ok,
      message: ok ? "System health OK" : "System health requires attention",
      health: {
        releaseId: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 12) || "local",
        environment: process.env.VERCEL_ENV || process.env.NODE_ENV || "unknown",
        expectedMigration: EXPECTED_MIGRATION,
        role,
        checkedAt: new Date().toISOString(),
        checks,
      },
    });
  } catch (error) {
    console.error("/api/admin/ping failed:", error);
    sendError(res, error);
  }
}

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method === "GET") {
    const operationValue = req.query?.operation;
    const operation = Array.isArray(operationValue) ? String(operationValue[0] || "") : String(operationValue || "");
    if (operation === "audit-events") await handleAuditEvents(req, res);
    else await handleHealthCheck(req, res);
    return;
  }
  if (req.method !== "POST") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

  try {
    const body = parseBody(req);
    const action = String(body.action || "");
    const isAccountDeletion = action === "delete-user";
    const { supabase, user } = await requireAdminUser(req, isAccountDeletion
      ? { roles: ["primary_admin"], requireAal2: true }
      : { roles: ["primary_admin", "admin"] });
    const email = String(body.email || "").trim();
    const deviceId = String(body.deviceId || "").trim();
    const userId = body.userId ? String(body.userId) : email ? await findUserIdByEmail(supabase, email) : "";

    if (!userId) throw new Error("缺少 userId 或 email。 ");

    if (action === "delete-user") {
      await deleteMemberAccount({ supabase, user, req, res, body, userId, email });
      return;
    }

    if (action === "revoke") {
      const examId = normalizeExamId(body.examId);
      const { data: updatedEntitlements, error: entitlementError } = await supabase
        .from("user_exam_entitlements")
        .update({ status: "revoked" })
        .eq("user_id", userId)
        .eq("exam_id", examId)
        .select("user_id");
      if (entitlementError) throw entitlementError;
      if (!updatedEntitlements?.length) throw new HttpError(`找不到可取消的${EXAM_LABELS[examId]}授權。`, 404);

      if (examId === "senior-securities") {
        const { error: legacyError } = await supabase
          .from("user_entitlements")
          .update({ status: "revoked" })
          .eq("user_id", userId);
        if (legacyError) throw legacyError;
      }

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.entitlement.revoke",
        targetUserId: userId,
        targetEmail: email,
        metadata: { examId },
      });

      sendJson(res, 200, { ok: true, message: `${EXAM_LABELS[examId]}權限已取消。` });
      return;
    }

    if (action === "restore") {
      const examId = normalizeExamId(body.examId);
      const grantedAt = new Date().toISOString();
      const { error: upsertError } = await supabase.from("user_exam_entitlements").upsert({
        user_id: userId,
        exam_id: examId,
        plan: "full",
        status: "active",
        granted_at: grantedAt,
        expires_at: null,
      }, { onConflict: "user_id,exam_id" });
      if (upsertError) throw upsertError;

      if (examId === "senior-securities") {
        const { error: legacyError } = await supabase.from("user_entitlements").upsert({
          user_id: userId,
          plan: "full",
          status: "active",
          granted_at: grantedAt,
          expires_at: null,
        }, { onConflict: "user_id" });
        if (legacyError) throw legacyError;
      }

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.entitlement.restore",
        targetUserId: userId,
        targetEmail: email,
        metadata: { examId },
      });

      sendJson(res, 200, { ok: true, message: `${EXAM_LABELS[examId]}權限已開通。` });
      return;
    }

    if (action === "reset-devices") {
      const { data: revokedDevices, error: resetDevicesError } = await supabase
        .from("user_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .is("revoked_at", null)
        .select("id");
      if (resetDevicesError) throw resetDevicesError;

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.devices.archive_all",
        targetUserId: userId,
        targetEmail: email,
        metadata: { affectedDevices: revokedDevices?.length || 0 },
      });

      sendJson(res, 200, { ok: true, message: `已封存 ${revokedDevices?.length || 0} 台有效裝置；這不會強制登出現有工作階段。` });
      return;
    }

    if (action === "revoke-device") {
      if (!deviceId) throw new HttpError("缺少 deviceId。", 400);
      const { data: revokedDevice, error: revokeDeviceError } = await supabase
        .from("user_devices")
        .update({ revoked_at: new Date().toISOString() })
        .eq("id", deviceId)
        .eq("user_id", userId)
        .is("revoked_at", null)
        .select("id");
      if (revokeDeviceError) throw revokeDeviceError;
      if (!revokedDevice?.length) throw new HttpError("找不到這台有效裝置，可能已經封存。", 404);

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.device.archive",
        targetUserId: userId,
        targetEmail: email,
        metadata: { deviceId },
      });

      sendJson(res, 200, { ok: true, message: "已封存指定裝置紀錄；這不會強制登出現有工作階段。" });
      return;
    }



    if (action === "delete-leaderboard") {
      const [{ error: statsError }, { error: profileError }] = await Promise.all([
        supabase.from("user_leaderboard_stats").delete().eq("user_id", userId),
        supabase.from("user_leaderboard_profiles").delete().eq("user_id", userId),
      ]);
      if (statsError) throw statsError;
      if (profileError) throw profileError;

      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "leaderboard.entry.delete",
        targetUserId: userId,
        targetEmail: email,
      });

      sendJson(res, 200, { ok: true, message: "已刪除該使用者的排行榜紀錄。" });
      return;
    }

    if (action === "send-password-reset") {
      if (!email) throw new Error("寄送重設密碼信需要 email。");
      const normalizedEmail = email.trim().toLowerCase();
      const { data: resetTargetData, error: resetTargetError } = await supabase.auth.admin.getUserById(userId);
      if (resetTargetError || !resetTargetData?.user) {
        throw new HttpError("找不到這個會員，已停止寄送重設密碼信。", 404);
      }
      if (normalizeEmail(resetTargetData.user.email) !== normalizedEmail) {
        throw new HttpError("會員 Email 已變更，請重新整理後再寄送重設密碼信。", 409);
      }
      const recentCount = await countRecentPasswordResetRequests(supabase, normalizedEmail);
      if (recentCount >= EMAIL_LIMIT_PER_HOUR) {
        await recordPasswordResetRequest(supabase, {
          email: normalizedEmail,
          targetUserId: userId,
          status: "blocked",
          errorMessage: "email hourly limit",
        });
        throw new HttpError(`這個 Email 1 小時內已經寄送 ${EMAIL_LIMIT_PER_HOUR} 次重設密碼信，請稍後再試。`, 429);
      }

      const redirectTo = getPasswordResetRedirectUrl();
      const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo });
      if (resetError) {
        await recordPasswordResetRequest(supabase, {
          email: normalizedEmail,
          targetUserId: userId,
          status: "failed",
          errorMessage: resetError.message,
        });
        throw resetError;
      }

      await recordPasswordResetRequest(supabase, {
        email: normalizedEmail,
        targetUserId: userId,
        status: "sent",
      });
      await writeAdminAudit({
        supabase,
        actor: user,
        req,
        action: "user.password_reset.send",
        targetUserId: userId,
        targetEmail: normalizedEmail,
      });
      sendJson(res, 200, { ok: true, message: "已寄出重設密碼信。" });
      return;
    }

    throw new Error("未知操作。 ");
  } catch (error) {
    console.error("/api/admin/action failed:", error);
    sendError(res, error);
  }
}
