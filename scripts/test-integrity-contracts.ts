import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function main(): Promise<void> {
  const [
    db,
    adminClient,
    adminUsers,
    adminLeaderboard,
    adminAction,
    overrides,
    recovery,
    layout,
    analytics,
    css,
    appLayout,
    migration,
  ] = await Promise.all([
    read("src/lib/db.ts"),
    read("api/_adminClient.ts"),
    read("api/admin/users.ts"),
    read("api/admin/leaderboard.ts"),
    read("api/admin/action.ts"),
    read("api/question-overrides.ts"),
    read("src/lib/appRecovery.ts"),
    read("src/components/AppLayout.tsx"),
    read("src/components/DeferredAnalytics.tsx"),
    read("src/styles/glass.css"),
    read("src/components/AppLayout.tsx"),
    read("supabase/migrations/20260712090000_stabilization_final.sql"),
  ]);

  assert(db.includes("CLOUD_PAGE_SIZE = 500"), "Cloud sync must use explicit 500-row pagination.");
  assert(/\.range\(\s*offset\s*,\s*offset \+ CLOUD_PAGE_SIZE - 1\s*\)/.test(db), "Cloud sync pagination must use range().");
  assert(db.includes("user_record_tombstones"), "Cloud reconciliation must use explicit tombstones.");
  assert(!db.includes("cloudIds.has") || !db.includes("deleteLocal"), "Cloud sync must not delete local rows merely because they are absent from one response page.");
  assert(db.includes("tieBreakers") && db.includes('.order(tieBreaker'), "Cloud pagination must use deterministic secondary ordering.");
  assert(db.includes("const merged = await mergeCloudRecordsToLocal") && db.includes("if (merged) await setReliabilityMetadata"), "Sync checkpoint must advance only after a completed merge.");
  assert(db.includes("effectiveTombstones") && db.includes("liveUpdatedAt"), "Older tombstones must not delete newer recreated cloud rows.");
  assert(db.includes("record_learning_attempts_batch_v75"), "Learning attempts must support batched cloud RPCs.");
  assert(db.includes("record_leaderboard_answer_events_batch_v75"), "Leaderboard events must support batched cloud RPCs.");

  assert(adminClient.includes("export async function requireAdminUser"), "Admin authorization must be centralized.");
  for (const [name, source] of [
    ["users", adminUsers],
    ["leaderboard", adminLeaderboard],
    ["action", adminAction],
  ] as const) {
    assert(source.includes('from "../_adminClient"') || source.includes('from "../_adminClient.js"'), `${name} admin API must import central authorization.`);
    assert(!/function\s+requireAdminUser\s*\(/.test(source), `${name} admin API must not define a local requireAdminUser.`);
  }

  const activationSources = await Promise.all([
    read("api/admin/tools.ts"),
    read("api/admin/user-detail.ts"),
    read("src/components/AdminToolsPanel.tsx"),
    read("src/pages/AdminPage.tsx"),
  ]);
  assert(activationSources.every((source) => !source.includes("code_plain")), "Activation-code plaintext must not be stored, queried, or rendered.");
  assert(!overrides.includes("legacy-draft-fallback"), "Production question overrides must never fall back to draft data.");
  assert(overrides.includes("bundled"), "No active release must fall back to bundled stable data.");

  assert(recovery.includes("subscribeToAppUpdate"), "PWA update availability must be persisted in a module-level store.");
  assert(recovery.includes("question-bank-") && recovery.includes("workbox-precache-"), "Recovery must clear only app-scoped caches.");
  assert(layout.includes("lazyWithRetry") && analytics.includes("lazyWithRetry"), "Every non-route lazy chunk must use lazyWithRetry.");
  assert(appLayout.includes('import "../styles/theme-current.css"'), "App must load the consolidated current theme.");
  assert(!appLayout.includes("premium-liquid-v67") && !appLayout.includes("premium-navy-v70"), "Historical theme layers must not be imported independently.");

  assert(css.includes(".glass-answer-button.glass-answer-correct"), "Correct-answer visual contract is missing.");
  assert(css.includes(".glass-answer-button.glass-answer-wrong"), "Wrong-answer visual contract is missing.");
  assert(css.includes(".glass-badge.weak-count-badge"), "Wrong-count badge visual contract is missing.");
  assert(css.includes(".chapter-card .glass-progress span"), "Chapter progress visual contract is missing.");

  assert(migration.includes("create table if not exists public.user_record_tombstones"), "Tombstone migration is missing.");
  assert(migration.includes("publish_question_release_v75"), "Atomic publish RPC migration is missing.");
  assert(migration.includes("rollback_question_release_v75"), "Atomic rollback RPC migration is missing.");
  assert(migration.includes("app_client_errors"), "Privacy-safe client telemetry table is missing.");
  assert(migration.includes("update public.activation_codes set code_plain = null"), "Legacy activation-code plaintext must be cleared.");

  console.log("Integrity contracts passed.");
}

void main();
