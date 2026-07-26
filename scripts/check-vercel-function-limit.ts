import { readdir } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const apiRoot = path.join(root, "api");
const HOBBY_LIMIT = 12;
const PROJECT_LIMIT = 11; // Keep one spare slot for emergency or platform-generated routing.

async function entrypoints(directory: string, prefix = ""): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    if (entry.name.startsWith("_") || entry.name.startsWith(".")) continue;
    const absolute = path.join(directory, entry.name);
    const relative = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) {
      output.push(...await entrypoints(absolute, relative));
      continue;
    }
    if (!entry.isFile() || entry.name.endsWith(".d.ts")) continue;
    if (/\.(?:[cm]?[jt]s)$/.test(entry.name)) output.push(relative);
  }
  return output.sort();
}

const routes = await entrypoints(apiRoot);
if (routes.length > HOBBY_LIMIT) {
  throw new Error(`Vercel Hobby allows at most ${HOBBY_LIMIT} functions; found ${routes.length}: ${routes.join(", ")}`);
}
if (routes.length > PROJECT_LIMIT) {
  throw new Error(`Project policy keeps one spare Vercel function slot; found ${routes.length}, maximum ${PROJECT_LIMIT}: ${routes.join(", ")}`);
}
console.log(`Vercel function budget passed: ${routes.length}/${HOBBY_LIMIT} public functions (${HOBBY_LIMIT - routes.length} spare).`);
