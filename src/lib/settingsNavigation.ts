import type { StudyPlanExamId } from "./studyPlan";

export const OPEN_SETTINGS_EVENT = "app:open-settings";

export type SettingsSectionTarget = "general" | "plans" | "data";

export type OpenSettingsDetail = {
  section?: SettingsSectionTarget;
  planExamId?: StudyPlanExamId;
};

export function openSettings(detail: OpenSettingsDetail = {}): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent<OpenSettingsDetail>(OPEN_SETTINGS_EVENT, { detail }));
}

export function openStudyPlanSettings(planExamId?: StudyPlanExamId): void {
  openSettings({ section: "plans", planExamId });
}
