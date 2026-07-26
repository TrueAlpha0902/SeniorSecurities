import { readFile } from "node:fs/promises";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const [theme, indexHtml, viteConfig, layout, packageSource] = await Promise.all([
  readFile("src/styles/theme-v93.css", "utf8"),
  readFile("index.html", "utf8"),
  readFile("vite.config.ts", "utf8"),
  readFile("src/components/AppLayout.tsx", "utf8"),
  readFile("package.json", "utf8"),
]);

for (const token of [
  "color-scheme: light",
  "--v93-bg: #f4f7fb",
  "--v93-surface: #ffffff",
  "--v93-text: #172033",
  "--v93-accent: #2b6ea6",
  "--v90-foreign: #2f7d50",
  ".glass-answer-correct",
  ".glass-answer-wrong",
]) {
  assert(theme.includes(token), `v87.3 reissue theme is missing: ${token}`);
}

assert(
  indexHtml.includes('<meta name="theme-color" content="#f4f7fb" />')
    && indexHtml.includes('<meta name="color-scheme" content="light" />')
    && indexHtml.includes('background:#f4f7fb;color:#172033')
    && indexHtml.includes('apple-mobile-web-app-status-bar-style" content="default"'),
  "The browser boot shell must use the v87.3 light palette.",
);

assert(
  viteConfig.includes('theme_color: "#f4f7fb"')
    && viteConfig.includes('background_color: "#f4f7fb"'),
  "The PWA manifest must use the v87.3 light palette.",
);

for (const copy of [
  'primary: "金融證照"',
  'primary: "證券高業"',
  'primary: "初階外匯"',
  'logoKind: "certificate"',
  'logoKind: "securities"',
  'logoKind: "foreign-exchange"',
]) {
  assert(layout.includes(copy), `Contextual Chinese brand contract is missing: ${copy}`);
}

assert(
  layout.includes("V93BrandLockup") || layout.includes("ExamBrandMark"),
  "The app shell must render a native contextual vector brand mark.",
);
assert(
  !layout.includes("HandwrittenAsset")
    && !layout.includes("HandwrittenLabel")
    && !layout.includes("HandwrittenIcon"),
  "Visible navigation must not depend on handwritten PNG labels.",
);
assert(!theme.includes("@font-face"), "The reissue must not bundle or distribute font files.");
assert(!/url\(\s*["']?https?:/i.test(theme), "The reissue theme must not load remote images or fonts.");

const packageJson = JSON.parse(packageSource) as { scripts?: Record<string, string> };
assert(
  packageJson.scripts?.["test:v87-reissue"] ===
    "tsx scripts/test-v87-3-reissue-contracts.ts",
  "package.json is missing test:v87-reissue.",
);
assert(
  packageJson.scripts?.verify?.includes("npm run test:v87-reissue"),
  "npm run verify must include the v87.3 reissue contract.",
);

console.log(
  "v87.3 reissue contracts passed: light surfaces, navy/blue actions, green FX accents, "
    + "contextual Chinese vector logos, text answer states, and no bundled font files.",
);
