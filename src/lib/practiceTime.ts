import { supabase } from "./supabase";
import {
  getLearningResetGeneration,
  isStaleLearningGenerationError,
  LEARNING_RESET_APPLIED_EVENT,
  synchronizeLearningResetGeneration,
} from "./learningResetGeneration";
import { createUuid } from "./uuid";
import {
  getActiveUserStorageScope,
  readScopedStorageItem,
  removeScopedStorageItem,
  writeScopedStorageItem,
} from "./userScopedStorage";

const TOTAL_PRACTICE_SECONDS_KEY = "quizpwa:total-practice-seconds";
const PENDING_CLOUD_PRACTICE_SECONDS_KEY = "quizpwa:pending-cloud-practice-seconds";
const PENDING_CLOUD_PRACTICE_EVENT_KEY = "quizpwa:pending-cloud-practice-event";
export const PRACTICE_TIME_CHANGED = "practice-time:changed";

let activePracticeFlush: Promise<void> | null = null;
let lastFlushAttemptAt = 0;
let practiceWritePauseDepth = 0;

type PendingPracticeEvent = {
  eventId: string;
  seconds: number;
};

function readNumber(key: string): number {
  const raw = readScopedStorageItem(key);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function writeNumber(key: string, value: number): void {
  writeScopedStorageItem(key, String(Math.max(0, Math.floor(value))));
}

export function getTotalPracticeSeconds(): number {
  return readNumber(TOTAL_PRACTICE_SECONDS_KEY);
}

function getPendingCloudPracticeSeconds(): number {
  return readNumber(PENDING_CLOUD_PRACTICE_SECONDS_KEY);
}

function setPendingCloudPracticeSeconds(seconds: number): void {
  writeNumber(PENDING_CLOUD_PRACTICE_SECONDS_KEY, seconds);
}

function getOrCreatePendingPracticeEvent(pendingSeconds: number): PendingPracticeEvent {
  const existing = readScopedStorageItem(PENDING_CLOUD_PRACTICE_EVENT_KEY);
  if (existing) {
    try {
      const parsed = JSON.parse(existing) as Partial<PendingPracticeEvent>;
      const seconds = Math.min(60, Math.max(0, Math.trunc(Number(parsed.seconds))));
      if (typeof parsed.eventId === "string" && parsed.eventId && seconds > 0) {
        const event = { eventId: parsed.eventId, seconds };
        writeScopedStorageItem(PENDING_CLOUD_PRACTICE_EVENT_KEY, JSON.stringify(event));
        return event;
      }
    } catch {
      // v96 previews briefly stored only the UUID; preserve it with a fixed snapshot.
      if (existing.trim()) {
        const migrated = {
          eventId: existing.trim(),
          seconds: Math.min(60, pendingSeconds),
        };
        writeScopedStorageItem(PENDING_CLOUD_PRACTICE_EVENT_KEY, JSON.stringify(migrated));
        return migrated;
      }
    }
  }
  const event = { eventId: createUuid(), seconds: Math.min(60, pendingSeconds) };
  writeScopedStorageItem(PENDING_CLOUD_PRACTICE_EVENT_KEY, JSON.stringify(event));
  return event;
}

export function flushPracticeSecondsToCloud(
  force = false,
  allowWhilePaused = false,
): Promise<void> {
  if (!supabase) return Promise.resolve();
  if (practiceWritePauseDepth > 0 && !allowWhilePaused) return Promise.resolve();
  if (activePracticeFlush) return activePracticeFlush;

  const pendingSeconds = getPendingCloudPracticeSeconds();
  if (pendingSeconds <= 0) return Promise.resolve();

  const now = Date.now();
  if (!force && pendingSeconds < 60 && now - lastFlushAttemptAt < 60_000) {
    return Promise.resolve();
  }

  lastFlushAttemptAt = now;
  const event = getOrCreatePendingPracticeEvent(pendingSeconds);
  const flush = (async () => {
    let currentUserId: string | null = null;
    try {
      const { data: userData } = await supabase.auth.getUser();
      const userId = userData.user?.id;
      if (!userId) return;
      currentUserId = userId;
      if (getActiveUserStorageScope() !== `user:${userId}`) return;
      const generation = await getLearningResetGeneration(
        userId,
        "senior-securities",
      );

      const { error } = await supabase.rpc(
        "record_leaderboard_practice_event_v96",
        {
          p_exam_id: "senior-securities",
          p_generation: generation,
          p_event_id: event.eventId,
          p_seconds: event.seconds,
        },
      );
      if (error) throw error;

      const latestPending = getPendingCloudPracticeSeconds();
      setPendingCloudPracticeSeconds(Math.max(0, latestPending - event.seconds));
      removeScopedStorageItem(PENDING_CLOUD_PRACTICE_EVENT_KEY);
    } catch (error) {
      if (isStaleLearningGenerationError(error) && currentUserId) {
        const synchronized = await synchronizeLearningResetGeneration(
          currentUserId,
          "senior-securities",
          true,
        );
        if (synchronized.dataChanged) {
          resetLocalPracticeTime();
        }
        return;
      }
      console.warn("Failed to sync practice seconds to cloud", error);
    }
  })().finally(() => {
    if (activePracticeFlush === flush) activePracticeFlush = null;
  });
  activePracticeFlush = flush;
  return flush;
}

export async function waitForActivePracticeSecondsFlush(): Promise<void> {
  if (activePracticeFlush) await activePracticeFlush;
}

export function pausePracticeTimeWrites(): void {
  practiceWritePauseDepth += 1;
}

export function resumePracticeTimeWrites(): void {
  practiceWritePauseDepth = Math.max(0, practiceWritePauseDepth - 1);
}

export function resetLocalPracticeTime(): void {
  writeNumber(TOTAL_PRACTICE_SECONDS_KEY, 0);
  writeNumber(PENDING_CLOUD_PRACTICE_SECONDS_KEY, 0);
  removeScopedStorageItem(PENDING_CLOUD_PRACTICE_EVENT_KEY);
  if (typeof window !== "undefined") {
    window.dispatchEvent(
      new CustomEvent(PRACTICE_TIME_CHANGED, { detail: { seconds: 0 } }),
    );
  }
}

export function addPracticeSeconds(seconds: number): number {
  if (typeof window === "undefined" || seconds <= 0) return getTotalPracticeSeconds();
  if (practiceWritePauseDepth > 0) return getTotalPracticeSeconds();

  const safeSeconds = Math.floor(seconds);
  const next = getTotalPracticeSeconds() + safeSeconds;
  writeNumber(TOTAL_PRACTICE_SECONDS_KEY, next);
  setPendingCloudPracticeSeconds(getPendingCloudPracticeSeconds() + safeSeconds);
  window.dispatchEvent(new CustomEvent(PRACTICE_TIME_CHANGED, { detail: { seconds: next } }));

  if (getPendingCloudPracticeSeconds() >= 60) {
    void flushPracticeSecondsToCloud(false);
  }

  return next;
}

export function formatTotalPracticeTime(totalSeconds: number): string {
  const safeSeconds = Math.max(0, Math.floor(totalSeconds));
  const hours = Math.floor(safeSeconds / 3600);
  const minutes = Math.floor((safeSeconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours} 小時 ${minutes} 分`;
  if (hours > 0) return `${hours} 小時`;
  if (minutes > 0) return `${minutes} 分`;
  return "0 分";
}

if (typeof window !== "undefined") {
  window.addEventListener(LEARNING_RESET_APPLIED_EVENT, (event) => {
    const detail = (event as CustomEvent<{
      examId?: string;
      dataChanged?: boolean;
    }>).detail;
    if (detail?.examId === "senior-securities" && detail.dataChanged) {
      resetLocalPracticeTime();
    }
  });
  window.addEventListener("beforeunload", () => {
    void flushPracticeSecondsToCloud(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushPracticeSecondsToCloud(true);
    }
  });
}
