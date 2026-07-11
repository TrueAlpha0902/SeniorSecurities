import {
  Award,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Crown,
  Flame,
  Medal,
  RefreshCw,
  Save,
  Sparkles,
  Target,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useMemo, useState } from "react";
import { ErrorState } from "../components/ErrorState";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
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
import "../styles/leaderboard-v66.css";

type LeaderboardTab = "streak" | "time";
const PAGE_SIZE = 10;

function formatDate(value: string | null): string {
  if (!value) return "尚無紀錄";
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function metricValue(entry: LeaderboardEntry, tab: LeaderboardTab): string {
  return tab === "streak" ? `${entry.bestCorrectStreak} 題` : formatTotalPracticeTime(entry.totalPracticeSeconds);
}

function secondaryMetric(entry: LeaderboardEntry, tab: LeaderboardTab): string {
  if (tab === "streak") return `目前連勝 ${entry.currentCorrectStreak} 題 · 累計答對 ${entry.totalCorrect.toLocaleString("zh-TW")} 題`;
  return `累計作答 ${entry.totalAnswered.toLocaleString("zh-TW")} 題 · 答對率 ${entry.totalAnswered ? Math.round(entry.totalCorrect / entry.totalAnswered * 100) : 0}%`;
}

export function LeaderboardPage() {
  const [streakEntries, setStreakEntries] = useState<LeaderboardEntry[]>([]);
  const [timeEntries, setTimeEntries] = useState<LeaderboardEntry[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("streak");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true);
    else setRefreshing(true);
    setError(null);
    try {
      const [profile, streak, time] = await Promise.all([getCurrentLeaderboardProfile(), listLeaderboard(100), listPracticeTimeLeaderboard(100)]);
      setDisplayName(profile.displayName);
      setStreakEntries(streak);
      setTimeEntries(time);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(true); }, [refresh]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSaving(true); setError(null); setMessage(null);
    try {
      await updateLeaderboardDisplayName(displayName);
      setMessage("排行榜名稱已更新。");
      await refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally { setSaving(false); }
  }

  const entries = activeTab === "streak" ? streakEntries : timeEntries;
  const currentIndex = entries.findIndex((entry) => entry.isCurrentUser);
  const currentEntry = currentIndex >= 0 ? entries[currentIndex] : null;
  const podium = entries.slice(0, 3);
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleEntries = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const nextEntry = currentIndex > 0 ? entries[currentIndex - 1] : null;
  const progressToNext = useMemo(() => {
    if (!currentEntry || !nextEntry) return 100;
    const current = activeTab === "streak" ? currentEntry.bestCorrectStreak : currentEntry.totalPracticeSeconds;
    const next = activeTab === "streak" ? nextEntry.bestCorrectStreak : nextEntry.totalPracticeSeconds;
    return next <= 0 ? 100 : Math.min(100, Math.max(0, current / next * 100));
  }, [activeTab, currentEntry, nextEntry]);

  if (loading) return <LoadingState label="載入排行榜" />;

  return (
    <div className="page-stack leaderboard-v66-page">
      <GlassCard className="leaderboard-v66-hero" as="section">
        <div className="leaderboard-v66-heading">
          <span className="leaderboard-v66-icon"><Trophy size={24} /></span>
          <div><p className="eyebrow">Learning League</p><h1>學習排行榜</h1><p>把排名當成節奏提示，不只比名次，也看持續練習與穩定進步。</p></div>
        </div>
        <div className="leaderboard-v66-actions">
          <div className="leaderboard-v66-tabs" role="tablist" aria-label="排行榜類型">
            <button type="button" className={activeTab === "streak" ? "is-active" : ""} onClick={() => { setActiveTab("streak"); setPage(1); }}><Flame size={17} />連續答對</button>
            <button type="button" className={activeTab === "time" ? "is-active" : ""} onClick={() => { setActiveTab("time"); setPage(1); }}><Clock3 size={17} />練習時數</button>
          </div>
          <GlassButton variant="secondary" disabled={refreshing} onClick={() => void refresh()}><RefreshCw className={refreshing ? "is-spinning" : ""} size={18} />{refreshing ? "更新中" : "更新排名"}</GlassButton>
        </div>
      </GlassCard>

      {error ? <ErrorState message={error} /> : null}

      <section className="leaderboard-v66-overview" aria-label="排行榜摘要">
        <GlassCard className="leaderboard-v66-my-card">
          <div className="leaderboard-v66-card-label"><Target size={18} />我的進度</div>
          <div className="leaderboard-v66-my-main"><strong>{currentIndex >= 0 ? `#${currentIndex + 1}` : "尚未上榜"}</strong><span>{currentEntry ? metricValue(currentEntry, activeTab) : "完成一場測驗即可開始累積"}</span></div>
          {currentEntry && nextEntry ? <><div className="leaderboard-v66-progress-copy"><span>距離上一名</span><strong>{activeTab === "streak" ? `${Math.max(0, nextEntry.bestCorrectStreak - currentEntry.bestCorrectStreak)} 題` : formatTotalPracticeTime(Math.max(0, nextEntry.totalPracticeSeconds - currentEntry.totalPracticeSeconds))}</strong></div><progress value={progressToNext} max={100} /></> : <p>{currentEntry ? "你目前位於榜首，繼續維持節奏。" : "先完成題目，系統會自動建立排名。"}</p>}
        </GlassCard>

        <GlassCard className="leaderboard-v66-stat-card"><span><UsersRound size={18} />本榜人數</span><strong>{entries.length}</strong><small>位學習者</small></GlassCard>
        <GlassCard className="leaderboard-v66-stat-card"><span><Sparkles size={18} />榜首成績</span><strong>{entries[0] ? metricValue(entries[0], activeTab) : "—"}</strong><small>{entries[0]?.displayName ?? "等待第一筆紀錄"}</small></GlassCard>
      </section>

      <section className="leaderboard-v66-podium" aria-label="前三名">
        {podium.length ? [1, 0, 2].map((sourceIndex) => {
          const entry = podium[sourceIndex];
          if (!entry) return <div className="leaderboard-v66-podium-placeholder" key={sourceIndex} />;
          const rank = sourceIndex + 1;
          return <GlassCard key={entry.userId} className={`leaderboard-v66-podium-card rank-${rank}${entry.isCurrentUser ? " is-current" : ""}`}>
            <div className="leaderboard-v66-rank-icon">{rank === 1 ? <Crown size={28} /> : <Medal size={25} />}</div>
            <span className="leaderboard-v66-rank">第 {rank} 名</span>
            <strong className="leaderboard-v66-name">{entry.displayName}{entry.isCurrentUser ? <em>你</em> : null}</strong>
            <strong className="leaderboard-v66-score">{metricValue(entry, activeTab)}</strong>
            <small>{secondaryMetric(entry, activeTab)}</small>
          </GlassCard>;
        }) : <GlassCard className="leaderboard-v66-empty"><Trophy size={30} /><h2>排行榜正在等第一位挑戰者</h2><p>完成題目或開始計時練習後，排名會自動出現。</p><GlassLinkButton to="/random" variant="primary">開始模擬考測驗</GlassLinkButton></GlassCard>}
      </section>

      <GlassCard className="leaderboard-v66-name-editor" as="section">
        <div><span className="leaderboard-v66-section-icon"><UserRound size={20} /></span><div><p className="eyebrow">Display Name</p><h2>排行榜顯示名稱</h2><p>使用不含個資、容易辨識的暱稱，最多 24 個字。</p></div></div>
        <form onSubmit={(event) => void handleSubmit(event)}><label><input value={displayName} minLength={2} maxLength={24} required onChange={(event) => setDisplayName(event.currentTarget.value)} /><small>{displayName.length}/24</small></label><GlassButton type="submit" variant="primary" disabled={saving || displayName.trim().length < 2}><Save size={17} />{saving ? "儲存中" : "儲存名稱"}</GlassButton></form>
        {message ? <p className="form-success" role="status">{message}</p> : null}
      </GlassCard>

      <GlassCard className="leaderboard-v66-list" as="section">
        <div className="leaderboard-v66-list-head"><div><p className="eyebrow">Full Ranking</p><h2>{activeTab === "streak" ? "連續答對排行" : "累積練習時數排行"}</h2></div><span>{entries.length} 位</span></div>
        <div className="leaderboard-v66-rows">
          {visibleEntries.map((entry, index) => {
            const rank = (currentPage - 1) * PAGE_SIZE + index + 1;
            return <article key={entry.userId} className={entry.isCurrentUser ? "is-current" : ""}>
              <span className={`leaderboard-v66-row-rank rank-${rank <= 3 ? rank : "other"}`}>{rank <= 3 ? <Award size={17} /> : null}{rank}</span>
              <div className="leaderboard-v66-player"><strong>{entry.displayName}{entry.isCurrentUser ? <em>你</em> : null}</strong><small>{secondaryMetric(entry, activeTab)}</small></div>
              <div className="leaderboard-v66-row-score"><strong>{metricValue(entry, activeTab)}</strong><small>{formatDate(entry.updatedAt)}</small></div>
            </article>;
          })}
        </div>
        {entries.length > PAGE_SIZE ? <div className="leaderboard-v66-pagination"><button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} />上一頁</button><span>{currentPage} / {pageCount}</span><button disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一頁<ChevronRight size={17} /></button></div> : null}
      </GlassCard>
    </div>
  );
}
