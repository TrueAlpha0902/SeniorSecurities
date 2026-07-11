import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import { announceAppUpdate, recoverFromChunkLoadError } from "./lib/appRecovery";
import { reportClientError } from "./lib/telemetry";
import "./styles/glass.css";

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
};

function installGlobalRecoveryHandlers(): void {
  window.addEventListener("error", (event) => {
    const error = event.error ?? event.message;
    if (recoverFromChunkLoadError(error)) event.preventDefault();
    else reportClientError(error);
  });

  window.addEventListener("unhandledrejection", (event) => {
    if (recoverFromChunkLoadError(event.reason)) event.preventDefault();
    else reportClientError(event.reason);
  });
}

function registerServiceWorkerAfterFirstPaint(): void {
  const startRegistration = () => {
    const updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        announceAppUpdate(() => updateServiceWorker(true));
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;

        const checkForUpdate = () => {
          void registration.update();
        };

        checkForUpdate();
        window.addEventListener("focus", checkForUpdate, { passive: true });
        document.addEventListener("visibilitychange", () => {
          if (document.visibilityState === "visible") checkForUpdate();
        });
        window.setInterval(checkForUpdate, 30 * 60 * 1000);
      },
    });
  };

  const schedule = () => {
    const idleWindow = window as IdleWindow;
    if (idleWindow.requestIdleCallback) {
      idleWindow.requestIdleCallback(startRegistration, { timeout: 3000 });
    } else {
      window.setTimeout(startRegistration, 900);
    }
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true, passive: true });
}

installGlobalRecoveryHandlers();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorkerAfterFirstPaint();
