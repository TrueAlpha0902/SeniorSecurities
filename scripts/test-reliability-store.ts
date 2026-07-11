import "fake-indexeddb/auto";
import {
  countReliabilityDeadLetters,
  countReliabilityQueue,
  enqueueReliabilityMutation,
  listDueReliabilityQueue,
  listReliabilityDeadLetters,
  loadReliabilityLearningData,
  moveReliabilityQueueEntryToDeadLetter,
  persistReliabilityLearningUpdate,
  retryReliabilityDeadLetters,
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
const learningA = await loadReliabilityLearningData<
  { questionId: string },
  { eventId: string }
>(userA);
const learningB = await loadReliabilityLearningData<
  { questionId: string },
  { eventId: string }
>(userB);
assert(
  learningA.states.length === 3500,
  "All 3,500 learning states must persist without localStorage quota loss.",
);
assert(
  learningA.attempts.length === 1200,
  "Attempt retention must be bounded to 1,200 rows.",
);
assert(
  learningB.states.length === 0,
  "Learning state must be isolated by user.",
);

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
await enqueueReliabilityMutation(userA, {
  ...first,
  id: "queue-2",
  payload: { value: 2 },
});
assert(
  (await countReliabilityQueue(userA)) === 1,
  "Coalesced mutations must replace older entries.",
);
const due = await listDueReliabilityQueue<{ value: number }>(
  userA,
  new Date(Date.now() + 1000).toISOString(),
);
assert(
  due[0]?.payload.value === 2,
  "The newest coalesced mutation must be retained.",
);
await moveReliabilityQueueEntryToDeadLetter(userA, due[0]!);
assert(
  (await countReliabilityQueue(userA)) === 0,
  "Dead-letter transfer must remove queue entry atomically.",
);
assert(
  (await countReliabilityDeadLetters(userA)) === 1,
  "Dead-letter row must persist for diagnostics.",
);
const failedRows = await listReliabilityDeadLetters<{ value: number }>(userA);
assert(
  failedRows[0]?.payload.value === 2,
  "Dead-letter diagnostics must retain the failed payload.",
);
assert(
  (await retryReliabilityDeadLetters(userA)) === 1,
  "Dead-letter recovery must report the number of retried events.",
);
assert(
  (await countReliabilityDeadLetters(userA)) === 0 &&
    (await countReliabilityQueue(userA)) === 1,
  "Retrying a dead letter must atomically return it to the queue.",
);
const retried = await listDueReliabilityQueue<{ value: number }>(
  userA,
  new Date(Date.now() + 1000).toISOString(),
);
assert(
  retried[0]?.attemptCount === 0 && retried[0]?.lastError === null,
  "Retried events must reset their backoff state.",
);

const atomicUser = `test-atomic-${Date.now()}`;
const atomicNow = new Date().toISOString();
const atomicQueueEntry: ReliabilityQueueEntry<{ kind: string }> = {
  id: "atomic-queue-1",
  userId: atomicUser,
  createdAt: atomicNow,
  updatedAt: atomicNow,
  coalesceKey: "learning:atomic-event",
  attemptCount: 0,
  nextAttemptAt: atomicNow,
  lastError: null,
  payload: { kind: "sync-learning-attempt" },
};
await persistReliabilityLearningUpdate(
  atomicUser,
  { questionId: "atomic-question", nextReviewAt: atomicNow },
  { eventId: "atomic-event", answeredAt: atomicNow },
  1200,
  [atomicQueueEntry],
);
const atomicLearning = await loadReliabilityLearningData<
  { questionId: string },
  { eventId: string }
>(atomicUser);
assert(
  atomicLearning.states.length === 1,
  "Atomic learning transaction must persist state.",
);
assert(
  atomicLearning.attempts.length === 1,
  "Atomic learning transaction must persist attempt.",
);
assert(
  (await countReliabilityQueue(atomicUser)) === 1,
  "Atomic learning transaction must persist its cloud outbox entry.",
);

console.log(
  "Reliability store 3,500-row capacity, isolation, atomic outbox, coalescing and dead-letter tests passed.",
);
