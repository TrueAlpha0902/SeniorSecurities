import { supabase } from "./supabase";

export type ForeignExchangeAnswerKey = "A" | "B" | "C" | "D";
export type ForeignExchangeSubjectId = "remittance" | "trade";
export type ForeignExchangeSession = 45 | 46 | 47;

export type ForeignExchangeQuestion = {
  id: string;
  bankTitle: string;
  chapter: string;
  question: string;
  options: Record<ForeignExchangeAnswerKey, string>;
  answer: ForeignExchangeAnswerKey;
  explanation: string;
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

export const FOREIGN_EXCHANGE_SESSIONS: readonly ForeignExchangeSessionMeta[] = [
  {
    session: 47,
    standardVersion: "ISO 20022",
    subjects: [
      { id: "remittance", title: "國外匯兌業務", questionCount: 50, durationMinutes: 60 },
      { id: "trade", title: "進出口外匯業務", questionCount: 80, durationMinutes: 90 },
    ],
  },
  {
    session: 46,
    standardVersion: "SWIFT MT",
    subjects: [
      { id: "remittance", title: "國外匯兌業務", questionCount: 50, durationMinutes: 60 },
      { id: "trade", title: "進出口外匯業務", questionCount: 80, durationMinutes: 90 },
    ],
  },
  {
    session: 45,
    standardVersion: "SWIFT MT",
    subjects: [
      { id: "remittance", title: "國外匯兌業務", questionCount: 50, durationMinutes: 60 },
      { id: "trade", title: "進出口外匯業務", questionCount: 80, durationMinutes: 90 },
    ],
  },
] as const;

type LoadFilters = {
  session?: ForeignExchangeSession;
  subject?: ForeignExchangeSubjectId;
  ids?: string[];
  signal?: AbortSignal;
};

type QuestionResponse = {
  questions?: ForeignExchangeQuestion[];
  error?: string;
};

const memoryCache = new Map<string, ForeignExchangeQuestion[]>();

function cacheKey(filters: Omit<LoadFilters, "signal">): string {
  return JSON.stringify({
    session: filters.session ?? null,
    subject: filters.subject ?? null,
    ids: filters.ids ? [...filters.ids].sort() : null,
  });
}

export async function loadForeignExchangeQuestions(filters: LoadFilters = {}): Promise<ForeignExchangeQuestion[]> {
  const key = cacheKey(filters);
  const cached = memoryCache.get(key);
  if (cached) return cached.map((question) => ({ ...question, options: { ...question.options } }));

  const parameters = new URLSearchParams();
  if (filters.session) parameters.set("session", String(filters.session));
  if (filters.subject) parameters.set("subject", filters.subject);
  if (filters.ids?.length) parameters.set("ids", filters.ids.join(","));

  const authResult = supabase ? await supabase.auth.getSession() : null;
  const token = authResult?.data.session?.access_token;
  const response = await fetch(`/api/foreign-exchange/questions${parameters.size ? `?${parameters}` : ""}`, {
    cache: "no-store",
    signal: filters.signal,
    headers: token ? { Authorization: `Bearer ${token}` } : undefined,
  });
  const contentType = response.headers.get("content-type") || "";
  const payload = contentType.includes("application/json")
    ? await response.json() as QuestionResponse
    : { error: (await response.text()).slice(0, 240) };
  if (!response.ok) throw new Error(payload.error || `題庫載入失敗（${response.status}）。`);

  const questions = Array.isArray(payload.questions) ? payload.questions : [];
  memoryCache.set(key, questions);
  return questions.map((question) => ({ ...question, options: { ...question.options } }));
}

export function subjectTitle(subject: ForeignExchangeSubjectId): string {
  return subject === "remittance" ? "國外匯兌業務" : "進出口外匯業務";
}

export function subjectDuration(subject: ForeignExchangeSubjectId): number {
  return subject === "remittance" ? 60 : 90;
}

export function shuffleQuestions<T>(items: readonly T[]): T[] {
  const output = [...items];
  for (let index = output.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = output[index];
    const replacement = output[randomIndex];
    if (current === undefined || replacement === undefined) continue;
    output[index] = replacement;
    output[randomIndex] = current;
  }
  return output;
}
