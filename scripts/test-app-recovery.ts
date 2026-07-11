import { isChunkLoadError } from "../src/lib/appRecovery";

function expect(value: boolean, expected: boolean, label: string): void {
  if (value !== expected) {
    throw new Error(`${label}: expected ${expected}, received ${value}`);
  }
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

console.log("App recovery error detection tests passed.");
