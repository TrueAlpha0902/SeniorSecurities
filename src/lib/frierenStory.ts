import { assetUrl } from "./imageQuiz";

export const FRIEREN_STORY_ASSETS = {
  study: assetUrl("animation/frieren-story/study.webp"),
  studyPage: assetUrl("animation/frieren-story/study-page.webp"),
  glassesMid: assetUrl("animation/frieren-story/glasses-mid.webp"),
  tired: assetUrl("animation/frieren-story/tired.webp"),
  walk1: assetUrl("animation/frieren-story/walk.webp"),
  walk2: assetUrl("animation/frieren-story/walk-2.webp"),
  walk3: assetUrl("animation/frieren-story/walk-3.webp"),
  walk4: assetUrl("animation/frieren-story/walk-4.webp"),
  sleep: assetUrl("animation/frieren-story/sleep.webp"),
} as const;

let storyPreloadPromise: Promise<boolean[]> | null = null;

function preloadImage(src: string, priority: "high" | "auto") {
  return new Promise<boolean>((resolve) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = priority;
    image.onload = () => {
      void image.decode().catch(() => undefined).finally(() => resolve(true));
    };
    image.onerror = () => resolve(false);
    image.src = src;
  });
}

/** Starts downloading every key pose before the user scrolls to the scene. */
export function preloadFrierenStory() {
  if (!storyPreloadPromise) {
    const pending = Promise.all(
      Object.values(FRIEREN_STORY_ASSETS).map((src, index) => preloadImage(src, index === 0 ? "high" : "auto")),
    );
    storyPreloadPromise = pending;
    void pending.then((loaded) => {
      if (!loaded.every(Boolean) && storyPreloadPromise === pending) {
        storyPreloadPromise = null;
      }
    });
  }
  return storyPreloadPromise;
}
