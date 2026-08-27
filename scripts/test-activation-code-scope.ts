import { readFile } from "node:fs/promises";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const read = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

const [adminAction, adminApi, adminUsersApi, adminPanel, authContext, activatePage, authPage, migration, ledgerMigration, currentMigration] = await Promise.all([
  read("api/admin/action.ts"),
  read("api/admin/tools.ts"),
  read("api/admin/users.ts"),
  read("src/components/AdminToolsPanel.tsx"),
  read("src/auth/AuthContext.tsx"),
  read("src/pages/ActivatePage.tsx"),
  read("src/pages/AuthPage.tsx"),
  read("supabase/migrations/20260826081812_add_exam_scoped_activation_redemption.sql"),
  read("supabase/migrations/20260826145617_add_activation_redemption_ledger.sql"),
  read("supabase/migrations/20260828090000_admin_password_activation_management_v97.sql"),
]);

assert(
  adminApi.includes('const examId = String(value || "").trim().toLowerCase();')
    && !adminApi.includes('value || "senior-securities"'),
  "Activation-code creation must reject a missing exam scope instead of silently defaulting to securities.",
);
assert(
  adminApi.includes("p_exam_id: examId") && adminApi.includes("examId,"),
  "The admin API must persist and return the selected activation-code scope.",
);
assert(
  adminAction.includes('const EXPECTED_MIGRATION = "20260828090000_admin_password_activation_management_v97";'),
  "Admin system status must identify the activation-management migration required by this release.",
);

assert(
  adminPanel.includes("啟用碼適用題庫")
    && adminPanel.includes("證券高業啟用碼")
    && adminPanel.includes("初階外匯啟用碼")
    && adminPanel.includes("全部題庫啟用碼")
    && adminPanel.includes('onChange={() => setExamId("all")}'),
  "The admin generator must present both single-bank scopes and an explicit all-question-bank choice.",
);
assert(
  adminPanel.includes("setCreatedCode({ code: payload.code, examId: payload.examId })")
    && adminPanel.includes("EXAM_LABELS[createdCode.examId]")
    && adminPanel.includes("copyCode(createdCode.code)"),
  "The one-time creation result must retain and display the code's immutable exam scope.",
);

assert(
  authContext.includes('redeemActivationCode: (code: string, expectedExamId: ExamId)')
    && authContext.includes('supabase.rpc("redeem_exam_activation_code_v94"')
    && authContext.includes("p_expected_exam_id: expectedExamId"),
  "The client must send the expected question bank to the scoped redemption RPC.",
);
assert(
  activatePage.includes("redeemActivationCode(code, examId)")
    && activatePage.includes("專用碼或全部題庫啟用碼")
    && activatePage.includes("同時開通兩個題庫"),
  "The activation page must explain that the scoped endpoint also accepts an all-question-bank code.",
);
assert(
  authPage.includes("examIdForReturnTo")
    && authPage.includes('returnTo.startsWith("/foreign-exchange")')
    && authPage.includes('const activationReturnTo = returnTo.startsWith("/activate") ? "/" : returnTo;')
    && authPage.includes("state: { returnTo: activationReturnTo }"),
  "Authentication must preserve the requested exam without looping back to the activation page.",
);

assert(
  migration.includes("create or replace function public.redeem_exam_activation_code_v94(")
    && migration.includes("p_expected_exam_id text")
    && !migration.includes("create or replace function public.redeem_activation_code("),
  "The migration must use a unique RPC name rather than an unsupported overloaded function.",
);
assert(
  migration.includes("and exam_id = normalized_exam_id")
    && migration.includes("and is_active = true")
    && migration.includes("and use_count < max_uses")
    && migration.includes("returning * into code_record"),
  "Activation-code consumption must atomically require the requested exam, active state, and remaining capacity.",
);
assert(
  migration.includes("code_record.exam_id")
    && migration.includes("if code_record.exam_id = 'senior-securities' then"),
  "Redemption must grant only the code's exam and mirror only securities into the legacy entitlement table.",
);
assert(
  migration.includes("security definer")
    && migration.includes("set search_path = pg_catalog, public, extensions")
    && migration.includes("from public, anon, authenticated")
    && migration.includes("to authenticated, service_role"),
  "The scoped RPC must keep a fixed search path and explicit least-privilege grants.",
);
assert(
  ledgerMigration.includes("create table if not exists public.activation_code_redemptions")
    && ledgerMigration.includes("unique (activation_code_id, user_id)")
    && ledgerMigration.includes("foreign key (activation_code_id, exam_id)")
    && ledgerMigration.includes("references public.activation_codes(id, exam_id) on delete restrict")
    && ledgerMigration.includes("user_id uuid references auth.users(id) on delete set null"),
  "Every code redemption must have an append-only, privacy-preserving membership ledger with a duplicate-use guard.",
);
assert(
  ledgerMigration.includes("private.redeem_activation_code_v95")
    && ledgerMigration.includes("from public.activation_code_redemptions")
    && ledgerMigration.includes("這個帳號已使用過此啟用碼")
    && ledgerMigration.includes("insert into public.activation_code_redemptions")
    && ledgerMigration.includes("update public.activation_codes")
    && ledgerMigration.indexOf("insert into public.activation_code_redemptions") < ledgerMigration.indexOf("update public.activation_codes"),
  "Redemption must reject a repeated account/code tuple before consuming another use.",
);
assert(
  currentMigration.includes("activation_codes_exam_id_check")
    && currentMigration.includes("activation_code_redemptions_exam_id_check")
    && (currentMigration.match(/'all'/g)?.length || 0) >= 7
    && currentMigration.includes("private.redeem_activation_code_v97")
    && currentMigration.includes("code_record.exam_id not in (normalized_exam_id, 'all')")
    && currentMigration.includes("unnest(array['senior-securities', 'junior-foreign-exchange']::text[])")
    && currentMigration.includes("insert into public.activation_code_redemptions")
    && currentMigration.includes("insert into public.user_exam_entitlements")
    && currentMigration.includes("if code_record.exam_id in ('senior-securities', 'all') then"),
  "The v97 redemption transaction must consume one all-scope use and atomically grant both question banks.",
);
assert(
  adminUsersApi.includes('from("activation_code_redemptions")')
    && adminUsersApi.includes("activationCodesByUser")
    && adminUsersApi.includes("examIdsForScope")
    && adminUsersApi.includes("deletedAt")
    && adminUsersApi.includes("啟用碼分類帳缺少有效的來源資料")
    && adminUsersApi.includes("codePreview")
    && !adminUsersApi.includes("code_plain"),
  "The admin member API must classify users from the redemption ledger without exposing plaintext codes.",
);
assert(
  ledgerMigration.includes("redemption_history_gap")
    && ledgerMigration.includes("from public.user_entitlements as entitlement")
    && ledgerMigration.includes("activation_code.redeemed_by")
    && ledgerMigration.includes("revoke all on table public.activation_code_redemptions from public, anon, authenticated, service_role")
    && ledgerMigration.includes("grant select on table public.activation_code_redemptions to service_role")
    && !ledgerMigration.includes("grant all on table public.activation_code_redemptions"),
  "Legacy redemption reconstruction must cover every available provenance source, expose gaps, and keep ledger privileges read-only.",
);
assert(
  ledgerMigration.includes("revoke all on table public.password_reset_requests from public, anon, authenticated, service_role")
    && ledgerMigration.includes("grant select, insert, delete on table public.password_reset_requests to service_role")
    && ledgerMigration.includes("target_user_id uuid references auth.users(id) on delete cascade")
    && ledgerMigration.includes("prevent_deleted_member_reset_record_v95")
    && ledgerMigration.includes("password_reset_deletion_tombstone_v95")
    && ledgerMigration.includes("anonymize_deleted_member_audit_email_v95")
    && ledgerMigration.includes("admin_audit_deletion_anonymizer_v95")
    && ledgerMigration.includes("revoke all on table public.admin_member_deletion_operations from public, anon, authenticated, service_role")
    && ledgerMigration.includes("grant select on table public.admin_member_deletion_operations to service_role")
    && ledgerMigration.includes("claim_member_deletion_operation_v95")
    && ledgerMigration.includes("p_target_email_fingerprint text")
    && ledgerMigration.includes("renew_member_deletion_operation_v95")
    && ledgerMigration.includes("mark_member_deletion_auth_started_v95")
    && ledgerMigration.includes("release_member_deletion_for_reconcile_v95")
    && ledgerMigration.includes("authDeleteStarted")
    && ledgerMigration.includes("lease_token = p_lease_token")
    && ledgerMigration.includes("and lease_expires_at > v_now")
    && ledgerMigration.includes("pg_advisory_xact_lock")
    && ledgerMigration.includes("current_user_has_pending_member_deletion_v95")
    && ledgerMigration.includes("prevent_admin_grant_during_member_deletion_v95")
    && ledgerMigration.includes("prevent_admin_email_grant_during_member_deletion_v95")
    && ledgerMigration.includes("admin_user_deletion_guard_v95")
    && ledgerMigration.includes("prevent_auth_email_change_during_member_deletion_v95")
    && ledgerMigration.includes("auth_user_email_deletion_guard_v95")
    && ledgerMigration.includes("prevent_deleted_member_avatar_commit_v95")
    && ledgerMigration.includes("member_avatar_deletion_tombstone_v95")
    && ledgerMigration.includes("operation.status in ('pending', 'completed')")
    && ledgerMigration.includes("language plpgsql\nvolatile")
    && !/operation\.status = 'pending'\s+and operation\.lease_expires_at > now\(\)/.test(ledgerMigration),
  "Server-only support tables must use least privilege, durable reconciliation guards, expiry-fenced leases, and serialized Storage/user-id/email writes.",
);
assert(
  currentMigration.includes("create or replace function public.delete_activation_code_v97")
    && currentMigration.includes("deleted_at = clock_timestamp()")
    && currentMigration.includes("deletion_mode := 'archived'")
    && currentMigration.includes("create or replace function public.set_activation_code_status_v97")
    && currentMigration.includes("deleted activation codes cannot be restored")
    && adminApi.includes('.is("deleted_at", null)')
    && adminApi.includes('supabase.rpc("delete_activation_code_v97"')
    && adminApi.includes('supabase.rpc("create_activation_code_v97"')
    && adminPanel.includes("既有會員權限、使用次數與分類歷史都會保留"),
  "Activation-code deletion must hide the code while preserving used-code provenance and existing entitlements.",
);

console.log("Activation code scope contracts passed.");
