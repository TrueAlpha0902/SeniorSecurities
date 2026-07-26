import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import ts from "typescript";

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
  const files: string[] = [];
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) files.push(...await listTsxFiles(fullPath));
    else if (entry.name.endsWith(".tsx")) files.push(fullPath);
  }
  return files;
}

type Attributes = Record<string, ts.JsxAttributeValue | undefined>;
type QualityIssue = { file: string; line: number; issue: string };
type Destination = { value: string; file: string; line: number };

function tagText(tag: ts.JsxTagNameExpression): string {
  return tag.getText();
}

function attributesOf(
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
): Attributes {
  const output: Attributes = {};
  for (const property of attributes.properties) {
    if (ts.isJsxAttribute(property)) {
      output[property.name.getText(sourceFile)] = property.initializer;
    } else {
      output.__spread = undefined;
    }
  }
  return output;
}

function literalValue(node: ts.Node | undefined): string | null {
  if (!node) return null;
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  if (ts.isJsxExpression(node)) return literalValue(node.expression);
  return null;
}

function attributeIdentity(node: ts.Node | undefined): string | null {
  if (!node) return null;
  const literal = literalValue(node);
  if (literal) return `literal:${literal}`;
  if (ts.isJsxExpression(node) && node.expression) {
    return `expression:${node.expression.getText()}`;
  }
  return null;
}

const iconName = /^(?:[A-Z][A-Za-z0-9]*|Icon)$/;
const textRenderingComponents = new Set([
  "V93BrandLockup",
  "V93SectionTitle",
  "V93InlineNotice",
  "V93AnswerBadge",
]);

function childCanNameControl(
  child: ts.JsxChild,
  sourceFile: ts.SourceFile,
): boolean {
  if (ts.isJsxText(child)) return child.text.trim().length > 0;
  if (ts.isJsxExpression(child)) {
    if (!child.expression) return false;
    return ![
      ts.SyntaxKind.NullKeyword,
      ts.SyntaxKind.TrueKeyword,
      ts.SyntaxKind.FalseKeyword,
    ].includes(child.expression.kind);
  }
  if (ts.isJsxElement(child)) {
    const tag = tagText(child.openingElement.tagName);
    if (tag === "svg" || tag === "path") return false;
    return child.children.some((nested) => childCanNameControl(nested, sourceFile));
  }
  if (ts.isJsxSelfClosingElement(child)) {
    const tag = tagText(child.tagName);
    if (textRenderingComponents.has(tag)) return true;
    return !iconName.test(tag) && tag !== "svg" && tag !== "img";
  }
  return false;
}

function hasAncestorLabel(node: ts.Node): boolean {
  let current: ts.Node | undefined = node.parent;
  while (current) {
    if (
      ts.isJsxElement(current)
      && tagText(current.openingElement.tagName) === "label"
    ) return true;
    current = current.parent;
  }
  return false;
}

const routePatterns = [
  /^\/$/,
  /^\/auth$/,
  /^\/forgot-password$/,
  /^\/reset-password$/,
  /^\/activate(?:\?.*)?$/,
  /^\/account$/,
  /^\/admin$/,
  /^\/search$/,
  /^\/trial$/,
  /^\/securities(?:#.*)?$/,
  /^\/leaderboard$/,
  /^\/banks\/[^/?#]+$/,
  /^\/answer-drill$/,
  /^\/similar$/,
  /^\/random$/,
  /^\/image-quiz\/(?:daily|today-wrong|all|wrong|favorites)$/,
  /^\/image-quiz\/random\/[^/?#]+\/[^/?#]+$/,
  /^\/image-quiz\/session-wrong\/[^/?#]+$/,
  /^\/image-quiz\/bank\/[^/?#]+(?:\/chapter\/[^/?#]+)?(?:\?.*)?$/,
  /^\/foreign-exchange(?:#.*)?$/,
  /^\/foreign-exchange\/practice(?:\?.*)?$/,
  /^\/questions\//,
  /^\/quiz\//,
  /^\/result$/,
  /^\/review$/,
];

const tsxFiles = await listTsxFiles(srcRoot);
const issues: QualityIssue[] = [];
const destinations: Destination[] = [];
let buttonCount = 0;
let formControlCount = 0;
let dialogCount = 0;

for (const file of tsxFiles) {
  const source = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const relativeFile = path.relative(root, file).replaceAll("\\", "/");
  const labelledIds = new Set<string>();

  function collectLabels(node: ts.Node): void {
    if (
      ts.isJsxElement(node)
      && tagText(node.openingElement.tagName) === "label"
    ) {
      const attrs = attributesOf(node.openingElement.attributes, sourceFile);
      const htmlFor = attributeIdentity(attrs.htmlFor);
      if (htmlFor) labelledIds.add(htmlFor);
    }
    ts.forEachChild(node, collectLabels);
  }
  collectLabels(sourceFile);

  function recordIssue(node: ts.Node, issue: string): void {
    const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
    issues.push({ file: relativeFile, line, issue });
  }

  function visit(node: ts.Node): void {
    let tagName: string | null = null;
    let attrs: Attributes | null = null;
    let children: readonly ts.JsxChild[] = [];

    if (ts.isJsxElement(node)) {
      tagName = tagText(node.openingElement.tagName);
      attrs = attributesOf(node.openingElement.attributes, sourceFile);
      children = node.children;
    } else if (ts.isJsxSelfClosingElement(node)) {
      tagName = tagText(node.tagName);
      attrs = attributesOf(node.attributes, sourceFile);
    }

    if (tagName && attrs) {
      if (tagName === "button" || tagName === "GlassButton") {
        buttonCount += 1;
        const accessibleName = Boolean(
          attrs["aria-label"]
          || attrs["aria-labelledby"]
          || attrs.title
          || children.some((child) => childCanNameControl(child, sourceFile)),
        );
        if (!accessibleName) recordIssue(node, `${tagName} 沒有可判定的可存取名稱`);
      }

      if (["input", "select", "textarea"].includes(tagName)) {
        const type = literalValue(attrs.type);
        if (type !== "hidden") {
          formControlCount += 1;
          const id = attributeIdentity(attrs.id);
          const named = Boolean(
            attrs["aria-label"]
            || attrs["aria-labelledby"]
            || attrs.title
            || hasAncestorLabel(node)
            || (id && labelledIds.has(id)),
          );
          if (!named) recordIssue(node, `${tagName} 沒有 label 或 aria 名稱`);
        }
      }

      const role = literalValue(attrs.role);
      if (role === "dialog" || role === "alertdialog" || tagName === "dialog") {
        dialogCount += 1;
        if (!attrs["aria-label"] && !attrs["aria-labelledby"]) {
          recordIssue(node, `${tagName} dialog 沒有 aria-label/aria-labelledby`);
        }
        if (tagName !== "dialog" && !attrs["aria-modal"]) {
          recordIssue(node, `${tagName} dialog 沒有 aria-modal`);
        }
      }

      if (tagName === "Link" || tagName === "GlassLinkButton") {
        const to = literalValue(attrs.to);
        if (to) {
          const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
          destinations.push({ value: to, file: relativeFile, line });
        }
      }
    }

    if (
      ts.isCallExpression(node)
      && ts.isIdentifier(node.expression)
      && (node.expression.text === "navigate" || node.expression.text === "go")
    ) {
      const value = literalValue(node.arguments[0]);
      if (value) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        destinations.push({ value, file: relativeFile, line });
      }
    }

    if (
      ts.isPropertyAssignment(node)
      && ts.isIdentifier(node.name)
      && ["destination", "to", "path", "activatePath"].includes(node.name.text)
    ) {
      const value = literalValue(node.initializer);
      if (value?.startsWith("/")) {
        const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
        destinations.push({ value, file: relativeFile, line });
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

for (const destination of destinations) {
  if (!routePatterns.some((pattern) => pattern.test(destination.value))) {
    issues.push({
      file: destination.file,
      line: destination.line,
      issue: `literal route 沒有對應 route contract：${destination.value}`,
    });
  }
}

assert(buttonCount >= 170, `Button accessibility scan count is too low: ${buttonCount}`);
assert(formControlCount >= 25, `Form control scan count is too low: ${formControlCount}`);
assert(dialogCount >= 10, `Dialog scan count is too low: ${dialogCount}`);
assert(destinations.length >= 45, `Route destination scan count is too low: ${destinations.length}`);
assert(
  issues.length === 0,
  `v93 final quality issues:\n${issues
    .map((issue) => `- ${issue.file}:${issue.line} ${issue.issue}`)
    .join("\n")}`,
);

const [
  app,
  layout,
  authContext,
  theme,
  safetyTest,
  smokeE2e,
  feedbackE2e,
  finalQualityE2e,
  playwrightConfig,
  packageJsonSource,
  indexHtml,
  viteConfig,
  bundleBudget,
] = await Promise.all([
  read("src/App.tsx"),
  read("src/components/AppLayout.tsx"),
  read("src/auth/AuthContext.tsx"),
  read("src/styles/theme-v93.css"),
  read("scripts/test-v93-safety-interactions.ts"),
  read("tests/e2e/app-smoke.spec.ts"),
  read("tests/e2e/learner-feedback-v93.spec.ts"),
  read("tests/e2e/final-quality-v93.spec.ts"),
  read("playwright.config.ts"),
  read("package.json"),
  read("index.html"),
  read("vite.config.ts"),
  read("scripts/check-bundle-budget.ts"),
]);

assert(
  app.includes("<HashScrollManager />")
    && app.includes("<InteractionFeedbackHost />")
    && app.includes('<Route path="*" element={<Navigate to="/" replace />} />'),
  "App must retain navigation, feedback, and unknown-route recovery hosts.",
);
assert(
  layout.includes("theme-v93")
    && layout.includes('aria-label={`前往${brand.primary}首頁`}'),
  "App shell must activate v93 and name the mobile brand control.",
);
assert(
  authContext.includes('import.meta.env.DEV && import.meta.env.VITE_LOCAL_PREVIEW_ACCESS === "1"')
    && authContext.includes('LOCAL_PREVIEW_AUTH_STATE_KEY = "truealpha:v93:e2e-auth-state"'),
  "Local preview authentication must remain development-only and expose an explicit signed-out test state.",
);
for (const token of [
  "color-scheme: light",
  "--v93-bg: #f4f7fb",
  "--v93-text: #172033",
  ":focus-visible",
  ":active:not(:disabled)",
  "prefers-reduced-motion",
]) {
  assert(theme.includes(token), `Final v87.3 reissue light/accessibility theme is missing ${token}.`);
}
assert(
  [
    ".floating-calculator",
    ".floating-calculator-screen",
    ".admin-premium-directory",
    ".admin-overview-strip",
    ".admin-member-row",
    ".admin-tool-pane",
    ".product-search-field",
    ".settings-dialog-header",
    ".product-account-exam-card",
  ].every((selector) => theme.includes(selector)),
  "Light surface coverage must include calculator, administration, search, settings, and account interfaces.",
);
assert(
  safetyTest.includes("Blocking browser dialogs remain")
    && safetyTest.includes("source files contain zero")
    && safetyTest.includes("blocking browser dialogs"),
  "Final quality gate requires the no-native-dialog scan.",
);
assert(
  smokeE2e.includes("AxeBuilder")
    && smokeE2e.includes("expectNoSeriousAccessibilityViolations")
    && smokeE2e.includes('testInfo.project.name !== "mobile"'),
  "Browser smoke suite must keep axe and mobile-specific validation.",
);
assert(
  feedbackE2e.includes('getByRole("dialog", { name: /計算機/ })')
    && feedbackE2e.includes('getByRole("alertdialog", { name: "最後確認" })'),
  "Browser feedback suite must exercise dialogs and destructive confirmations.",
);
assert(
  finalQualityE2e.includes("major learner interfaces render")
    && finalQualityE2e.includes("desktop exam navigation")
    && finalQualityE2e.includes("foreign-exchange navigation")
    && finalQualityE2e.includes("mobile navigation")
    && finalQualityE2e.includes("unknown routes recover"),
  "Final browser suite must cover major routes, navigation, dialogs, mobile, and route recovery.",
);
assert(
  playwrightConfig.includes("command: `npm run dev")
    && playwrightConfig.includes('VITE_LOCAL_PREVIEW_ACCESS: "1"')
    && !playwrightConfig.includes("e2e.supabase.co"),
  "Playwright must use the gated Vite development preview without contacting a fake Supabase project.",
);
assert(
  feedbackE2e.includes('truealpha:v93:e2e-auth-state')
    && feedbackE2e.includes('"signed-out"'),
  "Authentication browser coverage must explicitly enter the local signed-out state.",
);

const packageJson = JSON.parse(packageJsonSource) as {
  scripts?: Record<string, string>;
};
assert(
  packageJson.scripts?.["test:v93-quality"] ===
    "tsx scripts/test-v93-final-quality.ts",
  "package.json is missing test:v93-quality.",
);
assert(
  packageJson.scripts?.verify?.includes("npm run test:v93-quality"),
  "npm run verify must include the final v93 quality gate.",
);
assert(
  packageJson.scripts?.["test:e2e:v93"]?.includes("final-quality-v93.spec.ts")
    && packageJson.scripts?.["test:e2e:v93"]?.includes("--project=desktop")
    && packageJson.scripts?.["test:e2e:v93"]?.includes("--project=mobile"),
  "package.json must expose the focused desktop/mobile v93 browser suite.",
);
assert(
  indexHtml.includes('<meta name="theme-color" content="#f4f7fb" />')
    && indexHtml.includes('<meta name="color-scheme" content="light" />')
    && indexHtml.includes('background:#f4f7fb;color:#172033')
    && indexHtml.includes('apple-mobile-web-app-status-bar-style" content="default"'),
  "The initial browser shell must be light before React mounts.",
);
assert(
  viteConfig.includes('theme_color: "#f4f7fb"')
    && viteConfig.includes('background_color: "#f4f7fb"'),
  "The PWA manifest and splash screen must use the v87.3 reissue light background.",
);

assert(
  bundleBudget.includes("initialGzip: 235 * 1024")
    && bundleBudget.includes("largestJavaScript: 360 * 1024")
    && bundleBudget.includes("largestCss: 261 * 1024")
    && !bundleBudget.includes("largestCss: 262 * 1024"),
  "Bundle budgets must retain the 235 KiB initial gzip, 360 KiB JS, and exact 261 KiB CSS caps.",
);

console.log(
  `v87.3 reissue final quality contracts passed: ${buttonCount} buttons, ${formControlCount} form controls, `
    + `${dialogCount} dialogs, and ${destinations.length} literal destinations are named and valid.`,
);
