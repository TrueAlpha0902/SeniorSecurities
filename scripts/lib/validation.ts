import type { QuizBank, ReviewStatus } from "../../src/types";
import { answerKeys, isAnswerKey } from "../../src/lib/quiz";
import type {
  DuplicateQuestionGroup,
  MissingOptionGroup,
  SameQuestionDifferentChapters,
  ShortOptionIssue,
  StagedQuestion,
  ValidationIssue,
  ValidationReport
} from "./types";

const allowedReviewStatuses: ReviewStatus[] = ["raw", "checked", "needs_fix"];

export function validateQuestionSet(questions: readonly StagedQuestion[], scope: string, banks: readonly QuizBank[] = []): ValidationReport {
  const issues: ValidationIssue[] = [];
  const invalidQuestionIds = new Set<string>();
  const idCounts = new Map<string, number>();
  const normalizedQuestionMap = new Map<string, StagedQuestion[]>();
  const missingOptions: MissingOptionGroup[] = [];
  const missingExplanations: string[] = [];
  const invalidAnswers: string[] = [];
  const questionsNeedingManualReview: string[] = [];
  const unusuallyShortOptions: ShortOptionIssue[] = [];
  const unusuallyShortExplanations: string[] = [];

  const markInvalid = (question: StagedQuestion, message: string) => {
    invalidQuestionIds.add(question.id || "(missing id)");
    issues.push({ severity: "error", questionId: question.id || undefined, message });
  };

  for (const question of questions) {
    if (!question.id) {
      markInvalid(question, "id is missing");
    } else {
      idCounts.set(question.id, (idCounts.get(question.id) ?? 0) + 1);
    }

    if (!question.bankId) {
      markInvalid(question, "bankId is missing");
    }
    if (!question.bankTitle) {
      markInvalid(question, "bankTitle is missing");
    }
    if (!question.chapter) {
      markInvalid(question, "chapter is missing");
    }
    if (!question.question) {
      markInvalid(question, "question is missing");
    }
    if (!question.sourceFile) {
      markInvalid(question, "sourceFile is missing");
    }
    if (!question.batchId) {
      markInvalid(question, "batchId is missing");
    }
    if (!allowedReviewStatuses.includes(question.reviewStatus)) {
      markInvalid(question, "reviewStatus must be raw, checked, or needs_fix");
    }
    if (question.reviewStatus === "needs_fix") {
      questionsNeedingManualReview.push(question.id);
      markInvalid(question, "question needs manual review");
    }

    const missing = answerKeys.filter((answerKey) => !question.options?.[answerKey]?.trim());
    if (missing.length > 0) {
      missingOptions.push({ questionId: question.id, missing });
      markInvalid(question, `missing options: ${missing.join(", ")}`);
    }

    for (const answerKey of answerKeys) {
      const option = question.options?.[answerKey]?.trim() ?? "";
      if (option && visibleLength(option) < 2) {
        unusuallyShortOptions.push({ questionId: question.id, answerKey, option });
        issues.push({ severity: "warning", questionId: question.id, message: `option ${answerKey} is unusually short` });
      }
    }

    if (!isAnswerKey(question.answer)) {
      invalidAnswers.push(question.id);
      markInvalid(question, "answer must be A, B, C, or D");
    }

    if (!question.explanation?.trim()) {
      missingExplanations.push(question.id);
      markInvalid(question, "explanation is missing");
    } else if (visibleLength(question.explanation) < 8) {
      unusuallyShortExplanations.push(question.id);
      issues.push({ severity: "warning", questionId: question.id, message: "explanation is unusually short" });
    }

    const normalized = normalizeQuestionText(question.question);
    if (normalized) {
      normalizedQuestionMap.set(normalized, [...(normalizedQuestionMap.get(normalized) ?? []), question]);
    }
  }

  const duplicateIds = [...idCounts.entries()]
    .filter(([, count]) => count > 1)
    .map(([id]) => id);
  duplicateIds.forEach((id) => {
    issues.push({ severity: "error", questionId: id, message: "duplicate id" });
    invalidQuestionIds.add(id);
  });

  const possibleDuplicateQuestions: DuplicateQuestionGroup[] = [];
  const sameQuestionAppearingInDifferentChapters: SameQuestionDifferentChapters[] = [];

  for (const [normalizedQuestion, groupedQuestions] of normalizedQuestionMap.entries()) {
    if (groupedQuestions.length <= 1) {
      continue;
    }

    possibleDuplicateQuestions.push({
      normalizedQuestion,
      questionIds: groupedQuestions.map((question) => question.id)
    });
    issues.push({
      severity: "warning",
      message: `possible duplicate question: ${groupedQuestions.map((question) => question.id).join(", ")}`
    });

    const chapters = new Set(groupedQuestions.map((question) => `${question.bankId}/${question.chapter}`));
    if (chapters.size > 1) {
      sameQuestionAppearingInDifferentChapters.push({
        normalizedQuestion,
        chapters: [...chapters],
        questionIds: groupedQuestions.map((question) => question.id)
      });
      issues.push({
        severity: "warning",
        message: `same question appears in different chapters: ${[...chapters].join(", ")}`
      });
    }
  }

  const derivedBankCount = new Set(questions.map((question) => question.bankId).filter(Boolean)).size;
  const derivedChapterCount = new Set(questions.map((question) => `${question.bankId}/${question.chapter}`).filter(Boolean)).size;
  const totalBanks = banks.length > 0 ? banks.length : derivedBankCount;
  const totalChapters =
    banks.length > 0 ? banks.reduce((sum, bank) => sum + bank.chapters.length, 0) : derivedChapterCount;

  const hasErrors = issues.some((issue) => issue.severity === "error");

  return {
    passed: !hasErrors,
    scope,
    generatedAt: new Date().toISOString(),
    totalBanks,
    totalChapters,
    totalQuestions: questions.length,
    validQuestions: questions.length - invalidQuestionIds.size,
    invalidQuestions: invalidQuestionIds.size,
    duplicateIds,
    possibleDuplicateQuestions,
    sameQuestionAppearingInDifferentChapters,
    missingExplanations,
    missingOptions,
    invalidAnswers,
    questionsNeedingManualReview,
    unusuallyShortOptions,
    unusuallyShortExplanations,
    issues
  };
}

export function normalizeQuestionText(question: string): string {
  return question
    .toLowerCase()
    .replace(/[\s,.;:!?，。；：！？、（）()「」『』"']/g, "")
    .trim();
}

function visibleLength(input: string): number {
  return [...input.trim()].length;
}
