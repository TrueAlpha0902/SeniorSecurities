export const INTERACTION_FEEDBACK_EVENT = "app:interaction-feedback";

export type InteractionFeedbackTone = "info" | "success" | "warning" | "error";

export type InteractionFeedbackDetail = {
  message: string;
  tone: InteractionFeedbackTone;
  durationMs: number;
};

export function announceInteractionFeedback(
  message: string,
  tone: InteractionFeedbackTone = "info",
  durationMs = 2400,
): void {
  if (typeof window === "undefined") return;
  const normalizedMessage = message.trim();
  if (!normalizedMessage) return;

  window.dispatchEvent(
    new CustomEvent<InteractionFeedbackDetail>(INTERACTION_FEEDBACK_EVENT, {
      detail: {
        message: normalizedMessage,
        tone,
        durationMs: Math.min(8000, Math.max(1200, Math.trunc(durationMs))),
      },
    }),
  );
}
