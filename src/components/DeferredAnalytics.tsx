import { lazy, Suspense, useEffect, useState } from "react";

const LazyAnalytics = lazy(() =>
  import("@vercel/analytics/react").then((module) => ({
    default: module.Analytics,
  })),
);

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
  cancelIdleCallback?: (handle: number) => void;
};

export function DeferredAnalytics() {
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      const handle = idleWindow.requestIdleCallback(
        () => setEnabled(true),
        { timeout: 4000 },
      );
      return () => idleWindow.cancelIdleCallback?.(handle);
    }
    const timer = window.setTimeout(() => setEnabled(true), 1800);
    return () => window.clearTimeout(timer);
  }, []);

  return enabled ? (
    <Suspense fallback={null}>
      <LazyAnalytics />
    </Suspense>
  ) : null;
}
