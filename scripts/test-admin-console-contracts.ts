import { access, readFile } from "node:fs/promises";
import path from "node:path";
import { acquireBodyScrollLock } from "../src/hooks/useBodyScrollLock";

const root = process.cwd();
const read = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");
async function exists(relativePath: string): Promise<boolean> {
  try { await access(path.join(root, relativePath)); return true; } catch { return false; }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const [
  panel,
  adminClient,
  tools,
  action,
  account,
  adminPage,
  interactionPrimitives,
  appLayout,
  currentTheme,
  bodyScrollLock,
  dialogFocusTrap,
  deleteMemberDialog,
  deletionMigration,
  currentMigration,
  supabaseClient,
] = await Promise.all([
  read("src/components/AdminToolsPanel.tsx"),
  read("api/_adminClient.ts"),
  read("api/admin/tools.ts"),
  read("api/admin/action.ts"),
  read("src/pages/AccountPage.tsx"),
  read("src/pages/AdminPage.tsx"),
  read("src/components/V93InteractionPrimitives.tsx"),
  read("src/components/AppLayout.tsx"),
  read("src/styles/theme-current.css"),
  read("src/hooks/useBodyScrollLock.ts"),
  read("src/hooks/useDialogFocusTrap.ts"),
  read("src/components/AdminDeleteMemberDialog.tsx"),
  read("supabase/migrations/20260826145617_add_activation_redemption_ledger.sql"),
  read("supabase/migrations/20260828090000_admin_password_activation_management_v97.sql"),
  read("src/lib/supabase.ts"),
]);

assert(panel.includes("啟用碼") && panel.includes("管理員") && panel.includes("系統狀態"), "Admin workspace must keep its core tools.");
assert(!panel.includes('{ id: "questions"') && !panel.includes('activeTool === "questions"'), "Question editing must not be reachable from the admin UI.");
assert(!await exists("api/admin/question-editor.ts"), "Question editor serverless entrypoint must be deleted.");
assert(adminClient.includes("requireAdminUser") && !adminClient.includes("true.alpha0902@gmail.com"), "Admin authorization must remain centralized and role-based.");
assert(tools.includes("create_activation_code_v97") && action.includes("audit-events"), "Core admin operations must remain available.");
assert(!account.includes("VITE_ADMIN_EMAILS"), "Account page must not contain a client admin allowlist.");
assert(
  adminPage.includes('fetch("/api/admin/action"')
    && adminPage.includes('method: "POST"')
    && adminPage.includes("examId"),
  "Admin entitlement controls must POST exam-scoped actions to the protected admin endpoint.",
);
assert(
  interactionPrimitives.includes('import { createPortal } from "react-dom";')
    && interactionPrimitives.includes('data-v93-confirm-dialog="true"')
    && interactionPrimitives.includes("return createPortal(dialog, portalTarget);"),
  "Confirmation dialogs must portal to document.body so admin drawers cannot cover or clip them.",
);
assert(
  appLayout.includes('import "../styles/theme-current.css";')
    && /\.v93-confirm-backdrop\s*\{[^}]*position:\s*fixed;[^}]*z-index:\s*210;[^}]*inset:\s*0;/s.test(currentTheme)
    && /\.v93-confirm-dialog\s*\{[^}]*display:\s*grid;[^}]*background:/s.test(currentTheme),
  "Portaled confirmation dialogs must keep their fixed overlay styles in the loaded current theme.",
);
assert(
  adminPage.includes('const EXAM_IDS: readonly ExamId[] = ["senior-securities", "junior-foreign-exchange"]')
    && adminPage.includes("EXAM_IDS.map((examId) =>")
    && adminPage.includes("body: JSON.stringify({ action, userId: target.id, email: target.email, deviceId, examId })"),
  "Both entitlement buttons must preserve their exam id through the confirmation and POST flow.",
);
assert(
  bodyScrollLock.includes("const activeLocks = new Set<symbol>()")
    && bodyScrollLock.includes("if (activeLocks.size > 0) return;")
    && adminPage.includes("useBodyScrollLock(hasPageOverlay)")
    && !adminPage.includes("auditOpen || pendingConfirmation")
    && adminPage.includes("setPendingConfirmation(null);\n      await Promise.all(["),
  "Nested admin confirmations must share a reference-counted scroll lock and release the dialog before background refreshes.",
);
assert(
  adminPage.includes('setDirectoryMode("activation-codes")')
    && adminPage.includes("buildActivationCodeGroups(filteredUsers)")
    && adminPage.includes("selectedActivationGroupKey")
    && adminPage.includes("admin-activation-group-select")
    && adminPage.includes("membership.codePreview")
    && adminPage.includes("管理員直接開通")
    && adminPage.includes("尚未輸入啟用碼"),
  "The member directory must support privacy-safe grouping by actual activation-code provenance and explicit fallback groups.",
);
assert(
  action.includes('action === "delete-user"')
    && action.includes('roles: ["primary_admin"], requireFreshPassword: true')
    && action.includes("supabase.auth.admin.deleteUser(userId, false)")
    && action.includes("removeMemberAvatarObjects")
    && action.includes("claim_member_deletion_operation_v95")
    && action.includes("renew_member_deletion_operation_v95")
    && action.includes("mark_member_deletion_auth_started_v95")
    && action.includes("release_member_deletion_for_reconcile_v95")
    && action.includes("complete_member_deletion_operation_v95")
    && action.includes("fail_member_deletion_operation_v95")
    && action.includes("privacyFingerprint(userId)")
    && action.includes('throw new HttpError("永久刪除需要有效的 operationId')
    && action.includes("不可刪除目前登入的管理員帳號")
    && action.includes("activationUsesRestored: false")
    && action.includes("cleanupMemberEmailArtifacts")
    && action.includes("cleanup_member_email_artifacts_v95")
    && action.includes('if (!authDeleteStarted)')
    && action.includes("email-reassigned-skipped-email-sweep")
    && action.includes("targetUserId: userId")
    && (action.match(/renewDeletionOperationLease\(\{ supabase, operationId, leaseToken \}\)/g)?.length || 0) >= 3,
  "Permanent member deletion must use a stable-target fenced lease and durable Auth reconciliation, require a recent primary-admin password session, remove Storage first, and never restore code uses.",
);
assert(
  deleteMemberDialog.includes("createEphemeralAuthClient")
    && deleteMemberDialog.includes("signInWithPassword")
    && deleteMemberDialog.includes('signOut({ scope: "local" })')
    && deleteMemberDialog.includes("data.session.access_token")
    && deleteMemberDialog.includes("目前管理員密碼")
    && !deleteMemberDialog.includes("challengeAndVerify")
    && !deleteMemberDialog.includes("confirmationEmail")
    && !deleteMemberDialog.includes("confirmationPhrase")
    && !deleteMemberDialog.includes("reauthPassword.length < 8")
    && !adminPage.includes("...request")
    && supabaseClient.includes("persistSession: false")
    && supabaseClient.includes("autoRefreshToken: false")
    && dialogFocusTrap.includes("const onEscapeRef = useRef(onEscape)")
    && !dialogFocusTrap.includes("initialFocusRef, onEscape, open"),
  "The deletion dialog must verify only the current password through an isolated Auth session, keep the password out of the admin API, and preserve stable focus trapping.",
);
assert(
  deletionMigration.includes("v_requested.target_email_fingerprint is distinct from p_target_email_fingerprint")
    && deletionMigration.includes("v_row.target_email_fingerprint is distinct from p_target_email_fingerprint")
    && !deletionMigration.includes("target_email_fingerprint = p_target_email_fingerprint,")
    && deletionMigration.includes("before insert or update of email\non auth.users")
    && deletionMigration.includes("operation.target_email_fingerprint = v_new_email_fingerprint")
    && deletionMigration.includes("create or replace function public.cleanup_member_email_artifacts_v95")
    && deletionMigration.includes("and operation.lease_token = p_lease_token")
    && deletionMigration.includes("v_current_email_owner <> p_target_user_id")
    && deletionMigration.includes("return 'email_reassigned'")
    && (action.match(/renewDeletionOperationLease\(\{ supabase, operationId, leaseToken \}\)/g)?.length || 0) >= 4,
  "Deletion retries must keep the original email identity immutable and fence same-email Auth reuse through final cleanup.",
);
assert(
  adminClient.includes("verify_active_recent_password_session_v97")
    && adminClient.includes("claims.session_id")
    && adminClient.includes("configuredPrimaryAdminEmails.includes(email)")
    && currentMigration.includes("auth.mfa_amr_claims")
    && currentMigration.includes("authentication_method = 'password'")
    && currentMigration.includes("to service_role")
    && adminPage.includes("const userDrawerOpen = Boolean(selectedUserId && selectedUser)")
    && adminPage.includes("users.some((row) => row.id === selectedUserId)"),
  "Hard delete must require a live recent-password session, preserve the primary-role boundary, and never lock scrolling for an invisible drawer.",
);
assert(
  action.includes('["activation-codes-v97", "activation_codes", "deleted_at"]')
    && action.includes('id: "recent-password-v97"')
    && action.includes('"verify_active_recent_password_session_v97"'),
  "Admin health must fail closed when the v97 activation/password schema is missing.",
);

const originalDocument = Object.getOwnPropertyDescriptor(globalThis, "document");
const fakeBody = { style: { overflow: "auto" } };
const currentOverflow = () => fakeBody.style.overflow;
Object.defineProperty(globalThis, "document", {
  configurable: true,
  value: { body: fakeBody },
});
try {
  const releaseDrawer = acquireBodyScrollLock();
  const releaseConfirmation = acquireBodyScrollLock();
  assert(currentOverflow() === "hidden", "Nested overlays must lock body scrolling.");
  releaseConfirmation();
  assert(currentOverflow() === "hidden", "Closing the confirmation must keep the underlying drawer locked.");
  releaseDrawer();
  assert(currentOverflow() === "auto", "Closing the final overlay must restore the original body overflow.");
  releaseDrawer();
  assert(currentOverflow() === "auto", "Scroll-lock cleanup must be idempotent.");
} finally {
  if (originalDocument) Object.defineProperty(globalThis, "document", originalDocument);
  else delete (globalThis as { document?: unknown }).document;
}

console.log("Admin console contracts passed.");
