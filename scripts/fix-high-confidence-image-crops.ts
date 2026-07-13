import { existsSync } from "node:fs";
import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

type Segment = {
  page: number;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
};

type Question = {
  id: string;
  explanationSegments: Segment[];
};

type QuizData = {
  banks: Array<{
    chapters: Array<{
      questions: Question[];
    }>;
  }>;
};

type HeightPatch = {
  kind: "height";
  questionId: string;
  before: Segment;
  afterHeight: number;
};

type RemoveFirstPatch = {
  kind: "remove-first";
  questionId: string;
  before: Segment[];
  after: Segment[];
};

type CropPatch = HeightPatch | RemoveFirstPatch;

const root = process.cwd();
const sourcePath = path.join(root, "public", "data", "pdf-image-quiz.json");
const trialPath = path.join(root, "public", "data", "pdf-image-quiz-trial.json");

const patches: CropPatch[] = [
  {
    kind: "height",
    questionId: "investment-ch01-pdf-0004",
    before: {
      page: 1,
      src: "pdf-pages/investment/ch01/page-01.webp",
      x: 60,
      y: 1495,
      width: 1160,
      height: 193,
      pageWidth: 1239,
      pageHeight: 1752,
    },
    afterHeight: 153,
  },
  {
    kind: "height",
    questionId: "investment-ch04-pdf-0002",
    before: {
      page: 1,
      src: "pdf-pages/investment/ch04/page-01.webp",
      x: 60,
      y: 931,
      width: 1160,
      height: 169,
      pageWidth: 1239,
      pageHeight: 1752,
    },
    afterHeight: 306,
  },
  {
    kind: "height",
    questionId: "financial-analysis-ch08-pdf-0047",
    before: {
      page: 11,
      src: "pdf-pages/financial-analysis/ch08/page-11.webp",
      x: 60,
      y: 555,
      width: 1160,
      height: 1133,
      pageWidth: 1239,
      pageHeight: 1752,
    },
    afterHeight: 160,
  },
  {
    kind: "remove-first",
    questionId: "securities-trading-regulations-ch02-pdf-0097",
    before: [
      {
        page: 26,
        src: "pdf-pages/securities-trading-regulations/ch02/page-26.webp",
        x: 60,
        y: 1658,
        width: 1160,
        height: 30,
        pageWidth: 1239,
        pageHeight: 1752,
      },
      {
        page: 27,
        src: "pdf-pages/securities-trading-regulations/ch02/page-27.webp",
        x: 60,
        y: 202,
        width: 1160,
        height: 164,
        pageWidth: 1239,
        pageHeight: 1752,
      },
    ],
    after: [
      {
        page: 27,
        src: "pdf-pages/securities-trading-regulations/ch02/page-27.webp",
        x: 60,
        y: 202,
        width: 1160,
        height: 164,
        pageWidth: 1239,
        pageHeight: 1752,
      },
    ],
  },
  {
    kind: "remove-first",
    questionId: "securities-trading-regulations-ch02-pdf-0125",
    before: [
      {
        page: 34,
        src: "pdf-pages/securities-trading-regulations/ch02/page-34.webp",
        x: 60,
        y: 1659,
        width: 1160,
        height: 29,
        pageWidth: 1239,
        pageHeight: 1752,
      },
      {
        page: 35,
        src: "pdf-pages/securities-trading-regulations/ch02/page-35.webp",
        x: 60,
        y: 188,
        width: 1160,
        height: 208,
        pageWidth: 1239,
        pageHeight: 1752,
      },
    ],
    after: [
      {
        page: 35,
        src: "pdf-pages/securities-trading-regulations/ch02/page-35.webp",
        x: 60,
        y: 188,
        width: 1160,
        height: 208,
        pageWidth: 1239,
        pageHeight: 1752,
      },
    ],
  },
  {
    kind: "remove-first",
    questionId: "securities-trading-regulations-ch04-pdf-0125",
    before: [
      {
        page: 33,
        src: "pdf-pages/securities-trading-regulations/ch04/page-33.webp",
        x: 60,
        y: 1656,
        width: 1160,
        height: 32,
        pageWidth: 1239,
        pageHeight: 1752,
      },
      {
        page: 34,
        src: "pdf-pages/securities-trading-regulations/ch04/page-34.webp",
        x: 60,
        y: 205,
        width: 1160,
        height: 258,
        pageWidth: 1239,
        pageHeight: 1752,
      },
    ],
    after: [
      {
        page: 34,
        src: "pdf-pages/securities-trading-regulations/ch04/page-34.webp",
        x: 60,
        y: 205,
        width: 1160,
        height: 258,
        pageWidth: 1239,
        pageHeight: 1752,
      },
    ],
  },
];

const geometryKeys = [
  "page",
  "src",
  "x",
  "y",
  "width",
  "height",
  "pageWidth",
  "pageHeight",
] as const;

function hasSameGeometry(actual: Segment, expected: Segment): boolean {
  return geometryKeys.every((key) => actual[key] === expected[key]);
}

function hasSameGeometryList(actual: Segment[], expected: Segment[]): boolean {
  return (
    actual.length === expected.length &&
    actual.every((segment, index) => hasSameGeometry(segment, expected[index]!))
  );
}

function formatGeometry(segments: Segment[]): string {
  return JSON.stringify(
    segments.map((segment) =>
      Object.fromEntries(geometryKeys.map((key) => [key, segment[key]])),
    ),
  );
}

function indexQuestions(data: QuizData): Map<string, Question> {
  const index = new Map<string, Question>();
  for (const bank of data.banks) {
    for (const chapter of bank.chapters) {
      for (const question of chapter.questions) {
        if (index.has(question.id)) {
          throw new Error(`Duplicate question id: ${question.id}`);
        }
        index.set(question.id, question);
      }
    }
  }
  return index;
}

function applyPatch(question: Question, patch: CropPatch): "changed" | "current" {
  const actual = question.explanationSegments;

  if (patch.kind === "height") {
    const after = { ...patch.before, height: patch.afterHeight };
    if (hasSameGeometryList(actual, [after])) {
      return "current";
    }
    if (!hasSameGeometryList(actual, [patch.before])) {
      throw new Error(
        `${patch.questionId}: expected old or repaired explanation geometry, got ${formatGeometry(actual)}`,
      );
    }
    actual[0]!.height = patch.afterHeight;
    return "changed";
  }

  if (hasSameGeometryList(actual, patch.after)) {
    return "current";
  }
  if (!hasSameGeometryList(actual, patch.before)) {
    throw new Error(
      `${patch.questionId}: expected exact two-segment geometry before removing the blank seam, got ${formatGeometry(actual)}`,
    );
  }
  question.explanationSegments.splice(0, 1);
  return "changed";
}

async function repairFile(filePath: string, requireAllTargets: boolean): Promise<void> {
  const raw = await readFile(filePath, "utf8");
  const data = JSON.parse(raw) as QuizData;
  const questions = indexQuestions(data);
  const changed: string[] = [];
  const current: string[] = [];
  const absent: string[] = [];

  for (const patch of patches) {
    const question = questions.get(patch.questionId);
    if (!question) {
      absent.push(patch.questionId);
      continue;
    }
    const result = applyPatch(question, patch);
    (result === "changed" ? changed : current).push(patch.questionId);
  }

  if (requireAllTargets && absent.length > 0) {
    throw new Error(`${path.basename(filePath)} is missing required targets: ${absent.join(", ")}`);
  }

  if (changed.length > 0) {
    const trailingNewline = raw.endsWith("\n") ? "\n" : "";
    await writeFile(filePath, `${JSON.stringify(data)}${trailingNewline}`, "utf8");
  }

  console.log(
    `${path.relative(root, filePath)}: changed=${changed.length}, already-current=${current.length}, absent=${absent.length}`,
  );
  if (absent.length > 0) {
    console.log(`  absent targets: ${absent.join(", ")}`);
  }
}

await repairFile(sourcePath, true);
if (existsSync(trialPath)) {
  await repairFile(trialPath, false);
}
