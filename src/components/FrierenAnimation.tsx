import { useEffect, useRef, useState } from "react";
import { FRIEREN_STORY_ASSETS, preloadFrierenStory } from "../lib/frierenStory";
import "../styles/frieren-story-v65.css";

/**
 * A single-room, continuously choreographed character scene.
 *
 * The existing character artwork is preserved verbatim for visual consistency.
 * Furniture and ambience remain on stage for the full loop; only character poses
 * cross-fade, travel and breathe. The compositor handles the animation so it
 * stays smooth without shipping a heavyweight video.
 */
export function FrierenAnimation() {
  const stageRef = useRef<HTMLDivElement>(null);
  const [isReady, setIsReady] = useState(false);
  const [isStoryReady, setIsStoryReady] = useState(false);

  useEffect(() => {
    let disposed = false;

    const loadStory = async () => {
      const firstAttempt = await preloadFrierenStory();
      const loaded = firstAttempt.every(Boolean) ? firstAttempt : await preloadFrierenStory();
      if (disposed) return;
      setIsReady(Boolean(loaded[0] || firstAttempt[0]));
      setIsStoryReady(loaded.every(Boolean));
    };
    void loadStory();

    return () => {
      disposed = true;
    };
  }, []);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;

    let isIntersecting = typeof IntersectionObserver === "undefined";

    const updatePlayback = () => {
      const shouldPause = !isIntersecting || document.visibilityState === "hidden";
      stage.classList.toggle("is-paused", shouldPause);
    };

    const observer = typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver(([entry]) => {
          isIntersecting = Boolean(entry?.isIntersecting);
          updatePlayback();
        }, { rootMargin: "280px 0px" });

    observer?.observe(stage);
    document.addEventListener("visibilitychange", updatePlayback);
    updatePlayback();

    return () => {
      observer?.disconnect();
      document.removeEventListener("visibilitychange", updatePlayback);
    };
  }, []);

  return (
    <div
      ref={stageRef}
      className={`frieren-story-stage${isReady ? " is-ready" : ""}${isStoryReady ? " is-story-ready" : ""}`}
      role="img"
      aria-label="芙莉蓮在自己的房間讀書、翻頁、收拾後走到床邊休息的連續生活動畫"
    >
      <div className="frieren-room-world" aria-hidden="true">
        <div className="frieren-room-wall" />
        <div className="frieren-room-window">
          <span className="frieren-room-window-sky" />
          <span className="frieren-room-window-cross horizontal" />
          <span className="frieren-room-window-cross vertical" />
          <span className="frieren-room-curtain curtain-left" />
          <span className="frieren-room-curtain curtain-right" />
        </div>

        <div className="frieren-room-shelf">
          <span className="shelf-board shelf-board-one" />
          <span className="shelf-board shelf-board-two" />
          <span className="shelf-book book-one" />
          <span className="shelf-book book-two" />
          <span className="shelf-book book-three" />
          <span className="shelf-book book-four" />
          <span className="shelf-plant"><i /><b /></span>
        </div>

        <div className="frieren-room-rug" />
        <div className="frieren-room-floor-line floor-line-one" />
        <div className="frieren-room-floor-line floor-line-two" />

        <div className="frieren-room-desk" aria-hidden="true">
          <span className="room-chair-back" />
          <span className="room-chair-seat" />
          <span className="room-chair-leg chair-leg-left" />
          <span className="room-chair-leg chair-leg-right" />
          <span className="room-desk-top" />
          <span className="room-desk-front" />
          <span className="room-desk-leg desk-leg-left" />
          <span className="room-desk-leg desk-leg-right" />
          <span className="room-desk-book"><i /><b /></span>
          <span className="room-pencil-cup"><i /><i /><i /></span>
          <span className="room-lamp-base" />
          <span className="room-lamp-arm" />
          <span className="room-lamp-shade" />
          <span className="room-lamp-glow" />
        </div>

        <div className="frieren-room-bed" aria-hidden="true">
          <span className="room-bed-headboard" />
          <span className="room-bed-footboard" />
          <span className="room-bed-mattress" />
          <span className="room-bed-pillow" />
          <span className="room-bed-blanket" />
          <span className="room-bed-book" />
          <span className="room-bedside-table" />
          <span className="room-bedside-lamp" />
          <span className="room-bedside-glow" />
        </div>

        <figure className="frieren-room-actor frieren-story-study-group">
          <img className="frieren-study-pose pose-base" src={FRIEREN_STORY_ASSETS.study} alt="" decoding="async" fetchPriority="high" draggable={false} />
          <img className="frieren-study-pose pose-page" src={FRIEREN_STORY_ASSETS.studyPage} alt="" decoding="async" draggable={false} />
          <img className="frieren-study-pose pose-glasses" src={FRIEREN_STORY_ASSETS.glassesMid} alt="" decoding="async" draggable={false} />
          <img className="frieren-study-pose pose-tired" src={FRIEREN_STORY_ASSETS.tired} alt="" decoding="async" draggable={false} />
        </figure>

        <figure className="frieren-room-actor frieren-story-walk">
          <div className="frieren-story-walk-cycle">
            <img className="walk-frame walk-frame-one" src={FRIEREN_STORY_ASSETS.walk1} alt="" decoding="async" draggable={false} />
            <img className="walk-frame walk-frame-two" src={FRIEREN_STORY_ASSETS.walk2} alt="" decoding="async" draggable={false} />
            <img className="walk-frame walk-frame-three" src={FRIEREN_STORY_ASSETS.walk3} alt="" decoding="async" draggable={false} />
            <img className="walk-frame walk-frame-four" src={FRIEREN_STORY_ASSETS.walk4} alt="" decoding="async" draggable={false} />
          </div>
        </figure>

        <figure className="frieren-room-actor frieren-story-sleep">
          <img src={FRIEREN_STORY_ASSETS.sleep} alt="" decoding="async" draggable={false} />
        </figure>

        <span className="frieren-change-light" />
        <span className="frieren-room-dust dust-one" />
        <span className="frieren-room-dust dust-two" />
        <span className="frieren-room-dust dust-three" />
        <span className="frieren-room-dust dust-four" />
        <span className="frieren-story-zzz zzz-one">Z</span>
        <span className="frieren-story-zzz zzz-two">z</span>
        <span className="frieren-story-zzz zzz-three">z</span>
      </div>
    </div>
  );
}
