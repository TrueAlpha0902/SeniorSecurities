import "fake-indexeddb/auto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import {
  enqueueReliabilityMutation,
  getReliabilityMetadata,
  listDueReliabilityQueue,
  listReliabilityDeadLetters,
  listReliabilityQueue,
  loadReliabilityLearningData,
  moveReliabilityQueueEntryToDeadLetter,
  persistReliabilityLearningUpdate,
  type ReliabilityQueueEntry,
} from "../src/lib/reliabilityStore";
import {
  applyLearningResetGeneration,
  isLearningMutationForExam,
  type LearningResetExamId,
} from "../src/lib/learningResetGeneration";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

type TestMutation = {
  kind: string;
  examId?: LearningResetExamId;
  resetGeneration?: number;
  record?: { questionId?: string; bankId?: string };
};
const userId = `reset-v96-${Date.now()}`;
const now = new Date().toISOString();
const entry = (
  id: string,
  kind: string,
  payload: Omit<TestMutation, "kind"> = {},
): ReliabilityQueueEntry<TestMutation> => ({
  id,
  userId,
  createdAt: now,
  updatedAt: now,
  coalesceKey: null,
  attemptCount: 0,
  nextAttemptAt: now,
  lastError: null,
  payload: { kind, ...payload },
});

await persistReliabilityLearningUpdate(
  userId,
  { questionId: "security-q-1", nextReviewAt: now },
  { eventId: "attempt-1", answeredAt: now },
  1200,
  [entry("learning-queue", "sync-learning-attempt")],
);
await enqueueReliabilityMutation(
  userId,
  entry("leaderboard-dead", "record-leaderboard-answer"),
);
await enqueueReliabilityMutation(
  userId,
  entry("wrong-queue", "upsert-wrong", {
    examId: "senior-securities",
    record: { questionId: "investment-ch01-pdf-0001" },
  }),
);
await enqueueReliabilityMutation(
  userId,
  entry("favorite-queue", "upsert-favorite", {
    examId: "senior-securities",
    resetGeneration: 0,
    record: { questionId: "investment-ch01-pdf-0002" },
  }),
);
await enqueueReliabilityMutation(
  userId,
  entry("answer-queue", "upsert-answer", {
    examId: "senior-securities",
    record: { questionId: "investment-ch01-pdf-0001" },
  }),
);
await enqueueReliabilityMutation(
  userId,
  entry("fx-answer-queue", "upsert-answer", {
    record: { questionId: "fx-47-trade-001" },
  }),
);
const due = await listDueReliabilityQueue<TestMutation>(
  userId,
  new Date(Date.now() + 1000).toISOString(),
);
const leaderboard = due.find(
  (item) => item.payload.kind === "record-leaderboard-answer",
);
assert(leaderboard, "The leaderboard mutation fixture must exist.");
await moveReliabilityQueueEntryToDeadLetter(userId, leaderboard);

await applyLearningResetGeneration(
  userId,
  "senior-securities",
  0,
  "wrong",
  1,
);

let learning = await loadReliabilityLearningData<
  { questionId: string },
  { eventId: string }
>(userId);
assert(
  learning.states.length === 1 && learning.attempts.length === 1,
  "Wrong-only reset must preserve local learning states and attempts.",
);
let queue = await listReliabilityQueue<TestMutation>(userId, 20);
assert(
  !queue.some((item) => item.payload.kind === "upsert-wrong") &&
    queue.some((item) => item.payload.kind === "upsert-answer") &&
    queue.some((item) => item.payload.kind === "upsert-favorite") &&
    queue.some((item) => item.payload.record?.questionId === "fx-47-trade-001"),
  "Wrong-only reset must discard only same-exam wrong mutations.",
);
assert(
  (await listReliabilityDeadLetters<TestMutation>(userId, 20)).length === 1,
  "Wrong-only reset must preserve unrelated leaderboard dead letters.",
);
assert(
  (await getReliabilityMetadata<number>(
    userId,
    "senior-securities-wrong-reset-generation-v96",
  )) === 1,
  "Wrong generation must commit in the same reliability transaction.",
);

await applyLearningResetGeneration(
  userId,
  "senior-securities",
  1,
  "restart",
  2,
  0,
);
learning = await loadReliabilityLearningData<
  { questionId: string },
  { eventId: string }
>(userId);
assert(
  learning.states.length === 0 && learning.attempts.length === 0,
  "Restart must clear local learning states and attempts atomically.",
);
queue = await listReliabilityQueue<TestMutation>(userId, 20);
const seniorQueue = queue.filter((item) =>
  isLearningMutationForExam(item.payload, "senior-securities")
);
assert(
  seniorQueue.length === 1 &&
    seniorQueue[0]?.payload.kind === "upsert-favorite" &&
    seniorQueue[0]?.payload.resetGeneration === 0,
  "Restart must retain favorite mutations on their independent favorite generation.",
);
assert(
  queue.some((item) => item.payload.record?.questionId === "fx-47-trade-001"),
  "Securities restart must retain foreign-exchange mutations.",
);
assert(
  (await listReliabilityDeadLetters<TestMutation>(userId, 20)).length === 0,
  "Restart must remove stale learning and leaderboard dead letters.",
);

const offlineUserId = `${userId}-offline`;
await enqueueReliabilityMutation(
  offlineUserId,
  {
    ...entry("offline-favorite", "upsert-favorite", {
      examId: "senior-securities",
      resetGeneration: 0,
      record: { questionId: "investment-ch01-pdf-0003" },
    }),
    userId: offlineUserId,
  },
);
await applyLearningResetGeneration(
  offlineUserId,
  "senior-securities",
  2,
  "restart",
  2,
  1,
  "restart",
);
assert(
  (await listReliabilityQueue<TestMutation>(offlineUserId, 20)).length === 0,
  "A device that missed complete -> restart must drop pre-complete favorites via favorite generation.",
);

const root = process.cwd();
const read = (relativePath: string) =>
  readFile(path.join(root, relativePath), "utf8");
const [migration, correction, page, settings, practice, fxProgress, support, database] =
  await Promise.all([
    read("supabase/migrations/20260827032452_reset_safe_leaderboards_v96.sql"),
    read("supabase/migrations/20260827050500_reset_favorite_generation_v961.sql"),
    read("src/pages/LeaderboardPage.tsx"),
    read("src/components/SettingsPanel.tsx"),
    read("src/lib/practiceTime.ts"),
    read("src/lib/foreignExchangeProgress.ts"),
    read("src/components/ActivationSupport.tsx"),
    read("src/lib/db.ts"),
  ]);

for (const contract of [
  "user_learning_reset_state",
  "user_learning_reset_requests",
  "wrong_generation",
  "last_data_mode",
  "reset_learning_data_v96",
  "record_learning_attempts_batch_v96",
  "record_leaderboard_answer_events_batch_v96",
  "record_leaderboard_practice_event_v96",
  "get_learning_reset_state_v96",
  "guard_user_record_generation_v96",
  "leaderboard_unique_questions",
  "unique_answered",
  "stale learning generation",
  "practice time exceeds server elapsed-time budget",
]) {
  assert(migration.includes(contract), `Migration is missing ${contract}.`);
}
assert(
  migration.includes("revoke all on function public.reset_learning_data_v96") &&
    migration.includes("to authenticated, service_role"),
  "Reset RPC must revoke default execution and grant only signed-in/server callers.",
);
for (const contract of [
  "favorite_generation",
  "user_learning_delete_operations",
  "delete_user_learning_records_v961",
  "clear_user_record_tombstones_v961",
  "securitiesFavoriteGeneration",
  "foreignExchangeFavoriteGeneration",
  "operation_id already used for a different deletion",
  "revoke delete on table",
]) {
  assert(correction.includes(contract), `v96.1 migration is missing ${contract}.`);
}
assert(
  migration.includes("record_leaderboard_answer_events_batch_v75(jsonb)") &&
    migration.includes("from public, anon, authenticated") &&
    migration.includes("leaderboard_question_catalog_exam_id_check"),
  "Legacy ranking RPCs must be revoked and question scope must be canonical.",
);
assert(
  settings.includes("PENDING_RESET_REQUEST_KEY") &&
    settings.includes("getOrCreateResetRequestId") &&
    settings.includes("localCleanup: async"),
  "Reset retries must persist one request id until server and local cleanup both finish.",
);
assert(
  database.includes('"resetMarkers"') &&
    database.includes("stampedResetScope") &&
    database.includes("favoriteGeneration") &&
    database.includes("externalCleanupPending") &&
    database.includes('handoff?: Pick<SyncIntentRecord, "id" | "createdAt">') &&
    database.includes("id: handoff?.id ?? createMutationId()") &&
    database.includes("id: intent.id") &&
    database.includes('rpc("delete_user_learning_records_v961"') &&
    database.includes('{ kind: "upsert-wrong", record }'),
  "Reset markers, stable outbox operation ids, independent generations, and atomic destructive writes must stay enforced.",
);
assert(
  practice.includes("PENDING_CLOUD_PRACTICE_EVENT_KEY") &&
    practice.includes("JSON.stringify(event)") &&
    practice.includes("pausePracticeTimeWrites") &&
    practice.includes("resetLocalPracticeTime") &&
    practice.includes("record_leaderboard_practice_event_v96"),
  "Practice time must be idempotent and reset both total and pending values.",
);
assert(
  (migration.match(/pg_advisory_xact_lock\(hashtextextended/g) ?? []).length >= 6 &&
    migration.includes("delete from public.user_answer_records") &&
    migration.includes("delete from public.user_wrong_records") &&
    migration.includes("foreignExchangeGeneration"),
  "Reset and every ingestion path must share one lock and atomically clear both exam scopes.",
);
assert(
  fxProgress.includes('key.includes("quizpwa:fx-mock:v2:")'),
  "Foreign-exchange mock reset must target the actual scoped storage prefix.",
);
assert(
  !page.includes("學習榮耀榜") &&
    !page.includes("榮耀殿堂") &&
    page.includes("刷題大師") &&
    page.includes('className="leaderboard-v66-row metric-streak"') &&
    page.includes("V93ConfirmDialog") &&
    page.includes("busy={refreshing}") &&
    page.includes("entry.uniqueAnswered"),
  "Leaderboard layout must remove the old hero, add mastery, and keep streak rows minimal.",
);
assert(
  support.includes("mailto:aaron.kcts@gmail.com") &&
    support.includes("請勿寄送密碼或完整啟用碼"),
  "Activation support must expose the requested address without asking for secrets.",
);

console.log(
  "Reset generations, local outbox cleanup, three leaderboard categories, and activation support contracts passed.",
);
