import { readdir, readFile } from "node:fs/promises";
import path from "node:path";

const root = process.cwd();
const srcRoot = path.join(root, "src");

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function read(relativePath: string): Promise<string> {
  return readFile(path.join(root, relativePath), "utf8");
}

async function listTsxFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listTsxFiles(fullPath));
    else if (entry.name.endsWith(".tsx")) output.push(fullPath);
  }
  return output;
}

const [
  layout,
  homeSections,
  materials,
  emptyState,
  errorState,
  imageQuiz,
  fxQuiz,
  theme,
  packageJsonSource,
] = await Promise.all([
  read("src/components/AppLayout.tsx"),
  read("src/components/ExamHomeSections.tsx"),
  read("src/components/V93VisualMaterials.tsx"),
  read("src/components/EmptyState.tsx"),
  read("src/components/ErrorState.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("src/styles/theme-v93.css"),
  read("package.json"),
]);

assert(
  layout.includes("V93BrandLockup")
    && layout.includes("v93-nav-label")
    && layout.includes("Settings2"),
  "App shell must use native text brand and navigation materials.",
);
assert(
  !layout.includes("HandwrittenLabel")
    && !layout.includes("HandwrittenIcon")
    && !layout.includes("HandwrittenAsset"),
  "App navigation must not render text-bearing handwritten PNG labels.",
);
assert(
  homeSections.includes('className="v93-home-title"')
    && homeSections.includes("SketchSecuritiesHero")
    && homeSections.includes("SketchForeignExchangeHero")
    && homeSections.includes("V93SectionTitle"),
  "Exam home pages must use native titles and text-free vector hero art.",
);
assert(
  !homeSections.includes("HandwrittenLabel")
    && !homeSections.includes("HandwrittenIcon")
    && !homeSections.includes("HandwrittenAsset"),
  "Home cards must not use image-based labels or icon labels.",
);
assert(
  emptyState.includes("V93StateIllustration")
    && errorState.includes('kind="error"'),
  "Empty and error states must use the coordinated v93 vector material system.",
);
assert(
  imageQuiz.includes("V93AnswerBadge")
    && fxQuiz.includes("V93AnswerBadge")
    && imageQuiz.includes("<span>查看解析</span>")
    && fxQuiz.includes("<span>查看解析</span>"),
  "Both quiz engines must use native control text and coordinated answer badges.",
);
assert(
  materials.includes("V93BrandLockup")
    && materials.includes("V93SectionTitle")
    && materials.includes("V93StateIllustration")
    && materials.includes("V93AnswerBadge")
    && !materials.includes("<img"),
  "v93 materials must be native text and inline vector UI, not text-bearing images.",
);

const visibleTsxFiles = (await listTsxFiles(srcRoot)).filter(
  (file) => !file.endsWith(`${path.sep}HandwrittenAsset.tsx`),
);
const legacyImports: string[] = [];
for (const file of visibleTsxFiles) {
  const source = await readFile(file, "utf8");
  if (/from ["'].*HandwrittenAsset["']/.test(source)) {
    legacyImports.push(path.relative(root, file).replaceAll("\\", "/"));
  }
}
assert(
  legacyImports.length === 0,
  `Visible UI still imports legacy handwritten assets:\n${legacyImports.join("\n")}`,
);

for (const token of [
  ".v93-brand-lockup",
  ".v93-section-title",
  ".v93-home-title",
  ".v93-hero-material",
  ".v93-state-illustration",
  ".v93-answer-badge",
  ".v93-nav-label",
  ".v93-bottom-label",
]) {
  assert(theme.includes(token), `v93 material CSS is missing ${token}.`);
}
assert(
  theme.toLowerCase().includes("native-text materials")
    && theme.toLowerCase().includes("text-bearing png labels are retired"),
  "The theme must document the native-text material boundary.",
);

const packageJson = JSON.parse(packageJsonSource) as {
  scripts?: Record<string, string>;
};
assert(
  packageJson.scripts?.["test:v93-materials"] ===
    "tsx scripts/test-v93-material-contracts.ts",
  "package.json is missing test:v93-materials.",
);
assert(
  packageJson.scripts?.verify?.includes("npm run test:v93-materials"),
  "npm run verify must include the v93 material contract.",
);

console.log(
  `v93 material contracts passed: ${visibleTsxFiles.length} visible TSX files, `
    + "0 legacy handwritten imports, native text/vector materials active.",
);
