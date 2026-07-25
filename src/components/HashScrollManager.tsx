import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { announceInteractionFeedback } from "../lib/interactionFeedback";

const MAX_ATTEMPTS = 24;
const RETRY_INTERVAL_MS = 80;

function decodeHash(hash: string): string {
  const value = hash.startsWith("#") ? hash.slice(1) : hash;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}

function targetLabel(target: HTMLElement): string {
  const labelledBy = target.getAttribute("aria-labelledby");
  if (labelledBy) {
    const label = document.getElementById(labelledBy)?.textContent?.trim();
    if (label) return label;
  }

  const heading = target.matches("h1, h2, h3")
    ? target
    : target.querySelector<HTMLElement>("h1, h2, h3");
  return heading?.textContent?.trim() || "指定區段";
}

function prefersReducedMotion(): boolean {
  return window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
}

function focusSection(target: HTMLElement): void {
  const hadTabIndex = target.hasAttribute("tabindex");
  if (!hadTabIndex) target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });
  if (!hadTabIndex) {
    target.addEventListener(
      "blur",
      () => target.removeAttribute("tabindex"),
      { once: true },
    );
  }
}

export async function scrollToHashTarget(
  hash: string,
  options: { announce?: boolean } = {},
): Promise<boolean> {
  if (typeof window === "undefined" || typeof document === "undefined") {
    return false;
  }

  const id = decodeHash(hash);
  if (!id) return false;

  for (let attempt = 0; attempt < MAX_ATTEMPTS; attempt += 1) {
    const target = document.getElementById(id);
    if (target) {
      target.scrollIntoView({
        behavior: prefersReducedMotion() ? "auto" : "smooth",
        block: "start",
      });
      focusSection(target);
      if (options.announce !== false) {
        announceInteractionFeedback(`已前往：${targetLabel(target)}`, "success");
      }
      return true;
    }

    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, RETRY_INTERVAL_MS);
    });
  }

  if (options.announce !== false) {
    announceInteractionFeedback("找不到指定區段，請重新整理後再試。", "error", 4200);
  }
  return false;
}

export function HashScrollManager() {
  const location = useLocation();

  useEffect(() => {
    if (!location.hash) return;
    const frame = window.requestAnimationFrame(() => {
      void scrollToHashTarget(location.hash);
    });
    return () => window.cancelAnimationFrame(frame);
  }, [location.hash, location.pathname, location.search]);

  useEffect(() => {
    function handleAnchorClick(event: MouseEvent): void {
      if (!(event.target instanceof Element)) return;
      const anchor = event.target.closest<HTMLAnchorElement>("a[href*='#']");
      if (!anchor) return;

      const targetUrl = new URL(anchor.href, window.location.href);
      if (
        targetUrl.origin !== window.location.origin ||
        targetUrl.pathname !== window.location.pathname ||
        targetUrl.search !== window.location.search ||
        !targetUrl.hash ||
        targetUrl.hash !== window.location.hash
      ) {
        return;
      }

      window.requestAnimationFrame(() => {
        void scrollToHashTarget(targetUrl.hash);
      });
    }

    document.addEventListener("click", handleAnchorClick, true);
    return () => document.removeEventListener("click", handleAnchorClick, true);
  }, []);

  return null;
}
