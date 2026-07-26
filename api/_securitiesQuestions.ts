import { readFile } from "node:fs/promises";
import { resolve } from "node:path";

export type SecuritiesAnswerKey = "1" | "2" | "3" | "4";

export type SecuritiesQuestionRecord = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterTopic?: string;
  number: number;
  answer: SecuritiesAnswerKey;
  questionText?: string;
  optionTexts?: Record<SecuritiesAnswerKey, string>;
  explanationText?: string;
};

type ManifestChapter = {
  chapterId: string;
  chapterTitle: string;
  chapterSlug: string;
  sourceFile: string;
  questionCount: number;
  path: string;
  hash: string;
  bytes: number;
};

type ManifestBank = {
  bankId: string;
  bankTitle: string;
  questionCount: number;
  chapters: ManifestChapter[];
};

export type SecuritiesManifest = {
  schemaVersion: 3;
  releaseId: string;
  sourceHash: string;
  generatedAt: string;
  totalQuestions: number;
  questionIndex: Record<string, string>;
  banks: ManifestBank[];
};

type SourceQuestion = SecuritiesQuestionRecord & {
  sourceFile?: string;
  questionSegments?: unknown[];
  explanationSegments?: unknown[];
  answerMask?: unknown;
};

type SourceChapter = {
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterTopic?: string;
  chapterSlug: string;
  sourceFile?: string;
  questionCount: number;
  questions: SourceQuestion[];
};

type SourceShard = {
  bankId: string;
  bankTitle: string;
  chapter: SourceChapter;
};

export type SecuritiesClientQuestion = SecuritiesQuestionRecord & {
  sourceFile: "";
  questionSegments: [];
  explanationSegments: [];
  answerMask: null;
};

export type SecuritiesClientChapter = {
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterTopic?: string;
  chapterSlug: string;
  sourceFile: "";
  questionCount: number;
  questions: SecuritiesClientQuestion[];
};

const root = process.cwd();
const manifestPath = resolve(root, "public", "data", "question-release-manifest.json");
let manifestPromise: Promise<SecuritiesManifest> | undefined;
const shardCache = new Map<string, Promise<SourceShard>>();

function normalizePath(value: string): string {
  return value.replace(/^\/+/, "").replaceAll("\\", "/");
}

export async function loadSecuritiesManifest(): Promise<SecuritiesManifest> {
  if (manifestPromise) return manifestPromise;
  const promise = readFile(manifestPath, "utf8")
    .then((source) => JSON.parse(source) as SecuritiesManifest);
  manifestPromise = promise;
  void promise.catch(() => {
    if (manifestPromise === promise) manifestPromise = undefined;
  });
  return promise;
}

export async function loadSecuritiesShard(path: string): Promise<SourceShard> {
  const manifest = await loadSecuritiesManifest();
  const normalized = normalizePath(path);
  const allowed = manifest.banks.some((bank) =>
    bank.chapters.some((chapter) => chapter.path === normalized),
  );
  if (!allowed) throw new Error("Unknown securities chapter shard.");

  const existing = shardCache.get(normalized);
  if (existing) return existing;

  const filePath = resolve(root, "public", normalized);
  const promise = readFile(filePath, "utf8")
    .then((source) => JSON.parse(source) as SourceShard);
  shardCache.set(normalized, promise);
  void promise.catch(() => {
    if (shardCache.get(normalized) === promise) shardCache.delete(normalized);
  });
  return promise;
}

export function toSecuritiesClientQuestion(question: SourceQuestion): SecuritiesClientQuestion {
  if (!question.questionText || !question.optionTexts || !question.explanationText) {
    throw new Error(`Securities text is incomplete for ${question.id}.`);
  }
  return {
    id: question.id,
    bankId: question.bankId,
    bankTitle: question.bankTitle,
    chapterId: question.chapterId,
    chapterTitle: question.chapterTitle,
    chapterTopic: question.chapterTopic,
    number: question.number,
    answer: question.answer,
    questionText: question.questionText,
    optionTexts: question.optionTexts,
    explanationText: question.explanationText,
    sourceFile: "",
    questionSegments: [],
    explanationSegments: [],
    answerMask: null,
  };
}

export function toSecuritiesClientChapter(shard: SourceShard): SecuritiesClientChapter {
  return {
    bankId: shard.chapter.bankId,
    bankTitle: shard.chapter.bankTitle,
    chapterId: shard.chapter.chapterId,
    chapterTitle: shard.chapter.chapterTitle,
    chapterTopic: shard.chapter.chapterTopic,
    chapterSlug: shard.chapter.chapterSlug,
    sourceFile: "",
    questionCount: shard.chapter.questionCount,
    questions: shard.chapter.questions.map(toSecuritiesClientQuestion),
  };
}

export async function loadSecuritiesQuestionsByIds(questionIds: readonly string[]): Promise<SecuritiesQuestionRecord[]> {
  const manifest = await loadSecuritiesManifest();
  const requested = new Set(questionIds);
  const paths = Array.from(new Set(
    questionIds
      .map((id) => manifest.questionIndex[id])
      .filter((path): path is string => Boolean(path)),
  ));
  const shards = await Promise.all(paths.map((path) => loadSecuritiesShard(path)));
  const byId = new Map(
    shards.flatMap((shard) => shard.chapter.questions)
      .filter((question) => requested.has(question.id))
      .map((question) => [question.id, question] as const),
  );
  return questionIds
    .map((id) => byId.get(id))
    .filter((question): question is SourceQuestion => Boolean(question));
}


function normalizeSearchText(value: unknown): string {
  return String(value ?? "").trim().toLowerCase().replace(/\s+/g, " ");
}

export async function searchSecuritiesQuestions(
  query: string,
  limit: number,
): Promise<SourceQuestion[]> {
  const normalized = normalizeSearchText(query);
  if (normalized.length < 2) return [];
  const manifest = await loadSecuritiesManifest();
  const shards = await Promise.all(
    manifest.banks.flatMap((bank) =>
      bank.chapters.map((chapter) => loadSecuritiesShard(chapter.path)),
    ),
  );
  const results: SourceQuestion[] = [];
  for (const question of shards.flatMap((shard) => shard.chapter.questions)) {
    const haystack = normalizeSearchText([
      question.bankTitle,
      question.chapterTitle,
      question.chapterTopic,
      question.number,
      question.questionText,
      question.optionTexts?.["1"],
      question.optionTexts?.["2"],
      question.optionTexts?.["3"],
      question.optionTexts?.["4"],
      question.explanationText,
    ].filter(Boolean).join(" "));
    if (!haystack.includes(normalized)) continue;
    results.push(question);
    if (results.length >= limit) break;
  }
  return results;
}

export async function loadSecuritiesBankQuestions(bankId: string): Promise<SourceQuestion[]> {
  const manifest = await loadSecuritiesManifest();
  const sourceBankIds = bankId === "securities-laws-practice"
    ? ["securities-trading-regulations", "securities-trading-practice"]
    : [bankId];
  const banks = manifest.banks.filter((bank) => sourceBankIds.includes(bank.bankId));
  if (!banks.length) return [];
  const shards = await Promise.all(banks.flatMap((bank) => bank.chapters.map((chapter) => loadSecuritiesShard(chapter.path))));
  return shards.flatMap((shard) => shard.chapter.questions);
}
