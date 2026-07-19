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
    reliability,
    learningStore,
    adminClient,
    adminUsers,
    adminLeaderboard,
    adminAction,
    adminTools,
    overrides,
    recovery,
    layout,
    analytics,
    css,
    migrationV78,
    migrationV79,
    migrationV80,
    telemetry,
    clientError,
    vite,
    appSettings,
    mockExam,
    uuid,
    randomPractice,
    imageQuizPage,
  ] = await Promise.all([
    read("src/lib/db.ts"),
    read("src/lib/reliabilityStore.ts"),
    read("src/lib/learningStateStore.ts"),
    read("api/_adminClient.ts"),
    read("api/admin/users.ts"),
    read("api/admin/leaderboard.ts"),
    read("api/admin/action.ts"),
    read("api/admin/tools.ts"),
    read("api/question-overrides.ts"),
    read("src/lib/appRecovery.ts"),
    read("src/components/AppLayout.tsx"),
    read("src/components/DeferredAnalytics.tsx"),
    read("src/styles/glass.css"),
    read("supabase/migrations/20260712090000_stabilization_final.sql"),
    read("supabase/migrations/20260712130000_final_hardening_v79.sql"),
    read("supabase/migrations/20260719120000_exam_scoped_entitlements_v80.sql"),
    read("src/lib/telemetry.ts"),
    read("api/client-error.ts"),
    read("vite.config.ts"),
    read("src/lib/appSettings.ts"),
    read("src/lib/mockExam.ts"),
    read("src/lib/uuid.ts"),
    read("src/pages/RandomPracticePage.tsx"),
    read("src/pages/ImageQuizPage.tsx"),
  ]);

  assert(
    db.includes('CLOUD_SYNC_CURSOR_KEY = "cloud-records:server-cursors-v79"'),
    "Cloud sync must use the v79 server cursor format.",
  );
  assert(
    db.includes("fetchKeysetCloudRows") &&
      db.includes('.gt("sync_version", nextCursor)') &&
      db.includes('.order("sync_version", { ascending: true })'),
    "Cloud sync must use server-authored sync_version keyset pagination.",
  );
  assert(
    !/\.range\(\s*offset\s*,/.test(db),
    "Cloud reconciliation must not use mutable offset pagination.",
  );
  assert(
    db.includes("user_record_tombstones") &&
      db.includes("effectiveTombstones") &&
      db.includes("liveVersion"),
    "Cloud reconciliation must compare explicit tombstones with live sync versions.",
  );
  assert(
    db.indexOf("await importCloudRecordsToLocal(userId)") <
      db.indexOf("await uploadLocalRecordsToCloud(userId)"),
    "First synchronization must download and reconcile before a legacy full upload.",
  );
  assert(
    db.includes('["userAnswers", "wrongQuestions", "syncIntents"]') &&
      db.includes('["imageQuizSessions", "syncIntents"]'),
    "Domain writes and local sync intents must share IndexedDB transactions.",
  );
  assert(
    reliability.includes('"learningStates", "learningAttempts", "cloudQueue"') &&
      learningStore.includes("queueEntries"),
    "Learning state, attempt and cloud outbox writes must be atomic.",
  );
  assert(
    db.includes("user_image_quiz_sessions") &&
      db.includes('kind: "upsert-image-session"'),
    "Image quiz sessions must participate in cloud synchronization.",
  );
  assert(
    reliability.includes("listReliabilityDeadLetters") &&
      reliability.includes("retryReliabilityDeadLetters") &&
      reliability.includes("deleteReliabilityDeadLetters"),
    "Dead-letter recovery operations are missing.",
  );
  assert(
    db.includes("record_learning_attempts_batch_v75") &&
      db.includes("record_leaderboard_answer_events_batch_v75"),
    "Learning and leaderboard events must support batched RPCs.",
  );

  assert(
    adminClient.includes("export async function requireAdminUser"),
    "Admin authorization must be centralized.",
  );
  assert(
    !adminClient.includes("true.alpha0902@gmail.com") &&
      adminClient.includes("process.env.ADMIN_EMAILS"),
    "Admin access must not rely on a hard-coded email.",
  );
  assert(
    adminClient.includes("if (!assignment.is_active) return null") &&
      adminClient.includes('databaseAccess.role === "primary_admin"'),
    "Inactive role assignments must fail closed and database primary roles must be recognized.",
  );
  for (const [name, source] of [
    ["users", adminUsers],
    ["leaderboard", adminLeaderboard],
    ["action", adminAction],
  ] as const) {
    assert(
      source.includes('from "../_adminClient"') ||
        source.includes('from "../_adminClient.js"'),
      `${name} admin API must import central authorization.`,
    );
    assert(
      !/function\s+requireAdminUser\s*\(/.test(source),
      `${name} admin API must not define local authorization.`,
    );
  }
  assert(
    adminTools.includes('roles: ["primary_admin"]') &&
      !adminTools.includes("requireAal2") &&
      adminTools.includes("create_activation_code_v80") &&
      adminTools.includes("set_admin_access_v79"),
    "Sensitive admin tools must require the primary-admin role and atomic RPCs without MFA coupling.",
  );

  const activationSources = await Promise.all([
    read("api/admin/tools.ts"),
    read("api/admin/user-detail.ts"),
    read("src/components/AdminToolsPanel.tsx"),
    read("src/pages/AdminPage.tsx"),
  ]);
  assert(
    activationSources.every((source) => !source.includes("code_plain")),
    "Activation-code plaintext must not be stored, queried or rendered.",
  );
  assert(
    !overrides.includes("legacy-draft-fallback") &&
      overrides.includes("bundled") &&
      overrides.includes("sendPublicJson") &&
      overrides.includes("if-none-match"),
    "Published overrides must use bundled fallback, ETag and public cache semantics.",
  );

  assert(
    recovery.includes("subscribeToAppUpdate"),
    "PWA update availability must be kept in a module-level store.",
  );
  assert(
    recovery.includes("question-bank-") &&
      recovery.includes("workbox-precache-"),
    "Recovery must clear only app-scoped caches.",
  );
  assert(
    layout.includes("lazyWithRetry") && analytics.includes("lazyWithRetry"),
    "Every non-route lazy chunk must use lazyWithRetry.",
  );
  assert(
    layout.includes('import "../styles/theme-current.css"') &&
      !layout.includes("premium-liquid-v67") &&
      !layout.includes("premium-navy-v70"),
    "Only the consolidated current theme may be imported.",
  );
  assert(
    css.includes(".glass-answer-button.glass-answer-correct") &&
      css.includes(".glass-answer-button.glass-answer-wrong") &&
      css.includes(".glass-badge.weak-count-badge") &&
      css.includes(".chapter-card .glass-progress span"),
    "Critical answer, badge and progress visual contracts are missing.",
  );

  assert(
    migrationV78.includes("create table if not exists public.user_record_tombstones") &&
      migrationV78.includes("publish_question_release_v75") &&
      migrationV78.includes("rollback_question_release_v75") &&
      migrationV78.includes("update public.activation_codes set code_plain = null"),
    "The stabilization migration is incomplete.",
  );
  assert(
    migrationV79.includes("assign_user_sync_version") &&
      migrationV79.includes("user_image_quiz_sessions") &&
      migrationV79.includes("set_admin_access_v79") &&
      migrationV79.includes("create_activation_code_v79") &&
      migrationV79.includes("to service_role"),
    "The v79 server-cursor, image-session and atomic-admin migration is incomplete.",
  );
  assert(
    migrationV80.includes("user_exam_entitlements") &&
      migrationV80.includes("create_activation_code_v80") &&
      migrationV80.includes("junior-foreign-exchange") &&
      migrationV80.includes("primary key (user_id, exam_id)"),
    "The v80 exam-scoped entitlement migration is incomplete.",
  );

  assert(
    !telemetry.includes("window.location.search") &&
      telemetry.includes("window.location.pathname"),
    "Client telemetry must not transmit URL query values.",
  );
  assert(
    clientError.includes("MAX_BODY_CHARS") &&
      clientError.includes("sourceHash") &&
      clientError.includes("RATE_LIMIT"),
    "Client-error ingestion must enforce size, source hashing and rate limiting.",
  );
  assert(
    vite.includes("pdf-image-quiz.json") &&
      vite.includes("editor source") &&
      vite.includes("rm(editorSourceOutputPath"),
    "Raw editor question data must be removed from production output.",
  );


  assert(
    appSettings.includes("MOCK_EXAM_DEFERRED_FEEDBACK_KEY") &&
      appSettings.includes("getMockExamDeferredFeedbackEnabled") &&
      appSettings.includes("setMockExamDeferredFeedbackEnabled"),
    "Mock-exam grading preference must persist in user-scoped settings.",
  );
  assert(
    randomPractice.includes("getMockExamDeferredFeedbackEnabled") &&
      randomPractice.includes("setMockExamDeferredFeedbackEnabled") &&
      randomPractice.includes("getImageQuizSession(sessionId)") &&
      randomPractice.includes("persistedSession.feedbackMode !== feedbackMode") &&
      randomPractice.includes("resolveMockExamFeedbackMode("),
    "Mock-exam grading mode must be read at start time, persisted, and verified before navigation.",
  );
  assert(
    mockExam.includes("resolveMockExamSessionFeedbackMode") &&
      mockExam.includes("shouldRevealMockExamFeedback") &&
      mockExam.includes("getMockExamAnswerCardStatus") &&
      imageQuizPage.includes("shouldEnforceDeferredMockExamFeedback(") &&
      imageQuizPage.includes("saveImageQuizSessionFeedbackMode(") &&
      imageQuizPage.includes("data-mock-exam-feedback-mode") &&
      imageQuizPage.includes("canChooseImageQuizAnswer({") &&
      imageQuizPage.includes("submitted-exam-answer-card") &&
      imageQuizPage.includes("reviewingSubmittedExam"),
    "Mock exams must fail closed before submission, allow revisions, and expose a post-submit review answer card.",
  );
  assert(
    db.includes("learningEventId") &&
      db.includes("ensureImageQuizLearningEvent(") &&
      uuid.includes("crypto?.randomUUID") &&
      uuid.includes("UUID_PATTERN") &&
      db.includes('["imageQuizSessions", "userAnswers", "wrongQuestions", "syncIntents"]') &&
      db.includes("learningRecorded: true"),
    "Mock-exam learning commits must use persisted UUIDs and atomically mark the session answer with domain sync intents.",
  );
  assert(
    db.includes("queueImageQuizSessionMutation(") &&
      db.includes("updateImageQuizSession(") &&
      imageQuizPage.indexOf("await saveRandomSessionResult(") <
        imageQuizPage.lastIndexOf("await commitImageQuizSessionLearningAnswers("),
    "Mock-exam session mutations must be serialized and local submission must finish before learning records commit.",
  );

  console.log("v79 security, synchronization and deployment integrity contracts passed.");
}

void main();
