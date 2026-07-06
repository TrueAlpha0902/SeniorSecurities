import type { AnswerKey } from "../types";

type ExplanationPanelProps = {
  selectedAnswer: AnswerKey;
  correctAnswer: AnswerKey;
  explanation: string;
};

export function ExplanationPanel({ selectedAnswer, correctAnswer, explanation }: ExplanationPanelProps) {
  const isCorrect = selectedAnswer === correctAnswer;
  return (
    <section className="glass-explanation" aria-live="polite">
      <div className="result-line">
        <span className={isCorrect ? "status-text correct" : "status-text wrong"}>
          {isCorrect ? "答對" : "答錯"}
        </span>
        <span>你的答案：{selectedAnswer}</span>
        <span>正確答案：{correctAnswer}</span>
      </div>
      <p>{explanation}</p>
    </section>
  );
}
