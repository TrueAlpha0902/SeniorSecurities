import {
  AlertTriangle,
  CheckCircle2,
  Info,
  X,
} from "lucide-react";
import { useEffect, useRef, useState } from "react";
import {
  INTERACTION_FEEDBACK_EVENT,
  type InteractionFeedbackDetail,
} from "../lib/interactionFeedback";

type FeedbackState = InteractionFeedbackDetail & {
  id: number;
};

export function InteractionFeedbackHost() {
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);
  const dismissTimerRef = useRef<number | null>(null);

  useEffect(() => {
    function clearDismissTimer(): void {
      if (dismissTimerRef.current !== null) {
        window.clearTimeout(dismissTimerRef.current);
        dismissTimerRef.current = null;
      }
    }

    function handleFeedback(event: Event): void {
      const detail = (event as CustomEvent<InteractionFeedbackDetail>).detail;
      if (!detail?.message) return;

      clearDismissTimer();
      setFeedback({ ...detail, id: Date.now() });
      dismissTimerRef.current = window.setTimeout(() => {
        setFeedback(null);
        dismissTimerRef.current = null;
      }, detail.durationMs);
    }

    window.addEventListener(INTERACTION_FEEDBACK_EVENT, handleFeedback);
    return () => {
      window.removeEventListener(INTERACTION_FEEDBACK_EVENT, handleFeedback);
      clearDismissTimer();
    };
  }, []);

  if (!feedback) return null;

  const Icon = feedback.tone === "success"
    ? CheckCircle2
    : feedback.tone === "warning" || feedback.tone === "error"
      ? AlertTriangle
      : Info;

  return (
    <aside
      key={feedback.id}
      className={`v93-interaction-feedback is-${feedback.tone}`}
      role={feedback.tone === "error" ? "alert" : "status"}
      aria-live={feedback.tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <Icon aria-hidden="true" size={19} />
      <span>{feedback.message}</span>
      <button
        type="button"
        aria-label="關閉操作提示"
        onClick={() => setFeedback(null)}
      >
        <X aria-hidden="true" size={17} />
      </button>
    </aside>
  );
}
