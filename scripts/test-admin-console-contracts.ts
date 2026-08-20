import { access, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const read = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");
async function exists(relativePath: string): Promise<boolean> {
  try { await access(path.join(root, relativePath)); return true; } catch { return false; }
}
function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const [panel, adminClient, tools, action, account, adminPage, interactionPrimitives] = await Promise.all([
  read("src/components/AdminToolsPanel.tsx"),
  read("api/_adminClient.ts"),
  read("api/admin/tools.ts"),
  read("api/admin/action.ts"),
  read("src/pages/AccountPage.tsx"),
  read("src/pages/AdminPage.tsx"),
  read("src/components/V93InteractionPrimitives.tsx"),
]);

assert(panel.includes("啟用碼") && panel.includes("管理員") && panel.includes("系統狀態"), "Admin workspace must keep its core tools.");
assert(!panel.includes('{ id: "questions"') && !panel.includes('activeTool === "questions"'), "Question editing must not be reachable from the admin UI.");
assert(!await exists("api/admin/question-editor.ts"), "Question editor serverless entrypoint must be deleted.");
assert(adminClient.includes("requireAdminUser") && !adminClient.includes("true.alpha0902@gmail.com"), "Admin authorization must remain centralized and role-based.");
assert(tools.includes("create_activation_code_v80") && action.includes("audit-events"), "Core admin operations must remain available.");
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

console.log("Admin console contracts passed.");
