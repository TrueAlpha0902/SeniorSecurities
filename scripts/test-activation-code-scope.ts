import { readFile } from "node:fs/promises";
import path from "node:path";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const root = process.cwd();
const read = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

const [adminApi, adminPanel, authContext, activatePage, authPage, migration] = await Promise.all([
  read("api/admin/tools.ts"),
  read("src/components/AdminToolsPanel.tsx"),
  read("src/auth/AuthContext.tsx"),
  read("src/pages/ActivatePage.tsx"),
  read("src/pages/AuthPage.tsx"),
  read("supabase/migrations/20260826081812_add_exam_scoped_activation_redemption.sql"),
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
  adminPanel.includes("啟用碼適用題庫")
    && adminPanel.includes("證券高業啟用碼")
    && adminPanel.includes("初階外匯啟用碼")
    && adminPanel.includes("每組啟用碼只能開通一個題庫"),
  "The admin generator must present securities and foreign-exchange codes as separate choices.",
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
    && activatePage.includes("此頁只接受")
    && activatePage.includes("另一題庫需使用另外建立的啟用碼"),
  "The activation page must enforce and explain its current question-bank scope.",
);
assert(
  authPage.includes("examIdForReturnTo")
    && authPage.includes('returnTo.startsWith("/foreign-exchange")')
    && authPage.includes("navigate(`/activate?exam=${requestedExamId}`"),
  "Authentication must preserve the requested exam when redirecting an unentitled learner.",
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

console.log("Activation code scope contracts passed.");
