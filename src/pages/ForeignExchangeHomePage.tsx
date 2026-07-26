import { Bookmark, BookOpen, RotateCcw, Shuffle, TimerReset } from "lucide-react";
import { type FormEvent, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { GlassButton, GlassLinkButton } from "../components/GlassButton";
import { GlassCard } from "../components/GlassCard";
import { FOREIGN_EXCHANGE_SESSIONS } from "../lib/foreignExchange";
import {
  FOREIGN_EXCHANGE_PROGRESS_CHANGED,
  foreignExchangeProgressSummary,
} from "../lib/foreignExchangeProgress";
import { USER_STORAGE_SCOPE_CHANGED } from "../lib/userScopedStorage";
import "../styles/foreign-exchange-compact.css";

export function ForeignExchangeHomePage() {
  const navigate = useNavigate();
  const [summary, setSummary] = useState(() => foreignExchangeProgressSummary());
  const [randomCount, setRandomCount] = useState("20");

  useEffect(() => {
    const refresh = () => setSummary(foreignExchangeProgressSummary());
    window.addEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
    window.addEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
    window.addEventListener("storage", refresh);
    return () => {
      window.removeEventListener(FOREIGN_EXCHANGE_PROGRESS_CHANGED, refresh);
      window.removeEventListener(USER_STORAGE_SCOPE_CHANGED, refresh);
      window.removeEventListener("storage", refresh);
    };
  }, []);

  function startRandomPractice(event: FormEvent<HTMLFormElement>): void {
    event.preventDefault();
    const parsed = Number.parseInt(randomCount, 10);
    const safeCount = Math.min(
      100,
      Math.max(1, Number.isFinite(parsed) ? parsed : 20),
    );
    setRandomCount(String(safeCount));
    navigate(`/foreign-exchange/practice?mode=random&count=${safeCount}`);
  }

  return (
    <div className="page-stack fx-home-page">
      <GlassCard className="fx-hero">
        <div>
          <h1>初階外匯</h1>
        </div>
        <div className="fx-summary" aria-label="作答統計">
          <div><span>已作答</span><strong>{summary.answered}</strong></div>
          <div><span>正確率</span><strong>{summary.accuracy}%</strong></div>
          <div><span>錯題</span><strong>{summary.wrong}</strong></div>
          <div><span>收藏</span><strong>{summary.favorites}</strong></div>
        </div>
      </GlassCard>

      <section className="fx-practice-launcher" aria-label="快速練習">
        <form className="fx-random-form" onSubmit={startRandomPractice}>
          <label htmlFor="fx-random-count">
            <span>隨機題數</span>
            <input
              id="fx-random-count"
              type="number"
              min={1}
              max={100}
              inputMode="numeric"
              value={randomCount}
              onChange={(event) => setRandomCount(event.currentTarget.value)}
              aria-describedby="fx-random-count-hint"
            />
          </label>
          <GlassButton type="submit" variant="primary">
            <Shuffle aria-hidden="true" size={17} />開始練習
          </GlassButton>
          <small id="fx-random-count-hint">可選 1–100 題</small>
        </form>

        <div className="fx-quick-actions">
          <GlassLinkButton to="/foreign-exchange/practice?mode=wrong" variant="secondary">
            <RotateCcw aria-hidden="true" size={17} />錯題重練
          </GlassLinkButton>
          <GlassLinkButton to="/foreign-exchange/practice?mode=favorites" variant="secondary">
            <Bookmark aria-hidden="true" size={17} />收藏題目
          </GlassLinkButton>
        </div>
      </section>

      <section
        className="fx-session-list fx-session-list-compact"
        aria-label="歷屆試題"
      >
        {FOREIGN_EXCHANGE_SESSIONS.map((session) => (
          <GlassCard key={session.session} className="fx-session-row">
            <div className="fx-session-identity">
              <h2>第{session.session}屆</h2>
            </div>

            <div className="fx-session-subjects-compact">
              {session.subjects.map((subject) => (
                <article key={subject.id} className="fx-subject-compact">
                  <div className="fx-subject-compact-copy">
                    <span className="fx-subject-compact-icon" aria-hidden="true">
                      <BookOpen size={18} />
                    </span>
                    <div>
                      <h3>{subject.title}</h3>
                      <div className="fx-subject-compact-meta">
                        <span>{subject.questionCount}題</span>
                        <span>{subject.durationMinutes}分鐘</span>
                      </div>
                    </div>
                  </div>

                  <div className="fx-subject-compact-actions">
                    <GlassLinkButton
                      to={`/foreign-exchange/practice?mode=practice&session=${session.session}&subject=${subject.id}`}
                      variant="primary"
                    >
                      練習
                    </GlassLinkButton>
                    <GlassLinkButton
                      to={`/foreign-exchange/practice?mode=mock&session=${session.session}&subject=${subject.id}`}
                      variant="secondary"
                    >
                      <TimerReset aria-hidden="true" size={15} />模擬測驗
                    </GlassLinkButton>
                  </div>
                </article>
              ))}
            </div>
          </GlassCard>
        ))}
      </section>
    </div>
  );
}
