import {
  fetchQuestionBankResponse,
  getQuestionBankAccess,
  requestQuestionBankJson,
} from "./questionBankApi";

const RUNTIME_ENV = (import.meta as ImportMeta & { env?: ImportMetaEnv }).env;
const LOCAL_PREVIEW_ACCESS = Boolean(RUNTIME_ENV?.DEV && RUNTIME_ENV.VITE_LOCAL_PREVIEW_ACCESS === "1");

export type NumericAnswer = "1" | "2" | "3" | "4";

export const SECURITIES_QUESTION_ID_PATTERN = /^[a-z0-9][a-z0-9-]{2,120}-pdf-\d{4}$/;

export function isSecuritiesQuestionId(value: unknown): value is string {
  return typeof value === "string" && SECURITIES_QUESTION_ID_PATTERN.test(value);
}

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

export type MobileSegmentVerification = `pixel-and-visual-reviewed:v2:${string}`;

const MOBILE_SEGMENT_VERIFICATION_PATTERN = /^pixel-and-visual-reviewed:v2:[a-f0-9]{64}:[a-f0-9]{64}:\d{1,6}:[a-f0-9]{64}$/;

export type ImageQuizQuestion = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  chapterTopic?: string;
  number: number;
  answer: NumericAnswer;
  answerRedacted?: boolean;
  sourceFile: string;
  questionSegments: PdfCropSegment[];
  explanationSegments: PdfCropSegment[];
  mobileQuestionSegments?: PdfCropSegment[];
  mobileExplanationSegments?: PdfCropSegment[];
  mobileQuestionSegmentsVerification?: MobileSegmentVerification;
  mobileExplanationSegmentsVerification?: MobileSegmentVerification;
  answerMask: PdfMaskRect | null;
  questionText?: string;
  optionTexts?: Record<NumericAnswer, string>;
  explanationText?: string;
  textSource?: {
    kind: "project-scan-pages-only";
    questionSegmentsSha256: string;
    explanationSegmentsSha256: string;
  };
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

export type ImageQuizLearnerOverride = {
  questionId: string;
  bankTitle?: string;
  chapterTitle?: string;
  questionNumber?: number;
  answer: NumericAnswer;
};

export type ImageQuizQuestionOverride = {
  questionId: string;
  bankTitle?: string;
  chapterTitle?: string;
  questionNumber?: number;
  answer: NumericAnswer;
  questionSegments: PdfCropSegment[];
  explanationSegments: PdfCropSegment[];
  mobileQuestionSegments?: PdfCropSegment[];
  mobileExplanationSegments?: PdfCropSegment[];
  mobileQuestionSegmentsVerification?: MobileSegmentVerification;
  mobileExplanationSegmentsVerification?: MobileSegmentVerification;
  updatedAt: string;
  updatedBy: string;
};

export type ImageQuizSegmentKind = "question" | "explanation";

function haveSameSegmentGeometry(left: PdfCropSegment[], right: PdfCropSegment[]): boolean {
  return left.length === right.length && left.every((segment, index) => {
    const candidate = right[index];
    return candidate !== undefined &&
      segment.page === candidate.page &&
      segment.src === candidate.src &&
      segment.x === candidate.x &&
      segment.y === candidate.y &&
      segment.width === candidate.width &&
      segment.height === candidate.height &&
      segment.pageWidth === candidate.pageWidth &&
      segment.pageHeight === candidate.pageHeight;
  });
}

function mobileSegmentsStayInsideSource(
  mobileSegments: PdfCropSegment[],
  sourceSegments: PdfCropSegment[],
): boolean {
  let previousOrder: [number, number, number] | undefined;
  for (const segment of mobileSegments) {
    const sourceIndex = sourceSegments.findIndex((source) => (
      source.page === segment.page &&
      source.src === segment.src &&
      source.pageWidth === segment.pageWidth &&
      source.pageHeight === segment.pageHeight &&
      segment.x >= source.x &&
      segment.y >= source.y &&
      segment.x + segment.width <= source.x + source.width &&
      segment.y + segment.height <= source.y + source.height
    ));
    if (sourceIndex < 0) return false;
    const order: [number, number, number] = [sourceIndex, segment.y, segment.x];
    if (previousOrder && (
      order[0] < previousOrder[0] ||
      (order[0] === previousOrder[0] && order[1] < previousOrder[1]) ||
      (order[0] === previousOrder[0] && order[1] === previousOrder[1] && order[2] < previousOrder[2])
    )) return false;
    previousOrder = order;
  }
  return true;
}

export function hasVerifiedMobileImageQuizSegments(
  question: ImageQuizQuestion,
  kind: ImageQuizSegmentKind,
): boolean {
  const segments = kind === "question"
    ? question.mobileQuestionSegments
    : question.mobileExplanationSegments;
  const verification = kind === "question"
    ? question.mobileQuestionSegmentsVerification
    : question.mobileExplanationSegmentsVerification;
  const sourceSegments = kind === "question"
    ? question.questionSegments
    : question.explanationSegments;
  return Boolean(
    segments?.length &&
    verification &&
    MOBILE_SEGMENT_VERIFICATION_PATTERN.test(verification) &&
    mobileSegmentsStayInsideSource(segments, sourceSegments),
  );
}

/**
 * Selects the reviewed mobile crop sequence when available. Missing or empty
 * alternates always fall back to the original crop so data generation can be
 * rolled out question-by-question without changing tablet/desktop rendering.
 */
export function getImageQuizSegments(
  question: ImageQuizQuestion,
  kind: ImageQuizSegmentKind,
  preferMobile: boolean,
): PdfCropSegment[] {
  const original = kind === "question"
    ? question.questionSegments
    : question.explanationSegments;
  if (!preferMobile || !hasVerifiedMobileImageQuizSegments(question, kind)) return original;
  const mobile = kind === "question"
    ? question.mobileQuestionSegments
    : question.mobileExplanationSegments;
  return mobile?.length ? mobile : original;
}

type QuestionOverridesResponse = {
  overrides?: ImageQuizLearnerOverride[];
};

type AdminQuestionOverridesResponse = {
  overrides?: ImageQuizQuestionOverride[];
};

export type SimilarQuestionGroup = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  score: number;
  similarity?: number;
  reason?: string;
  matchType?: "same-stem" | "numeric-variant" | "near-duplicate" | "same-concept";
  reviewed?: boolean;
  sharedTerms?: string[];
  contrastTerms?: string[];
  questionIds: string[];
};

type SimilarQuestionData = {
  groups: SimilarQuestionGroup[];
};

export type ImageQuizPlanningQuestion = Pick<
  ImageQuizQuestion,
  "id" | "bankId"
>;

type ImageQuizPlanningIndexData = {
  version: 1;
  questions: ImageQuizPlanningQuestion[];
};

type QuestionShardManifestChapter = {
  chapterId: string;
  chapterTitle: string;
  chapterSlug: string;
  sourceFile: string;
  questionCount: number;
  path: string;
  hash: string;
  bytes: number;
};

type QuestionShardManifestBank = {
  bankId: string;
  bankTitle: string;
  questionCount: number;
  chapters: QuestionShardManifestChapter[];
};


export type ImageQuizEditorChapterSummary = Pick<
  ImageQuizChapter,
  "bankId" | "bankTitle" | "chapterId" | "chapterTitle" | "chapterSlug" | "sourceFile" | "questionCount"
>;

export type ImageQuizEditorBankSummary = {
  bankId: string;
  bankTitle: string;
  chapters: ImageQuizEditorChapterSummary[];
};

export type QuestionReleaseManifest = {
  schemaVersion: 3;
  releaseId: string;
  sourceHash: string;
  generatedAt: string;
  totalQuestions: number;
  questionIndex: Record<string, string>;
  banks: QuestionShardManifestBank[];
};

type QuestionShardPayload = {
  bankId: string;
  bankTitle: string;
  chapter: ImageQuizChapter;
};

type SecuritiesMockApiQuestion = Omit<ImageQuizQuestion, "answer" | "sourceFile" | "questionSegments" | "explanationSegments" | "answerMask"> & {
  answer?: NumericAnswer;
  sourceFile?: string;
  questionSegments?: PdfCropSegment[];
  explanationSegments?: PdfCropSegment[];
  answerMask?: PdfMaskRect | null;
};

export type SecuritiesMockSession = {
  mockToken: string;
  questions: ImageQuizQuestion[];
};

export type SecuritiesMockResult = ImageQuizQuestion & {
  selectedAnswer: NumericAnswer | null;
  isCorrect: boolean;
};

export type SecuritiesMockSubmission = {
  questionCount: number;
  correctCount: number;
  results: SecuritiesMockResult[];
};

const dataCache: { promise?: Promise<ImageQuizData> } = {};
const manifestCache: { promise?: Promise<QuestionReleaseManifest> } = {};
const sourceBankCache = new Map<string, Promise<ImageQuizBank | undefined>>();
const sourceChapterCache = new Map<string, Promise<ImageQuizChapter>>();
const similarGroupsCache: { promise?: Promise<SimilarQuestionGroup[]> } = {};
const trialQuestionsCache: { promise?: Promise<ImageQuizQuestion[]> } = {};
const summaryBanksCache: { promise?: Promise<ImageQuizBank[]> } = {};
const planningIndexCache: { promise?: Promise<ImageQuizPlanningQuestion[]> } =
  {};
const questionOverridesCache: {
  promise?: Promise<Map<string, ImageQuizLearnerOverride>>;
} = {};

type PromiseCache<T> = { promise?: Promise<T> };

function rememberRecoverable<T>(
  cache: PromiseCache<T>,
  loader: () => Promise<T>,
): Promise<T> {
  if (cache.promise) return cache.promise;
  const promise = loader();
  cache.promise = promise;
  void promise.catch(() => {
    if (cache.promise === promise) delete cache.promise;
  });
  return promise;
}

function rememberRecoverableMap<K, V>(
  cache: Map<K, Promise<V>>,
  key: K,
  loader: () => Promise<V>,
): Promise<V> {
  const existing = cache.get(key);
  if (existing) return existing;
  const promise = loader();
  cache.set(key, promise);
  void promise.catch(() => {
    if (cache.get(key) === promise) cache.delete(key);
  });
  return promise;
}

export function resetImageQuizCaches(): void {
  delete dataCache.promise;
  delete manifestCache.promise;
  delete similarGroupsCache.promise;
  delete trialQuestionsCache.promise;
  delete summaryBanksCache.promise;
  delete planningIndexCache.promise;
  delete questionOverridesCache.promise;
  sourceBankCache.clear();
  sourceChapterCache.clear();
}


const SECURITIES_COMBINED_BANK_ID = "securities-laws-practice";
const SECURITIES_COMBINED_BANK_TITLE =
  "\u8b49\u5238\u76f8\u95dc\u6cd5\u898f\u8207\u5be6\u52d9";

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

async function fetchJson<T>(path: string, version?: string): Promise<T> {
  const url = assetUrl(path);
  const requestUrl = version
    ? `${url}${url.includes("?") ? "&" : "?"}v=${encodeURIComponent(version)}`
    : url;
  const response = await fetch(requestUrl, { cache: "no-store" });
  if (!response.ok) {
    throw new Error(
      `\u7121\u6cd5\u8f09\u5165 ${path}: ${response.status} ${response.statusText}`,
    );
  }
  if (!(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error(`\u7121\u6cd5\u8b58\u5225 ${path} \u7684\u56de\u61c9\u683c\u5f0f\u3002`);
  }
  return (await response.json()) as T;
}

const SECURITIES_OFFLINE_CACHE = "question-bank-data";

async function securitiesAccess(): Promise<{ token: string; account: string }> {
  return getQuestionBankAccess();
}

async function securitiesApiPost<T>(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<T> {
  return requestQuestionBankJson<T>({
    url: assetUrl("api/questions"),
    method: "POST",
    signal,
    context: "證券高業題庫",
    body: { resource: "securities", ...body },
  });
}

function normalizeSecuritiesApiQuestion(question: SecuritiesMockApiQuestion): ImageQuizQuestion {
  const hasAnswer = question.answer === "1" || question.answer === "2" || question.answer === "3" || question.answer === "4";
  return {
    ...question,
    answer: hasAnswer ? question.answer as NumericAnswer : "1",
    answerRedacted: !hasAnswer,
    sourceFile: "",
    questionSegments: [],
    explanationSegments: [],
    answerMask: null,
  };
}

function encodeLocalSecuritiesMockToken(questionIds: string[]): string {
  return `local.${btoa(JSON.stringify({ questionIds }))}`;
}

function decodeLocalSecuritiesMockToken(token: string): string[] {
  if (!token.startsWith("local.")) return [];
  try {
    const parsed = JSON.parse(atob(token.slice(6))) as { questionIds?: unknown };
    return Array.isArray(parsed.questionIds) ? parsed.questionIds.map(String) : [];
  } catch {
    return [];
  }
}

function redactLocalSecuritiesQuestion(question: ImageQuizQuestion): ImageQuizQuestion {
  return {
    ...question,
    answer: "1",
    answerRedacted: true,
    explanationText: undefined,
    sourceFile: "",
    questionSegments: [],
    explanationSegments: [],
    answerMask: null,
  };
}

export async function startSecuritiesMock(args: {
  bankId: string;
  randomCount: number;
  avoidIds?: string[];
  signal?: AbortSignal;
}): Promise<SecuritiesMockSession> {
  if (LOCAL_PREVIEW_ACCESS) {
    const source = await loadImageBankQuestions(args.bankId);
    const avoided = new Set(args.avoidIds ?? []);
    const available = source.filter((question) => !avoided.has(question.id));
    const pool = available.length ? available : source;
    const questions = [...pool].sort(() => Math.random() - 0.5).slice(0, args.randomCount);
    return {
      mockToken: encodeLocalSecuritiesMockToken(questions.map((question) => question.id)),
      questions: questions.map(redactLocalSecuritiesQuestion),
    };
  }
  const payload = await securitiesApiPost<{ mockToken?: string; questions?: SecuritiesMockApiQuestion[] }>({
    action: "mock-start",
    bankId: args.bankId,
    randomCount: args.randomCount,
    avoidIds: args.avoidIds ?? [],
  }, args.signal);
  if (!payload.mockToken || !Array.isArray(payload.questions)) throw new Error("模擬考建立失敗。");
  return { mockToken: payload.mockToken, questions: payload.questions.map(normalizeSecuritiesApiQuestion) };
}

export async function resumeSecuritiesMock(mockToken: string, signal?: AbortSignal): Promise<SecuritiesMockSession> {
  if (LOCAL_PREVIEW_ACCESS) {
    const questionIds = decodeLocalSecuritiesMockToken(mockToken);
    const questions = await loadImageQuestionsByIds(questionIds);
    return { mockToken, questions: questions.map(redactLocalSecuritiesQuestion) };
  }
  const payload = await securitiesApiPost<{ mockToken?: string; questions?: SecuritiesMockApiQuestion[] }>({
    action: "mock-resume",
    mockToken,
  }, signal);
  if (!payload.mockToken || !Array.isArray(payload.questions)) throw new Error("模擬考恢復失敗。");
  return { mockToken: payload.mockToken, questions: payload.questions.map(normalizeSecuritiesApiQuestion) };
}

export async function submitSecuritiesMock(
  mockToken: string,
  answers: Record<string, NumericAnswer>,
  signal?: AbortSignal,
): Promise<SecuritiesMockSubmission> {
  if (LOCAL_PREVIEW_ACCESS) {
    const questionIds = decodeLocalSecuritiesMockToken(mockToken);
    const questions = await loadImageQuestionsByIds(questionIds);
    const results = questions.map((question) => ({
      ...question,
      answerRedacted: false,
      selectedAnswer: answers[question.id] ?? null,
      isCorrect: answers[question.id] === question.answer,
    }));
    return {
      questionCount: results.length,
      correctCount: results.filter((question) => question.isCorrect).length,
      results,
    };
  }
  const payload = await securitiesApiPost<{
    questionCount?: number;
    correctCount?: number;
    results?: Array<SecuritiesMockApiQuestion & { selectedAnswer?: NumericAnswer | null; isCorrect?: boolean }>;
  }>({ action: "mock-submit", mockToken, answers }, signal);
  if (!Array.isArray(payload.results)) throw new Error("模擬考批改失敗。");
  const results = payload.results.map((question) => ({
    ...normalizeSecuritiesApiQuestion(question),
    selectedAnswer: question.selectedAnswer ?? null,
    isCorrect: Boolean(question.isCorrect),
  }));
  return {
    questionCount: Number(payload.questionCount ?? results.length),
    correctCount: Number(payload.correctCount ?? results.filter((question) => question.isCorrect).length),
    results,
  };
}

export async function securitiesChapterApiRequest(
  path: string,
  version?: string,
): Promise<{ url: string; headers: HeadersInit }> {
  const access = await securitiesAccess();
  const query = new URLSearchParams({
    resource: "securities",
    action: "chapter",
    path,
    account: access.account,
  });
  if (version) query.set("v", version);
  return {
    url: `${assetUrl("api/questions")}?${query.toString()}`,
    headers: access.token ? { Authorization: `Bearer ${access.token}` } : {},
  };
}

async function readCachedSecuritiesChapter<T>(url: string): Promise<T | undefined> {
  if (typeof window === "undefined" || !("caches" in window)) return undefined;
  const cache = await caches.open(SECURITIES_OFFLINE_CACHE);
  const cached = await cache.match(url);
  return cached ? await cached.json() as T : undefined;
}

async function fetchSecuritiesChapterPayload(
  path: string,
  version?: string,
): Promise<QuestionShardPayload> {
  if (LOCAL_PREVIEW_ACCESS) return fetchJson<QuestionShardPayload>(path, version);
  const request = await securitiesChapterApiRequest(path, version);
  try {
    const response = await fetchQuestionBankResponse({
      url: request.url,
      headers: request.headers,
      context: "證券高業題庫章節",
    });
    return await response.json() as QuestionShardPayload;
  } catch (error) {
    const cached = await readCachedSecuritiesChapter<QuestionShardPayload>(request.url);
    if (cached) return cached;
    throw error;
  }
}

export async function cacheSecuritiesChapterForOffline(
  path: string,
  version?: string,
): Promise<string> {
  if (typeof window === "undefined" || !("caches" in window)) {
    throw new Error("此瀏覽器不支援離線快取。");
  }
  const request = await securitiesChapterApiRequest(path, version);
  const response = await fetchQuestionBankResponse({
    url: request.url,
    headers: request.headers,
    context: "證券高業離線題庫",
  });
  const cache = await caches.open(SECURITIES_OFFLINE_CACHE);
  await cache.put(request.url, response.clone());
  return request.url;
}

export async function loadQuestionReleaseManifest(): Promise<QuestionReleaseManifest> {
  return rememberRecoverable(manifestCache, () =>
    fetchJson<QuestionReleaseManifest>("data/question-release-manifest.json"),
  );
}

async function loadSourceChapter(
  bank: QuestionShardManifestBank,
  chapter: QuestionShardManifestChapter,
): Promise<ImageQuizChapter> {
  const key = `${bank.bankId}:${chapter.chapterId}:${chapter.hash}`;
  return rememberRecoverableMap(sourceChapterCache, key, () =>
    fetchSecuritiesChapterPayload(chapter.path, chapter.hash).then(
      (payload) => payload.chapter,
    ),
  );
}

function findManifestChapterByPath(
  manifest: QuestionReleaseManifest,
  shardPath: string,
):
  | { bank: QuestionShardManifestBank; chapter: QuestionShardManifestChapter }
  | undefined {
  for (const bank of manifest.banks) {
    const chapter = bank.chapters.find(
      (candidate) => candidate.path === shardPath,
    );
    if (chapter) return { bank, chapter };
  }
  return undefined;
}

async function loadSourceBank(
  bankId: string,
): Promise<ImageQuizBank | undefined> {
  return rememberRecoverableMap(sourceBankCache, bankId, () =>
    loadQuestionReleaseManifest().then(async (manifest) => {
      const bank = manifest.banks.find(
        (candidate) => candidate.bankId === bankId,
      );
      if (!bank) return undefined;
      const chapters = await Promise.all(
        bank.chapters.map((chapter) => loadSourceChapter(bank, chapter)),
      );
      return enrichBankTopics({
        bankId: bank.bankId,
        bankTitle: bank.bankTitle,
        chapters,
      });
    }),
  );
}

export async function loadImageQuizData(): Promise<ImageQuizData> {
  return rememberRecoverable(dataCache, () =>
    Promise.all([
      loadQuestionReleaseManifest(),
      loadQuestionOverrides(),
    ]).then(async ([manifest, overrides]) => {
      const sourceBanks = (
        await Promise.all(
          manifest.banks.map((bank) => loadSourceBank(bank.bankId)),
        )
      ).filter((bank): bank is ImageQuizBank => Boolean(bank));
      return normalizeImageQuizData(
        applyQuestionOverrides({ banks: sourceBanks }, overrides),
      );
    }),
  );
}

export async function loadImageQuizBanks(): Promise<ImageQuizBank[]> {
  return (await loadImageQuizData()).banks;
}

export async function loadImageQuizEditorBanks(): Promise<ImageQuizBank[]> {
  const [manifest, overrides] = await Promise.all([
    loadQuestionReleaseManifest(),
    loadAllAdminQuestionOverrides(),
  ]);
  const sourceBanks = (
    await Promise.all(
      manifest.banks.map((bank) => loadSourceBank(bank.bankId)),
    )
  ).filter((bank): bank is ImageQuizBank => Boolean(bank));
  return applyEditorQuestionOverrides({ banks: sourceBanks }, overrides).banks;
}

export async function loadImageQuizEditorCatalog(): Promise<ImageQuizEditorBankSummary[]> {
  const manifest = await loadQuestionReleaseManifest();
  return manifest.banks.map((bank) => ({
    bankId: bank.bankId,
    bankTitle: bank.bankTitle,
    chapters: bank.chapters.map((chapter) => ({
      bankId: bank.bankId,
      bankTitle: bank.bankTitle,
      chapterId: chapter.chapterId,
      chapterTitle: chapter.chapterTitle,
      chapterSlug: chapter.chapterSlug,
      sourceFile: chapter.sourceFile,
      questionCount: chapter.questionCount,
    })),
  }));
}


async function loadAdminQuestionOverridesByIds(
  questionIds: readonly string[],
): Promise<Map<string, ImageQuizQuestionOverride>> {
  if (LOCAL_PREVIEW_ACCESS) return new Map();
  const ids = Array.from(new Set(questionIds)).sort();
  if (!ids.length) return new Map();
  const access = await securitiesAccess();
  const response = await fetch(assetUrl("api/admin/question-editor"), {
    method: "POST",
    cache: "no-store",
    headers: {
      "Content-Type": "application/json",
      ...(access.token ? { Authorization: `Bearer ${access.token}` } : {}),
    },
    body: JSON.stringify({ action: "load-overrides", questionIds: ids }),
  });
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error(`無法載入題目裁切覆寫（${response.status}）。`);
  }
  const payload = await response.json() as AdminQuestionOverridesResponse;
  return new Map((payload.overrides || []).map((override) => [override.questionId, override]));
}

async function loadAllAdminQuestionOverrides(): Promise<Map<string, ImageQuizQuestionOverride>> {
  if (LOCAL_PREVIEW_ACCESS) return new Map();
  const access = await securitiesAccess();
  const response = await fetch(assetUrl("api/admin/question-editor"), {
    cache: "no-store",
    headers: access.token ? { Authorization: `Bearer ${access.token}` } : {},
  });
  if (!response.ok || !(response.headers.get("content-type") || "").includes("application/json")) {
    throw new Error(`無法載入題目裁切覆寫（${response.status}）。`);
  }
  const payload = await response.json() as AdminQuestionOverridesResponse;
  return new Map((payload.overrides || []).map((override) => [override.questionId, override]));
}

export async function loadImageQuizEditorChapter(
  bankId: string,
  chapterId: string,
): Promise<ImageQuizChapter | undefined> {
  const chapter = await loadImageQuizChapter(bankId, chapterId);
  if (!chapter) return undefined;
  const overrides = await loadAdminQuestionOverridesByIds(chapter.questions.map((question) => question.id));
  const bank: ImageQuizBank = { bankId: chapter.bankId, bankTitle: chapter.bankTitle, chapters: [chapter] };
  return applyEditorQuestionOverrides({ banks: [bank] }, overrides).banks[0]?.chapters[0];
}

export async function loadImageQuizBankSummaries(): Promise<ImageQuizBank[]> {
  return rememberRecoverable(summaryBanksCache, () =>
    loadQuestionReleaseManifest()
      .then((manifest) =>
        fetchJson<ImageQuizData>(
          "data/pdf-image-quiz-summary.json",
          manifest.releaseId,
        ),
      )
      // Learner-facing navigation follows the three official exam subjects.
      // Regulations and practice remain separate source banks internally, but
      // are exposed as one combined subject everywhere users choose a subject.
      .then((data) => normalizeImageQuizData(data).banks),
  );
}

export async function loadImageQuizPlanningIndex(): Promise<
  ImageQuizPlanningQuestion[]
> {
  return rememberRecoverable(planningIndexCache, () =>
    loadQuestionReleaseManifest()
      .then((manifest) =>
        fetchJson<ImageQuizPlanningIndexData>(
          "data/pdf-image-quiz-plan-index.json",
          manifest.releaseId,
        ),
      )
      .then((data) => data.questions),
  );
}

export async function loadImageQuizBank(
  bankId: string,
): Promise<ImageQuizBank | undefined> {
  if (
    bankId === "securities-trading-regulations" ||
    bankId === "securities-trading-practice"
  ) {
    return loadImageQuizBank(SECURITIES_COMBINED_BANK_ID);
  }
  if (bankId === SECURITIES_COMBINED_BANK_ID) {
    const [regulations, practice] = await Promise.all([
      loadSourceBank("securities-trading-regulations"),
      loadSourceBank("securities-trading-practice"),
    ]);
    if (!regulations || !practice) return undefined;
    return normalizeImageQuizData({
      banks: [regulations, practice],
    }).banks.find((bank) => bank.bankId === bankId);
  }
  return loadSourceBank(bankId);
}

export async function loadImageQuizChapter(
  bankId: string,
  chapterId: string,
): Promise<ImageQuizChapter | undefined> {
  if (bankId === SECURITIES_COMBINED_BANK_ID) {
    const source = chapterId.startsWith("regulations-")
      ? { bankId: "securities-trading-regulations", prefix: "regulations" }
      : chapterId.startsWith("practice-")
        ? { bankId: "securities-trading-practice", prefix: "practice" }
        : null;
    if (source) {
      const slug = chapterId.slice(source.prefix.length + 1);
      const manifest = await loadQuestionReleaseManifest();
      const bank = manifest.banks.find(
        (candidate) => candidate.bankId === source.bankId,
      );
      const chapter = bank?.chapters.find(
        (candidate) => candidate.chapterSlug === slug,
      );
      if (bank && chapter) {
        const loaded = await loadSourceChapter(bank, chapter);
        const enriched = enrichBankTopics({
          bankId: bank.bankId,
          bankTitle: bank.bankTitle,
          chapters: [loaded],
        }).chapters[0];
        return enriched
          ? makeCombinedChapter(
              enriched,
              source.prefix === "regulations" ? "\u6cd5\u898f" : "\u5be6\u52d9",
              source.prefix,
            )
          : undefined;
      }
    }
  }
  const manifest = await loadQuestionReleaseManifest();
  const bank = manifest.banks.find((candidate) => candidate.bankId === bankId);
  const chapter = bank?.chapters.find(
    (candidate) => candidate.chapterId === chapterId,
  );
  if (!bank || !chapter) return undefined;
  const loaded = await loadSourceChapter(bank, chapter);
  return enrichBankTopics({
    bankId: bank.bankId,
    bankTitle: bank.bankTitle,
    chapters: [loaded],
  }).chapters[0];
}

export async function loadImageBankQuestions(
  bankId: string,
): Promise<ImageQuizQuestion[]> {
  const bank = await loadImageQuizBank(bankId);
  if (!bank) throw new Error(`\u627e\u4e0d\u5230\u984c\u5eab\uff1a${bankId}`);
  const overrides = await loadQuestionOverrides();
  return (
    applyQuestionOverrides(
      { banks: [bank] },
      overrides,
    ).banks[0]?.chapters.flatMap((chapter) => chapter.questions) ?? []
  );
}

export async function loadImageChapterQuestions(
  bankId: string,
  chapterId: string,
): Promise<ImageQuizQuestion[]> {
  const chapter = await loadImageQuizChapter(bankId, chapterId);
  if (!chapter)
    throw new Error(
      `\u627e\u4e0d\u5230\u7ae0\u7bc0\uff1a${bankId} / ${chapterId}`,
    );
  const overrides = await loadQuestionOverrides();
  const bank: ImageQuizBank = {
    bankId,
    bankTitle: chapter.bankTitle,
    chapters: [chapter],
  };
  return (
    applyQuestionOverrides({ banks: [bank] }, overrides).banks[0]?.chapters[0]
      ?.questions ?? []
  );
}

export async function loadAllImageQuestions(): Promise<ImageQuizQuestion[]> {
  return (await loadImageQuizBanks()).flatMap((bank) =>
    bank.chapters.flatMap((chapter) => chapter.questions),
  );
}

/** Loads only the chapter shards needed for the requested question ids. */
export async function loadImageQuestionsByIds(
  questionIds: readonly string[],
): Promise<ImageQuizQuestion[]> {
  if (questionIds.length === 0) return [];
  const [manifest, overrides] = await Promise.all([
    loadQuestionReleaseManifest(),
    loadQuestionOverrides(),
  ]);
  const requestedIds = new Set(questionIds);
  const shardPaths = [
    ...new Set(
      questionIds
        .map((id) => manifest.questionIndex[id])
        .filter((value): value is string => Boolean(value)),
    ),
  ];
  const chapters = await Promise.all(
    shardPaths.map(async (shardPath) => {
      const entry = findManifestChapterByPath(manifest, shardPath);
      return entry ? loadSourceChapter(entry.bank, entry.chapter) : undefined;
    }),
  );
  const loadedQuestions = chapters
    .filter((chapter): chapter is ImageQuizChapter => Boolean(chapter))
    .flatMap((chapter) => chapter.questions)
    .filter((question) => requestedIds.has(question.id));
  const questionBank: ImageQuizBank = {
    bankId: "__selected__",
    bankTitle: "Selected questions",
    chapters: [
      {
        bankId: "__selected__",
        bankTitle: "Selected questions",
        chapterId: "selected",
        chapterTitle: "Selected questions",
        chapterSlug: "selected",
        sourceFile: "",
        questionCount: loadedQuestions.length,
        questions: loadedQuestions,
      },
    ],
  };
  const overridden =
    applyQuestionOverrides({ banks: [questionBank] }, overrides).banks[0]
      ?.chapters[0]?.questions ?? [];
  const byId = new Map(overridden.map((question) => [question.id, question]));
  return questionIds
    .map((id) => byId.get(id))
    .filter((question): question is ImageQuizQuestion => Boolean(question));
}

export async function loadTrialImageQuestions(): Promise<ImageQuizQuestion[]> {
  return rememberRecoverable(trialQuestionsCache, () =>
    Promise.all([
      loadQuestionReleaseManifest(),
      loadQuestionOverrides(),
    ])
      .then(([manifest, overrides]) =>
        Promise.all([
          fetchJson<ImageQuizData>(
            "data/pdf-image-quiz-trial.json",
            manifest.releaseId,
          ),
          Promise.resolve(overrides),
        ]),
      )
      .then(([data, overrides]) =>
        normalizeImageQuizData(applyQuestionOverrides(data, overrides)),
      )
      .then((data) =>
        data.banks
          .flatMap((bank) =>
            bank.chapters.flatMap((chapter) => chapter.questions),
          )
          .slice(0, 10),
      ),
  );
}

async function loadQuestionOverrides(): Promise<
  Map<string, ImageQuizLearnerOverride>
> {
  if (LOCAL_PREVIEW_ACCESS) return new Map();
  return rememberRecoverable(questionOverridesCache, async () => {
    try {
      const access = await securitiesAccess();
      const response = await fetchQuestionBankResponse({
        url: `${assetUrl("api/questions")}?resource=overrides`,
        headers: access.token
          ? { Authorization: `Bearer ${access.token}` }
          : {},
        context: "題目修訂資料",
      });
      const payload = (await response.json()) as QuestionOverridesResponse;
      return new Map(
        (payload.overrides || []).map((override) => [
          override.questionId,
          override,
        ]),
      );
    } catch {
      // Offline, incomplete optional override tables, and local Vite mode keep
      // using the bundled stable question bank.
      return new Map();
    }
  });
}

function applyQuestionOverrides(
  data: ImageQuizData,
  overrides: Map<string, ImageQuizLearnerOverride>,
): ImageQuizData {
  if (overrides.size === 0) return data;
  return {
    banks: data.banks.map((bank) => ({
      ...bank,
      chapters: bank.chapters.map((chapter) => ({
        ...chapter,
        questions: chapter.questions.map((question) => {
          const override = overrides.get(question.id);
          if (!override) return question;
          return {
            ...question,
            answer: override.answer,
            bankTitle: override.bankTitle?.trim() || question.bankTitle,
            chapterTitle: override.chapterTitle?.trim() || question.chapterTitle,
            number: Number.isInteger(override.questionNumber) && Number(override.questionNumber) > 0
              ? Number(override.questionNumber)
              : question.number,
          };
        }),
      })),
    })),
  };
}

function applyEditorQuestionOverrides(
  data: ImageQuizData,
  overrides: Map<string, ImageQuizQuestionOverride>,
): ImageQuizData {
  if (overrides.size === 0) return data;
  return {
    banks: data.banks.map((bank) => ({
      ...bank,
      chapters: bank.chapters.map((chapter) => ({
        ...chapter,
        questions: chapter.questions.map((question) => {
          const override = overrides.get(question.id);
          const keepsQuestionCrop = override
            ? haveSameSegmentGeometry(override.questionSegments, question.questionSegments)
            : false;
          const keepsExplanationCrop = override
            ? haveSameSegmentGeometry(override.explanationSegments, question.explanationSegments)
            : false;
          return override
            ? {
                ...question,
                answer: override.answer,
                bankTitle: override.bankTitle?.trim() || question.bankTitle,
                chapterTitle: override.chapterTitle?.trim() || question.chapterTitle,
                number: Number.isInteger(override.questionNumber) && Number(override.questionNumber) > 0
                  ? Number(override.questionNumber)
                  : question.number,
                questionSegments: override.questionSegments,
                explanationSegments: override.explanationSegments,
                // Remote overrides cannot create reviewed mobile fields. Preserve
                // the bundled evidence only while the corresponding crop is exact.
                mobileQuestionSegments: keepsQuestionCrop ? question.mobileQuestionSegments : undefined,
                mobileExplanationSegments: keepsExplanationCrop ? question.mobileExplanationSegments : undefined,
                mobileQuestionSegmentsVerification: keepsQuestionCrop ? question.mobileQuestionSegmentsVerification : undefined,
                mobileExplanationSegmentsVerification: keepsExplanationCrop ? question.mobileExplanationSegmentsVerification : undefined,
                // Scan-derived text is bound to the exact bundled crop hashes.
                // Any crop edit fails closed to the original scan until the text
                // is transcribed and reviewed again.
                questionText: keepsQuestionCrop ? question.questionText : undefined,
                optionTexts: keepsQuestionCrop ? question.optionTexts : undefined,
                explanationText: keepsExplanationCrop ? question.explanationText : undefined,
                textSource: keepsQuestionCrop && keepsExplanationCrop ? question.textSource : undefined,
              }
            : question;
        }),
      })),
    })),
  };
}

export async function loadSimilarQuestionGroups(): Promise<
  SimilarQuestionGroup[]
> {
  return rememberRecoverable(similarGroupsCache, () =>
    loadQuestionReleaseManifest()
      .then((manifest) =>
        fetchJson<SimilarQuestionData>(
          "data/similar-question-groups.json",
          manifest.releaseId,
        ),
      )
      .then((data) => data.groups),
  );
}

export function findImageQuestion(
  questions: readonly ImageQuizQuestion[],
  questionId: string,
): ImageQuizQuestion | undefined {
  return questions.find((question) => question.id === questionId);
}

export function formatImageQuizQuestionSource(
  question: ImageQuizQuestion,
): string {
  const base = `${question.bankTitle} / ${question.chapterTitle}`;
  const topic = question.chapterTopic?.trim();
  return topic ? `${base} - ${topic}` : base;
}

function normalizeImageQuizData(data: ImageQuizData): ImageQuizData {
  const banks = data.banks.map(enrichBankTopics);
  const regulations = banks.find(
    (bank) => bank.bankId === "securities-trading-regulations",
  );
  const practice = banks.find(
    (bank) => bank.bankId === "securities-trading-practice",
  );

  if (!regulations || !practice) {
    return { banks };
  }

  const combined: ImageQuizBank = {
    bankId: SECURITIES_COMBINED_BANK_ID,
    bankTitle: SECURITIES_COMBINED_BANK_TITLE,
    chapters: [
      ...regulations.chapters.map((chapter) =>
        makeCombinedChapter(chapter, "\u6cd5\u898f", "regulations"),
      ),
      ...practice.chapters.map((chapter) =>
        makeCombinedChapter(chapter, "\u5be6\u52d9", "practice"),
      ),
    ],
  };

  return {
    banks: [
      ...banks.filter(
        (bank) =>
          bank.bankId !== "securities-trading-regulations" &&
          bank.bankId !== "securities-trading-practice",
      ),
      combined,
    ],
  };
}

function enrichBankTopics(bank: ImageQuizBank): ImageQuizBank {
  return {
    ...bank,
    chapters: bank.chapters.map((chapter) => {
      const chapterTopic =
        CHAPTER_TOPIC_TITLES[bank.bankId]?.[chapter.chapterSlug];
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

function makeCombinedChapter(
  chapter: ImageQuizChapter,
  label: string,
  prefix: string,
): ImageQuizChapter {
  return {
    ...chapter,
    chapterId: `${prefix}-${chapter.chapterSlug}`,
    chapterTitle: `${label} / ${chapter.chapterTitle}`,
    sourceBankId: chapter.bankId,
    sourceBankTitle: chapter.bankTitle,
    sourceChapterId: chapter.chapterId,
  };
}
