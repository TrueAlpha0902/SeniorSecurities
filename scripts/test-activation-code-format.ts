import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { canonicalizeActivationCode } from "../api/_activationCodeFormat.js";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const compactCode = "ABCD1234EFGH56";
const separatedCode = "ABCD-1234-EFGH-56";
const root = process.cwd();
const read = (relativePath: string) => readFile(path.join(root, relativePath), "utf8");

assert(canonicalizeActivationCode(compactCode) === compactCode, "Compact activation codes must remain unchanged.");
assert(canonicalizeActivationCode(separatedCode) === compactCode, "Legacy separators must remain redemption-compatible.");
assert(canonicalizeActivationCode(" abcd-1234-efgh-56 ") === compactCode, "Activation codes must remain case and whitespace tolerant.");

const compactHash = createHash("sha256").update(canonicalizeActivationCode(compactCode)).digest("hex");
const separatedHash = createHash("sha256").update(canonicalizeActivationCode(separatedCode)).digest("hex");
assert(compactHash === separatedHash, "Compact and legacy activation-code forms must resolve to the same hash.");

const [tools, adminPanel, activatePage] = await Promise.all([
  read("api/admin/tools.ts"),
  read("src/components/AdminToolsPanel.tsx"),
  read("src/pages/ActivatePage.tsx"),
]);

assert(tools.includes("const formatted = normalized;"), "New activation codes must be returned without inserted separators.");
assert(!tools.includes('join("-")'), "The admin API must not reinsert activation-code separators.");
assert(adminPanel.includes("可留空，不需連字號") && adminPanel.includes("SENIORXXXXXXXX"), "Admin activation-code guidance must show the compact format.");
assert(activatePage.includes("FOREXXXXXXXX") && activatePage.includes("SENIORXXXXXXXX"), "Learner activation placeholders must show compact codes.");

console.log("Activation code format contracts passed.");
