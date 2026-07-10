import { ArrowLeft, ArrowRight, CheckCircle2 } from "lucide-react";
import { useMemo, useState } from "react";
import { EmptyState } from "../components/EmptyState";
import { ErrorState } from "../components/ErrorState";
import { EncouragementNote } from "../components/EncouragementNote";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { PdfSegmentStack } from "../components/PdfSegmentStack";
import { ProgressBar } from "../components/ProgressBar";
import { useAsync } from "../hooks/useAsync";
import { loadAllImageQuestions, type ImageQuizQuestion } from "../lib/imageQuiz";

const T = {
  loading: "\u8f09\u5165\u6b63\u89e3\u6a21\u5f0f",
  title: "\u6b63\u89e3\u6a21\u5f0f",
  empty: "\u76ee\u524d\u6c92\u6709\u984c\u76ee",
  emptyMessage: "\u8acb\u5148\u56de\u9996\u9801\u9078\u64c7\u984c\u5eab\u3002",
  home: "\u56de\u9996\u9801",
  answer: "\u6b63\u89e3",
  explanation: "\u89e3\u6790",
  previous: "\u4e0a\u4e00\u984c",
  next: "\u4e0b\u4e00\u984c",
  navigation: "\u6b63\u89e3\u6a21\u5f0f\u5c0e\u89bd",
};

type AnswerDrillData = {
  questions: ImageQuizQuestion[];
};

async function loadAnswerDrillData(): Promise<AnswerDrillData> {
  const questions = await loadAllImageQuestions();
  return { questions };
}

export function AnswerDrillPage() {
  const { data, error, loading } = useAsync(loadAnswerDrillData, []);
  const questions = useMemo(() => data?.questions ?? [], [data?.questions]);
  const [currentIndex, setCurrentIndex] = useState(0);

  if (loading) {
    return <LoadingState label={T.loading} />;
  }

  if (error) {
    return <ErrorState message={error} />;
  }

  if (!questions.length) {
    return <EmptyState title={T.empty} message={T.emptyMessage} actionLabel={T.home} actionTo="/" />;
  }

  const currentQuestion = questions[currentIndex];
  if (!currentQuestion) {
    return <ErrorState message={T.empty} />;
  }

  return (
    <div className="image-quiz-page answer-drill-page">
      <GlassCard className="image-quiz-card">
        <div className="image-quiz-header">
          <div>
            <p className="eyebrow">
              {currentQuestion.bankTitle} / {currentQuestion.chapterTitle}
            </p>
            <h1>
              {"\u7b2c "}
              {currentIndex + 1}
              {" \u984c"}
            </h1>
          </div>
          <div className="answer-drill-mark" aria-label={`${T.answer} (${currentQuestion.answer})`}>
            <CheckCircle2 aria-hidden="true" size={24} />
            <span>({currentQuestion.answer})</span>
          </div>
        </div>

        <ProgressBar
          value={currentIndex + 1}
          max={questions.length}
          label={`${currentIndex + 1} / ${questions.length}`}
        />

        <PdfSegmentStack
          label={`${currentQuestion.bankTitle} ${currentQuestion.chapterTitle} ${currentQuestion.number} \u984c`}
          segments={currentQuestion.questionSegments}
          priority="high"
        />

        <div className="answer-drill-key">
          <span>{T.answer}</span>
          <strong>({currentQuestion.answer})</strong>
        </div>

        <EncouragementNote isCorrect seed={currentQuestion.id} />

        <div className="glass-explanation">
          <h2>{T.explanation}</h2>
          <PdfSegmentStack
            label={`${currentQuestion.bankTitle} ${currentQuestion.chapterTitle} ${currentQuestion.number} \u984c\u89e3\u6790`}
            segments={currentQuestion.explanationSegments}
            priority="auto"
          />
        </div>
      </GlassCard>

      <div className="image-quiz-controls" aria-label={T.navigation}>
        <GlassButton
          variant="secondary"
          onClick={() => setCurrentIndex((index) => Math.max(0, index - 1))}
          disabled={currentIndex === 0}
        >
          <ArrowLeft aria-hidden="true" size={18} />
          <span>{T.previous}</span>
        </GlassButton>
        <GlassButton
          variant="primary"
          onClick={() => setCurrentIndex((index) => Math.min(questions.length - 1, index + 1))}
          disabled={currentIndex >= questions.length - 1}
        >
          <span>{T.next}</span>
          <ArrowRight aria-hidden="true" size={18} />
        </GlassButton>
      </div>
    </div>
  );
}
