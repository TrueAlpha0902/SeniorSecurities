import type { Question, QuestionRef, QuizBank } from "../types";

const banksCache: { promise?: Promise<QuizBank[]> } = {};
const chapterCache = new Map<string, Promise<Question[]>>();

function dataUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  const normalizedPath = path.replace(/^\/+/, "");
  return encodeURI(`${normalizedBase}${normalizedPath}`);
}

async function fetchJson<T>(path: string): Promise<T> {
  const response = await fetch(dataUrl(path));
  if (!response.ok) {
    throw new Error(`Unable to load ${path}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export function loadBanks(): Promise<QuizBank[]> {
  banksCache.promise ??= fetchJson<QuizBank[]>("data/banks.json");
  return banksCache.promise;
}

export async function loadBank(bankId: string): Promise<QuizBank | undefined> {
  const banks = await loadBanks();
  return banks.find((bank) => bank.id === bankId);
}

export async function loadChapterQuestions(bankId: string, chapterId: string): Promise<Question[]> {
  const cacheKey = `${bankId}/${chapterId}`;
  const cached = chapterCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  const promise = loadBanks().then(async (banks) => {
    const bank = banks.find((candidate) => candidate.id === bankId);
    const chapter = bank?.chapters.find((candidate) => candidate.id === chapterId);
    if (!bank || !chapter) {
      throw new Error(`Question chapter not found: ${bankId} / ${chapterId}`);
    }
    return fetchJson<Question[]>(`data/${chapter.file}`);
  });

  chapterCache.set(cacheKey, promise);
  return promise;
}

export async function loadBankQuestions(bankId: string): Promise<Question[]> {
  const bank = await loadBank(bankId);
  if (!bank) {
    throw new Error(`Question bank not found: ${bankId}`);
  }

  const chapters = await Promise.all(
    bank.chapters.map((chapter) => loadChapterQuestions(bank.id, chapter.id))
  );
  return chapters.flat();
}

export async function loadAllQuestions(): Promise<Question[]> {
  const banks = await loadBanks();
  const bankQuestions = await Promise.all(banks.map((bank) => loadBankQuestions(bank.id)));
  return bankQuestions.flat();
}

export async function loadQuestionsForRefs(refs: readonly QuestionRef[]): Promise<Question[]> {
  if (refs.length === 0) {
    return [];
  }

  const grouped = new Map<string, QuestionRef[]>();
  refs.forEach((ref) => {
    const key = `${ref.bankId}/${ref.chapter}`;
    grouped.set(key, [...(grouped.get(key) ?? []), ref]);
  });

  const questionSets = await Promise.all(
    [...grouped.entries()].map(async ([key, groupedRefs]) => {
      const [bankId, ...chapterParts] = key.split("/");
      const chapter = chapterParts.join("/");
      if (!bankId || !chapter) {
        return [];
      }
      const ids = new Set(groupedRefs.map((ref) => ref.questionId));
      const questions = await loadChapterQuestions(bankId, chapter);
      return questions.filter((question) => ids.has(question.id));
    })
  );

  const byId = new Map(questionSets.flat().map((question) => [question.id, question]));
  return refs.map((ref) => byId.get(ref.questionId)).filter((question): question is Question => Boolean(question));
}

export async function findQuestionById(ref: QuestionRef): Promise<Question | undefined> {
  const questions = await loadQuestionsForRefs([ref]);
  return questions[0];
}
