import "fake-indexeddb/auto";
import {
  countReliabilityDeadLetters,
  countReliabilityQueue,
  enqueueReliabilityMutation,
  listDueReliabilityQueue,
  loadReliabilityLearningData,
  moveReliabilityQueueEntryToDeadLetter,
  persistReliabilityLearningUpdate,
  type ReliabilityQueueEntry,
} from "../src/lib/reliabilityStore";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const userA = `test-a-${Date.now()}`;
const userB = `test-b-${Date.now()}`;
for (let index = 0; index < 3500; index += 1) {
  const answeredAt = new Date(Date.UTC(2026, 0, 1, 0, 0, index)).toISOString();
  await persistReliabilityLearningUpdate(
    userA,
    { questionId: `q-${index}`, nextReviewAt: answeredAt },
    { eventId: `e-${index}`, answeredAt },
    1200,
  );
}
const learningA = await loadReliabilityLearningData<{ questionId: string }, { eventId: string }>(userA);
const learningB = await loadReliabilityLearningData<{ questionId: string }, { eventId: string }>(userB);
assert(learningA.states.length === 3500, "All 3,500 learning states must persist without localStorage quota loss.");
assert(learningA.attempts.length === 1200, "Attempt retention must be bounded to 1,200 rows.");
assert(learningB.states.length === 0, "Learning state must be isolated by user.");

const now = new Date().toISOString();
const first: ReliabilityQueueEntry<{ value: number }> = {
  id: "queue-1",
  userId: userA,
  createdAt: now,
  updatedAt: now,
  coalesceKey: "answer:q-1",
  attemptCount: 0,
  nextAttemptAt: now,
  lastError: null,
  payload: { value: 1 },
};
await enqueueReliabilityMutation(userA, first);
await enqueueReliabilityMutation(userA, { ...first, id: "queue-2", payload: { value: 2 } });
assert(await countReliabilityQueue(userA) === 1, "Coalesced mutations must replace older entries.");
const due = await listDueReliabilityQueue<{ value: number }>(userA, new Date(Date.now() + 1000).toISOString());
assert(due[0]?.payload.value === 2, "The newest coalesced mutation must be retained.");
await moveReliabilityQueueEntryToDeadLetter(userA, due[0]!);
assert(await countReliabilityQueue(userA) === 0, "Dead-letter transfer must remove queue entry atomically.");
assert(await countReliabilityDeadLetters(userA) === 1, "Dead-letter row must persist for diagnostics.");

console.log("Reliability store 3,500-row capacity, isolation, coalescing and dead-letter tests passed.");
