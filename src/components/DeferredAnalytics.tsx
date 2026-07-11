import { Component, Suspense, useEffect, useState, type ErrorInfo, type ReactNode } from "react";
import { lazyWithRetry } from "../lib/lazyWithRetry";

const LazyAnalytics = lazyWithRetry(() =>
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

class AnalyticsErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.warn("Analytics disabled after an isolated loading error", error, info.componentStack);
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

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
    <AnalyticsErrorBoundary>
      <Suspense fallback={null}>
        <LazyAnalytics />
      </Suspense>
    </AnalyticsErrorBoundary>
  ) : null;
}
