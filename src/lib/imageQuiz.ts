export type NumericAnswer = "1" | "2" | "3" | "4";

export type PdfCropSegment = {
  page: number;
  src: string;
  x: number;
  y: number;
  width: number;
  height: number;
  pageWidth: number;
  pageHeight: number;
};

export type PdfMaskRect = {
  x: number;
  y: number;
  width: number;
  height: number;
};

export type ImageQuizQuestion = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterTopic?: string;
  number: number;
  answer: NumericAnswer;
  sourceFile: string;
  questionSegments: PdfCropSegment[];
  explanationSegments: PdfCropSegment[];
  answerMask: PdfMaskRect | null;
};

export type ImageQuizChapter = {
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterTopic?: string;
  chapterSlug: string;
  sourceFile: string;
  questionCount: number;
  questions: ImageQuizQuestion[];
  sourceBankId?: string;
  sourceBankTitle?: string;
  sourceChapterId?: string;
};

export type ImageQuizBank = {
  bankId: string;
  bankTitle: string;
  chapters: ImageQuizChapter[];
};

type ImageQuizData = {
  banks: ImageQuizBank[];
};

export type SimilarQuestionGroup = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  score: number;
  questionIds: string[];
};

type SimilarQuestionData = {
  groups: SimilarQuestionGroup[];
};

const dataCache: { promise?: Promise<ImageQuizData> } = {};
const similarGroupsCache: { promise?: Promise<SimilarQuestionGroup[]> } = {};
const trialQuestionsCache: { promise?: Promise<ImageQuizQuestion[]> } = {};
const summaryBanksCache: { promise?: Promise<ImageQuizBank[]> } = {};
const IMAGE_DATA_CACHE_VERSION = "20260705-crop-fix";
const SECURITIES_COMBINED_BANK_ID = "securities-laws-practice";
const SECURITIES_COMBINED_BANK_TITLE = "\u8b49\u5238\u76f8\u95dc\u6cd5\u898f\u8207\u5be6\u52d9";

const CHAPTER_TOPIC_TITLES: Record<string, Record<string, string>> = {
  investment: {
    ch01: "\u6295\u8cc7\u74b0\u5883\u8207\u91d1\u878d\u5de5\u5177",
    ch02: "\u56fa\u5b9a\u6536\u76ca\u8b49\u5238\u5206\u6790",
    ch03: "\u666e\u901a\u80a1\u8a55\u50f9\u8207\u5206\u6790",
    ch04: "\u8b49\u5238\u6295\u8cc7\u6280\u8853\u5206\u6790",
    ch05: "\u6295\u8cc7\u7d44\u5408\u7406\u8ad6",
    ch06: "\u8cc7\u672c\u8cc7\u7522\u5b9a\u50f9\u8207\u98a8\u96aa",
    ch07: "\u6548\u7387\u5e02\u5834\u8207\u6295\u8cc7\u7e3e\u6548",
    ch08: "\u884d\u751f\u6027\u91d1\u878d\u5546\u54c1",
    ch09: "\u57fa\u91d1\u8207\u6295\u8cc7\u7ba1\u7406",
  },
  "financial-analysis": {
    ch01: "\u8ca1\u52d9\u5831\u8868\u5206\u6790\u6982\u8ad6",
    ch02: "\u8ca1\u52d9\u5831\u8868\u7de8\u88fd\u8207\u89e3\u8b80",
    ch03: "\u73fe\u91d1\u6d41\u91cf\u5206\u6790",
    ch04: "\u8ca1\u52d9\u6bd4\u7387\u5206\u6790",
    ch05: "\u7372\u5229\u80fd\u529b\u8207\u6210\u9577\u5206\u6790",
    ch06: "\u8cc7\u7522\u8ca0\u50b5\u8207\u6b0a\u76ca\u5206\u6790",
    ch07: "\u4f01\u696d\u8a55\u50f9\u8207\u6295\u8cc7\u5206\u6790",
    ch08: "\u71df\u904b\u6548\u7387\u5206\u6790",
    ch09: "\u511f\u50b5\u80fd\u529b\u8207\u98a8\u96aa\u5206\u6790",
    ch10: "\u8ca1\u52d9\u9810\u6e2c\u8207\u7279\u6b8a\u6703\u8a08\u8b70\u984c",
    ch11: "\u7d9c\u5408\u5206\u6790\u8207\u6848\u4f8b",
  },
  "securities-trading-regulations": {
    ch01: "\u8b49\u5238\u4ea4\u6613\u6cd5\u7e3d\u5247",
    ch02: "\u6709\u50f9\u8b49\u5238\u52df\u96c6\u8207\u767c\u884c",
    ch03: "\u516c\u958b\u767c\u884c\u516c\u53f8\u7ba1\u7406",
    ch04: "\u8b49\u5238\u5546\u8207\u8b49\u5238\u4ea4\u6613\u5e02\u5834",
    ch05: "\u4e0a\u5e02\u4e0a\u6ac3\u8207\u8cc7\u8a0a\u63ed\u9732",
    ch06: "\u516c\u958b\u6536\u8cfc\u8207\u5167\u90e8\u4eba\u898f\u7bc4",
    ch07: "\u6cd5\u5f8b\u8cac\u4efb\u8207\u88c1\u7f70",
  },
  "securities-trading-practice": {
    ch01: "\u8b49\u5238\u5e02\u5834\u8207\u4ea4\u6613\u5236\u5ea6",
    ch02: "\u8b49\u5238\u958b\u6236\u8207\u53d7\u8a17\u8cb7\u8ce3",
    ch03: "\u96c6\u4e2d\u5e02\u5834\u4ea4\u6613\u5be6\u52d9",
    ch04: "\u4e0a\u6ac3\u8207\u8208\u6ac3\u4ea4\u6613\u5be6\u52d9",
    ch05: "\u4fe1\u7528\u4ea4\u6613\u5be6\u52d9",
    ch06: "\u8b49\u5238\u7d66\u4ed8\u7d50\u7b97\u8207\u96c6\u4fdd",
    ch07: "\u50b5\u5238\u4ea4\u6613\u5be6\u52d9",
    ch08: "\u884d\u751f\u6027\u5546\u54c1\u8207\u907f\u96aa",
    ch09: "\u627f\u92b7\u8207\u52df\u96c6\u767c\u884c\u5be6\u52d9",
    ch10: "\u8b49\u5238\u5546\u5167\u90e8\u63a7\u5236\u8207\u7a3d\u6838",
    ch11: "\u53cd\u6d17\u9322\u8207\u6cd5\u4ee4\u9075\u5faa",
    ch12: "\u8ca1\u5bcc\u7ba1\u7406\u8207\u5ba2\u6236\u670d\u52d9",
    ch13: "\u8b49\u5238\u5e02\u5834\u7d9c\u5408\u5be6\u52d9",
  },
};

export function assetUrl(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  const normalizedBase = base.endsWith("/") ? base : `${base}/`;
  return encodeURI(`${normalizedBase}${path.replace(/^\/+/, "")}`);
}

async function fetchJson<T>(path: string): Promise<T> {
  const url = assetUrl(path);
  const separator = url.includes("?") ? "&" : "?";
  const response = await fetch(`${url}${separator}v=${IMAGE_DATA_CACHE_VERSION}`);
  if (!response.ok) {
    throw new Error(`\u7121\u6cd5\u8f09\u5165 ${path}: ${response.status} ${response.statusText}`);
  }
  return (await response.json()) as T;
}

export async function loadImageQuizData(): Promise<ImageQuizData> {
  dataCache.promise ??= fetchJson<ImageQuizData>("data/pdf-image-quiz.json").then(normalizeImageQuizData);
  return dataCache.promise;
}

export async function loadImageQuizBanks(): Promise<ImageQuizBank[]> {
  const data = await loadImageQuizData();
  return data.banks;
}

export async function loadImageQuizBankSummaries(): Promise<ImageQuizBank[]> {
  summaryBanksCache.promise ??= fetchJson<ImageQuizData>("data/pdf-image-quiz-summary.json")
    .then(normalizeImageQuizData)
    .then((data) => data.banks);
  return summaryBanksCache.promise;
}

export async function loadImageQuizBank(bankId: string): Promise<ImageQuizBank | undefined> {
  const banks = await loadImageQuizBanks();
  return banks.find((bank) => bank.bankId === bankId);
}

export async function loadImageQuizChapter(bankId: string, chapterId: string): Promise<ImageQuizChapter | undefined> {
  const bank = await loadImageQuizBank(bankId);
  return bank?.chapters.find((chapter) => chapter.chapterId === chapterId);
}

export async function loadImageBankQuestions(bankId: string): Promise<ImageQuizQuestion[]> {
  const bank = await loadImageQuizBank(bankId);
  if (!bank) {
    throw new Error(`\u627e\u4e0d\u5230\u984c\u5eab\uff1a${bankId}`);
  }
  return bank.chapters.flatMap((chapter) => chapter.questions);
}

export async function loadImageChapterQuestions(bankId: string, chapterId: string): Promise<ImageQuizQuestion[]> {
  const chapter = await loadImageQuizChapter(bankId, chapterId);
  if (!chapter) {
    throw new Error(`\u627e\u4e0d\u5230\u7ae0\u7bc0\uff1a${bankId} / ${chapterId}`);
  }
  return chapter.questions;
}

export async function loadAllImageQuestions(): Promise<ImageQuizQuestion[]> {
  const banks = await loadImageQuizBanks();
  return banks.flatMap((bank) => bank.chapters.flatMap((chapter) => chapter.questions));
}

export async function loadTrialImageQuestions(): Promise<ImageQuizQuestion[]> {
  trialQuestionsCache.promise ??= fetchJson<ImageQuizData>("data/pdf-image-quiz-trial.json")
    .then(normalizeImageQuizData)
    .then((data) => data.banks.flatMap((bank) => bank.chapters.flatMap((chapter) => chapter.questions)).slice(0, 10));
  return trialQuestionsCache.promise;
}

export async function loadSimilarQuestionGroups(): Promise<SimilarQuestionGroup[]> {
  similarGroupsCache.promise ??= fetchJson<SimilarQuestionData>("data/similar-question-groups.json").then(
    (data) => data.groups,
  );
  return similarGroupsCache.promise;
}

export function findImageQuestion(
  questions: readonly ImageQuizQuestion[],
  questionId: string,
): ImageQuizQuestion | undefined {
  return questions.find((question) => question.id === questionId);
}

export function formatImageQuizQuestionSource(question: ImageQuizQuestion): string {
  const base = `${question.bankTitle} / ${question.chapterTitle}`;
  const topic = question.chapterTopic?.trim();
  return topic ? `${base} - ${topic}` : base;
}

function normalizeImageQuizData(data: ImageQuizData): ImageQuizData {
  const banks = data.banks.map(enrichBankTopics);
  const regulations = banks.find((bank) => bank.bankId === "securities-trading-regulations");
  const practice = banks.find((bank) => bank.bankId === "securities-trading-practice");

  if (!regulations || !practice) {
    return { banks };
  }

  const combined: ImageQuizBank = {
    bankId: SECURITIES_COMBINED_BANK_ID,
    bankTitle: SECURITIES_COMBINED_BANK_TITLE,
    chapters: [
      ...regulations.chapters.map((chapter) => makeCombinedChapter(chapter, "\u6cd5\u898f", "regulations")),
      ...practice.chapters.map((chapter) => makeCombinedChapter(chapter, "\u5be6\u52d9", "practice")),
    ],
  };

  return {
    banks: [
      ...banks.filter(
        (bank) => bank.bankId !== "securities-trading-regulations" && bank.bankId !== "securities-trading-practice",
      ),
      combined,
    ],
  };
}

function enrichBankTopics(bank: ImageQuizBank): ImageQuizBank {
  return {
    ...bank,
    chapters: bank.chapters.map((chapter) => {
      const chapterTopic = CHAPTER_TOPIC_TITLES[bank.bankId]?.[chapter.chapterSlug];
      return {
        ...chapter,
        chapterTopic,
        questions: chapter.questions.map((question) => ({
          ...question,
          bankTitle: bank.bankTitle,
          chapterTitle: chapter.chapterTitle,
          chapterTopic,
        })),
      };
    }),
  };
}

function makeCombinedChapter(chapter: ImageQuizChapter, label: string, prefix: string): ImageQuizChapter {
  return {
    ...chapter,
    chapterId: `${prefix}-${chapter.chapterSlug}`,
    chapterTitle: `${label} / ${chapter.chapterTitle}`,
    sourceBankId: chapter.bankId,
    sourceBankTitle: chapter.bankTitle,
    sourceChapterId: chapter.chapterId,
  };
}
