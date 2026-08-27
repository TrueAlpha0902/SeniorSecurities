import { clearForeignExchangeProgress } from "./foreignExchangeProgress";
import type {
  LearningResetExamId,
  LearningResetMode,
} from "./learningResetGeneration";
import { resetLocalPracticeTime } from "./practiceTime";
import { getStudyPlanScopesForExam, localTodayKey } from "./studyPlan";
import { removeScopedStorageItem } from "./userScopedStorage";

export async function performLearningResetExternalCleanup(
  examId: LearningResetExamId,
  mode: LearningResetMode,
): Promise<void> {
  if (examId === "junior-foreign-exchange") {
    await clearForeignExchangeProgress(mode, { localOnly: true });
    return;
  }
  if (mode === "wrong") return;
  resetLocalPracticeTime();
  for (const scope of getStudyPlanScopesForExam("senior-securities")) {
    removeScopedStorageItem(
      `quizpwa:daily-plan:${scope.id}:${localTodayKey()}`,
    );
  }
}
