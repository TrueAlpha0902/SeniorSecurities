import { useEffect } from "react";

const activeLocks = new Set<symbol>();
let lockedBody: HTMLElement | null = null;
let previousOverflow = "";

export function acquireBodyScrollLock(): () => void {
  if (typeof document === "undefined" || !document.body) return () => undefined;

  const token = Symbol("body-scroll-lock");
  if (activeLocks.size === 0) {
    lockedBody = document.body;
    previousOverflow = lockedBody.style.overflow;
    lockedBody.style.overflow = "hidden";
  }
  activeLocks.add(token);

  return () => {
    if (!activeLocks.delete(token)) return;
    if (activeLocks.size > 0) return;

    if (lockedBody) lockedBody.style.overflow = previousOverflow;
    lockedBody = null;
    previousOverflow = "";
  };
}

export function useBodyScrollLock(locked: boolean): void {
  useEffect(() => {
    if (!locked) return;
    return acquireBodyScrollLock();
  }, [locked]);
}
