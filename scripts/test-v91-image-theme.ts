import { readFile, readdir, stat } from "node:fs/promises";
import { join, resolve } from "node:path";

const root = process.cwd();

async function read(relativePath: string): Promise<string> {
  return readFile(resolve(root, relativePath), "utf8");
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

async function listFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const output: string[] = [];
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) output.push(...await listFiles(path));
    else output.push(path);
  }
  return output;
}

const [layout, homeSections, imageQuiz, fxQuiz, settings, bankPage, dialog, studyPlan, theme, assetComponent] = await Promise.all([
  read("src/components/AppLayout.tsx"),
  read("src/components/ExamHomeSections.tsx"),
  read("src/pages/ImageQuizPage.tsx"),
  read("src/pages/ForeignExchangePracticePage.tsx"),
  read("src/components/SettingsPanel.tsx"),
  read("src/pages/BankPage.tsx"),
  read("src/components/ExamStudyPlanDialog.tsx"),
  read("src/lib/studyPlan.ts"),
  read("src/styles/theme-v91.css"),
  read("src/components/HandwrittenAsset.tsx"),
]);

assert(layout.includes('theme-v91'), "AppLayout must activate the v91 theme.");
assert(layout.includes("HandwrittenLabel") && layout.includes("HandwrittenIcon"), "Navigation must use generated handwritten assets.");
assert(homeSections.includes('name={tone === "foreign-exchange" ? "fx-international" : "securities"}'), "Both exam home pages must use text-free exam-specific generated artwork.");
assert(!homeSections.includes('name={tone === "foreign-exchange" ? "foreign-exchange-brand" : "securities-brand"}'), "Hero artwork must not repeat the handwritten exam title.");
assert(imageQuiz.includes('name={correct ? "correct-chip" : "wrong-chip"}'), "Securities answers must use generated correct/wrong labels.");
assert(fxQuiz.includes('name={correct ? "correct-chip" : "wrong-chip"}'), "Foreign-exchange answers must use generated correct/wrong labels.");
assert(imageQuiz.includes('text={correct ? "正解" : "錯誤"}'), "Securities answer images must expose 正解/錯誤 accessible fallback text.");
assert(fxQuiz.includes('text={correct ? "正解" : "錯誤"}'), "Foreign-exchange answer images must expose 正解/錯誤 accessible fallback text.");
assert(theme.includes("width: 108px") && theme.includes("width: 92px"), "Answer-state images must use the v90 handwritten badge sizing.");
assert(assetComponent.includes("onError={() => setFailed(true)}"), "Image assets must provide a text fallback when loading fails.");
assert(!assetComponent.includes('className="sr-only"'), "Handwritten image text must not render a second visible DOM label.");
assert(assetComponent.includes('"aria-label": text') && assetComponent.includes('role: "img"'), "Handwritten images must expose one accessible name without visible duplicate text.");
assert(theme.includes(".sr-only") && theme.includes("clip-path: inset(50%)"), "The global visually-hidden utility must remain available for other accessible controls.");
assert(theme.includes("position: static !important") && theme.includes("safe-area-inset-bottom"), "Mobile question navigation must remain in normal flow and respect safe areas.");

assert(dialog.includes("examId: StudyPlanExamId") && dialog.includes("setStudyPlanConfigForExam"), "The study-plan dialog must be exam-scoped.");
assert(settings.includes('openPlanEditor("senior-securities")') && settings.includes('openPlanEditor("junior-foreign-exchange")'), "Settings must expose exactly the two exam-level plans.");
assert(!bankPage.includes("ExamStudyPlanDialog") && !bankPage.includes("共同考試計畫"), "Subject pages must not expose separate plan editors.");
assert(studyPlan.includes('"senior-securities": getStudyPlanConfigForExam') && studyPlan.includes('"junior-foreign-exchange": getStudyPlanConfigForExam'), "Study-plan storage must provide two exam-level configs.");

const assetRoot = resolve(root, "public/handwritten-ui");
const assetFiles = (await listFiles(assetRoot)).filter((path) => path.endsWith(".png"));
assert(assetFiles.length >= 80, `Expected at least 80 generated PNG assets; found ${assetFiles.length}.`);
let bytes = 0;
let largest = 0;
for (const file of assetFiles) {
  const info = await stat(file);
  bytes += info.size;
  largest = Math.max(largest, info.size);
}
assert(bytes <= 12 * 1024 * 1024, `Generated asset budget exceeded: ${(bytes / 1024 / 1024).toFixed(2)} MiB.`);
assert(largest <= 650 * 1024, `A generated asset is too large: ${(largest / 1024).toFixed(1)} KiB.`);

console.log(`v91 image theme contracts passed: ${assetFiles.length} PNG assets, ${(bytes / 1024 / 1024).toFixed(2)} MiB total.`);
