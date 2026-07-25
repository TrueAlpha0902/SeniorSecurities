import type { ExamId } from "../auth/AuthContext";
import { requestQuestionBankJson } from "./questionBankApi";

export type SecuritiesSearchResult = {
  examId: "senior-securities";
  id: string;
  bankId: string;
  bankTitle: string;
  chapterId: string;
  chapterTitle: string;
  questionNumber: number;
  question: string;
};

export type ForeignExchangeSearchResult = {
  examId: "junior-foreign-exchange";
  id: string;
  session: number;
  subjectId: "remittance" | "trade";
  bankTitle: string;
  questionNumber: number;
  question: string;
};

export type QuestionSearchResult = SecuritiesSearchResult | ForeignExchangeSearchResult;

type SearchResponse = {
  results?: QuestionSearchResult[];
  error?: string;
};

export async function searchQuestionBank(
  examId: ExamId,
  query: string,
  signal?: AbortSignal,
): Promise<QuestionSearchResult[]> {
  const payload = await requestQuestionBankJson<SearchResponse>({
    url: "/api/questions",
    method: "POST",
    signal,
    context: "題庫搜尋",
    body: {
      resource: examId === "senior-securities" ? "securities" : "foreign-exchange",
      action: "search",
      query,
      limit: 80,
    },
  });
  return Array.isArray(payload.results) ? payload.results : [];
}
