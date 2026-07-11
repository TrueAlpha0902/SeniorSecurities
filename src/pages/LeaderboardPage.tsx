import {
  ChevronLeft,
  ChevronRight,
  Clock3,
  Medal,
  RefreshCw,
  Save,
  Target,
  Trophy,
  UserRound,
  UsersRound,
} from "lucide-react";
import { type FormEvent, useCallback, useEffect, useState } from "react";
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
import "../styles/learner-experience-v65.css";

type LeaderboardTab = "streak" | "time";

const PAGE_SIZE = 10;

function formatDate(value: string | null): string {
  if (!value) return "尚無紀錄";
  return new Intl.DateTimeFormat("zh-TW", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function getRankClass(rank: number): string {
  if (rank === 1) return "is-gold";
  if (rank === 2) return "is-silver";
  if (rank === 3) return "is-bronze";
  return "";
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

  const refresh = useCallback(async (initialLoad = false): Promise<void> => {
    if (initialLoad) {
      setLoading(true);
    } else {
      setRefreshing(true);
    }
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
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    void refresh(true);
  }, [refresh]);

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

  function changeTab(tab: LeaderboardTab): void {
    setActiveTab(tab);
    setPage(1);
  }

  const entries = activeTab === "streak" ? streakEntries : timeEntries;
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const pageStart = (currentPage - 1) * PAGE_SIZE;
  const visibleEntries = entries.slice(pageStart, pageStart + PAGE_SIZE);
  const currentUserIndex = entries.findIndex((entry) => entry.isCurrentUser);
  const currentEntry = currentUserIndex >= 0 ? entries[currentUserIndex] : null;
  const leader = entries[0] ?? null;
  const personalResult = currentEntry
    ? activeTab === "streak"
      ? `${currentEntry.bestCorrectStreak} 題`
      : formatTotalPracticeTime(currentEntry.totalPracticeSeconds)
    : "尚未上榜";
  const leadingResult = leader
    ? activeTab === "streak"
      ? `${leader.bestCorrectStreak} 題`
      : formatTotalPracticeTime(leader.totalPracticeSeconds)
    : "等待第一筆紀錄";

  if (loading) return <LoadingState label="載入排行榜" />;

  return (
    <div className="page-stack learner-page leaderboard-page">
      <GlassCard className="learner-hero leaderboard-hero" as="section">
        <div className="learner-hero-copy leaderboard-title-row">
          <div className="learner-title-icon" aria-hidden="true"><Trophy size={22} /></div>
          <div>
            <p className="eyebrow">Leaderboard</p>
            <h1>排行榜</h1>
            <p>用練習成果看見自己的進步；排行榜名稱可隨時調整，所有數據都會自動更新。</p>
          </div>
        </div>

        <GlassButton
          type="button"
          variant="secondary"
          className="leaderboard-refresh-button"
          disabled={refreshing}
          aria-busy={refreshing}
          onClick={() => void refresh()}
        >
          <RefreshCw className={refreshing ? "is-spinning" : ""} aria-hidden="true" size={18} />
          <span>{refreshing ? "更新中" : "更新排名"}</span>
        </GlassButton>

        <div className="learner-kpi-grid leaderboard-kpis" aria-label="排行榜摘要">
          <div className="learner-kpi">
            <span><UsersRound aria-hidden="true" size={17} /> 本榜人數</span>
            <strong>{entries.length} <small>位</small></strong>
          </div>
          <div className="learner-kpi is-accent">
            <span><Target aria-hidden="true" size={17} /> 我的名次</span>
            <strong>{currentUserIndex >= 0 ? `#${currentUserIndex + 1}` : "—"}</strong>
            <small>{personalResult}</small>
          </div>
          <div className="learner-kpi">
            <span><Medal aria-hidden="true" size={17} /> 目前榜首</span>
            <strong>{leadingResult}</strong>
            <small>{leader?.displayName ?? "完成練習後即可上榜"}</small>
          </div>
        </div>
      </GlassCard>

      <GlassCard className="leaderboard-name-card" as="section" aria-labelledby="leaderboard-name-title">
        <div className="leaderboard-name-intro">
          <div className="learner-section-icon" aria-hidden="true"><UserRound size={20} /></div>
          <div>
            <p className="eyebrow">Display Name</p>
            <h2 id="leaderboard-name-title">你的排行榜名稱</h2>
            <p>使用容易辨識且不含個資的暱稱，最多 24 個字。</p>
          </div>
        </div>

        <form className="leaderboard-name-form" onSubmit={(event) => void handleSubmit(event)}>
          <label className="leaderboard-name-field">
            <span className="learner-sr-only">排行榜名稱</span>
            <input
              type="text"
              minLength={2}
              maxLength={24}
              required
              value={displayName}
              placeholder="例如：高業衝刺王"
              aria-describedby="leaderboard-name-count"
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
            <small id="leaderboard-name-count">{displayName.length} / 24</small>
          </label>
          <GlassButton type="submit" variant="primary" disabled={saving || displayName.trim().length < 2}>
            <Save aria-hidden="true" size={18} />
            <span>{saving ? "儲存中" : "儲存名稱"}</span>
          </GlassButton>
        </form>
        {message ? <p className="form-success" role="status">{message}</p> : null}
      </GlassCard>

      {error ? <ErrorState message={error} /> : null}

      <GlassCard className="leaderboard-list-card" as="section" aria-labelledby="leaderboard-list-title">
        <div className="leaderboard-list-toolbar">
          <div className="leaderboard-list-head">
            <p className="eyebrow">Top performers</p>
            <h2 id="leaderboard-list-title">{activeTab === "streak" ? "連續答對排行" : "累積練習時數排行"}</h2>
          </div>

          <div className="leaderboard-tabs" aria-label="排行榜類型">
            <button
              id="leaderboard-tab-streak"
              type="button"
              className={activeTab === "streak" ? "is-active" : ""}
              aria-pressed={activeTab === "streak"}
              onClick={() => changeTab("streak")}
            >
              <Trophy aria-hidden="true" size={18} />
              <span>連續答對</span>
            </button>
            <button
              id="leaderboard-tab-time"
              type="button"
              className={activeTab === "time" ? "is-active" : ""}
              aria-pressed={activeTab === "time"}
              onClick={() => changeTab("time")}
            >
              <Clock3 aria-hidden="true" size={18} />
              <span>練習時數</span>
            </button>
          </div>
        </div>

        <div id="leaderboard-results">
          {entries.length === 0 ? (
            <div className="learner-empty-state leaderboard-empty">
              <Trophy aria-hidden="true" size={30} />
              <h3>{activeTab === "streak" ? "還沒有連續答對紀錄" : "還沒有累積練習時間"}</h3>
              <p>
                {activeTab === "streak"
                  ? "完成題目並建立連勝後，你的成績就會出現在這裡。"
                  : "開始任一練習，系統就會自動累積有效練習時間。"}
              </p>
              <GlassLinkButton to="/random" variant="primary">開始一場練習</GlassLinkButton>
            </div>
          ) : (
            <>
              <div className="leaderboard-table-shell">
                <table className="leaderboard-table">
                  <caption className="learner-sr-only">
                    {activeTab === "streak" ? "連續答對排行榜" : "累積練習時數排行榜"}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">排名</th>
                      <th scope="col">考生</th>
                      {activeTab === "streak" ? (
                        <>
                          <th scope="col">最高連續答對</th>
                          <th scope="col">目前連勝</th>
                          <th scope="col">累計答對</th>
                        </>
                      ) : (
                        <th scope="col">累積練習</th>
                      )}
                      <th scope="col">更新時間</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleEntries.map((entry, index) => {
                      const rank = pageStart + index + 1;
                      return (
                        <tr key={entry.userId} className={entry.isCurrentUser ? "is-current-user" : ""}>
                          <td className="leaderboard-rank-cell" data-label="排名">
                            <span className={`leaderboard-rank-badge ${getRankClass(rank)}`} aria-label={`第 ${rank} 名`}>
                              {rank <= 3 ? <Medal aria-hidden="true" size={17} /> : <span aria-hidden="true">#</span>}
                              <strong>{rank}</strong>
                            </span>
                          </td>
                          <th scope="row" className="leaderboard-player" data-label="考生">
                            <strong>{entry.displayName}</strong>
                            {entry.isCurrentUser ? <span>你</span> : null}
                          </th>
                          {activeTab === "streak" ? (
                            <>
                              <td className="leaderboard-metric is-main" data-label="最高連續答對"><strong>{entry.bestCorrectStreak}</strong><span>題</span></td>
                              <td className="leaderboard-metric" data-label="目前連勝"><strong>{entry.currentCorrectStreak}</strong><span>題</span></td>
                              <td className="leaderboard-metric" data-label="累計答對"><strong>{entry.totalCorrect}</strong><span>/ {entry.totalAnswered}</span></td>
                            </>
                          ) : (
                            <td className="leaderboard-metric is-main" data-label="累積練習"><strong>{formatTotalPracticeTime(entry.totalPracticeSeconds)}</strong></td>
                          )}
                          <td className="leaderboard-updated" data-label="更新時間">
                            {entry.updatedAt ? <time dateTime={entry.updatedAt}>{formatDate(entry.updatedAt)}</time> : formatDate(null)}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <nav className="leaderboard-pagination" aria-label="排行榜分頁">
                <p>顯示第 {pageStart + 1}–{Math.min(pageStart + PAGE_SIZE, entries.length)} 位，共 {entries.length} 位</p>
                <div>
                  <button
                    type="button"
                    disabled={currentPage <= 1}
                    aria-controls="leaderboard-results"
                    onClick={() => setPage(Math.max(1, currentPage - 1))}
                  >
                    <ChevronLeft aria-hidden="true" size={18} />
                    <span>上一頁</span>
                  </button>
                  <span aria-live="polite">{currentPage} / {pageCount}</span>
                  <button
                    type="button"
                    disabled={currentPage >= pageCount}
                    aria-controls="leaderboard-results"
                    onClick={() => setPage(Math.min(pageCount, currentPage + 1))}
                  >
                    <span>下一頁</span>
                    <ChevronRight aria-hidden="true" size={18} />
                  </button>
                </div>
              </nav>
            </>
          )}
        </div>
      </GlassCard>
    </div>
  );
}
