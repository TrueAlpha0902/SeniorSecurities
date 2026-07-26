import { ListChecks } from "lucide-react";
import {
  type FormEvent,
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

const EMPTY_POSITION: QuizPosition = { current: 1, total: 1 };

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

export function QuizNavigationEnhancer() {
  const headerHostRef = useRef<HTMLSpanElement | null>(null);
  const panelHostRef = useRef<HTMLDivElement | null>(null);
  const [headerHost, setHeaderHost] = useState<HTMLSpanElement | null>(null);
  const [panelHost, setPanelHost] = useState<HTMLDivElement | null>(null);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<QuizPosition>(EMPTY_POSITION);
  const [jumpValue, setJumpValue] = useState("1");

  useEffect(() => {
    function removeHosts(): void {
      headerHostRef.current?.remove();
      panelHostRef.current?.remove();
      headerHostRef.current = null;
      panelHostRef.current = null;
      setHeaderHost(null);
      setPanelHost(null);
    }

    function syncEnhancer(): void {
      const page = document.querySelector<HTMLElement>(
        ".image-quiz-layout .image-quiz-page",
      );
      const actions = page?.querySelector<HTMLElement>(
        ".quiz-header-actions",
      );
      const favorite = actions?.querySelector<HTMLElement>(
        ".quiz-favorite-button",
      );
      const questionCard = page?.querySelector<HTMLElement>(
        ".image-quiz-card",
      );
      const hasNativeAnswerCard = Boolean(
        actions?.querySelector(".quiz-exam-action"),
      );

      if (!page || !actions || !favorite || !questionCard || hasNativeAnswerCard) {
        removeHosts();
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

      if (!panelHostRef.current?.isConnected) {
        const host = document.createElement("div");
        host.className = "quiz-jump-panel-host";
        questionCard.parentNode?.insertBefore(host, questionCard.nextSibling);
        panelHostRef.current = host;
        setPanelHost(host);
      }

      const next = readQuizPosition();
      setPosition((previous) =>
        previous.current === next.current && previous.total === next.total
          ? previous
          : next,
      );
    }

    syncEnhancer();
    const observer = new MutationObserver(syncEnhancer);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      removeHosts();
    };
  }, []);

  useEffect(() => {
    if (open) setJumpValue(String(position.current));
  }, [open, position.current]);

  function jumpToQuestion(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const requested = Number.parseInt(jumpValue, 10);
    if (
      !Number.isInteger(requested) ||
      requested < 1 ||
      requested > position.total
    ) {
      announceInteractionFeedback(
        `請輸入 1 到 ${position.total} 之間的題號。`,
        "warning",
        3600,
      );
      return;
    }

    const trigger = document.querySelector<HTMLButtonElement>(
      ".image-quiz-layout .v90-question-list-trigger",
    );
    if (!trigger) {
      announceInteractionFeedback("目前無法開啟答案卡，請稍後再試。", "error");
      return;
    }

    let attempt = 0;
    const selectQuestion = () => {
      const buttons = Array.from(
        document.querySelectorAll<HTMLButtonElement>(
          ".image-quiz-layout .v90-question-list-grid button",
        ),
      );
      const target = buttons[requested - 1];
      if (target) {
        target.click();
        setOpen(false);
        announceInteractionFeedback(`已前往第 ${requested} 題`, "success");
        return;
      }

      if (attempt === 0) trigger.click();
      attempt += 1;
      if (attempt <= 12) {
        window.requestAnimationFrame(selectQuestion);
      } else {
        announceInteractionFeedback("答案卡尚未完成載入，請再試一次。", "error");
      }
    };

    selectQuestion();
  }

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

      {panelHost && open
        ? createPortal(
            <section className="quiz-jump-panel" aria-label="答案卡跳題">
              <div className="quiz-jump-panel-copy">
                <span className="quiz-jump-panel-icon" aria-hidden="true">
                  <ListChecks size={20} />
                </span>
                <div>
                  <strong>答案卡</strong>
                  <span>
                    目前第 {position.current} 題，共 {position.total} 題
                  </span>
                </div>
              </div>
              <form className="quiz-jump-form" onSubmit={jumpToQuestion}>
                <label htmlFor="quiz-jump-input">跳到題號</label>
                <div>
                  <input
                    id="quiz-jump-input"
                    type="number"
                    min={1}
                    max={position.total}
                    inputMode="numeric"
                    value={jumpValue}
                    onChange={(event) => setJumpValue(event.currentTarget.value)}
                    aria-describedby="quiz-jump-hint"
                  />
                  <button type="submit">跳轉</button>
                </div>
                <small id="quiz-jump-hint">
                  請輸入 1–{position.total}；跳轉後會自動回到題目。
                </small>
              </form>
            </section>,
            panelHost,
          )
        : null}
    </>
  );
}
