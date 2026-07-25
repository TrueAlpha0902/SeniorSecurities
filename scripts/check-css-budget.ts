import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const stylesDirectory = path.join(root, "src", "styles");
const limits = {
  files: 13,
  totalLines: 16_000,
  importantDeclarations: 620,
  glassLines: 4_900,
};

const files = (await readdir(stylesDirectory))
  .filter((name) => name.endsWith(".css"))
  .sort();
const contents = await Promise.all(
  files.map(async (name) => ({
    name,
    source: await readFile(path.join(stylesDirectory, name), "utf8"),
  })),
);
const totalLines = contents.reduce(
  (sum, item) => sum + item.source.split(/\r?\n/).length,
  0,
);
const importantDeclarations = contents.reduce(
  (sum, item) => sum + (item.source.match(/!important\b/g)?.length ?? 0),
  0,
);
const glassLines =
  contents
    .find((item) => item.name === "glass.css")
    ?.source.split(/\r?\n/).length ?? 0;

const failures: string[] = [];
if (files.length > limits.files) {
  failures.push(`CSS file count ${files.length} exceeds ${limits.files}.`);
}
if (totalLines > limits.totalLines) {
  failures.push(`CSS lines ${totalLines} exceed ${limits.totalLines}.`);
}
if (importantDeclarations > limits.importantDeclarations) {
  failures.push(
    `!important declarations ${importantDeclarations} exceed ${limits.importantDeclarations}.`,
  );
}
if (glassLines > limits.glassLines) {
  failures.push(`glass.css lines ${glassLines} exceed ${limits.glassLines}.`);
}

if (failures.length) {
  throw new Error(`CSS maintenance budget failed:\n- ${failures.join("\n- ")}`);
}

console.log(
  `CSS budget passed: ${files.length} files, ${totalLines} lines, ${importantDeclarations} !important declarations.`,
);
