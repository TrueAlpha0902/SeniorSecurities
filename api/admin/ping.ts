import { requireAdminUser, sendError, sendJson, type ApiRequest, type ApiResponse } from "../_adminClient.js";

const EXPECTED_MIGRATION = "20260712130000_final_hardening_v79";

type HealthCheck = {
  id: string;
  ok: boolean;
  message: string;
};

export default async function handler(req: ApiRequest, res: ApiResponse) {
  if (req.method !== "GET") {
    sendJson(res, 405, { error: "Method not allowed" });
    return;
  }

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
    ] as const;

    for (const [id, table, column] of tableChecks) {
      const { error } = await supabase.from(table).select(column, { head: true, count: "exact" }).limit(1);
      checks.push({
        id,
        ok: !error,
        message: error ? `${table}：${error.message}` : `${table} 可用`,
      });
    }

    sendJson(res, 200, {
      ok: checks.every((check) => check.ok),
      message: checks.every((check) => check.ok) ? "System health OK" : "System health requires attention",
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
