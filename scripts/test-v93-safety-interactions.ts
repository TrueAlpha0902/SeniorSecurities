import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

async function listSourceFiles(directory: string): Promise<string[]> {
  const absolute = path.join(root, directory);
  const entries = await readdir(absolute, { withFileTypes: true });
  const files: string[] = [];
  for (const entry of entries) {
    const relative = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listSourceFiles(relative));
    else if (/\.(?:ts|tsx)$/.test(entry.name)) files.push(relative);
  }
  return files;
}

const sourceFiles = await listSourceFiles("src");
const browserDialogViolations: string[] = [];
for (const relativePath of sourceFiles) {
  const source = await read(relativePath);
  if (/\bwindow\.(?:alert|confirm|prompt)\s*\(/.test(source)) {
    browserDialogViolations.push(relativePath);
  }
}
assert(
  browserDialogViolations.length === 0,
  `Blocking browser dialogs remain in: ${browserDialogViolations.join(", ")}`,
);

const files = {
  primitives: "src/components/V93InteractionPrimitives.tsx",
  focusTrap: "src/hooks/useDialogFocusTrap.ts",
  quiz: "src/pages/ImageQuizPage.tsx",
  adminTools: "src/components/AdminToolsPanel.tsx",
  admin: "src/pages/AdminPage.tsx",
  mockE2e: "tests/e2e/mock-exam-flow.spec.ts",
  packageJson: "package.json",
} as const;

const sources = Object.fromEntries(
  await Promise.all(
    Object.entries(files).map(async ([name, relativePath]) => [name, await read(relativePath)]),
  ),
) as Record<keyof typeof files, string>;

assert(
  sources.primitives.includes('role="alertdialog"')
    && sources.primitives.includes("useDialogFocusTrap")
    && sources.primitives.includes("busy={busy}")
    && sources.focusTrap.includes("previousFocus?.focus"),
  "V93 confirmations must trap focus, lock while busy, and restore prior focus.",
);

assert(
  sources.quiz.includes("V93ConfirmDialog")
    && sources.quiz.includes("V93InlineNotice")
    && sources.quiz.includes("exitConfirmationOpen")
    && sources.quiz.includes("submitConfirmationOpen")
    && sources.quiz.includes("requestQuizNavigation")
    && sources.quiz.includes('announceInteractionFeedback(T.answerSaving, "warning"')
    && sources.quiz.includes("busy={submissionPending}"),
  "Quiz navigation, answer saves, exit settlement, and submission need visible non-blocking feedback.",
);
assert(
  !sources.quiz.includes("window.alert(") && !sources.quiz.includes("window.confirm("),
  "ImageQuizPage must not reintroduce native alert/confirm dialogs.",
);

assert(
  sources.adminTools.includes("V93ConfirmDialog")
    && sources.adminTools.includes("pendingDeleteCode")
    && sources.adminTools.includes("pendingAdminAction")
    && sources.adminTools.includes("requestDeleteCode")
    && sources.adminTools.includes("requestRun")
    && sources.adminTools.includes("announceInteractionFeedback")
    && sources.adminTools.includes("V93InlineNotice"),
  "Admin tools require custom confirmations and announced operation results.",
);

assert(
  sources.admin.includes("V93ConfirmDialog")
    && sources.admin.includes("pendingConfirmation")
    && sources.admin.includes("requestUserAction")
    && sources.admin.includes("requestDeleteLeaderboardEntry")
    && sources.admin.includes("announceInteractionFeedback")
    && sources.admin.includes("V93InlineNotice"),
  "Admin user, device, entitlement, and leaderboard actions require a single safe confirmation flow.",
);

assert(
  !sources.mockE2e.includes('page.on("dialog"')
    && sources.mockE2e.includes('getByRole("alertdialog", { name: "確認交卷" })')
    && sources.mockE2e.includes('getByRole("button", { name: "確認交卷" })'),
  "Mock-exam E2E must validate the custom submission confirmation instead of accepting browser dialogs.",
);

const packageJson = JSON.parse(sources.packageJson) as {
  scripts?: Record<string, string>;
};
assert(
  packageJson.scripts?.["test:v93-safety"] ===
    "tsx scripts/test-v93-safety-interactions.ts",
  "package.json is missing test:v93-safety.",
);
assert(
  packageJson.scripts?.verify?.includes("npm run test:v93-safety"),
  "npm run verify must include the v93 safety-interaction contract.",
);

console.log(
  `v93 safety interaction contracts passed: ${sourceFiles.length} source files contain zero `
    + "blocking browser dialogs; quiz and administration confirmations use accessible feedback.",
);
