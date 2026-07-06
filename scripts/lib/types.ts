import type { AnswerKey, Question } from "../../src/types";

export type StagedQuestion = Omit<Question, "answer"> & {
  answer: AnswerKey | "";
};

export type ValidationIssue = {
  severity: "error" | "warning";
  questionId?: string;
  message: string;
};

export type DuplicateQuestionGroup = {
  normalizedQuestion: string;
  questionIds: string[];
};

export type SameQuestionDifferentChapters = {
  normalizedQuestion: string;
  chapters: string[];
  questionIds: string[];
};

export type MissingOptionGroup = {
  questionId: string;
  missing: AnswerKey[];
};

export type ShortOptionIssue = {
  questionId: string;
  answerKey: AnswerKey;
  option: string;
};

export type ValidationReport = {
  passed: boolean;
  scope: string;
  generatedAt: string;
  totalBanks: number;
  totalChapters: number;
  totalQuestions: number;
  validQuestions: number;
  invalidQuestions: number;
  duplicateIds: string[];
  possibleDuplicateQuestions: DuplicateQuestionGroup[];
  sameQuestionAppearingInDifferentChapters: SameQuestionDifferentChapters[];
  missingExplanations: string[];
  missingOptions: MissingOptionGroup[];
  invalidAnswers: string[];
  questionsNeedingManualReview: string[];
  unusuallyShortOptions: ShortOptionIssue[];
  unusuallyShortExplanations: string[];
  issues: ValidationIssue[];
};
