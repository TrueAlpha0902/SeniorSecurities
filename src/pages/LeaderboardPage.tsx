import { RefreshCw, Save, Trophy } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { ErrorState } from "../components/ErrorState";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import {
  getCurrentLeaderboardProfile,
  listLeaderboard,
  updateLeaderboardDisplayName,
  type LeaderboardEntry,
} from "../lib/leaderboard";

function formatDate(value: string | null): string {
  if (!value) return "尚無紀錄";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

export function LeaderboardPage() {
  const [entries, setEntries] = useState<LeaderboardEntry[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [profile, leaderboard] = await Promise.all([getCurrentLeaderboardProfile(), listLeaderboard(50)]);
      setDisplayName(profile.displayName);
      setEntries(leaderboard);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateLeaderboardDisplayName(displayName);
      setMessage("排行榜名稱已更新。");
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  if (loading) return <LoadingState label="載入排行榜" />;

  return (
    <div className="page-stack leaderboard-page">
      <GlassCard className="leaderboard-hero" as="section">
        <div className="leaderboard-title-row">
          <div className="title-icon" aria-hidden="true"><Trophy size={24} /></div>
          <div>
            <p className="eyebrow">Leaderboard</p>
            <h1>連續答對排行榜</h1>
            <p>依照所有使用者的「最高連續答對題數」排序；開始練習後會自動加入排行榜。</p>
          </div>
        </div>
        <GlassButton type="button" variant="secondary" onClick={() => void refresh()}>
          <RefreshCw aria-hidden="true" size={18} />
          <span>重新整理</span>
        </GlassButton>
      </GlassCard>

      <GlassCard className="leaderboard-name-card" as="section">
        <form className="leaderboard-name-form" onSubmit={(event) => void handleSubmit(event)}>
          <div>
            <p className="eyebrow">Display Name</p>
            <h2>設定排行榜名稱</h2>
            <p>系統會先給你一個預設 ID。你也可以改成自己想顯示的名稱，建議不要使用真實姓名或敏感資訊。</p>
          </div>
          <label className="leaderboard-name-field">
            <span>排行榜名稱</span>
            <input
              type="text"
              maxLength={24}
              value={displayName}
              placeholder="例如：高業衝刺王"
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
          </label>
          <GlassButton type="submit" variant="primary" disabled={saving}>
            <Save aria-hidden="true" size={18} />
            <span>{saving ? "儲存中" : "儲存名稱"}</span>
          </GlassButton>
        </form>
        {message ? <p className="form-success">{message}</p> : null}
      </GlassCard>

      {error ? <ErrorState message={error} /> : null}

      <GlassCard className="leaderboard-list-card" as="section">
        <div className="leaderboard-list-head">
          <h2>排行榜</h2>
          <span>{entries.length} 位</span>
        </div>
        {entries.length === 0 ? (
          <p className="leaderboard-empty">目前還沒有排行榜紀錄。開始練習並答對題目後，就會出現在這裡。</p>
        ) : (
          <div className="leaderboard-list">
            {entries.map((entry, index) => (
              <article key={entry.userId} className={`leaderboard-row ${entry.isCurrentUser ? "is-current-user" : ""}`}>
                <div className="leaderboard-rank">#{index + 1}</div>
                <div className="leaderboard-player">
                  <strong>{entry.displayName}</strong>
                  {entry.isCurrentUser ? <span>你</span> : null}
                </div>
                <div className="leaderboard-metric main">
                  <span>最高連續答對</span>
                  <strong>{entry.bestCorrectStreak} 題</strong>
                </div>
                <div className="leaderboard-metric">
                  <span>目前連勝</span>
                  <strong>{entry.currentCorrectStreak} 題</strong>
                </div>
                <div className="leaderboard-metric">
                  <span>累計答對</span>
                  <strong>{entry.totalCorrect} / {entry.totalAnswered}</strong>
                </div>
                <div className="leaderboard-updated">{formatDate(entry.updatedAt)}</div>
              </article>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
