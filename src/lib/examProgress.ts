import type { ExamId } from "../auth/AuthContext";
import { listFavoriteQuestions, listUserAnswers, listWrongQuestions } from "./db";
import { foreignExchangeProgressSummary } from "./foreignExchangeProgress";
import { isSecuritiesQuestionId } from "./imageQuiz";

export const EXAM_QUESTION_COUNTS: Record<ExamId, number> = {
  "senior-securities": 3_526,
  "junior-foreign-exchange": 3_250,
};

export type ExamProgressSummary = {
  questionCount: number;
  answered: number;
  correct: number;
  wrong: number;
  favorites: number;
  accuracy: number;
  progressPercent: number;
};

export async function loadExamProgress(): Promise<Record<ExamId, ExamProgressSummary>> {
  const [answers, wrongRecords, favorites] = await Promise.all([
    listUserAnswers().catch(() => []),
    listWrongQuestions().catch(() => []),
    listFavoriteQuestions().catch(() => []),
  ]);
  const securitiesAnswers = answers.filter((record) => isSecuritiesQuestionId(record.questionId));
  const securitiesAnswerIds = new Set(securitiesAnswers.map((record) => record.questionId));
  const securitiesCorrect = securitiesAnswers.filter((record) => record.isCorrect).length;
  const securitiesWrong = wrongRecords.filter((record) => isSecuritiesQuestionId(record.questionId)).length;
  const securitiesFavorites = favorites.filter((record) => isSecuritiesQuestionId(record.questionId)).length;
  const foreignExchange = foreignExchangeProgressSummary();

  const securitiesQuestionCount = EXAM_QUESTION_COUNTS["senior-securities"];
  const foreignExchangeQuestionCount = EXAM_QUESTION_COUNTS["junior-foreign-exchange"];

  return {
    "senior-securities": {
      questionCount: securitiesQuestionCount,
      answered: securitiesAnswerIds.size,
      correct: securitiesCorrect,
      wrong: securitiesWrong,
      favorites: securitiesFavorites,
      accuracy: securitiesAnswers.length
        ? Math.round((securitiesCorrect / securitiesAnswers.length) * 100)
        : 0,
      progressPercent: Math.min(100, Math.round((securitiesAnswerIds.size / securitiesQuestionCount) * 100)),
    },
    "junior-foreign-exchange": {
      questionCount: foreignExchangeQuestionCount,
      answered: foreignExchange.answered,
      correct: foreignExchange.correct,
      wrong: foreignExchange.wrong,
      favorites: foreignExchange.favorites,
      accuracy: foreignExchange.accuracy,
      progressPercent: Math.min(
        100,
        Math.round((foreignExchange.answered / foreignExchangeQuestionCount) * 100),
      ),
    },
  };
}
