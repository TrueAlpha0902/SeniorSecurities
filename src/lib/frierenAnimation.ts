import { assetUrl } from "./imageQuiz";

export const FRIEREN_FRAME_WIDTH = 260;
export const FRIEREN_FRAME_HEIGHT = 285;
export const FRIEREN_FRAME_COUNT = 29;
export const FRIEREN_SPRITE_COLUMNS = 5;
export const FRIEREN_POSTER_URL = assetUrl("animation/frieren-sequence/frame-001.png");

const SPRITE_URL = assetUrl("animation/frieren-sequence/frieren-sprite-sheet.png");
let spritePromise: Promise<HTMLImageElement> | undefined;

/** Start network fetch and image decoding while the user is still signing in. */
export function preloadFrierenAnimation(): Promise<HTMLImageElement> {
  if (spritePromise) return spritePromise;

  const pendingSprite = new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.fetchPriority = "high";

    image.addEventListener("load", () => {
      void image.decode().catch(() => undefined).then(() => resolve(image));
    }, { once: true });
    image.addEventListener("error", () => reject(new Error("Unable to load Frieren animation sprite.")), { once: true });
    image.src = SPRITE_URL;
  }).catch((error: unknown): never => {
    spritePromise = undefined;
    throw error;
  });

  spritePromise = pendingSprite;
  return pendingSprite;
}
