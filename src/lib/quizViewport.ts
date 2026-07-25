export type QuestionFocusOptions = {
  previousScrollY?: number | null;
  neverScrollDown?: boolean;
};

/**
 * Moves keyboard focus to the newly rendered question without unexpectedly
 * moving the reader's viewport.
 *
 * Every in-run navigation path records the current scroll position before the
 * question changes. In that case we restore the exact position after React has
 * committed the next question. This keeps the fixed mobile controls stable and
 * prevents a shorter or longer question from pulling the whole page downward.
 *
 * When there is no previous position (for example, a direct deep link), the
 * question is aligned below the sticky navigation bar.
 */
export function focusQuestionAtTop(
  target: HTMLElement | null,
  options: QuestionFocusOptions = {},
): void {
  if (!target || typeof window === "undefined") return;

  const previousScrollY = options.previousScrollY;
  if (previousScrollY != null && Number.isFinite(previousScrollY)) {
    window.scrollTo({ top: Math.max(0, previousScrollY), behavior: "auto" });
    target.focus({ preventScroll: true });
    return;
  }

  const navbar = document.querySelector<HTMLElement>(".product-navbar");
  const navbarHeight = navbar?.offsetHeight ?? 0;
  const spacing = window.matchMedia?.("(max-width: 760px)").matches ? 8 : 16;
  const targetTop = target.getBoundingClientRect().top + window.scrollY;
  const desiredScrollTop = Math.max(0, targetTop - navbarHeight - spacing);
  const scrollTop = options.neverScrollDown
    ? Math.min(window.scrollY, desiredScrollTop)
    : desiredScrollTop;

  window.scrollTo({ top: scrollTop, behavior: "auto" });
  target.focus({ preventScroll: true });
}

export function vibrateForAnswer(isCorrect: boolean): void {
  if (typeof navigator === "undefined" || typeof navigator.vibrate !== "function") return;
  navigator.vibrate(isCorrect ? [28, 20, 42] : [55, 35, 85]);
}
