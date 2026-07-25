import { Download, HardDrive, RefreshCcw, Trash2 } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  clearAllOfflineContent,
  clearOfflineBank,
  downloadOfflineBank,
  listOfflinePackages,
  type OfflineDownloadProgress,
  type OfflinePackageSummary,
} from "../lib/offlineContent";
import { GlassButton } from "./GlassButton";

export function OfflineContentPanel() {
  const [packages, setPackages] = useState<OfflinePackageSummary[]>([]);
  const [busyBankId, setBusyBankId] = useState<string | null>(null);
  const [progress, setProgress] = useState<OfflineDownloadProgress | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  const refresh = useCallback(async () => setPackages(await listOfflinePackages()), []);
  useEffect(() => { void refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "無法讀取離線內容。")); }, [refresh]);

  async function download(bank: OfflinePackageSummary): Promise<void> {
    setBusyBankId(bank.bankId); setError(""); setMessage(""); setProgress(null);
    try {
      await downloadOfflineBank(bank.bankId, setProgress);
      setMessage(`${bank.bankTitle} 已可離線使用。`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "離線下載失敗。");
    } finally { setBusyBankId(null); setProgress(null); }
  }

  async function clear(bank: OfflinePackageSummary): Promise<void> {
    setBusyBankId(bank.bankId); setError(""); setMessage("");
    try {
      await clearOfflineBank(bank.bankId);
      setMessage(`${bank.bankTitle} 的離線內容已清除。`);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "清除離線內容失敗。");
    } finally { setBusyBankId(null); }
  }

  async function clearAll(): Promise<void> {
    setBusyBankId("all"); setError(""); setMessage("");
    try { await clearAllOfflineContent(); setMessage("所有離線題庫快取已清除。"); await refresh(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "清除離線內容失敗。"); }
    finally { setBusyBankId(null); }
  }

  return (
    <div className="offline-content-panel">
      <div className="offline-content-intro"><HardDrive size={22} /><div><strong>離線科目包</strong><p>按科目下載文字題目與解析，不包含掃描頁。下載完成後可在沒有網路時練習。</p></div></div>
      {message ? <p className="inline-success">{message}</p> : null}
      {error ? <p className="inline-error">{error}</p> : null}
      {progress ? <p className="offline-progress"><RefreshCcw className="is-spinning" size={16} />{progress.label}</p> : null}
      <div className="offline-package-list">
        {packages.map((item) => (
          <article key={item.bankId}>
            <div><strong>{item.bankTitle}</strong><span>{item.chapterCount} 章 · {item.questionCount.toLocaleString("zh-TW")} 題</span></div>
            <span className={item.downloaded ? "is-ready" : ""}>{item.downloaded ? "已下載" : "尚未下載"}</span>
            {item.downloaded ? (
              <GlassButton variant="secondary" disabled={Boolean(busyBankId)} onClick={() => void clear(item)}><Trash2 size={16} />清除</GlassButton>
            ) : (
              <GlassButton variant="primary" disabled={Boolean(busyBankId)} onClick={() => void download(item)}><Download size={16} />下載</GlassButton>
            )}
          </article>
        ))}
      </div>
      <GlassButton variant="danger" disabled={Boolean(busyBankId)} onClick={() => void clearAll()}><Trash2 size={17} />清除全部離線內容</GlassButton>
    </div>
  );
}
