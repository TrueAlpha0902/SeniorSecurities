import assert from "node:assert/strict";
import {
  getAnswerModeEnabled,
  getMockExamDeferredFeedbackEnabled,
  setAnswerModeEnabled,
  setMockExamDeferredFeedbackEnabled,
} from "../src/lib/appSettings";
import {
  clearScopedStorageByPrefix,
  readScopedStorageItem,
  removeScopedStorageItem,
  scopedStorageKey,
  setActiveUserStorageScope,
  writeScopedStorageItem,
} from "../src/lib/userScopedStorage";

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>();

  get length(): number {
    return this.values.size;
  }

  clear(): void {
    this.values.clear();
  }

  getItem(key: string): string | null {
    return this.values.get(key) ?? null;
  }

  key(index: number): string | null {
    return Array.from(this.values.keys())[index] ?? null;
  }

  removeItem(key: string): void {
    this.values.delete(key);
  }

  setItem(key: string, value: string): void {
    this.values.set(key, String(value));
  }
}

function installWindow(storage: Storage): void {
  Object.defineProperty(globalThis, "window", {
    configurable: true,
    value: {
      localStorage: storage,
      dispatchEvent: () => true,
    },
  });
}

const storage = new MemoryStorage();
installWindow(storage);

setActiveUserStorageScope("user-a");
writeScopedStorageItem("quizpwa:exam-date", "2026-07-30");
assert.equal(readScopedStorageItem("quizpwa:exam-date"), "2026-07-30");
assert.ok(scopedStorageKey("quizpwa:exam-date").includes("user:user-a"));

setActiveUserStorageScope("user-b");
assert.equal(readScopedStorageItem("quizpwa:exam-date"), null);
writeScopedStorageItem("quizpwa:exam-date", "2026-08-15");
assert.equal(readScopedStorageItem("quizpwa:exam-date"), "2026-08-15");

setActiveUserStorageScope("user-a");
assert.equal(readScopedStorageItem("quizpwa:exam-date"), "2026-07-30");

writeScopedStorageItem("quizpwa:daily-plan:2026-07-11", "plan-a");
writeScopedStorageItem("quizpwa:daily-plan:2026-07-12", "plan-b");
clearScopedStorageByPrefix("quizpwa:daily-plan:");
assert.equal(readScopedStorageItem("quizpwa:daily-plan:2026-07-11", false), null);
assert.equal(readScopedStorageItem("quizpwa:daily-plan:2026-07-12", false), null);

removeScopedStorageItem("quizpwa:exam-date");
assert.equal(readScopedStorageItem("quizpwa:exam-date", false), null);

const legacyStorage = new MemoryStorage();
legacyStorage.setItem("quizpwa:total-practice-seconds", "3600");
installWindow(legacyStorage);
setActiveUserStorageScope("legacy-owner");
assert.equal(readScopedStorageItem("quizpwa:total-practice-seconds"), "3600");
assert.equal(legacyStorage.getItem("quizpwa:total-practice-seconds"), null);

setActiveUserStorageScope("different-user");
assert.equal(readScopedStorageItem("quizpwa:total-practice-seconds"), null);

const settingsStorage = new MemoryStorage();
installWindow(settingsStorage);
setActiveUserStorageScope("settings-user");

assert.equal(
  getAnswerModeEnabled(),
  false,
  "Global answer mode must default to off.",
);

setAnswerModeEnabled(true);
assert.equal(
  getAnswerModeEnabled(),
  true,
  "The one answer-mode switch must enable ordinary practice across all question banks.",
);

setMockExamDeferredFeedbackEnabled(true);
assert.equal(
  getMockExamDeferredFeedbackEnabled(),
  true,
  "Mock-exam deferred grading must remain enabled independently.",
);
assert.equal(
  getAnswerModeEnabled(),
  true,
  "Mock-exam feedback settings must not mutate practice answer mode.",
);

setAnswerModeEnabled(false);
assert.equal(getAnswerModeEnabled(), false);

console.log(
  "User-scoped storage isolation, migration, and single-switch answer-mode tests passed.",
);
