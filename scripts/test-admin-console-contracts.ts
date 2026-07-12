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
const avatarCropDialog = read("src/components/AvatarCropDialog.tsx");
const adminPanel = read("src/components/AdminToolsPanel.tsx");
const imageQuiz = read("src/lib/imageQuiz.ts");
const segmentStack = read("src/components/PdfSegmentStack.tsx");
const restoreMigration = read("supabase/migrations/20260712160000_restore_admin_console_v793.sql");
const professionalMigration = read("supabase/migrations/20260712230000_professional_experience_v797.sql");
const randomPractice = read("src/pages/RandomPracticePage.tsx");
const vercel = read("vercel.json");
const adminCss = read("src/styles/admin-premium-v65.css");
const currentThemeCss = read("src/styles/theme-current.css");
const adminToolsCss = read("src/styles/admin-tools.css");
const goldMedalSvg = read("public/icons/medal-gold.svg");
const silverMedalSvg = read("public/icons/medal-silver.svg");
const bronzeMedalSvg = read("public/icons/medal-bronze.svg");

assertIncludes(app, 'path="/admin"', "Admin route must remain registered.");
assertIncludes(account, 'fetch("/api/admin/tools?tool=access"', "Account page must use server-side admin access discovery.");
assertIncludes(account, 'to="/admin"', "Account page must retain the administration entry point.");
assertIncludes(adminClient, "PRIMARY_ADMIN_EMAILS", "Server must support explicit primary administrator configuration.");
assertIncludes(adminClient, 'databaseAccess.role === "primary_admin"', "Database-assigned primary administrators must be recognized as primary.");
assertIncludes(tools, '"create-activation-code"', "Activation-code management must remain available.");
assertIncludes(tools, '"delete-activation-code"', "Activation-code deletion must remain protected and available.");
assertIncludes(tools, '"upsert-admin"', "Administrator account management must remain available.");
assertNotIncludes(tools, "requireAal2", "Administrator operations must not require the removed MFA flow.");
assertIncludes(releases, 'action === "publish-current"', "The release API must expose direct publication of current changes.");
assertNotIncludes(releases, "allowPrimaryAdminWithoutAal2", "Release operations must use role authorization without MFA-specific exceptions.");
assertIncludes(releases, 'roles: ["primary_admin"]', "Direct publication must remain restricted to primary administrators.");
assertNotIncludes(releases, 'action === "submit-review"', "The obsolete second-person submission flow must not return.");
assertNotIncludes(releases, 'action === "approve"', "The obsolete second-person approval flow must not return.");
assertNotIncludes(adminClient, "requireAal2", "The centralized admin guard must not expose MFA enforcement options.");
assertNotIncludes(adminPage, "90 秒內有心跳", "The admin dashboard must not expose implementation-specific heartbeat copy.");
assertNotIncludes(adminPage, "每 30 秒同步", "The user directory must not show background refresh implementation copy.");
assertNotIncludes(adminPage, '"Online"', "The user directory must not add a redundant online text badge.");
assertNotIncludes(adminPage, '"Offline"', "The user directory must not add a redundant offline text badge.");
assertIncludes(adminPage, "admin-member-table", "Members must use the compact horizontal directory layout.");
assertIncludes(adminPage, "admin-member-row", "Member data must remain readable as horizontal rows.");
assertNotIncludes(adminPage, "admin-member-card", "The dense member-card grid must not return.");
assertIncludes(account, 'className="account-sync-inline"', "Account sync must keep the quiet white two-metric summary.");
assertNotIncludes(account, "MfaSecuritySection", "The account page must not expose the removed MFA setup panel.");
assertNotIncludes(account, "多因素驗證", "The account page must not display MFA setup copy.");
assertNotIncludes(adminPanel, "強制 MFA", "Administrator management must not expose an MFA toggle.");
assertNotIncludes(adminPanel, "AAL2", "System health must not expose MFA assurance-level copy.");
assertIncludes(adminPage, "目前在線", "The operations summary must expose the current online-user count.");
assertNotIncludes(adminPage, "<small>有效授權</small>", "The operations summary must not use an entitlement KPI slot.");
assertIncludes(adminPage, 'className="is-duration"', "Practice-time KPI must use the non-clipping duration layout.");
assertNotIncludes(account, 'label="等待同步"', "The compact account sync panel must not restore low-priority queue counters.");
assertNotIncludes(account, 'label="需人工處理"', "The compact account sync panel must not restore dead-letter counters.");
assertIncludes(leaderboard, "leaderboard-v796-podium", "The learner leaderboard must retain the medal podium.");
assertNotIncludes(leaderboard, "我的成就", "The redundant personal achievement summary must remain removed.");
assertIncludes(leaderboard, 'className="leaderboard-v796-medal"', "The podium must retain a medal symbol for each winner.");
assertIncludes(leaderboard, '"/icons/medal-gold.svg"', "First place must use the dedicated gold medal icon.");
assertIncludes(leaderboard, '"/icons/medal-silver.svg"', "Second place must use the dedicated silver medal icon.");
assertIncludes(leaderboard, '"/icons/medal-bronze.svg"', "Third place must use the dedicated bronze medal icon.");

assertIncludes(adminCss, "flat transparent operations symbols", "The operations summary must use the flat symbol treatment.");
assertIncludes(adminCss, "background: transparent;", "Operations-summary symbols must blend into the white surface.");
assertIncludes(currentThemeCss, "flat transparent operations emblem", "The operations-center title emblem must use the flat treatment.");
assertIncludes(currentThemeCss, "background: transparent !important;", "The operations-center title emblem must blend into the page surface.");
for (const medalSvg of [goldMedalSvg, silverMedalSvg, bronzeMedalSvg]) {
  assertIncludes(medalSvg, 'stop-color="#d63f49"', "Every podium medal must use the shared red ribbon.");
  assertIncludes(medalSvg, 'stop-color="#8e1f2d"', "Every podium medal ribbon must retain a dark-red lower edge.");
}
assertNotIncludes(leaderboard, "本期", "Leaderboard copy must not use period-specific wording.");
assertNotIncludes(leaderboard, 'return "金牌"', "Medal identity must come from the symbol rather than a text label.");
assertIncludes(leaderboard, "updateLeaderboardAvatar", "Users must be able to upload a leaderboard avatar.");
assertIncludes(leaderboard, "AvatarCropDialog", "Avatar uploads must open the user-controlled crop workspace.");
assertNotIncludes(leaderboard, "頭像會自動裁成正方形並壓縮", "The removed automatic-crop explanation must not return.");
assertIncludes(avatarCropDialog, "setPointerCapture", "The avatar crop workspace must support direct drag positioning.");
assertIncludes(avatarCropDialog, 'type="range"', "The avatar crop workspace must provide user-controlled zoom.");
assertIncludes(avatarCropDialog, "context.drawImage", "The selected avatar crop must be rendered locally before upload.");
assertIncludes(leaderboardLib, 'const AVATAR_BUCKET = "leaderboard-avatars"', "Avatar uploads must use the dedicated storage bucket.");
assertIncludes(vercel, "img-src 'self' data: blob: https://*.supabase.co", "CSP must allow Supabase-hosted leaderboard avatars.");
assertIncludes(leaderboard, "onError={() => setFailed(true)}", "Avatar rendering must fall back safely when an image cannot load.");
assertIncludes(randomPractice, '<h1 id="mock-exam-title">模擬考</h1>', "The mock-exam title must remain concise.");
assertNotIncludes(randomPractice, "建立接近正式應試節奏的個人測驗", "The removed mock-exam subtitle must not return.");
assertIncludes(randomPractice, "random-record-complete-label", "Completed and incomplete session rows must reserve the same action column.");
assertIncludes(professionalMigration, "leaderboard-avatars", "The avatar storage bucket and policies must be migrated.");
assertIncludes(professionalMigration, "publish_question_overrides_v797", "Direct publishing must be implemented as one database transaction.");
assertIncludes(professionalMigration, "question_release.publish_direct", "Direct publishing must produce an audit event.");
assertIncludes(restoreMigration, "public.admin_users", "Restoration migration must use the existing administrator registry.");
assertIncludes(restoreMigration, "primary_admin", "Restoration migration must bootstrap the primary administrator role.");
assertIncludes(questionEditorApi, "listQuestionOverrides", "The editor must load private current changes, not only the public release.");
assertIncludes(adminPanel, "loadImageQuizEditorCatalog", "The editor must load a lightweight catalog.");

assertIncludes(questionEditorApi, 'mode === "index"', "The editor must load a lightweight draft index before downloading draft payloads.");
assertIncludes(questionEditorApi, 'action === "load-overrides"', "The editor must request only draft payloads for the selected chapter.");
assertIncludes(adminPanel, 'useDeferredValue(editable)', "Heavy draft previews must be deferred so crop controls remain responsive.");
assertIncludes(adminPanel, 'question-editor-preview-skeleton', "The editor must paint its controls before mounting expensive image previews.");
assertIncludes(imageQuiz, 'loadQuestionOverridesByIds', "Published overrides for the editor must be fetched only for the selected chapter.");
assertIncludes(segmentStack, 'key={`${segment.src}-${segment.page}-${index}`}', "Crop previews must keep stable React keys while crop coordinates change.");
assertNotIncludes(segmentStack, 'key={`${segment.src}-${segment.x}-${segment.y}-${segment.width}-${segment.height}`}', "Crop adjustments must not remount and decode the source image on every click.");
assertIncludes(segmentStack, '}, [segment.src]);', "Crop image retry state must reset only when the source page changes.");
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
assertIncludes(adminPanel, "草稿題目", "The editor must show the edited question draft as it will appear in the app.");
assertIncludes(adminPanel, "草稿解析", "The editor must show the edited explanation draft as it will appear in the app.");
assertIncludes(adminPanel, "原頁裁切定位", "The crop editor must include the full source-page context view.");
assertIncludes(adminPanel, "question-page-crop-box", "The full-page context view must mark crop regions with an overlay.");
assertIncludes(adminPanel, "目前裁切", "The active crop region must be identified clearly.");
assertIncludes(adminToolsCss, ".question-page-context-canvas .question-page-crop-box.is-active", "The source-page context must define a sufficiently specific active crop window.");
assertIncludes(adminToolsCss, "background: transparent !important", "The crop window must remain transparent so source text stays visible.");
assertIncludes(adminToolsCss, "0 0 0 9999px", "The crop context must dim only the area outside the transparent crop window.");
assertNotIncludes(adminToolsCss, "background: rgba(214, 47, 64, .08)", "The active crop window must not use a filled overlay.");
assertIncludes(adminPanel, 'className="crop-edge-button"', "Vertical crop-edge actions must use the high-contrast button treatment.");
assertIncludes(adminPanel, "發布題庫", "The primary administrator must have one clear publication action.");
assertNotIncludes(adminPanel, "第二人核准", "The editor must not require a second-person approval step.");
assertNotIncludes(adminPanel, 'className="admin-tool-actions question-editor-save-actions"', "The obsolete bottom sticky save bar must not return to the crop workspace.");
if (adminClient.includes("true.alpha0902@gmail.com") || professionalMigration.includes("true.alpha0902@gmail.com")) {
  throw new Error("Administrator access must not depend on an embedded email address.");
}

console.log("Admin console contracts passed.");
