import { readScopedStorageItem, writeScopedStorageItem } from "./userScopedStorage";
import {
  FOREIGN_EXCHANGE_MAX_SESSION,
  isForeignExchangeSession,
  type ForeignExchangeSession,
} from "./foreignExchange";

const DEFAULT_SESSION_KEY = "quizpwa:fx-default-session";
const INCLUDE_LEGACY_RANDOM_KEY = "quizpwa:fx-include-legacy-random";

export const FOREIGN_EXCHANGE_SETTINGS_CHANGED = "quizpwa:foreign-exchange-settings-changed";

export type ForeignExchangeSettings = {
  defaultSession: ForeignExchangeSession;
  includeLegacyInRandom: boolean;
};

export function getForeignExchangeSettings(): ForeignExchangeSettings {
  const storedSession = Number(readScopedStorageItem(DEFAULT_SESSION_KEY, false));
  return {
    defaultSession: isForeignExchangeSession(storedSession)
      ? storedSession
      : FOREIGN_EXCHANGE_MAX_SESSION,
    includeLegacyInRandom:
      readScopedStorageItem(INCLUDE_LEGACY_RANDOM_KEY, false) === "true",
  };
}

export function setForeignExchangeSettings(
  value: ForeignExchangeSettings,
): void {
  writeScopedStorageItem(DEFAULT_SESSION_KEY, String(value.defaultSession));
  writeScopedStorageItem(
    INCLUDE_LEGACY_RANDOM_KEY,
    value.includeLegacyInRandom ? "true" : "false",
  );
  window.dispatchEvent(
    new CustomEvent<ForeignExchangeSettings>(FOREIGN_EXCHANGE_SETTINGS_CHANGED, {
      detail: value,
    }),
  );
}
