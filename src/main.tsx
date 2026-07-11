import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { registerSW } from "virtual:pwa-register";
import { App } from "./App";
import "./styles/glass.css";

type IdleWindow = Window & {
  requestIdleCallback?: (
    callback: IdleRequestCallback,
    options?: IdleRequestOptions,
  ) => number;
};

function registerServiceWorkerAfterFirstPaint(): void {
  const startRegistration = () => {
    const updateServiceWorker = registerSW({
      immediate: true,
      onNeedRefresh() {
        void updateServiceWorker(true);
      },
      onRegisteredSW(_swUrl, registration) {
        if (!registration) return;

        const checkForUpdate = () => {
          void registration.update();
        };

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrowserRouter basename={import.meta.env.BASE_URL}>
      <App />
    </BrowserRouter>
  </StrictMode>,
);

registerServiceWorkerAfterFirstPaint();
