import { Check, RotateCcw, X, ZoomIn } from "lucide-react";
import {
  type PointerEvent as ReactPointerEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { GlassButton } from "./GlassButton";

const OUTPUT_SIZE = 320;

type Size = { width: number; height: number };
type Offset = { x: number; y: number };
type DragState = {
  pointerId: number;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

export type AvatarCropDialogProps = {
  file: File;
  busy: boolean;
  onCancel: () => void;
  onConfirm: (blob: Blob) => Promise<void> | void;
};

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.min(maximum, Math.max(minimum, value));
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

export function AvatarCropDialog({ file, busy, onCancel, onConfirm }: AvatarCropDialogProps) {
  const [sourceUrl, setSourceUrl] = useState("");
  const [naturalSize, setNaturalSize] = useState<Size>({ width: 0, height: 0 });
  const [stageSize, setStageSize] = useState(320);
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<Offset>({ x: 0, y: 0 });
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const imageRef = useRef<HTMLImageElement | null>(null);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => {
    const url = URL.createObjectURL(file);
    setSourceUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  useEffect(() => {
    const stage = stageRef.current;
    if (!stage) return;
    const update = () => setStageSize(Math.max(1, stage.clientWidth));
    update();
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(update);
    observer.observe(stage);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !busy && !processing) onCancel();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [busy, onCancel, processing]);

  const geometry = useMemo(() => {
    if (!naturalSize.width || !naturalSize.height || !stageSize) {
      return { scale: 1, width: stageSize, height: stageSize, maxX: 0, maxY: 0 };
    }
    const baseScale = Math.max(stageSize / naturalSize.width, stageSize / naturalSize.height);
    const scale = baseScale * zoom;
    const width = naturalSize.width * scale;
    const height = naturalSize.height * scale;
    return {
      scale,
      width,
      height,
      maxX: Math.max(0, (width - stageSize) / 2),
      maxY: Math.max(0, (height - stageSize) / 2),
    };
  }, [naturalSize.height, naturalSize.width, stageSize, zoom]);

  useEffect(() => {
    setOffset((current) => ({
      x: clamp(current.x, -geometry.maxX, geometry.maxX),
      y: clamp(current.y, -geometry.maxY, geometry.maxY),
    }));
  }, [geometry.maxX, geometry.maxY]);

  function resetCrop(): void {
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setError(null);
  }

  function handlePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (busy || processing || !naturalSize.width) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
  }

  function handlePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setOffset({
      x: clamp(drag.originX + event.clientX - drag.startX, -geometry.maxX, geometry.maxX),
      y: clamp(drag.originY + event.clientY - drag.startY, -geometry.maxY, geometry.maxY),
    });
  }

  function endPointerDrag(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  }

  async function confirmCrop(): Promise<void> {
    const image = imageRef.current;
    if (!image || !naturalSize.width || !stageSize) return;
    setProcessing(true);
    setError(null);
    try {
      const imageLeft = (stageSize - geometry.width) / 2 + offset.x;
      const imageTop = (stageSize - geometry.height) / 2 + offset.y;
      const sourceSide = Math.min(naturalSize.width, naturalSize.height, stageSize / geometry.scale);
      const sourceX = clamp(-imageLeft / geometry.scale, 0, Math.max(0, naturalSize.width - sourceSide));
      const sourceY = clamp(-imageTop / geometry.scale, 0, Math.max(0, naturalSize.height - sourceSide));
      const canvas = document.createElement("canvas");
      canvas.width = OUTPUT_SIZE;
      canvas.height = OUTPUT_SIZE;
      const context = canvas.getContext("2d");
      if (!context) throw new Error("瀏覽器無法建立頭像裁切畫布。");
      context.imageSmoothingEnabled = true;
      context.imageSmoothingQuality = "high";
      context.drawImage(image, sourceX, sourceY, sourceSide, sourceSide, 0, 0, OUTPUT_SIZE, OUTPUT_SIZE);
      const blob = await canvasToBlob(canvas, "image/webp", 0.88)
        ?? await canvasToBlob(canvas, "image/jpeg", 0.9);
      if (!blob) throw new Error("頭像裁切失敗，請改用另一張圖片。");
      await onConfirm(blob);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : String(caught));
    } finally {
      setProcessing(false);
    }
  }

  const disabled = busy || processing || !naturalSize.width;

  return (
    <div
      className="avatar-crop-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !disabled) onCancel();
      }}
    >
      <section className="avatar-crop-dialog" role="dialog" aria-modal="true" aria-labelledby="avatar-crop-title">
        <header>
          <div>
            <p className="eyebrow">Profile Photo</p>
            <h2 id="avatar-crop-title">裁切頭像</h2>
          </div>
          <button type="button" onClick={onCancel} disabled={disabled} aria-label="關閉裁切視窗">
            <X size={21} />
          </button>
        </header>

        <div
          ref={stageRef}
          className="avatar-crop-stage"
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointerDrag}
          onPointerCancel={endPointerDrag}
        >
          {sourceUrl ? (
            <img
              ref={imageRef}
              src={sourceUrl}
              alt="待裁切頭像"
              draggable={false}
              onLoad={(event) => {
                const image = event.currentTarget;
                setNaturalSize({ width: image.naturalWidth, height: image.naturalHeight });
                setOffset({ x: 0, y: 0 });
                setZoom(1);
              }}
              style={{
                width: geometry.width,
                height: geometry.height,
                transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
              }}
            />
          ) : null}
          <div className="avatar-crop-grid" aria-hidden="true"><i /><i /><i /><i /></div>
        </div>

        <div className="avatar-crop-controls">
          <label>
            <span><ZoomIn size={17} />縮放</span>
            <input
              type="range"
              min="1"
              max="3"
              step="0.01"
              value={zoom}
              disabled={disabled}
              onChange={(event) => setZoom(Number(event.currentTarget.value))}
            />
          </label>
          <button type="button" onClick={resetCrop} disabled={disabled}><RotateCcw size={17} />重設</button>
        </div>

        {error ? <p className="form-error avatar-crop-error" role="alert">{error}</p> : null}

        <footer>
          <GlassButton type="button" variant="secondary" onClick={onCancel} disabled={disabled}>取消</GlassButton>
          <GlassButton type="button" variant="primary" onClick={() => void confirmCrop()} disabled={disabled}>
            <Check size={18} />{busy || processing ? "處理中" : "使用這個裁切"}
          </GlassButton>
        </footer>
      </section>
    </div>
  );
}
