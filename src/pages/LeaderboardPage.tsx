import {
  Camera,
  ChevronLeft,
  ChevronRight,
  Clock3,
  Flame,
  RefreshCw,
  Save,
  Trash2,
  Trophy,
} from "lucide-react";
import { type ChangeEvent, type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { AvatarCropDialog } from "../components/AvatarCropDialog";
import { GlassButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { LoadingState } from "../components/LoadingState";
import { V93ConfirmDialog, V93InlineNotice } from "../components/V93InteractionPrimitives";
import {
  getCurrentLeaderboardProfile,
  listLeaderboard,
  listPracticeTimeLeaderboard,
  removeLeaderboardAvatar,
  updateLeaderboardAvatar,
  updateLeaderboardDisplayName,
  validateLeaderboardAvatarFile,
  type LeaderboardEntry,
} from "../lib/leaderboard";
import { formatTotalPracticeTime } from "../lib/practiceTime";
import { announceInteractionFeedback } from "../lib/interactionFeedback";
import "../styles/leaderboard-v66.css";

type LeaderboardTab = "streak" | "time";
const PAGE_SIZE = 10;

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

function formatDate(value: string | null): string {
  if (!value) return "尚無紀錄";
  return new Intl.DateTimeFormat("zh-TW", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function metricValue(entry: LeaderboardEntry, tab: LeaderboardTab): string {
  return tab === "streak" ? `${entry.bestCorrectStreak} 題` : formatTotalPracticeTime(entry.totalPracticeSeconds);
}

function secondaryMetric(entry: LeaderboardEntry, tab: LeaderboardTab): string {
  if (tab === "streak") return `目前連對 ${entry.currentCorrectStreak} 題 · 累計答對 ${entry.totalCorrect.toLocaleString("zh-TW")} 題`;
  return `累計作答 ${entry.totalAnswered.toLocaleString("zh-TW")} 題 · 正確率 ${entry.totalAnswered ? Math.round(entry.totalCorrect / entry.totalAnswered * 100) : 0}%`;
}

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
  const [displayName, setDisplayName] = useState("");
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<LeaderboardTab>("streak");
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [removeAvatarConfirmationOpen, setRemoveAvatarConfirmationOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const refresh = useCallback(async (initial = false) => {
    if (initial) setLoading(true); else setRefreshing(true);
    setError(null);
    try {
      const [profile, streak, time] = await Promise.all([
        getCurrentLeaderboardProfile(),
        listLeaderboard(100),
        listPracticeTimeLeaderboard(100),
      ]);
      setDisplayName(profile.displayName);
      setAvatarUrl(profile.avatarUrl);
      setStreakEntries(streak);
      setTimeEntries(time);
      if (!initial) {
        announceInteractionFeedback("排行榜已更新。", "success");
      }
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4400);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => { void refresh(true); }, [refresh]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const normalizedName = displayName.trim();
    if (normalizedName.length < 2) {
      const nextError = "顯示名稱至少需要 2 個字元。";
      setError(nextError);
      announceInteractionFeedback(nextError, "warning", 3200);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await updateLeaderboardDisplayName(normalizedName);
      setDisplayName(normalizedName);
      const nextMessage = "排行榜名稱已更新。";
      setMessage(nextMessage);
      announceInteractionFeedback(nextMessage, "success");
      await refresh();
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4400);
    } finally {
      setSaving(false);
    }
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
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4200);
    }
  }

  async function handleAvatarCrop(blob: Blob): Promise<void> {
    setAvatarBusy(true);
    setError(null);
    setMessage(null);
    try {
      await updateLeaderboardAvatar(blob);
      setPendingAvatarFile(null);
      const nextMessage = "頭像已更新。";
      setMessage(nextMessage);
      announceInteractionFeedback(nextMessage, "success");
      await refresh();
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4400);
      throw caught;
    } finally {
      setAvatarBusy(false);
    }
  }

  async function handleRemoveAvatar(): Promise<void> {
    if (avatarBusy) return;
    setAvatarBusy(true);
    setError(null);
    setMessage(null);
    try {
      await removeLeaderboardAvatar();
      const nextMessage = "頭像已移除。";
      setMessage(nextMessage);
      setRemoveAvatarConfirmationOpen(false);
      announceInteractionFeedback(nextMessage, "success");
      await refresh();
    } catch (caught) {
      const nextError = caught instanceof Error ? caught.message : String(caught);
      setError(nextError);
      announceInteractionFeedback(nextError, "error", 4400);
    } finally {
      setAvatarBusy(false);
    }
  }

  const entries = activeTab === "streak" ? streakEntries : timeEntries;
  const pageCount = Math.max(1, Math.ceil(entries.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);
  const visibleEntries = entries.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE);
  const podiumEntries = entries.slice(0, 3);
  const podiumOrder = [1, 0, 2].filter((index) => index < podiumEntries.length);

  if (loading) return <LoadingState label="載入排行榜" />;

  return (
    <div className="page-stack leaderboard-v66-page leaderboard-v797-page">
      <GlassCard className="leaderboard-v66-hero" as="section">
        <div className="leaderboard-v66-heading">
          <span className="leaderboard-v66-icon"><Trophy size={24} /></span>
          <div><p className="eyebrow">Learning League</p><h1>學習榮耀榜</h1><p>穩定練習、持續累積，讓每一次進步都值得被看見。</p></div>
        </div>
        <div className="leaderboard-v66-actions">
          <div className="leaderboard-v66-tabs" role="tablist" aria-label="排行榜類型">
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "streak"}
              className={activeTab === "streak" ? "is-active" : ""}
              onClick={() => { setActiveTab("streak"); setPage(1); }}
            >
              <Flame aria-hidden="true" size={17} />連續答對
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === "time"}
              className={activeTab === "time" ? "is-active" : ""}
              onClick={() => { setActiveTab("time"); setPage(1); }}
            >
              <Clock3 aria-hidden="true" size={17} />練習時數
            </button>
          </div>
          <GlassButton
            variant="secondary"
            busy={refreshing}
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw aria-hidden="true" className={refreshing ? "is-spinning" : ""} size={18} />
            {refreshing ? "更新中" : "更新排名"}
          </GlassButton>
        </div>
      </GlassCard>

      {error ? <V93InlineNotice tone="error">{error}</V93InlineNotice> : null}
      {message ? <V93InlineNotice tone="success">{message}</V93InlineNotice> : null}

      {podiumEntries.length ? (
        <GlassCard className={`leaderboard-v796-podium count-${podiumEntries.length}`} as="section">
          <div className="leaderboard-v796-podium-head">
            <div><p className="eyebrow">Hall of Achievement</p><h2>榮耀殿堂</h2><p>以穩定練習與持續投入，向前三名學習者致敬。</p></div>
            <span><Trophy size={17} />Top {podiumEntries.length}</span>
          </div>
          <div className="leaderboard-v796-podium-grid">
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
                    <span>{secondaryMetric(entry, activeTab)}</span>
                  </div>
                  <div className="leaderboard-v796-podium-score"><strong>{metricValue(entry, activeTab)}</strong><small>{formatDate(entry.updatedAt)}</small></div>
                </article>
              );
            })}
          </div>
        </GlassCard>
      ) : null}

      <GlassCard className="leaderboard-profile-editor" as="section">
        <div className="leaderboard-profile-heading">
          <div className="leaderboard-profile-avatar-wrap">
            <Avatar entry={{ avatarUrl, displayName }} size="profile" />
            <button type="button" disabled={avatarBusy} onClick={() => fileInputRef.current?.click()} aria-label="上傳排行榜頭像"><Camera size={18} /></button>
          </div>
          <div><p className="eyebrow">Public Profile</p><h2>我的排行榜資料</h2></div>
        </div>
        <input
          ref={fileInputRef}
          className="leaderboard-avatar-input"
          type="file"
          accept="image/png,image/jpeg,image/webp"
          disabled={avatarBusy}
          aria-label="選擇排行榜頭像圖片"
          onChange={(event) => void handleAvatar(event)}
        />
        <form aria-busy={saving || undefined} onSubmit={(event) => void handleSubmit(event)}>
          <label>
            <span>顯示名稱</span>
            <input
              value={displayName}
              minLength={2}
              maxLength={24}
              required
              disabled={saving}
              aria-invalid={displayName.trim().length < 2 || undefined}
              onChange={(event) => setDisplayName(event.currentTarget.value)}
            />
            <small>{displayName.length}/24</small>
          </label>
          <div className="leaderboard-profile-actions">
            <GlassButton type="button" variant="secondary" busy={avatarBusy} disabled={avatarBusy} onClick={() => fileInputRef.current?.click()}><Camera aria-hidden="true" size={17} />{avatarBusy ? "處理中" : "更換頭像"}</GlassButton>
            {avatarUrl ? <GlassButton type="button" variant="secondary" disabled={avatarBusy} onClick={() => setRemoveAvatarConfirmationOpen(true)}><Trash2 aria-hidden="true" size={17} />移除頭像</GlassButton> : null}
            <GlassButton type="submit" variant="primary" busy={saving} disabled={saving || displayName.trim().length < 2}><Save aria-hidden="true" size={17} />{saving ? "儲存中" : "儲存資料"}</GlassButton>
          </div>
        </form>
      </GlassCard>

      {pendingAvatarFile ? (
        <AvatarCropDialog
          file={pendingAvatarFile}
          busy={avatarBusy}
          onCancel={() => setPendingAvatarFile(null)}
          onConfirm={handleAvatarCrop}
        />
      ) : null}

      <GlassCard className="leaderboard-v66-list" as="section">
        <div className="leaderboard-v66-list-head"><div><p className="eyebrow">Full Ranking</p><h2>{activeTab === "streak" ? "連續答對排行" : "累積練習時數排行"}</h2></div><span>{entries.length} 位</span></div>
        <div className="leaderboard-v66-rows">
          {!visibleEntries.length ? <div className="leaderboard-v66-empty"><Trophy size={26} /><strong>目前還沒有排名資料</strong><span>完成一場測驗後會自動加入排行榜。</span></div> : null}
          {visibleEntries.map((entry, index) => {
            const rank = (currentPage - 1) * PAGE_SIZE + index + 1;
            return <article key={entry.userId} className={`${entry.isCurrentUser ? "is-current " : ""}${rank <= 3 ? `is-podium rank-${rank}` : ""}`.trim()}>
              <span className={`leaderboard-v66-row-rank rank-${rank <= 3 ? rank : "other"}`} role="img" aria-label={`第 ${rank} 名`}>{rank <= 3 ? <MedalIcon rank={rank as MedalRank} /> : rank}</span>
              <Avatar entry={entry} />
              <div className="leaderboard-v66-player"><strong>{entry.displayName}{entry.isCurrentUser ? <em>你</em> : null}</strong><small>{secondaryMetric(entry, activeTab)}</small></div>
              <div className="leaderboard-v66-row-score"><strong>{metricValue(entry, activeTab)}</strong><small>{formatDate(entry.updatedAt)}</small></div>
            </article>;
          })}
        </div>
        {entries.length > PAGE_SIZE ? (
          <nav className="leaderboard-v66-pagination" aria-label="排行榜分頁">
            <button
              type="button"
              disabled={currentPage <= 1}
              aria-label="上一頁排行榜"
              onClick={() => setPage((value) => Math.max(1, value - 1))}
            >
              <ChevronLeft aria-hidden="true" size={17} />上一頁
            </button>
            <span role="status" aria-live="polite">{currentPage} / {pageCount}</span>
            <button
              type="button"
              disabled={currentPage >= pageCount}
              aria-label="下一頁排行榜"
              onClick={() => setPage((value) => Math.min(pageCount, value + 1))}
            >
              下一頁<ChevronRight aria-hidden="true" size={17} />
            </button>
          </nav>
        ) : null}
      </GlassCard>

      <V93ConfirmDialog
        open={removeAvatarConfirmationOpen}
        title="移除排行榜頭像"
        message="移除後將改回文字縮寫頭像。這不會影響排行榜成績。"
        confirmLabel={avatarBusy ? "移除中" : "移除頭像"}
        busy={avatarBusy}
        onConfirm={() => void handleRemoveAvatar()}
        onCancel={() => setRemoveAvatarConfirmationOpen(false)}
      />
    </div>
  );
}
