import { Component, type ErrorInfo, type ReactNode } from "react";
import { clearRuntimeCachesAndReload, recoverFromChunkLoadError, reloadAppWithCacheBust } from "../lib/appRecovery";
import { reportClientError } from "../lib/telemetry";

type AppErrorBoundaryProps = {
  children: ReactNode;
};

type AppErrorBoundaryState = {
  error: Error | null;
  clearingCaches: boolean;
};

export class AppErrorBoundary extends Component<AppErrorBoundaryProps, AppErrorBoundaryState> {
  state: AppErrorBoundaryState = {
    error: null,
    clearingCaches: false,
  };

  static getDerivedStateFromError(error: Error): Partial<AppErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error("Unhandled application error", error, info);
    reportClientError(error);
    recoverFromChunkLoadError(error);
  }

  private handleReload = (): void => {
    void reloadAppWithCacheBust("manual-reload");
  };

  private handleClearCaches = async (): Promise<void> => {
    this.setState({ clearingCaches: true });
    await clearRuntimeCachesAndReload();
  };

  render(): ReactNode {
    if (!this.state.error) return this.props.children;

    return (
      <main className="app-recovery-shell" role="alert">
        <section className="app-recovery-card">
          <p className="eyebrow">App Recovery</p>
          <h1>頁面暫時無法載入</h1>
          <p>
            可能是 App 已更新，但目前分頁仍使用上一版程式。你的答題與學習紀錄不會因重新載入而被刪除。
          </p>
          <div className="app-recovery-actions">
            <button type="button" className="glass-button glass-button-primary" onClick={this.handleReload}>
              重新載入 App
            </button>
            <button
              type="button"
              className="glass-button glass-button-secondary"
              disabled={this.state.clearingCaches}
              onClick={() => void this.handleClearCaches()}
            >
              {this.state.clearingCaches ? "正在清除舊快取" : "清除舊快取後重載"}
            </button>
          </div>
          <details>
            <summary>技術資訊</summary>
            <pre>{this.state.error.message}</pre>
          </details>
        </section>
      </main>
    );
  }
}
