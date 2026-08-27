import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  ListChecks,
  RefreshCw,
  Save,
  Trash2,
  Trophy,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, type KeyboardEvent, useCallback, useEffect, useRef, useState } from "react";
import { AvatarCropDialog } from "../components/AvatarCropDialog";
import { ErrorState } from "../components/ErrorState";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { V93ConfirmDialog } from "../components/V93InteractionPrimitives";
import {
  getCurrentLeaderboardProfile,
  listLeaderboard,
  listPracticeTimeLeaderboard,
  listQuestionMasterLeaderboard,
  removeLeaderboardAvatar,
  updateLeaderboardAvatar,
  updateLeaderboardDisplayName,
  validateLeaderboardAvatarFile,
  type LeaderboardEntry,
} from "../lib/leaderboard";
import { formatTotalPracticeTime } from "../lib/practiceTime";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import "../styles/leaderboard-v66.css";

type LeaderboardTab = "streak" | "time" | "mastery";
const PAGE_SIZE = 10;
const TAB_ORDER: LeaderboardTab[] = ["streak", "time", "mastery"];

type MedalRank = 1 | 2 | 3;

const MEDAL_ICON_PATHS: Record<MedalRank, string> = {
  1: "/icons/medal-gold.svg",
  2: "/icons/medal-silver.svg",
  3: "/icons/medal-bronze.svg",
};

function MedalIcon({ rank, size = "row" }: { rank: MedalRank; size?: "row" | "podium" }) {
  return (
    <img
      className={`leaderboard-medal-icon is-${size}`}
      src={MEDAL_ICON_PATHS[rank]}
      alt=""
      aria-hidden="true"
      draggable={false}
    />
  );
}

function metricValue(entry: LeaderboardEntry, tab: LeaderboardTab): string {
  if (tab === "streak") return `${entry.bestCorrectStreak} 題`;
  if (tab === "time") return formatTotalPracticeTime(entry.totalPracticeSeconds);
  return `${entry.uniqueAnswered.toLocaleString("zh-TW")} 題`;
}

const TAB_LABELS: Record<LeaderboardTab, string> = {
  streak: "連續答對",
  time: "練習時數",
  mastery: "刷題大師",
};

const TAB_TITLES: Record<LeaderboardTab, string> = {
  streak: "連續答對排行",
  time: "累積練習時數排行",
  mastery: "不重複刷題排行",
};

function Avatar({ entry, size = "normal" }: { entry: Pick<LeaderboardEntry, "avatarUrl" | "displayName">; size?: "normal" | "large" | "profile" }) {
  const [failed, setFailed] = useState(false);
  useEffect(() => setFailed(false), [entry.avatarUrl]);
  const fallback = entry.displayName.slice(0, 1).toUpperCase() || "考";
  return (
    <span className={`leaderboard-avatar is-${size}`} aria-hidden="true">
      {entry.avatarUrl && !failed ? (
        <img src={entry.avatarUrl} alt="" loading="lazy" decoding="async" onError={() => setFailed(true)} />
      ) : fallback}
    </span>
  );
}

export function LeaderboardPage() {
  const [streakEntries, setStreakEntries] = useState<LeaderboardEntry[]>([]);
  const [timeEntries, setTimeEntries] = useState<LeaderboardEntry[]>([]);
  const [masteryEntries, setMasteryEntries] = useState<LeaderboardEntry[]>([]);
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("streak");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [removeAvatarConfirmationOpen, setRemoveAvatarConfirmationOpen] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [profile, streak, time, mastery] = await Promise.all([
        getCurrentLeaderboardProfile(),
        listLeaderboard(100),
        listPracticeTimeLeaderboard(100),
        listQuestionMasterLeaderboard(100),
      ]);
      setDisplayName(profile.displayName);
      setAvatarUrl(profile.avatarUrl);
      setStreakEntries(streak);
      setTimeEntries(time);
      setMasteryEntries(mastery);
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4200);
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
      announceInteractionFeedback("排行榜名稱已更新。", "success");
      await refresh();
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4200);
    } finally { setSaving(false); }
  }

  function handleAvatar(event: ChangeEvent<HTMLInputElement>) {
    const file = event.currentTarget.files?.[0];
    event.currentTarget.value = "";
    if (!file) return;
    setError(null); setMessage(null);
    try {
      validateLeaderboardAvatarFile(file);
      setPendingAvatarFile(file);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    }
  }

  async function handleAvatarCrop(blob: Blob): Promise<void> {
    setAvatarBusy(true); setError(null); setMessage(null);
    try {
      await updateLeaderboardAvatar(blob);
      setPendingAvatarFile(null);
      setMessage("頭像已更新。");
      announceInteractionFeedback("排行榜頭像已更新。", "success");
      await refresh();
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4200);
      throw caught;
    } finally { setAvatarBusy(false); }
  }

  async function handleRemoveAvatar() {
    setAvatarBusy(true); setError(null); setMessage(null);
    try {
      await removeLeaderboardAvatar();
      setRemoveAvatarConfirmationOpen(false);
      setMessage("頭像已移除。");
      announceInteractionFeedback("排行榜頭像已移除。", "success");
      await refresh();
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4200);
    } finally { setAvatarBusy(false); }
  }

  function selectTab(nextTab: LeaderboardTab): void {
    setActiveTab(nextTab);
    setPage(1);
  }

  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>): void {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentIndex = TAB_ORDER.indexOf(activeTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? TAB_ORDER.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + TAB_ORDER.length) % TAB_ORDER.length;
    const nextTab = TAB_ORDER[nextIndex] ?? "streak";
    selectTab(nextTab);
    window.requestAnimationFrame(() => document.getElementById(`leaderboard-tab-${nextTab}`)?.focus());
  }

  const entries = activeTab === "streak"
    ? streakEntries
    : activeTab === "time"
      ? timeEntries
      : masteryEntries;
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleEntries = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const podiumEntries = entries.slice(0, 3);
  const podiumOrder = [1, 0, 2].filter((index) => index < podiumEntries.length);

  if (loading) return <LoadingState label="載入排行榜" />;

  return (
    <div className="page-stack leaderboard-v66-page leaderboard-v797-page">
      {error ? <ErrorState message={error} /> : null}

      <GlassCard className={`leaderboard-v796-podium count-${podiumEntries.length}`} as="section">
          <div className="leaderboard-v796-podium-head">
            <div>
              <p className="eyebrow">Ranking</p>
              <h1>排行榜</h1>
              <p>目前依「{TAB_LABELS[activeTab]}」顯示前三名。</p>
            </div>
            <span><Trophy size={17} />Top {podiumEntries.length}</span>
          </div>
          {podiumEntries.length ? <div className="leaderboard-v796-podium-grid">
            {podiumOrder.map((entryIndex) => {
              const entry = podiumEntries[entryIndex];
              if (!entry) return null;
              const rank = entryIndex + 1;
              return (
                <article key={entry.userId} className={`rank-${rank}${entry.isCurrentUser ? " is-current" : ""}`}>
                  <span className="leaderboard-v796-medal" role="img" aria-label={`第 ${rank} 名`}><MedalIcon rank={rank as MedalRank} size="podium" /></span>
                  <Avatar entry={entry} size="large" />
                  <div className="leaderboard-v796-podium-player">
                    <small>{rank === 1 ? "冠軍" : `第 ${rank} 名`}</small>
                    <strong>{entry.displayName}{entry.isCurrentUser ? <em>你</em> : null}</strong>
                  </div>
                  <div className="leaderboard-v796-podium-score"><strong>{metricValue(entry, activeTab)}</strong></div>
                </article>
              );
            })}
          </div> : <div className="leaderboard-v66-empty leaderboard-v66-podium-empty"><Trophy size={26} /><strong>目前還沒有排名資料</strong><span>完成練習後，前三名會顯示在這裡。</span></div>}
        </GlassCard>

      <GlassCard className="leaderboard-profile-editor" as="section">
        <div className="leaderboard-profile-heading">
          <div className="leaderboard-profile-avatar-wrap">
            <Avatar entry={{ avatarUrl, displayName }} size="profile" />
            <button type="button" disabled={avatarBusy} onClick={() => fileInputRef.current?.click()} aria-label="上傳排行榜頭像"><Camera size={18} /></button>
          </div>
          <div><p className="eyebrow">Public Profile</p><h2>我的排行榜資料</h2></div>
        </div>
        <input ref={fileInputRef} className="leaderboard-avatar-input" type="file" accept="image/png,image/jpeg,image/webp" onChange={(event) => void handleAvatar(event)} />
        <form onSubmit={(event) => void handleSubmit(event)}>
          <label><span>顯示名稱</span><input value={displayName} minLength={2} maxLength={24} required onChange={(event) => setDisplayName(event.currentTarget.value)} /><small>{displayName.length}/24</small></label>
          <div className="leaderboard-profile-actions">
            <GlassButton type="button" variant="secondary" disabled={avatarBusy} onClick={() => fileInputRef.current?.click()}><Camera size={17} />{avatarBusy ? "處理中" : "更換頭像"}</GlassButton>
            {avatarUrl ? <GlassButton type="button" variant="secondary" disabled={avatarBusy} onClick={() => setRemoveAvatarConfirmationOpen(true)}><Trash2 size={17} />移除頭像</GlassButton> : null}
            <GlassButton type="submit" variant="primary" disabled={saving || displayName.trim().length < 2}><Save size={17} />{saving ? "儲存中" : "儲存資料"}</GlassButton>
          </div>
        </form>
        {message ? <p className="form-success" role="status">{message}</p> : null}
      </GlassCard>

      {pendingAvatarFile ? (
        <AvatarCropDialog
          file={pendingAvatarFile}
          busy={avatarBusy}
          onCancel={() => setPendingAvatarFile(null)}
          onConfirm={handleAvatarCrop}
        />
      ) : null}

      <V93ConfirmDialog
        open={removeAvatarConfirmationOpen}
        title="移除排行榜頭像"
        message="確定要移除目前的排行榜頭像？移除後會改回名稱首字顯示。"
        confirmLabel="移除頭像"
        busy={avatarBusy}
        onCancel={() => setRemoveAvatarConfirmationOpen(false)}
        onConfirm={() => void handleRemoveAvatar()}
      />

      <GlassCard className="leaderboard-v66-list" as="section">
        <div className="leaderboard-v66-list-head">
          <div>
            <p className="eyebrow">Full Ranking</p>
            <h2>{TAB_TITLES[activeTab]}</h2>
            <span className="leaderboard-v66-category-status" aria-live="polite">目前顯示：{TAB_LABELS[activeTab]}，共 {entries.length} 位</span>
          </div>
          <div className="leaderboard-v66-list-controls">
            <div className="leaderboard-v66-tabs" role="tablist" aria-label="排行榜類型">
              <button id="leaderboard-tab-streak" type="button" role="tab" aria-controls="leaderboard-ranking-panel" aria-selected={activeTab === "streak"} tabIndex={activeTab === "streak" ? 0 : -1} className={activeTab === "streak" ? "is-active" : ""} onKeyDown={handleTabKeyDown} onClick={() => selectTab("streak")}><Flame size={17} />連續答對</button>
              <button id="leaderboard-tab-time" type="button" role="tab" aria-controls="leaderboard-ranking-panel" aria-selected={activeTab === "time"} tabIndex={activeTab === "time" ? 0 : -1} className={activeTab === "time" ? "is-active" : ""} onKeyDown={handleTabKeyDown} onClick={() => selectTab("time")}><Clock3 size={17} />練習時數</button>
              <button id="leaderboard-tab-mastery" type="button" role="tab" aria-controls="leaderboard-ranking-panel" aria-selected={activeTab === "mastery"} tabIndex={activeTab === "mastery" ? 0 : -1} className={activeTab === "mastery" ? "is-active" : ""} onKeyDown={handleTabKeyDown} onClick={() => selectTab("mastery")}><ListChecks size={17} />刷題大師</button>
            </div>
            <GlassButton variant="secondary" busy={refreshing} disabled={refreshing} onClick={() => void refresh()}><RefreshCw className={refreshing ? "is-spinning" : ""} size={18} />{refreshing ? "更新中" : "更新排名"}</GlassButton>
          </div>
        </div>
        <div id="leaderboard-ranking-panel" className="leaderboard-v66-rows" role="tabpanel" aria-labelledby={`leaderboard-tab-${activeTab}`} tabIndex={0}>
          {!visibleEntries.length ? <div className="leaderboard-v66-empty"><Trophy size={26} /><strong>目前還沒有排名資料</strong><span>完成一場測驗後會自動加入排行榜。</span></div> : null}
          {visibleEntries.map((entry, index) => {
            const rank = (currentPage - 1) * PAGE_SIZE + index + 1;
            if (activeTab === "streak") {
              return <article key={entry.userId} className="leaderboard-v66-row metric-streak" aria-label={`第 ${rank} 名，${entry.displayName}，連續答對 ${entry.bestCorrectStreak} 題`}>
                <Avatar entry={entry} />
                <div className="leaderboard-v66-player"><strong>{entry.displayName}</strong></div>
                <div className="leaderboard-v66-row-score"><strong>{metricValue(entry, activeTab)}</strong></div>
              </article>;
            }
            return <article key={entry.userId} className={`leaderboard-v66-row${entry.isCurrentUser ? " is-current" : ""}${rank <= 3 ? ` is-podium rank-${rank}` : ""}`}>
              <span className={`leaderboard-v66-row-rank rank-${rank <= 3 ? rank : "other"}`} role="img" aria-label={`第 ${rank} 名`}>{rank <= 3 ? <MedalIcon rank={rank as MedalRank} /> : rank}</span>
              <Avatar entry={entry} />
              <div className="leaderboard-v66-player"><strong>{entry.displayName}{entry.isCurrentUser ? <em>你</em> : null}</strong></div>
              <div className="leaderboard-v66-row-score"><strong>{metricValue(entry, activeTab)}</strong></div>
            </article>;
          })}
        </div>
        {entries.length > PAGE_SIZE ? <div className="leaderboard-v66-pagination"><button disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}><ChevronLeft size={17} />上一頁</button><span>{currentPage} / {pageCount}</span><button disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一頁<ChevronRight size={17} /></button></div> : null}
      </GlassCard>
    </div>
  );
}
