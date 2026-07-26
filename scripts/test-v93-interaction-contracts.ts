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

type AttributeMap = Record<string, string>;
type InteractiveIssue = {
  file: string;
  line: number;
  tag: string;
  issue: string;
};

function tagNameText(tagName: ts.JsxTagNameExpression): string {
  return tagName.getText();
}

function attributesToMap(
  attributes: ts.JsxAttributes,
  sourceFile: ts.SourceFile,
): AttributeMap {
  const output: AttributeMap = {};
  for (const property of attributes.properties) {
    if (ts.isJsxSpreadAttribute(property)) {
      output[`...${property.expression.getText(sourceFile)}`] = "";
      continue;
    }

    const name = property.name.getText(sourceFile);
    if (!property.initializer) {
      output[name] = "true";
    } else if (ts.isStringLiteral(property.initializer)) {
      output[name] = property.initializer.text;
    } else if (ts.isJsxExpression(property.initializer)) {
      output[name] = property.initializer.expression?.getText(sourceFile) ?? "";
    } else {
      output[name] = property.initializer.getText(sourceFile);
    }
  }
  return output;
}

const interactiveTags = new Set([
  "button",
  "GlassButton",
  "GlassLinkButton",
  "Link",
]);

const files = await listTsxFiles(srcRoot);
const issues: InteractiveIssue[] = [];
let interactiveCount = 0;
let nativeButtonCount = 0;
let glassButtonCount = 0;
let linkButtonCount = 0;

for (const file of files) {
  const source = await readFile(file, "utf8");
  const sourceFile = ts.createSourceFile(
    file,
    source,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );

  function visit(node: ts.Node): void {
    let tagName: string | null = null;
    let attributes: ts.JsxAttributes | null = null;

    if (ts.isJsxElement(node)) {
      tagName = tagNameText(node.openingElement.tagName);
      attributes = node.openingElement.attributes;
    } else if (ts.isJsxSelfClosingElement(node)) {
      tagName = tagNameText(node.tagName);
      attributes = node.attributes;
    }

    if (tagName && attributes && interactiveTags.has(tagName)) {
      interactiveCount += 1;
      if (tagName === "button") nativeButtonCount += 1;
      else if (tagName === "GlassButton") glassButtonCount += 1;
      else linkButtonCount += 1;

      const attrs = attributesToMap(attributes, sourceFile);
      const hasSpread = Object.keys(attrs).some((name) => name.startsWith("..."));
      const line = sourceFile.getLineAndCharacterOfPosition(node.getStart()).line + 1;
      const relativeFile = path.relative(root, file).replaceAll("\\", "/");

      if (tagName === "button" || tagName === "GlassButton") {
        const buttonType = attrs.type ?? "";
        const handler = attrs.onClick ?? attrs.onSubmit ?? "";
        const nativeFormAction = buttonType === "submit" || buttonType === "reset";
        if (!handler && !nativeFormAction && !hasSpread) {
          issues.push({
            file: relativeFile,
            line,
            tag: tagName,
            issue: "沒有 onClick、表單 action 或 spread handler",
          });
        }
        if (handler === "undefined" || handler === "null") {
          issues.push({
            file: relativeFile,
            line,
            tag: tagName,
            issue: `onClick=${handler}`,
          });
        }
      }

      if (tagName === "Link" || tagName === "GlassLinkButton") {
        if (!attrs.to && !hasSpread) {
          issues.push({
            file: relativeFile,
            line,
            tag: tagName,
            issue: "沒有 to destination",
          });
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
}

assert(
  interactiveCount >= 190,
  `互動元件掃描數量異常：只找到 ${interactiveCount} 個。`,
);
assert(
  issues.length === 0,
  `發現靜態無作用互動元件：\n${issues
    .map((issue) => `- ${issue.file}:${issue.line} <${issue.tag}> ${issue.issue}`)
    .join("\n")}`,
);

const [
  app,
  layout,
  hashManager,
  feedbackHost,
  modalFallback,
  imageQuiz,
  searchPage,
  homeSections,
  homePage,
  foreignExchangeHome,
  theme,
  packageJsonSource,
] = await Promise.all([
  read("src/App.tsx"),
  read("src/components/AppLayout.tsx"),
  read("src/components/HashScrollManager.tsx"),
  read("src/components/InteractionFeedbackHost.tsx"),
  read("src/components/ModalLoadingFallback.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/SearchPage.tsx"),
  read("src/components/ExamHomeSections.tsx"),
  read("src/pages/HomePage.tsx"),
  read("src/pages/ForeignExchangeHomePage.tsx"),
  read("src/styles/theme-v93.css"),
  read("package.json"),
]);

assert(
  app.includes("<HashScrollManager />")
    && app.includes("<InteractionFeedbackHost />"),
  "App must mount global hash navigation and interaction feedback hosts.",
);
assert(
  layout.includes('import "../styles/theme-v93.css"')
    && layout.includes("theme-v93"),
  "AppLayout must activate the v87.3 reissue light theme after historical compatibility layers.",
);
assert(
  !layout.includes("v90-notification-button") && !layout.includes("<Bell"),
  "The dead notification button must be removed until a real notification feature exists.",
);
assert(
  layout.includes('<ModalLoadingFallback label="載入設定" />')
    && layout.includes('<ModalLoadingFallback label="載入計算機" />')
    && !layout.includes("Suspense fallback={null}"),
  "Lazy settings and calculator controls must show visible loading feedback.",
);
assert(
  layout.includes("scrollToHashTarget(targetUrl.hash)")
    && hashManager.includes("scrollIntoView")
    && hashManager.includes("target.focus"),
  "Hash navigation must scroll, focus, and announce the destination.",
);

for (const targetId of ["learning-path", "learning-summary", "fx-history"]) {
  assert(
    homeSections.includes(`id="${targetId}"`)
      || homePage.includes(`id="${targetId}"`)
      || foreignExchangeHome.includes(`id="${targetId}"`),
    `Missing hash navigation target #${targetId}.`,
  );
}

assert(
  searchPage.includes("?jump=${result.questionNumber}")
    && imageQuiz.includes('.get("jump")')
    && imageQuiz.includes("question.number === requestedQuestionNumber")
    && imageQuiz.includes("initialJumpHandledRef"),
  "Search results must navigate to the requested securities question number.",
);
assert(
  feedbackHost.includes('role={feedback.tone === "error" ? "alert" : "status"}')
    && modalFallback.includes('role="status"'),
  "Interaction feedback must be announced to assistive technology.",
);

for (const token of [
  "--v93-bg: #f4f7fb",
  "--v93-text: #172033",
  "--v93-accent: #2b6ea6",
  ":focus-visible",
  ":active:not(:disabled)",
  "cursor: not-allowed",
  ".v93-interaction-feedback",
  ".v93-modal-loading-backdrop",
  "prefers-reduced-motion",
]) {
  assert(theme.includes(token), `v87.3 reissue interaction theme is missing: ${token}`);
}

const packageJson = JSON.parse(packageJsonSource) as {
  scripts?: Record<string, string>;
};
assert(
  packageJson.scripts?.["test:v93-interactions"] ===
    "tsx scripts/test-v93-interaction-contracts.ts",
  "package.json is missing test:v93-interactions.",
);
assert(
  packageJson.scripts?.verify?.includes("npm run test:v93-interactions"),
  "npm run verify must include the v93 interaction contract.",
);

console.log(
  `v93 interaction contracts passed: ${interactiveCount} controls `
    + `(${nativeButtonCount} native buttons, ${glassButtonCount} GlassButtons, `
    + `${linkButtonCount} route links), 0 static dead controls.`,
);
