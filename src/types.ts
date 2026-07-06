export type AnswerKey = "A" | "B" | "C" | "D";

export type ReviewStatus = "raw" | "checked" | "needs_fix";

export type Question = {
  id: string;
  bankId: string;
  bankTitle: string;
  chapter: string;
  question: string;
  options: {
    A: string;
    B: string;
    C: string;
    D: string;
  };
  answer: AnswerKey;
  explanation: string;
  source?: string;
  sourceFile: string;
  batchId: string;
  importedAt: string;
  reviewStatus: ReviewStatus;
  tags?: string[];
};

export type QuizBank = {
  id: string;
  title: string;
  description?: string;
  chapters: {
    id: string;
    title: string;
    file: string;
    questionCount: number;
  }[];
};

export type UserAnswer = {
  questionId: string;
  selectedAnswer: AnswerKey;
  correctAnswer: AnswerKey;
  isCorrect: boolean;
  answeredAt: string;
  bankId: string;
  chapter: string;
};

export type WrongQuestionRecord = {
  questionId: string;
  bankId: string;
  chapter: string;
  lastWrongAt: string;
  wrongCount: number;
};

export type FavoriteQuestionRecord = {
  questionId: string;
  bankId: string;
  chapter: string;
  createdAt: string;
};

export type QuizSessionMode = "bank" | "chapter" | "all" | "wrong" | "favorites";

export type QuizSession = {
  sessionId: string;
  mode: QuizSessionMode;
  startedAt: string;
  finishedAt: string;
  totalQuestions: number;
  correctCount: number;
  wrongCount: number;
  accuracy: number;
};

export type QuestionRef = {
  questionId: string;
  bankId: string;
  chapter: string;
};

export type QuizResultState = {
  session: QuizSession;
  restartTo: string;
  wrongQuestionIds: string[];
};
