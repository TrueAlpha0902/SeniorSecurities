type QuizStatsProps = {
  current: number;
  total: number;
  correct: number;
  wrong: number;
  accuracy: number;
};

export function QuizStats({ current, total, correct, wrong, accuracy }: QuizStatsProps) {
  return (
    <div className="quiz-stats" aria-label="Quiz statistics">
      <span className="glass-badge">第 {Math.min(current, total)} / {total} 題</span>
      <span className="glass-badge">答對 {correct}</span>
      <span className="glass-badge">答錯 {wrong}</span>
      <span className="glass-badge">正確率 {accuracy}%</span>
    </div>
  );
}
