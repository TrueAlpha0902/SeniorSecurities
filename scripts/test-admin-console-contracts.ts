import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function assertIncludes(source: string, fragment: string, message: string): void {
  if (!source.includes(fragment)) throw new Error(message);
}

function assertNotIncludes(source: string, fragment: string, message: string): void {
  if (source.includes(fragment)) throw new Error(message);
}

const app = read("src/App.tsx");
const account = read("src/pages/AccountPage.tsx");
const adminClient = read("api/_adminClient.ts");
const tools = read("api/admin/tools.ts");
const releases = read("api/admin/releases.ts");
const adminPage = read("src/pages/AdminPage.tsx");
const leaderboard = read("src/pages/LeaderboardPage.tsx");
const adminPanel = read("src/components/AdminToolsPanel.tsx");
const segmentStack = read("src/components/PdfSegmentStack.tsx");
const migration = read("supabase/migrations/20260712160000_restore_admin_console_v793.sql");

assertIncludes(app, 'path="/admin"', "Admin route must remain registered.");
assertIncludes(account, 'fetch("/api/admin/tools?tool=access"', "Account page must use server-side admin access discovery.");
assertIncludes(account, 'to="/admin"', "Account page must retain the administration entry point.");
assertIncludes(adminClient, "PRIMARY_ADMIN_EMAILS", "Server must support explicit primary administrator configuration.");
assertIncludes(adminClient, 'databaseAccess.role === "primary_admin"', "Database-assigned primary administrators must be recognized as primary.");
assertIncludes(tools, '"create-activation-code"', "Activation-code management must remain available.");
assertIncludes(tools, '"delete-activation-code"', "Activation-code deletion must remain protected and available.");
assertIncludes(tools, '"upsert-admin"', "Administrator account management must remain available.");
assertIncludes(tools, 'requireAal2: true', "Destructive administrator actions must retain AAL2 enforcement.");
assertIncludes(releases, 'allowPrimaryAdminWithoutAal2: action === "publish"', "Primary administrators must be able to publish an approved release without completing MFA.");
assertIncludes(adminClient, "allowPrimaryAdminWithoutAal2", "The centralized admin guard must support the explicit publish-only primary-admin MFA exemption.");
assertNotIncludes(adminPage, "90 秒內有心跳", "The admin dashboard must not expose implementation-specific heartbeat copy.");
assertIncludes(adminPage, "admin-row-progress", "Member rows must retain the visual learning progress treatment.");
assertIncludes(account, 'className="account-status-grid account-sync-status-grid"', "Account sync must keep the compact two-metric summary.");
assertNotIncludes(account, 'label="等待同步"', "The compact account sync panel must not restore low-priority queue counters.");
assertNotIncludes(account, 'label="需人工處理"', "The compact account sync panel must not restore dead-letter counters.");
assertIncludes(leaderboard, "leaderboard-v796-podium", "The learner leaderboard must retain the achievement podium.");
assertIncludes(leaderboard, "我的成就", "The leaderboard must keep the personal achievement summary.");
assertIncludes(migration, "public.admin_users", "Restoration migration must use the existing administrator registry.");
assertIncludes(migration, "primary_admin", "Restoration migration must bootstrap the primary administrator role.");
assertIncludes(adminPanel, "自動壓縮接縫", "Cross-page question editing must retain automatic seam compression.");
assertIncludes(adminPanel, "裁上", "The crop editor must support trimming individual crop edges.");
assertIncludes(adminPanel, ">復原</GlassButton>", "The crop editor must provide a safe undo action.");
assertIncludes(segmentStack, "activeIndex", "The preview must identify the segment currently being edited.");
assertIncludes(adminPanel, 'className="question-editor-workspace question-editor-focus-workspace"', "The question editor must retain the single-screen crop focus workspace.");
assertIncludes(adminPanel, '<details className="question-editor-advanced">', "Low-frequency crop fields must remain available inside a collapsed advanced panel.");
assertIncludes(adminPanel, "自動貼合前段接縫", "The focused crop editor must keep the cross-page seam workflow prominent.");
assertIncludes(adminPanel, "儲存草稿", "The focused crop editor must keep the primary save action in the visible header.");
assertIncludes(adminPanel, '<details className="question-release-collapsible">', "Question publishing must remain available without crowding the crop workspace.");
assertNotIncludes(adminPanel, 'className="admin-tool-actions question-editor-save-actions"', "The obsolete bottom sticky save bar must not return to the crop workspace.");
if (adminClient.includes("true.alpha0902@gmail.com") || migration.includes("true.alpha0902@gmail.com")) {
  throw new Error("Administrator access must not depend on an embedded email address.");
}

console.log("Admin console contracts passed.");
