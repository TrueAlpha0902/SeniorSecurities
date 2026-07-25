import type { AnswerKey, Question } from "../types";
import { answerKeys } from "../lib/quiz";
import { ExplanationPanel } from "./ExplanationPanel";
import { FavoriteButton } from "./FavoriteButton";
import { QuizOptionButton } from "./QuizOptionButton";

type QuestionViewProps = {
  question: Question;
  selectedAnswer: AnswerKey | null;
  revealed: boolean;
  onSelect: (answer: AnswerKey) => void;
};

export function QuestionView({ question, selectedAnswer, revealed, onSelect }: QuestionViewProps) {
  return (
    <article className="question-view">
      <div className="question-header">
        <div>
          <span className="glass-badge">{question.bankTitle}</span>
          <span className="glass-badge">{question.chapter}</span>
        </div>
        <FavoriteButton question={question} />
      </div>

      <h1>{question.question}</h1>

      <div className="answer-grid">
        {answerKeys.map((answerKey) => (
          <QuizOptionButton
            key={answerKey}
            answerKey={answerKey}
            text={question.options[answerKey]}
            selectedAnswer={selectedAnswer}
            correctAnswer={question.answer}
            revealed={revealed}
            onSelect={onSelect}
          />
        ))}
      </div>

      {revealed && selectedAnswer ? (
        <ExplanationPanel selectedAnswer={selectedAnswer} correctAnswer={question.answer} explanation={question.explanation} />
      ) : null}
    </article>
  );
}
