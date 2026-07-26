import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { loadImageQuizChapter } from "../lib/imageQuiz";

function chapterRoute(pathname: string): { bankId: string; chapterId: string } | null {
  const match = pathname.match(/^\/image-quiz\/bank\/([^/]+)\/chapter\/([^/]+)/);
  if (!match) return null;
  return {
    bankId: decodeURIComponent(match[1] ?? ""),
    chapterId: decodeURIComponent(match[2] ?? ""),
  };
}

function chapterContext(
  bankTitle: string,
  chapterTitle: string,
  chapterTopic?: string,
): string {
  const topic = chapterTopic?.trim();
  const chapter = topic && !chapterTitle.includes(topic)
    ? `${chapterTitle} ${topic}`
    : chapterTitle;
  return `${bankTitle} / ${chapter}`;
}

export function QuizHeadingEnhancer() {
  const location = useLocation();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const [host, setHost] = useState<HTMLDivElement | null>(null);
  const [context, setContext] = useState<string | null>(null);

  useEffect(() => {
    const route = chapterRoute(location.pathname);
    let cancelled = false;

    if (!route) {
      setContext(null);
      return () => {
        cancelled = true;
      };
    }

    void loadImageQuizChapter(route.bankId, route.chapterId)
      .then((chapter) => {
        if (cancelled || !chapter) return;
        setContext(
          chapterContext(
            chapter.bankTitle,
            chapter.chapterTitle,
            chapter.chapterTopic,
          ),
        );
      })
      .catch(() => {
        if (!cancelled) setContext(null);
      });

    return () => {
      cancelled = true;
    };
  }, [location.pathname]);

  useEffect(() => {
    function removeHost(): void {
      hostRef.current?.remove();
      hostRef.current = null;
      setHost(null);
    }

    function sync(): void {
      const root = document.querySelector<HTMLElement>(".image-quiz-layout");
      const questionSurface =
        root?.querySelector<HTMLElement>(".active-question-panel") ??
        root?.querySelector<HTMLElement>(".fx-question-text");

      if (!root || !questionSurface) {
        removeHost();
        return;
      }

      if (!hostRef.current?.isConnected) {
        const nextHost = document.createElement("div");
        nextHost.className = "quiz-heading-host";
        questionSurface.parentNode?.insertBefore(nextHost, questionSurface);
        hostRef.current = nextHost;
        setHost(nextHost);
      }

      if (context) {
        const contextNode = root.querySelector<HTMLElement>(
          ".v90-quiz-position small",
        );
        if (contextNode && contextNode.textContent !== context) {
          contextNode.textContent = context;
        }
      }
    }

    sync();
    const observer = new MutationObserver(sync);
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });

    return () => {
      observer.disconnect();
      removeHost();
    };
  }, [context, location.pathname]);

  return host
    ? createPortal(
        <h2 className="quiz-section-heading">題目</h2>,
        host,
      )
    : null;
}
