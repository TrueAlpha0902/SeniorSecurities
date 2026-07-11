import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function read(relativePath: string): string {
  return readFileSync(resolve(process.cwd(), relativePath), "utf8");
}

function assertIncludes(source: string, fragment: string, message: string): void {
  if (!source.includes(fragment)) throw new Error(message);
}

const app = read("src/App.tsx");
const account = read("src/pages/AccountPage.tsx");
const adminClient = read("api/_adminClient.ts");
const tools = read("api/admin/tools.ts");
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
assertIncludes(migration, "public.admin_users", "Restoration migration must use the existing administrator registry.");
assertIncludes(migration, "primary_admin", "Restoration migration must bootstrap the primary administrator role.");
assertIncludes(adminPanel, "自動壓縮與前段接縫", "Cross-page question editing must retain automatic seam compression.");
assertIncludes(adminPanel, "裁上", "The crop editor must support trimming individual crop edges.");
assertIncludes(adminPanel, "復原上一步", "The crop editor must provide a safe undo action.");
assertIncludes(segmentStack, "activeIndex", "The preview must identify the segment currently being edited.");
if (adminClient.includes("true.alpha0902@gmail.com") || migration.includes("true.alpha0902@gmail.com")) {
  throw new Error("Administrator access must not depend on an embedded email address.");
}

console.log("Admin console contracts passed.");
