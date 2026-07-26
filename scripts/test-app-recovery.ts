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
  new TypeError(
    'Failed to load module script: Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".',
  ),
  new TypeError('Expected a JavaScript-or-Wasm module script but the server responded with a MIME type of "text/html".'),
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
const boundarySource = readFileSync(resolve(process.cwd(), "src/components/AppErrorBoundary.tsx"), "utf8");
const mainSource = readFileSync(resolve(process.cwd(), "src/main.tsx"), "utf8");
const noticeSource = readFileSync(resolve(process.cwd(), "src/components/AppUpdateNotice.tsx"), "utf8");
const vercel = JSON.parse(readFileSync(resolve(process.cwd(), "vercel.json"), "utf8")) as {
  rewrites?: Array<{ source?: string; destination?: string }>;
};

assertIncludes(recoverySource, "navigateToFreshApp", "Chunk recovery must use a fresh-document navigation helper.");
assertIncludes(recoverySource, 'cache: "reload"', "Chunk recovery must bypass the browser HTTP cache.");
assertIncludes(recoverySource, "window.location.replace", "Chunk recovery must replace the stale document URL.");
assertIncludes(recoverySource, "window.caches.keys", "Chunk recovery must clear CacheStorage entries.");
assertIncludes(recoverySource, "registration.unregister", "Chunk recovery must unregister stale service workers.");
assertIncludes(recoverySource, "JavaScript-or-Wasm module script", "MIME-type module failures must be recognized.");
assertIncludes(boundarySource, "reloadAppWithCacheBust", "The recovery screen reload button must bypass stale caches.");
assertIncludes(mainSource, "settleAppRecoveryAfterLoad", "A stable load must settle the recovery marker.");
assertIncludes(recoverySource, "applyAppUpdateAndReload", "App updates must use the bounded reload helper.");
assertIncludes(recoverySource, "Promise.race", "App update activation must not wait forever for a service worker.");
assertIncludes(noticeSource, "applyAppUpdateAndReload", "The update button must invoke the reliable update helper.");
assertIncludes(noticeSource, "更新中…", "The update button must provide immediate click feedback.");

if (vercel.rewrites?.some((rewrite) => rewrite.source === "/(.*)")) {
  throw new Error("The SPA fallback must not rewrite missing hashed assets to index.html.");
}
const spaRewrite = vercel.rewrites?.find((rewrite) => rewrite.destination === "/index.html");
if (!spaRewrite?.source?.includes("\\.")) {
  throw new Error("The SPA rewrite must exclude file-extension requests so missing assets return 404.");
}
if (!spaRewrite.source.includes("api")) {
  throw new Error("The SPA rewrite must exclude API routes.");
}

console.log("App recovery, stale-chunk routing and update activation tests passed.");
