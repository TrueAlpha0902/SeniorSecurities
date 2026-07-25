import type { AnswerKey } from "../types";

type QuizOptionButtonProps = {
  answerKey: AnswerKey;
  text: string;
  selectedAnswer: AnswerKey | null;
  correctAnswer: AnswerKey;
  revealed: boolean;
  onSelect: (answer: AnswerKey) => void;
};

export function QuizOptionButton({
  answerKey,
  text,
  selectedAnswer,
  correctAnswer,
  revealed,
  onSelect
}: QuizOptionButtonProps) {
  const isSelected = selectedAnswer === answerKey;
  const isCorrect = revealed && correctAnswer === answerKey;
  const isWrongSelected = revealed && isSelected && correctAnswer !== answerKey;
  const classes = [
    "glass-answer-button",
    isSelected ? "glass-answer-selected" : "",
    isCorrect ? "glass-answer-correct" : "",
    isWrongSelected ? "glass-answer-wrong" : ""
  ]
    .filter(Boolean)
    .join(" ");

  const resultText = isCorrect ? "正解" : isWrongSelected ? "你的答案" : "";

  return (
    <button
      className={classes}
      disabled={revealed}
      onClick={() => onSelect(answerKey)}
      type="button"
      aria-pressed={isSelected}
      aria-label={`${answerKey}. ${text}${resultText ? `, ${resultText}` : ""}`}
    >
      <span className="answer-key">{answerKey}</span>
      <span className="answer-text">{text}</span>
      {resultText ? <span className="answer-result">{resultText}</span> : null}
    </button>
  );
}
