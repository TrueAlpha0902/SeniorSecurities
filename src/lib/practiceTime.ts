import { supabase } from "./supabase";

const TOTAL_PRACTICE_SECONDS_KEY = "quizpwa:total-practice-seconds";
const PENDING_CLOUD_PRACTICE_SECONDS_KEY = "quizpwa:pending-cloud-practice-seconds";
export const PRACTICE_TIME_CHANGED = "practice-time:changed";

let flushingPracticeSeconds = false;
let lastFlushAttemptAt = 0;

function safeReadStorage(): Storage | undefined {
  if (typeof window === "undefined") return undefined;
  return window.localStorage;
}

function readNumber(key: string): number {
  const storage = safeReadStorage();
  if (!storage) return 0;
  const raw = storage.getItem(key);
  const value = raw ? Number(raw) : 0;
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : 0;
}

function writeNumber(key: string, value: number): void {
  const storage = safeReadStorage();
  if (!storage) return;
  storage.setItem(key, String(Math.max(0, Math.floor(value))));
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

export async function flushPracticeSecondsToCloud(force = false): Promise<void> {
  if (!supabase || flushingPracticeSeconds) return;

  const pendingSeconds = getPendingCloudPracticeSeconds();
  if (pendingSeconds <= 0) return;

  const now = Date.now();
  if (!force && pendingSeconds < 60 && now - lastFlushAttemptAt < 60_000) return;

  flushingPracticeSeconds = true;
  lastFlushAttemptAt = now;
  try {
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return;

    const { error } = await supabase.rpc("record_leaderboard_practice_seconds", {
      p_seconds: pendingSeconds,
    });
    if (error) {
      console.warn("Failed to sync practice seconds to leaderboard", error.message || error);
      return;
    }

    const latestPending = getPendingCloudPracticeSeconds();
    setPendingCloudPracticeSeconds(Math.max(0, latestPending - pendingSeconds));
  } catch (error) {
    console.warn("Failed to sync practice seconds to cloud", error);
  } finally {
    flushingPracticeSeconds = false;
  }
}

export function addPracticeSeconds(seconds: number): number {
  const storage = safeReadStorage();
  if (!storage || seconds <= 0) return getTotalPracticeSeconds();

  const safeSeconds = Math.floor(seconds);
  const next = getTotalPracticeSeconds() + safeSeconds;
  storage.setItem(TOTAL_PRACTICE_SECONDS_KEY, String(next));
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
  window.addEventListener("beforeunload", () => {
    void flushPracticeSecondsToCloud(true);
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") {
      void flushPracticeSecondsToCloud(true);
    }
  });
}
