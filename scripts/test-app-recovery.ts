import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { isChunkLoadError } from "../src/lib/appRecovery";

function expect(value: boolean, expected: boolean, label: string): void {
  if (value !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${value}`);
  }
}

function assertIncludes(source: string, fragment: string, message: string): void {
  if (!source.includes(fragment)) throw new Error(message);
}

const chunkErrors = [
  new Error("Failed to fetch dynamically imported module: /assets/HomePage-old.js"),
  new Error("Importing a module script failed."),
  new Error("Loading chunk 42 failed"),
  new Error("ChunkLoadError: Loading chunk 8 failed"),
  new Error("Unable to preload CSS for /assets/HomePage-old.css"),
];

for (const error of chunkErrors) {
  expect(isChunkLoadError(error), true, error.message);
}

expect(isChunkLoadError(new Error("Supabase request failed")), false, "ordinary API error");
expect(isChunkLoadError("ordinary validation error"), false, "ordinary validation error");

const circular: { self?: unknown } = {};
circular.self = circular;
expect(isChunkLoadError(circular), false, "circular non-chunk object");

const recoverySource = readFileSync(resolve(process.cwd(), "src/lib/appRecovery.ts"), "utf8");
const noticeSource = readFileSync(resolve(process.cwd(), "src/components/AppUpdateNotice.tsx"), "utf8");
assertIncludes(recoverySource, "applyAppUpdateAndReload", "App updates must use the bounded reload helper.");
assertIncludes(recoverySource, "Promise.race", "App update activation must not wait forever for a service worker.");
assertIncludes(recoverySource, "window.location.reload()", "App update activation must always finish with a page reload.");
assertIncludes(noticeSource, "applyAppUpdateAndReload", "The update button must invoke the reliable update helper.");
assertIncludes(noticeSource, "更新中…", "The update button must provide immediate click feedback.");

console.log("App recovery error detection and update activation tests passed.");
