const ANSWER_MODE_ENABLED_KEY = "quizpwa:answer-mode-enabled";
const AUTO_NEXT_CORRECT_ENABLED_KEY = "quizpwa:auto-next-correct-enabled";
const SETTINGS_DEFAULTS_VERSION_KEY = "quizpwa:settings-defaults-version";
const SETTINGS_DEFAULTS_VERSION = "2026-07-06-default-off-v1";

export const ANSWER_MODE_SETTING_CHANGED = "quizpwa:answer-mode-setting-changed";
export const AUTO_NEXT_CORRECT_SETTING_CHANGED = "quizpwa:auto-next-correct-setting-changed";

function ensureSettingsDefaultsInitialized(): void {
  if (typeof window === "undefined") return;

  const currentVersion = window.localStorage.getItem(SETTINGS_DEFAULTS_VERSION_KEY);
  if (currentVersion === SETTINGS_DEFAULTS_VERSION) return;

  window.localStorage.setItem(ANSWER_MODE_ENABLED_KEY, "false");
  window.localStorage.setItem(AUTO_NEXT_CORRECT_ENABLED_KEY, "false");
  window.localStorage.setItem(SETTINGS_DEFAULTS_VERSION_KEY, SETTINGS_DEFAULTS_VERSION);
}

export function getAnswerModeEnabled(): boolean {
  if (typeof window === "undefined") return false;
  ensureSettingsDefaultsInitialized();
  return window.localStorage.getItem(ANSWER_MODE_ENABLED_KEY) === "true";
}

export function setAnswerModeEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  ensureSettingsDefaultsInitialized();
  window.localStorage.setItem(ANSWER_MODE_ENABLED_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new CustomEvent<{ enabled: boolean }>(ANSWER_MODE_SETTING_CHANGED, { detail: { enabled } }));
}

export function getAutoNextCorrectEnabled(): boolean {
  if (typeof window === "undefined") return false;
  ensureSettingsDefaultsInitialized();
  return window.localStorage.getItem(AUTO_NEXT_CORRECT_ENABLED_KEY) === "true";
}

export function setAutoNextCorrectEnabled(enabled: boolean): void {
  if (typeof window === "undefined") return;
  ensureSettingsDefaultsInitialized();
  window.localStorage.setItem(AUTO_NEXT_CORRECT_ENABLED_KEY, enabled ? "true" : "false");
  window.dispatchEvent(new CustomEvent<{ enabled: boolean }>(AUTO_NEXT_CORRECT_SETTING_CHANGED, { detail: { enabled } }));
}
