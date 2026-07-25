import { readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

const files = {
  primitives: "src/components/V93InteractionPrimitives.tsx",
  glassButton: "src/components/GlassButton.tsx",
  auth: "src/pages/AuthPage.tsx",
  forgot: "src/pages/ForgotPasswordPage.tsx",
  reset: "src/pages/ResetPasswordPage.tsx",
  activate: "src/pages/ActivatePage.tsx",
  account: "src/pages/AccountPage.tsx",
  search: "src/pages/SearchPage.tsx",
  random: "src/pages/RandomPracticePage.tsx",
  similar: "src/pages/SimilarQuestionsPage.tsx",
  leaderboard: "src/pages/LeaderboardPage.tsx",
  calculator: "src/components/CalculatorModal.tsx",
  settings: "src/components/SettingsPanel.tsx",
  theme: "src/styles/theme-v93.css",
  packageJson: "package.json",
} as const;

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([name, relativePath]) => [name, await read(relativePath)]),
  ),
) as Record<keyof typeof files, string>;

assert(
  sources.primitives.includes("export function V93InlineNotice")
    && sources.primitives.includes("export function V93PasswordField")
    && sources.primitives.includes("export function V93ConfirmDialog")
    && sources.primitives.includes("useDialogFocusTrap"),
  "v93 learner flows require coordinated notices, password fields, and focus-trapped confirmations.",
);

assert(
  sources.glassButton.includes("forwardRef")
    && sources.glassButton.includes("busy?: boolean")
    && sources.glassButton.includes('aria-busy={busy || undefined}')
    && sources.glassButton.includes('data-busy={busy ? "true" : undefined}'),
  "GlassButton must expose a visible and accessible busy state.",
);

const nativeDialogTargets = [
  files.auth,
  files.forgot,
  files.reset,
  files.activate,
  files.account,
  files.search,
  files.random,
  files.similar,
  files.leaderboard,
  files.calculator,
  files.settings,
];

for (const relativePath of nativeDialogTargets) {
  const source = await read(relativePath);
  assert(
    !source.includes("window.alert(") && !source.includes("window.confirm("),
    `${relativePath} must not use blocking browser alert/confirm dialogs.`,
  );
}

assert(
  sources.auth.includes("V93PasswordField")
    && sources.auth.includes("announceInteractionFeedback")
    && sources.auth.includes("busy={submitting}")
    && sources.auth.includes('role="tab"'),
  "Authentication must expose password visibility, busy states, and announced feedback.",
);
assert(
  sources.forgot.includes("V93InlineNotice")
    && sources.forgot.includes("busy={submitting}")
    && sources.forgot.includes("announceInteractionFeedback"),
  "Forgot-password flow must expose progress and non-silent success/error feedback.",
);
assert(
  sources.reset.includes("V93PasswordField")
    && sources.reset.includes("redirecting")
    && sources.reset.includes("window.clearTimeout")
    && sources.reset.includes("busy={submitting || redirecting}"),
  "Password reset must validate both fields, clean up redirect timers, and show progress.",
);
assert(
  sources.activate.includes("V93InlineNotice")
    && sources.activate.includes("busy={submitting}")
    && sources.activate.includes("normalizedCode")
    && sources.activate.includes("announceInteractionFeedback"),
  "Activation must normalize codes and provide announced loading/success/error states.",
);
assert(
  sources.account.includes("V93InlineNotice")
    && sources.account.includes("announceInteractionFeedback")
    && sources.account.includes("busy={syncBusy}")
    && sources.account.includes("busy={busy}"),
  "Account sync and logout must have visible busy and feedback states.",
);
assert(
  sources.search.includes("v93-search-clear")
    && sources.search.includes("searchRevision")
    && sources.search.includes("尚未開通可搜尋的題庫")
    && sources.search.includes('role="status"'),
  "Search must support clear, retry, entitlement guidance, and result status feedback.",
);
assert(
  sources.random.includes("V93ConfirmDialog")
    && sources.random.includes("deleteConfirmationOpen")
    && sources.random.includes("operationError")
    && sources.random.includes("busy={startingBankId === bank.bankId}")
    && sources.random.includes("announceInteractionFeedback"),
  "Mock-exam builder must replace native dialogs and expose start/delete feedback.",
);
assert(
  sources.similar.includes("V93InlineNotice")
    && sources.similar.includes("catch (reason)")
    && sources.similar.includes("busy={savingAttempt}")
    && sources.similar.includes("aria-pressed={selectedBankId")
    && sources.similar.includes("announceInteractionFeedback"),
  "Similar-question comparison must catch persistence errors and expose filter/save state.",
);
assert(
  sources.leaderboard.includes("V93ConfirmDialog")
    && sources.leaderboard.includes("removeAvatarConfirmationOpen")
    && sources.leaderboard.includes('role="tab"')
    && sources.leaderboard.includes('aria-selected={activeTab')
    && sources.leaderboard.includes("busy={refreshing}")
    && sources.leaderboard.includes("announceInteractionFeedback"),
  "Leaderboard must use accessible tabs, busy refresh, and custom avatar confirmation.",
);
assert(
  sources.calculator.includes("useDialogFocusTrap")
    && sources.calculator.includes('id="floating-calculator-result"')
    && sources.calculator.includes('role={error ? "alert" : "status"}')
    && sources.calculator.includes("calculatorKeyAriaLabel")
    && sources.calculator.includes('aria-expanded={historyOpen}')
    && sources.calculator.includes("announceInteractionFeedback"),
  "Calculator must expose keyboard labels, result announcements, mobile focus trapping, and history state.",
);
assert(
  sources.settings.includes("V93InlineNotice")
    && sources.settings.includes('role="tablist"')
    && sources.settings.includes('role="tab"')
    && sources.settings.includes("busy={clearing}")
    && sources.settings.includes("operationError")
    && sources.settings.includes("announceInteractionFeedback"),
  "Settings must provide tab semantics and visible feedback for toggles, plans, and data reset.",
);

for (const token of [
  ".v93-button-spinner",
  ".v93-inline-notice",
  ".v93-password-control",
  ".v93-confirm-backdrop",
  ".v93-confirm-dialog",
  ".v93-search-clear",
]) {
  assert(sources.theme.includes(token), `v93 learner-flow CSS is missing ${token}.`);
}

const packageJson = JSON.parse(sources.packageJson) as {
  scripts?: Record<string, string>;
};
assert(
  packageJson.scripts?.["test:v93-flows"] ===
    "tsx scripts/test-v93-learner-flow-contracts.ts",
  "package.json is missing test:v93-flows.",
);
assert(
  packageJson.scripts?.verify?.includes("npm run test:v93-flows"),
  "npm run verify must include the v93 learner-flow contract.",
);

console.log(
  "v93 learner-flow contracts passed: auth, activation, account, search, "
    + "mock exam, similar questions, leaderboard, calculator, and settings feedback active.",
);
