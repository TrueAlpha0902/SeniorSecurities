import fs from "node:fs/promises";
import path from "node:path";
import type { QuizBank } from "../../src/types";
import type { StagedQuestion } from "./types";

export async function readJsonFile<T>(filePath: string): Promise<T> {
  const content = await fs.readFile(filePath, "utf8");
  return JSON.parse(content) as T;
}

export async function writeJsonFile(filePath: string, value: unknown): Promise<void> {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export async function listDocxFiles(batchDir: string): Promise<string[]> {
  const entries = await fs.readdir(batchDir, { withFileTypes: true });
  return entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".docx") && !entry.name.startsWith("~$"))
    .map((entry) => path.join(batchDir, entry.name))
    .sort((left, right) => left.localeCompare(right, "zh-Hant"));
}

export async function listJsonFiles(rootDir: string): Promise<string[]> {
  const entries = await fs.readdir(rootDir, { withFileTypes: true });
  const files = await Promise.all(
    entries.map(async (entry) => {
      const entryPath = path.join(rootDir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === "reports") {
          return [];
        }
        return listJsonFiles(entryPath);
      }
      if (
        entry.isFile() &&
        entry.name.toLowerCase().endsWith(".json") &&
        !entry.name.endsWith(".validation.json") &&
        entry.name !== "banks.json"
      ) {
        return [entryPath];
      }
      return [];
    })
  );
  return files.flat().sort((left, right) => left.localeCompare(right, "zh-Hant"));
}

export async function readProductionData(dataDir: string): Promise<{ banks: QuizBank[]; questions: StagedQuestion[] }> {
  const banksPath = path.join(dataDir, "banks.json");
  const banks = await readJsonFile<QuizBank[]>(banksPath);
  const questions: StagedQuestion[] = [];

  for (const bank of banks) {
    for (const chapter of bank.chapters) {
      const chapterPath = path.join(dataDir, chapter.file);
      const chapterQuestions = await readJsonFile<StagedQuestion[]>(chapterPath);
      questions.push(...chapterQuestions);
    }
  }

  return { banks, questions };
}

export async function readQuestionFiles(rootDir: string): Promise<StagedQuestion[]> {
  const files = await listJsonFiles(rootDir);
  const questionSets = await Promise.all(files.map((file) => readJsonFile<StagedQuestion[]>(file)));
  return questionSets.flat();
}
