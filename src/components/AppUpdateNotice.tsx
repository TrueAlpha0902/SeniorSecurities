import { useEffect, useState } from "react";
import {
  APP_UPDATE_AVAILABLE_EVENT,
  type AppUpdateAvailableDetail,
} from "../lib/appRecovery";

export function AppUpdateNotice() {
  const [applyUpdate, setApplyUpdate] = useState<(() => Promise<void>) | null>(null);
  const [updating, setUpdating] = useState(false);

  useEffect(() => {
    const handleUpdateAvailable = (event: Event) => {
      const customEvent = event as CustomEvent<AppUpdateAvailableDetail>;
      if (!customEvent.detail?.applyUpdate) return;
      setApplyUpdate(() => customEvent.detail.applyUpdate);
    };

    window.addEventListener(APP_UPDATE_AVAILABLE_EVENT, handleUpdateAvailable);
    return () => window.removeEventListener(APP_UPDATE_AVAILABLE_EVENT, handleUpdateAvailable);
  }, []);

  if (!applyUpdate) return null;

  async function handleApplyUpdate(): Promise<void> {
    setUpdating(true);
    try {
      await applyUpdate?.();
    } catch (error) {
      console.error("Unable to apply app update", error);
      setUpdating(false);
    }
  }

  return (
    <aside className="app-update-notice" role="status" aria-live="polite">
      <div>
        <strong>新版本已準備完成</strong>
        <span>完成目前操作後更新，可避免頁面在版本切換時變成空白。</span>
      </div>
      <div className="app-update-actions">
        <button type="button" onClick={() => setApplyUpdate(null)} disabled={updating}>
          稍後
        </button>
        <button type="button" className="is-primary" onClick={() => void handleApplyUpdate()} disabled={updating}>
          {updating ? "更新中" : "更新 App"}
        </button>
      </div>
    </aside>
  );
}
