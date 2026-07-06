import type { AnswerKey, Question } from "../types";

export const answerKeys: AnswerKey[] = ["A", "B", "C", "D"];

export function shuffleQuestions<T>(items: readonly T[]): T[] {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const randomIndex = Math.floor(Math.random() * (index + 1));
    const current = shuffled[index];
    shuffled[index] = shuffled[randomIndex] as T;
    shuffled[randomIndex] = current as T;
  }
  return shuffled;
}

export function calculateAccuracy(correctCount: number, totalQuestions: number): number {
  if (totalQuestions === 0) {
    return 0;
  }
  return Math.round((correctCount / totalQuestions) * 1000) / 10;
}

export function buildSessionId(): string {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }
  return `session-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function isAnswerKey(value: string): value is AnswerKey {
  return answerKeys.includes(value as AnswerKey);
}

export function questionMatchesId(question: Question, questionId: string): boolean {
  return question.id === questionId;
}
