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
const questionEditorApi = read("api/admin/question-editor.ts");
const adminPage = read("src/pages/AdminPage.tsx");
const leaderboard = read("src/pages/LeaderboardPage.tsx");
const leaderboardLib = read("src/lib/leaderboard.ts");
const adminPanel = read("src/components/AdminToolsPanel.tsx");
const imageQuiz = read("src/lib/imageQuiz.ts");
const segmentStack = read("src/components/PdfSegmentStack.tsx");
const restoreMigration = read("supabase/migrations/20260712160000_restore_admin_console_v793.sql");
const professionalMigration = read("supabase/migrations/20260712230000_professional_experience_v797.sql");

assertIncludes(app, 'path="/admin"', "Admin route must remain registered.");
assertIncludes(account, 'fetch("/api/admin/tools?tool=access"', "Account page must use server-side admin access discovery.");
assertIncludes(account, 'to="/admin"', "Account page must retain the administration entry point.");
assertIncludes(adminClient, "PRIMARY_ADMIN_EMAILS", "Server must support explicit primary administrator configuration.");
assertIncludes(adminClient, 'databaseAccess.role === "primary_admin"', "Database-assigned primary administrators must be recognized as primary.");
assertIncludes(tools, '"create-activation-code"', "Activation-code management must remain available.");
assertIncludes(tools, '"delete-activation-code"', "Activation-code deletion must remain protected and available.");
assertIncludes(tools, '"upsert-admin"', "Administrator account management must remain available.");
assertIncludes(tools, "requireAal2: true", "Destructive administrator actions must retain AAL2 enforcement.");
assertIncludes(releases, 'action === "publish-current"', "The release API must expose direct publication of current changes.");
assertIncludes(releases, "allowPrimaryAdminWithoutAal2: true", "Primary administrators must be able to publish current changes without MFA.");
assertIncludes(releases, 'roles: ["primary_admin"]', "Direct publication must remain restricted to primary administrators.");
assertNotIncludes(releases, 'action === "submit-review"', "The obsolete second-person submission flow must not return.");
assertNotIncludes(releases, 'action === "approve"', "The obsolete second-person approval flow must not return.");
assertIncludes(adminClient, "allowPrimaryAdminWithoutAal2", "The centralized admin guard must support the explicit primary-admin publish exemption.");
assertNotIncludes(adminPage, "90 秒內有心跳", "The admin dashboard must not expose implementation-specific heartbeat copy.");
assertNotIncludes(adminPage, "每 30 秒同步", "The user directory must not show background refresh implementation copy.");
assertNotIncludes(adminPage, '"Online"', "The user directory must not add a redundant online text badge.");
assertNotIncludes(adminPage, '"Offline"', "The user directory must not add a redundant offline text badge.");
assertIncludes(adminPage, "admin-member-card", "Members must use the professional card directory layout.");
assertIncludes(adminPage, "admin-row-progress", "Member cards must retain the visual learning progress treatment.");
assertIncludes(account, 'className="account-status-grid account-sync-status-grid"', "Account sync must keep the compact two-metric summary.");
assertNotIncludes(account, 'label="等待同步"', "The compact account sync panel must not restore low-priority queue counters.");
assertNotIncludes(account, 'label="需人工處理"', "The compact account sync panel must not restore dead-letter counters.");
assertIncludes(leaderboard, "leaderboard-v796-podium", "The learner leaderboard must retain the medal podium.");
assertNotIncludes(leaderboard, "我的成就", "The redundant personal achievement summary must remain removed.");
assertIncludes(leaderboard, 'return "金牌"', "First place must be presented as a gold medal.");
assertIncludes(leaderboard, 'return "銀牌"', "Second place must be presented as a silver medal.");
assertIncludes(leaderboard, 'return "銅牌"', "Third place must be presented as a bronze medal.");
assertIncludes(leaderboard, "updateLeaderboardAvatar", "Users must be able to upload a leaderboard avatar.");
assertIncludes(leaderboardLib, 'const AVATAR_BUCKET = "leaderboard-avatars"', "Avatar uploads must use the dedicated storage bucket.");
assertIncludes(professionalMigration, "leaderboard-avatars", "The avatar storage bucket and policies must be migrated.");
assertIncludes(professionalMigration, "publish_question_overrides_v797", "Direct publishing must be implemented as one database transaction.");
assertIncludes(professionalMigration, "question_release.publish_direct", "Direct publishing must produce an audit event.");
assertIncludes(restoreMigration, "public.admin_users", "Restoration migration must use the existing administrator registry.");
assertIncludes(restoreMigration, "primary_admin", "Restoration migration must bootstrap the primary administrator role.");
assertIncludes(questionEditorApi, "listQuestionOverrides", "The editor must load private current changes, not only the public release.");
assertIncludes(adminPanel, "loadImageQuizEditorCatalog", "The editor must load a lightweight catalog.");
assertIncludes(adminPanel, "loadImageQuizEditorChapter", "The editor must load only the selected chapter.");
assertNotIncludes(adminPanel, "loadImageQuizEditorBanks", "The editor must not eagerly load every full question bank.");
assertIncludes(imageQuiz, "loadImageQuizEditorCatalog", "The lightweight editor catalog service must remain available.");
assertIncludes(adminPanel, "自動壓縮接縫", "Cross-page question editing must retain automatic seam compression.");
assertIncludes(adminPanel, "裁上", "The crop editor must support trimming individual crop edges.");
assertIncludes(adminPanel, ">復原</GlassButton>", "The crop editor must provide a safe undo action.");
assertIncludes(segmentStack, "activeIndex", "The preview must identify the segment currently being edited.");
assertIncludes(adminPanel, 'className="question-editor-workspace question-editor-focus-workspace"', "The question editor must retain the single-screen crop focus workspace.");
assertIncludes(adminPanel, '<details className="question-editor-advanced">', "Low-frequency crop fields must remain available inside a collapsed advanced panel.");
assertIncludes(adminPanel, "自動貼合前段接縫", "The focused crop editor must keep the cross-page seam workflow prominent.");
assertIncludes(adminPanel, "儲存修改", "The focused editor must keep its save action visible.");
assertIncludes(adminPanel, "本次修改", "The editor must expose the current change list.");
assertIncludes(adminPanel, "發布題庫", "The primary administrator must have one clear publication action.");
assertNotIncludes(adminPanel, "第二人核准", "The editor must not require a second-person approval step.");
assertNotIncludes(adminPanel, 'className="admin-tool-actions question-editor-save-actions"', "The obsolete bottom sticky save bar must not return to the crop workspace.");
if (adminClient.includes("true.alpha0902@gmail.com") || professionalMigration.includes("true.alpha0902@gmail.com")) {
  throw new Error("Administrator access must not depend on an embedded email address.");
}

console.log("Admin console contracts passed.");
