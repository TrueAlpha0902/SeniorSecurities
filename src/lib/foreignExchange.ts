import { requestQuestionBankJson } from "./questionBankApi";

export type ForeignExchangeAnswerKey = "A" | "B" | "C" | "D";
export type ForeignExchangeSubjectId = "remittance" | "trade";
export type ForeignExchangeSession =
  | 23 | 24 | 25 | 26 | 27 | 28 | 29 | 30 | 31 | 32 | 33 | 34 | 35
  | 36 | 37 | 38 | 39 | 40 | 41 | 42 | 43 | 44 | 45 | 46 | 47;

export type ForeignExchangeQuestion = {
  id: string;
  bankTitle: string;
  chapter: string;
  question: string;
  options: Record<ForeignExchangeAnswerKey, string>;
  answer?: ForeignExchangeAnswerKey;
  acceptedAnswers?: ForeignExchangeAnswerKey[];
  allAnsweredCredit?: boolean;
  automaticCredit?: boolean;
  answerNote?: string | null;
  explanation?: string;
  session: ForeignExchangeSession;
  subjectId: ForeignExchangeSubjectId;
  questionNumber: number;
  standardVersion: "SWIFT MT" | "ISO 20022";
};

export type ForeignExchangeSubjectMeta = {
  id: ForeignExchangeSubjectId;
  title: string;
  questionCount: 50 | 80;
  durationMinutes: 60 | 90;
};

export type ForeignExchangeSessionMeta = {
  session: ForeignExchangeSession;
  standardVersion: "SWIFT MT" | "ISO 20022";
  subjects: readonly ForeignExchangeSubjectMeta[];
};

export const FOREIGN_EXCHANGE_MIN_SESSION = 23;
export const FOREIGN_EXCHANGE_MAX_SESSION = 47;
export const FOREIGN_EXCHANGE_TOTAL_QUESTIONS = 3_250;
export const FOREIGN_EXCHANGE_QUESTION_ID_PATTERN = /^fx-(2[3-9]|3\d|4[0-7])-(remittance|trade)-\d{3}$/;

const SESSION_NUMBERS = Array.from(
  { length: FOREIGN_EXCHANGE_MAX_SESSION - FOREIGN_EXCHANGE_MIN_SESSION + 1 },
  (_, index) => FOREIGN_EXCHANGE_MAX_SESSION - index,
) as ForeignExchangeSession[];

const SUBJECTS: readonly ForeignExchangeSubjectMeta[] = [
  { id: "remittance", title: "國外匯兌業務", questionCount: 50, durationMinutes: 60 },
  { id: "trade", title: "進出口外匯業務", questionCount: 80, durationMinutes: 90 },
] as const;

export const FOREIGN_EXCHANGE_SESSIONS: readonly ForeignExchangeSessionMeta[] = SESSION_NUMBERS.map((session) => ({
  session,
  standardVersion: session === 47 ? "ISO 20022" : "SWIFT MT",
  subjects: SUBJECTS,
}));

type LoadFilters = {
  session?: ForeignExchangeSession;
  subject?: ForeignExchangeSubjectId;
  ids?: string[];
  randomCount?: number;
  signal?: AbortSignal;
};

type QuestionResponse = {
  questions?: ForeignExchangeQuestion[];
  mockToken?: string;
  results?: ForeignExchangeMockResult[];
  correctCount?: number;
  error?: string;
};

export type ForeignExchangeMockResult = ForeignExchangeQuestion & {
  selectedAnswer: ForeignExchangeAnswerKey | null;
  isCorrect: boolean;
};

export type ForeignExchangeMockSession = {
  mockToken: string;
  questions: ForeignExchangeQuestion[];
};

export type ForeignExchangeMockSubmission = {
  questionCount: number;
  correctCount: number;
  results: ForeignExchangeMockResult[];
};

const memoryCache = new Map<string, ForeignExchangeQuestion[]>();

export function resetForeignExchangeQuestionCache(): void {
  memoryCache.clear();
}

function cacheKey(filters: Omit<LoadFilters, "signal">): string {
  return JSON.stringify({
    session: filters.session ?? null,
    subject: filters.subject ?? null,
    ids: filters.ids ? [...filters.ids].sort() : null,
    randomCount: filters.randomCount ?? null,
  });
}

function cloneQuestions(questions: readonly ForeignExchangeQuestion[]): ForeignExchangeQuestion[] {
  return questions.map((question) => ({
    ...question,
    options: { ...question.options },
    acceptedAnswers: question.acceptedAnswers ? [...question.acceptedAnswers] : undefined,
  }));
}

export function isForeignExchangeSession(value: unknown): value is ForeignExchangeSession {
  const session = Number(value);
  return Number.isInteger(session)
    && session >= FOREIGN_EXCHANGE_MIN_SESSION
    && session <= FOREIGN_EXCHANGE_MAX_SESSION;
}

export function acceptedForeignExchangeAnswers(
  question: Pick<ForeignExchangeQuestion, "answer" | "acceptedAnswers">,
): ForeignExchangeAnswerKey[] {
  const answers = Array.isArray(question.acceptedAnswers)
    ? question.acceptedAnswers.filter((answer): answer is ForeignExchangeAnswerKey => ["A", "B", "C", "D"].includes(answer))
    : [];
  if (answers.length) return Array.from(new Set(answers));
  return question.answer ? [question.answer] : [];
}

export function isForeignExchangeAnswerCorrect(
  question: Pick<ForeignExchangeQuestion, "answer" | "acceptedAnswers" | "allAnsweredCredit" | "automaticCredit">,
  selectedAnswer: ForeignExchangeAnswerKey | undefined,
): boolean {
  if (question.automaticCredit) return true;
  if (!selectedAnswer) return false;
  if (question.allAnsweredCredit) return true;
  const accepted = acceptedForeignExchangeAnswers(question);
  return accepted.length > 0 && accepted.includes(selectedAnswer);
}

export function foreignExchangeAnswerText(question: ForeignExchangeQuestion): string {
  if (question.automaticCredit) return question.answerNote || "本題一律給分";
  if (question.allAnsweredCredit) return question.answerNote || "凡有作答均予計分";
  const accepted = acceptedForeignExchangeAnswers(question);
  if (accepted.length > 1) {
    return `可計分答案：${accepted.map((answer) => `${answer}．${question.options[answer]}`).join("；")}`;
  }
  const answer = accepted[0];
  return answer ? `正確答案：${answer}．${question.options[answer]}` : "正確答案尚未載入";
}

export async function loadForeignExchangeQuestions(filters: LoadFilters = {}): Promise<ForeignExchangeQuestion[]> {
  const shouldCache = !filters.randomCount && !filters.ids?.length;
  const key = cacheKey(filters);
  if (shouldCache) {
    const cached = memoryCache.get(key);
    if (cached) return cloneQuestions(cached);
  }

  const payload = await requestQuestionBankJson<QuestionResponse>({
    url: "/api/questions",
    method: "POST",
    signal: filters.signal,
    context: "初階外匯題庫",
    body: {
      resource: "foreign-exchange",
      action: "questions",
      session: filters.session ?? null,
      subject: filters.subject ?? null,
      ids: filters.ids ?? null,
      randomCount: filters.randomCount ?? null,
    },
  });

  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  if (shouldCache) memoryCache.set(key, cloneQuestions(questions));
  return cloneQuestions(questions);
}

async function foreignExchangeApi(
  body: Record<string, unknown>,
  signal?: AbortSignal,
): Promise<QuestionResponse> {
  return requestQuestionBankJson<QuestionResponse>({
    url: "/api/questions",
    method: "POST",
    signal,
    context: "初階外匯題庫",
    body: { resource: "foreign-exchange", ...body },
  });
}

export async function startForeignExchangeMock(
  filters: Pick<LoadFilters, "session" | "subject" | "randomCount" | "signal">,
): Promise<ForeignExchangeMockSession> {
  const payload = await foreignExchangeApi({
    action: "mock-start",
    session: filters.session ?? null,
    subject: filters.subject ?? null,
    randomCount: filters.randomCount ?? null,
  }, filters.signal);
  if (!payload.mockToken || !Array.isArray(payload.questions)) throw new Error("模擬考建立失敗。");
  return { mockToken: payload.mockToken, questions: cloneQuestions(payload.questions) };
}

export async function resumeForeignExchangeMock(
  mockToken: string,
  signal?: AbortSignal,
): Promise<ForeignExchangeMockSession> {
  const payload = await foreignExchangeApi({ action: "mock-resume", mockToken }, signal);
  if (!payload.mockToken || !Array.isArray(payload.questions)) throw new Error("模擬考恢復失敗。");
  return { mockToken: payload.mockToken, questions: cloneQuestions(payload.questions) };
}

export async function submitForeignExchangeMock(
  mockToken: string,
  answers: Record<string, ForeignExchangeAnswerKey>,
  signal?: AbortSignal,
): Promise<ForeignExchangeMockSubmission> {
  const payload = await foreignExchangeApi({ action: "mock-submit", mockToken, answers }, signal);
  if (!Array.isArray(payload.results)) throw new Error("模擬考批改失敗。");
  return {
    questionCount: payload.results.length,
    correctCount: Number(payload.correctCount || 0),
    results: payload.results.map((question) => ({
      ...question,
      options: { ...question.options },
      acceptedAnswers: question.acceptedAnswers ? [...question.acceptedAnswers] : undefined,
    })),
  };
}

export function subjectTitle(subject: ForeignExchangeSubjectId): string {
  return subject === "remittance" ? "國外匯兌業務" : "進出口外匯業務";
}

export function subjectDuration(subject: ForeignExchangeSubjectId): number {
  return subject === "remittance" ? 60 : 90;
}
