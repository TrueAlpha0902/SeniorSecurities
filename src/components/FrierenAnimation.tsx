import { useEffect, useRef, useState } from "react";
import { FRIEREN_STORY_ASSETS, preloadFrierenStory } from "../lib/frierenStory";
import "../styles/frieren-story-v65.css";

/**
 * A transparent, display-synchronised animation made from four decoded key
 * poses. Only opacity and transforms animate, so the browser can keep the
 * full story on the compositor and render at the display refresh rate.
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
        }, { rootMargin: "240px 0px" });

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
      aria-label="芙莉蓮讀書讀累後換上睡衣，走向右邊的床並安心入睡"
    >
      <figure className="frieren-story-layer frieren-story-study">
        <img
          src={FRIEREN_STORY_ASSETS.study}
          alt=""
          decoding="async"
          fetchPriority="high"
          draggable={false}
          onLoad={(event) => {
            const image = event.currentTarget;
            void image.decode().catch(() => undefined).finally(() => setIsReady(true));
          }}
        />
      </figure>

      <figure className="frieren-story-layer frieren-story-study-page">
        <img src={FRIEREN_STORY_ASSETS.studyPage} alt="" decoding="async" draggable={false} />
      </figure>

      <figure className="frieren-story-layer frieren-story-glasses-mid">
        <img src={FRIEREN_STORY_ASSETS.glassesMid} alt="" decoding="async" draggable={false} />
      </figure>

      <figure className="frieren-story-layer frieren-story-tired">
        <img src={FRIEREN_STORY_ASSETS.tired} alt="" decoding="async" draggable={false} />
      </figure>

      <figure className="frieren-story-layer frieren-story-walk">
        <div className="frieren-story-walk-cycle">
          <img className="walk-frame walk-frame-one" src={FRIEREN_STORY_ASSETS.walk1} alt="" decoding="async" draggable={false} />
          <img className="walk-frame walk-frame-two" src={FRIEREN_STORY_ASSETS.walk2} alt="" decoding="async" draggable={false} />
          <img className="walk-frame walk-frame-three" src={FRIEREN_STORY_ASSETS.walk3} alt="" decoding="async" draggable={false} />
          <img className="walk-frame walk-frame-four" src={FRIEREN_STORY_ASSETS.walk4} alt="" decoding="async" draggable={false} />
        </div>
      </figure>

      <figure className="frieren-story-layer frieren-story-sleep">
        <img src={FRIEREN_STORY_ASSETS.sleep} alt="" decoding="async" draggable={false} />
      </figure>

      <span className="frieren-story-spark spark-one" aria-hidden="true" />
      <span className="frieren-story-spark spark-two" aria-hidden="true" />
      <span className="frieren-story-spark spark-three" aria-hidden="true" />
      <span className="frieren-story-zzz zzz-one" aria-hidden="true">Z</span>
      <span className="frieren-story-zzz zzz-two" aria-hidden="true">z</span>
      <span className="frieren-story-zzz zzz-three" aria-hidden="true">z</span>
    </div>
  );
}
