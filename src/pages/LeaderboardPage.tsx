import { Clock3, RefreshCw, Save, Trophy } from "lucide-react";
import { type FormEvent, useEffect, useMemo, useState } from "react";
import { ErrorState } from "../components/ErrorState";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import {
  getCurrentLeaderboardProfile,
  listLeaderboard,
  listPracticeTimeLeaderboard,
  updateLeaderboardDisplayName,
  type LeaderboardEntry,
} from "../lib/leaderboard";
import { formatTotalPracticeTime } from "../lib/practiceTime";
import "../styles/admin-leaderboard-v42.css";

type LeaderboardTab = "streak" | "time";

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
  const [streakEntries, setStreakEntries] = useState<LeaderboardEntry[]>([]);
  const [timeEntries, setTimeEntries] = useState<LeaderboardEntry[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("streak");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  async function refresh(): Promise<void> {
    setLoading(true);
    setError(null);
    try {
      const [profile, streakLeaderboard, timeLeaderboard] = await Promise.all([
        getCurrentLeaderboardProfile(),
        listLeaderboard(50),
        listPracticeTimeLeaderboard(50),
      ]);
      setDisplayName(profile.displayName);
      setStreakEntries(streakLeaderboard);
      setTimeEntries(timeLeaderboard);
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

  const entries = useMemo(() => (activeTab === "streak" ? streakEntries : timeEntries), [activeTab, streakEntries, timeEntries]);

  if (loading) return <LoadingState label="載入排行榜" />;

  return (
    <div className="page-stack leaderboard-page">
      <GlassCard className="leaderboard-hero" as="section">
        <div className="leaderboard-title-row">
          <div className="title-icon" aria-hidden="true"><Trophy size={24} /></div>
          <div>
            <p className="eyebrow">Leaderboard</p>
            <h1>排行榜</h1>
            <p>依照練習成果自動排行；名稱可自行設定，未設定時會使用系統預設 ID。</p>
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
            <p>系統會先給你一個預設 ID。你也可以改成自己想顯示的名稱。</p>
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
          <h2>{activeTab === "streak" ? "連續答對排行" : "累積練習時數排行"}</h2>
          <span>{entries.length} 位</span>
        </div>
        <div className="leaderboard-tabs" role="tablist" aria-label="排行榜類型">
          <button
            type="button"
            className={activeTab === "streak" ? "is-active" : ""}
            onClick={() => setActiveTab("streak")}
          >
            <Trophy aria-hidden="true" size={18} />
            <span>連續答對</span>
          </button>
          <button
            type="button"
            className={activeTab === "time" ? "is-active" : ""}
            onClick={() => setActiveTab("time")}
          >
            <Clock3 aria-hidden="true" size={18} />
            <span>累積練習時數</span>
          </button>
        </div>
        {entries.length === 0 ? (
          <p className="leaderboard-empty">
            {activeTab === "streak"
              ? "目前還沒有連續答對紀錄。開始練習並答對題目後，就會出現在這裡。"
              : "目前還沒有累積練習時間。開始練習後，就會出現在這裡。"}
          </p>
        ) : (
          <div className="leaderboard-list">
            {entries.map((entry, index) => (
              <article key={entry.userId} className={`leaderboard-row ${entry.isCurrentUser ? "is-current-user" : ""}`}>
                <div className="leaderboard-rank">#{index + 1}</div>
                <div className="leaderboard-player">
                  <strong>{entry.displayName}</strong>
                  {entry.isCurrentUser ? <span>你</span> : null}
                </div>
                {activeTab === "streak" ? (
                  <>
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
                  </>
                ) : (
                  <div className="leaderboard-metric main leaderboard-time-only">
                    <span>累積練習</span>
                    <strong>{formatTotalPracticeTime(entry.totalPracticeSeconds)}</strong>
                  </div>
                )}
                <div className="leaderboard-updated">{formatDate(entry.updatedAt)}</div>
              </article>
            ))}
          </div>
        )}
      </GlassCard>
    </div>
  );
}
