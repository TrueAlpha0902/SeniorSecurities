import { readScopedStorageItem, writeScopedStorageItem } from "./userScopedStorage";

export type RecentExamActivity = {
  examId: "senior-securities" | "junior-foreign-exchange";
  path: string;
  label: string;
  updatedAt: string;
};

const STORAGE_KEY = "quizpwa:recent-exam-activity:v1";

function parseActivities(value: string | null): RecentExamActivity[] {
  if (!value) return [];
  try {
    const parsed = JSON.parse(value) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is RecentExamActivity => {
      if (!item || typeof item !== "object") return false;
      const candidate = item as Partial<RecentExamActivity>;
      return (
        (candidate.examId === "senior-securities" || candidate.examId === "junior-foreign-exchange") &&
        typeof candidate.path === "string" && candidate.path.startsWith("/") &&
        typeof candidate.label === "string" && candidate.label.trim().length > 0 &&
        typeof candidate.updatedAt === "string"
      );
    });
  } catch {
    return [];
  }
}

export function listRecentExamActivities(): RecentExamActivity[] {
  return parseActivities(readScopedStorageItem(STORAGE_KEY, false));
}

export function getRecentExamActivity(
  examId: RecentExamActivity["examId"],
): RecentExamActivity | null {
  return listRecentExamActivities().find((activity) => activity.examId === examId) ?? null;
}

export function recordRecentExamActivity(activity: Omit<RecentExamActivity, "updatedAt">): void {
  const current = listRecentExamActivities().filter((item) => item.examId !== activity.examId);
  current.unshift({ ...activity, updatedAt: new Date().toISOString() });
  writeScopedStorageItem(STORAGE_KEY, JSON.stringify(current.slice(0, 4)));
}
