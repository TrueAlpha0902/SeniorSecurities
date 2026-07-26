import { ListChecks } from "lucide-react";
import {
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { announceInteractionFeedback } from "../lib/interactionFeedback";

type QuizPosition = {
  current: number;
  total: number;
};

type QuizQuestionItem = {
  number: number;
  answered: boolean;
  current: boolean;
};

const EMPTY_POSITION: QuizPosition = { current: 1, total: 1 };
const PAGE_SELECTOR = [
  ".image-quiz-layout .image-quiz-page",
  ".image-quiz-layout .fx-practice-page",
].join(", ");
const ACTIONS_SELECTOR = ".quiz-header-actions, .fx-question-top-actions";
const FAVORITE_SELECTOR = ".quiz-favorite-button, .fx-favorite";
const QUESTION_BUTTON_SELECTOR =
  ".image-quiz-layout .v90-question-list-grid button";

function readQuizPosition(): QuizPosition {
  const label = document.querySelector(
    ".image-quiz-layout .v90-quiz-position strong",
  )?.textContent ?? "";
  const match = label.match(/(\d+)\s*\/\s*(\d+)/);
  if (!match) return EMPTY_POSITION;
  const current = Number.parseInt(match[1] ?? "1", 10);
  const total = Number.parseInt(match[2] ?? "1", 10);
  return {
    current: Number.isFinite(current) && current > 0 ? current : 1,
    total: Number.isFinite(total) && total > 0 ? total : 1,
  };
}

function readQuestionItems(): QuizQuestionItem[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(QUESTION_BUTTON_SELECTOR),
  ).map((button, index) => ({
    number: Number.parseInt(button.textContent?.trim() ?? "", 10) || index + 1,
    answered: button.classList.contains("is-answered"),
    current: button.classList.contains("is-current"),
  }));
}

function questionItemsSignature(items: QuizQuestionItem[]): string {
  return items
    .map((item) => `${item.number}:${item.answered ? 1 : 0}:${item.current ? 1 : 0}`)
    .join("|");
}

function nativeQuestionButtons(): HTMLButtonElement[] {
  return Array.from(
    document.querySelectorAll<HTMLButtonElement>(QUESTION_BUTTON_SELECTOR),
  );
}

export function QuizNavigationEnhancer() {
  const headerHostRef = useRef<HTMLSpanElement | null>(null);
  const dialogRef = useRef<HTMLElement | null>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const itemsSignatureRef = useRef("");
  const [headerHost, setHeaderHost] = useState<HTMLSpanElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<QuizPosition>(EMPTY_POSITION);
  const [items, setItems] = useState<QuizQuestionItem[]>([]);

  const syncQuestionState = useCallback((): void => {
    const nextPosition = readQuizPosition();
    setPosition((previous) =>
      previous.current === nextPosition.current &&
      previous.total === nextPosition.total
        ? previous
        : nextPosition,
    );

    const nextItems = readQuestionItems();
    const nextSignature = questionItemsSignature(nextItems);
    if (nextSignature !== itemsSignatureRef.current) {
      itemsSignatureRef.current = nextSignature;
      setItems(nextItems);
    }
  }, []);

  const ensureNativeQuestionList = useCallback((): void => {
    if (nativeQuestionButtons().length > 0) {
      syncQuestionState();
      return;
    }

    const trigger = document.querySelector<HTMLButtonElement>(
      ".image-quiz-layout .v90-question-list-trigger",
    );
    if (!trigger) return;

    trigger.click();
    let attempt = 0;
    const waitForButtons = () => {
      attempt += 1;
      if (nativeQuestionButtons().length > 0) {
        syncQuestionState();
        return;
      }
      if (attempt <= 16) window.requestAnimationFrame(waitForButtons);
    };
    window.requestAnimationFrame(waitForButtons);
  }, [syncQuestionState]);

  useEffect(() => {
    function removeHost(): void {
      headerHostRef.current?.remove();
      headerHostRef.current = null;
      setHeaderHost(null);
    }

    function syncEnhancer(): void {
      const page = document.querySelector<HTMLElement>(PAGE_SELECTOR);
      const actions = page?.querySelector<HTMLElement>(ACTIONS_SELECTOR);
      const favorite = actions?.querySelector<HTMLElement>(FAVORITE_SELECTOR);
      const hasNativeAnswerCard = Boolean(
        actions?.querySelector(".quiz-exam-action"),
      );

      if (!page || !actions || !favorite || hasNativeAnswerCard) {
        removeHost();
        setOpen(false);
        return;
      }

      if (!headerHostRef.current?.isConnected) {
        const host = document.createElement("span");
        host.className = "quiz-answer-card-host";
        actions.insertBefore(host, favorite);
        headerHostRef.current = host;
        setHeaderHost(host);
      }

      syncQuestionState();
    }

    syncEnhancer();
    const observer = new MutationObserver(syncEnhancer);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["class"],
    });

    return () => {
      observer.disconnect();
      removeHost();
    };
  }, [syncQuestionState]);

  useEffect(() => {
    if (!open) return;

    previousFocusRef.current = document.activeElement as HTMLElement | null;
    document.body.classList.add("quiz-answer-card-open");

    const focusTimer = window.setTimeout(() => {
      dialogRef.current
        ?.querySelector<HTMLButtonElement>(".quiz-answer-card-close")
        ?.focus();
    }, 0);

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", handleKeyDown);

    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      document.body.classList.remove("quiz-answer-card-open");
      previousFocusRef.current?.focus();
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    ensureNativeQuestionList();
  }, [ensureNativeQuestionList, open]);

  function selectQuestion(requested: number): void {
    if (
      !Number.isInteger(requested) ||
      requested < 1 ||
      requested > position.total
    ) {
      announceInteractionFeedback(
        `請選擇 1 到 ${position.total} 之間的題號。`,
        "warning",
        3600,
      );
      return;
    }

    let attempt = 0;
    const choose = () => {
      const buttons = nativeQuestionButtons();
      const target = buttons[requested - 1];
      if (target) {
        target.click();
        setOpen(false);
        announceInteractionFeedback(`已前往第 ${requested} 題`, "success");
        return;
      }

      if (attempt === 0) ensureNativeQuestionList();
      attempt += 1;
      if (attempt <= 16) {
        window.requestAnimationFrame(choose);
      } else {
        announceInteractionFeedback("答案卡尚未完成載入，請再試一次。", "error");
      }
    };

    choose();
  }

  const answeredCount = items.filter((item) => item.answered).length;
  const fallbackItems = Array.from(
    { length: position.total },
    (_, index): QuizQuestionItem => ({
      number: index + 1,
      answered: false,
      current: index + 1 === position.current,
    }),
  );
  const visibleItems = items.length === position.total ? items : fallbackItems;

  return (
    <>
      {headerHost
        ? createPortal(
            <button
              type="button"
              className={`quiz-answer-card-button${open ? " is-active" : ""}`}
              aria-label="開啟答案卡"
              aria-expanded={open}
              onClick={() => setOpen((value) => !value)}
            >
              <ListChecks aria-hidden="true" size={19} />
              <span>答案卡</span>
            </button>,
            headerHost,
          )
        : null}

      {open
        ? createPortal(
            <div
              className="quiz-answer-card-backdrop"
              role="presentation"
              onMouseDown={(event) => {
                if (event.currentTarget === event.target) setOpen(false);
              }}
            >
              <section
                ref={dialogRef}
                className="quiz-answer-card-dialog"
                role="dialog"
                aria-modal="true"
                aria-labelledby="quiz-answer-card-title"
              >
                <header className="quiz-answer-card-dialog-header">
                  <div className="quiz-answer-card-title-group">
                    <span className="quiz-answer-card-title-icon" aria-hidden="true">
                      <ListChecks size={22} />
                    </span>
                    <div>
                      <h2 id="quiz-answer-card-title">答案卡</h2>
                      <p>
                        已作答 {answeredCount}／{position.total} 題・目前第 {position.current} 題
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    className="quiz-answer-card-close"
                    aria-label="關閉答案卡"
                    onClick={() => setOpen(false)}
                  >
                    <span aria-hidden="true">×</span>
                  </button>
                </header>

                <div className="quiz-answer-card-legend" aria-label="答案卡圖例">
                  <span className="is-current">目前題目</span>
                  <span className="is-answered">已作答</span>
                  <span>未作答</span>
                </div>

                <div className="quiz-answer-card-grid" role="list" aria-label="題目列表">
                  {visibleItems.map((item) => (
                    <button
                      type="button"
                      key={item.number}
                      className={`${item.current ? "is-current" : ""}${item.answered ? " is-answered" : ""}`}
                      aria-label={`第 ${item.number} 題${item.current ? "，目前題目" : ""}${item.answered ? "，已作答" : "，未作答"}`}
                      aria-current={item.current ? "step" : undefined}
                      onClick={() => selectQuestion(item.number)}
                    >
                      {item.number}
                    </button>
                  ))}
                </div>
              </section>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
