import { useEffect, useRef, useState } from "react";
import {
  FRIEREN_FRAME_COUNT as FRAME_COUNT,
  FRIEREN_FRAME_HEIGHT as FRAME_HEIGHT,
  FRIEREN_FRAME_WIDTH as FRAME_WIDTH,
  FRIEREN_POSTER_URL as POSTER_URL,
  FRIEREN_SPRITE_COLUMNS as SPRITE_COLUMNS,
  preloadFrierenAnimation,
} from "../lib/frierenAnimation";

const CYCLE_DURATION_MS = 12_180;
const WALK_END_PROGRESS = 0.68;
const LOOP_FADE_IN_END = 0.035;
const LOOP_FADE_OUT_START = 0.94;

function drawFrame(
  context: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  frameIndex: number,
  alpha: number,
): void {
  const sourceX = (frameIndex % SPRITE_COLUMNS) * FRAME_WIDTH;
  const sourceY = Math.floor(frameIndex / SPRITE_COLUMNS) * FRAME_HEIGHT;
  context.globalAlpha = alpha;
  context.drawImage(
    sprite,
    sourceX,
    sourceY,
    FRAME_WIDTH,
    FRAME_HEIGHT,
    0,
    0,
    FRAME_WIDTH,
    FRAME_HEIGHT,
  );
}

function drawInterpolatedFrame(
  context: CanvasRenderingContext2D,
  sprite: HTMLImageElement,
  progress: number,
): void {
  const framePosition = progress * FRAME_COUNT;
  const currentFrame = Math.min(Math.floor(framePosition), FRAME_COUNT - 1);
  const nextFrame = Math.min(currentFrame + 1, FRAME_COUNT - 1);
  const blendProgress = framePosition - currentFrame;
  const smoothBlend = blendProgress * blendProgress * (3 - 2 * blendProgress);

  context.clearRect(0, 0, FRAME_WIDTH, FRAME_HEIGHT);
  if (nextFrame === currentFrame) {
    drawFrame(context, sprite, currentFrame, 1);
  } else {
    drawFrame(context, sprite, currentFrame, 1 - smoothBlend);
    drawFrame(context, sprite, nextFrame, smoothBlend);
  }
  context.globalAlpha = 1;
}

function calculateBounce(progress: number): number {
  if (progress >= WALK_END_PROGRESS) return 0;
  if (progress >= 0.56) return -5 * (1 - (progress - 0.56) / 0.12);
  return -5 * Math.sin(Math.PI * ((progress % 0.16) / 0.16));
}

function smoothStep(progress: number): number {
  const clamped = Math.min(1, Math.max(0, progress));
  return clamped * clamped * (3 - 2 * clamped);
}

function calculateLoopOpacity(progress: number): number {
  if (progress < LOOP_FADE_IN_END) return smoothStep(progress / LOOP_FADE_IN_END);
  if (progress > LOOP_FADE_OUT_START) {
    return 1 - smoothStep((progress - LOOP_FADE_OUT_START) / (1 - LOOP_FADE_OUT_START));
  }
  return 1;
}

export function FrierenAnimation() {
  const walkerRef = useRef<HTMLDivElement>(null);
  const shadowRef = useRef<HTMLSpanElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const walker = walkerRef.current;
    const shadow = shadowRef.current;
    const canvas = canvasRef.current;
    if (!walker || !shadow || !canvas) return;

    const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
    if (reduceMotion.matches) {
      walker.style.transform = "translate3d(24px, 0, 0)";
      return;
    }

    let disposed = false;
    let animationFrame = 0;
    let startTime = 0;
    let maxTravel = 0;
    let isVisible = typeof IntersectionObserver === "undefined";
    let loadedSprite: HTMLImageElement | undefined;
    const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
    const context = canvas.getContext("2d", { alpha: true });
    if (!context) return;

    canvas.width = Math.round(FRAME_WIDTH * pixelRatio);
    canvas.height = Math.round(FRAME_HEIGHT * pixelRatio);
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";

    const updateTravelDistance = () => {
      const playgroundWidth = walker.parentElement?.clientWidth ?? FRAME_WIDTH;
      maxTravel = Math.max(0, playgroundWidth - 290);
    };
    updateTravelDistance();

    const resizeObserver = typeof ResizeObserver === "undefined"
      ? undefined
      : new ResizeObserver(updateTravelDistance);
    if (walker.parentElement) resizeObserver?.observe(walker.parentElement);
    window.addEventListener("resize", updateTravelDistance);

    const render = (now: number) => {
      animationFrame = 0;
      if (disposed || !isVisible || !loadedSprite) return;
      if (startTime === 0) startTime = now - CYCLE_DURATION_MS * LOOP_FADE_IN_END;

      const progress = ((now - startTime) % CYCLE_DURATION_MS) / CYCLE_DURATION_MS;
      const travelProgress = Math.min(progress / WALK_END_PROGRESS, 1);
      const x = maxTravel * travelProgress;
      const y = calculateBounce(progress);

      drawInterpolatedFrame(context, loadedSprite, progress);
      walker.style.opacity = String(calculateLoopOpacity(progress));
      walker.style.transform = `translate3d(${x.toFixed(2)}px, ${y.toFixed(2)}px, 0)`;

      const restProgress = Math.min(Math.max((progress - WALK_END_PROGRESS) / 0.18, 0), 1);
      shadow.style.opacity = String(0.68 - restProgress * 0.28);
      shadow.style.transform = `scaleX(${(1.08 + restProgress * 0.37).toFixed(3)})`;
      animationFrame = window.requestAnimationFrame(render);
    };

    const resumeAnimation = () => {
      if (!disposed && isVisible && loadedSprite && animationFrame === 0) {
        animationFrame = window.requestAnimationFrame(render);
      }
    };

    const visibilityObserver = typeof IntersectionObserver === "undefined"
      ? undefined
      : new IntersectionObserver(([entry]) => {
          isVisible = Boolean(entry?.isIntersecting);
          if (isVisible) {
            resumeAnimation();
          } else if (animationFrame !== 0) {
            window.cancelAnimationFrame(animationFrame);
            animationFrame = 0;
          }
        }, { rootMargin: "160px 0px" });
    if (walker.parentElement) visibilityObserver?.observe(walker.parentElement);

    const startAnimation = (sprite: HTMLImageElement) => {
      loadedSprite = sprite;
      drawInterpolatedFrame(context, sprite, 0);
      setIsReady(true);
      resumeAnimation();
    };

    void preloadFrierenAnimation().then((sprite) => {
      if (!disposed) startAnimation(sprite);
    }).catch(() => {
      // The first-frame poster remains visible if the combined sprite cannot load.
    });

    return () => {
      disposed = true;
      window.cancelAnimationFrame(animationFrame);
      resizeObserver?.disconnect();
      visibilityObserver?.disconnect();
      window.removeEventListener("resize", updateTravelDistance);
    };
  }, []);

  return (
    <div ref={walkerRef} className={`frieren-walker${isReady ? " is-ready" : ""}`}>
      <span ref={shadowRef} className="frieren-shadow" />
      <div className="frieren-sprite">
        <img className="frieren-poster" src={POSTER_URL} alt="" decoding="async" fetchPriority="high" />
        <canvas ref={canvasRef} className="frieren-canvas" aria-hidden="true" />
      </div>
    </div>
  );
}
