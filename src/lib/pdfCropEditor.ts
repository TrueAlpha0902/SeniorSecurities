import type { PdfCropSegment } from "./imageQuiz";

export type PdfCropEdge = "top" | "bottom" | "left" | "right";

export type VerticalContentBounds = {
  top: number;
  bottom: number;
};

export type VerticalTrim = {
  top: number;
  bottom: number;
};

const MIN_CROP_DIMENSION = 8;

function finite(value: number, fallback: number): number {
  return Number.isFinite(value) ? value : fallback;
}

export function normalizePdfCropSegment(segment: PdfCropSegment): PdfCropSegment {
  const pageWidth = Math.max(1, Math.round(finite(segment.pageWidth, 1)));
  const pageHeight = Math.max(1, Math.round(finite(segment.pageHeight, 1)));
  const minimumWidth = Math.min(MIN_CROP_DIMENSION, pageWidth);
  const minimumHeight = Math.min(MIN_CROP_DIMENSION, pageHeight);
  const x = Math.min(Math.max(0, Math.round(finite(segment.x, 0))), Math.max(0, pageWidth - minimumWidth));
  const y = Math.min(Math.max(0, Math.round(finite(segment.y, 0))), Math.max(0, pageHeight - minimumHeight));
  const width = Math.min(pageWidth - x, Math.max(minimumWidth, Math.round(finite(segment.width, minimumWidth))));
  const height = Math.min(pageHeight - y, Math.max(minimumHeight, Math.round(finite(segment.height, minimumHeight))));
  return { ...segment, pageWidth, pageHeight, x, y, width, height };
}

export function movePdfCropSegment(segment: PdfCropSegment, deltaX: number, deltaY: number): PdfCropSegment {
  return normalizePdfCropSegment({ ...segment, x: segment.x + deltaX, y: segment.y + deltaY });
}

export function resizePdfCropSegment(segment: PdfCropSegment, deltaWidth: number, deltaHeight: number): PdfCropSegment {
  return normalizePdfCropSegment({ ...segment, width: segment.width + deltaWidth, height: segment.height + deltaHeight });
}

export function trimPdfCropEdge(segment: PdfCropSegment, edge: PdfCropEdge, requestedAmount: number): PdfCropSegment {
  const current = normalizePdfCropSegment(segment);
  const amount = Math.max(0, Math.round(finite(requestedAmount, 0)));
  if (amount === 0) return current;

  if (edge === "top") {
    const applied = Math.min(amount, current.height - MIN_CROP_DIMENSION);
    return normalizePdfCropSegment({ ...current, y: current.y + applied, height: current.height - applied });
  }
  if (edge === "bottom") {
    const applied = Math.min(amount, current.height - MIN_CROP_DIMENSION);
    return normalizePdfCropSegment({ ...current, height: current.height - applied });
  }
  if (edge === "left") {
    const applied = Math.min(amount, current.width - MIN_CROP_DIMENSION);
    return normalizePdfCropSegment({ ...current, x: current.x + applied, width: current.width - applied });
  }
  const applied = Math.min(amount, current.width - MIN_CROP_DIMENSION);
  return normalizePdfCropSegment({ ...current, width: current.width - applied });
}

export function compressPdfCropSeam(
  previous: PdfCropSegment,
  current: PdfCropSegment,
  amount: number,
): [PdfCropSegment, PdfCropSegment] {
  return [trimPdfCropEdge(previous, "bottom", amount), trimPdfCropEdge(current, "top", amount)];
}

export function detectVerticalContentBounds(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  luminanceThreshold = 238,
): VerticalContentBounds | null {
  if (width <= 0 || height <= 0 || pixels.length < width * height * 4) return null;

  const minimumInkPixels = Math.max(6, Math.ceil(width * 0.006));
  const rows = new Uint8Array(height);

  for (let y = 0; y < height; y += 1) {
    let inkPixels = 0;
    const rowOffset = y * width * 4;
    for (let x = 0; x < width; x += 1) {
      const offset = rowOffset + x * 4;
      const alpha = pixels[offset + 3]!;
      if (alpha < 24) continue;
      const red = pixels[offset]!;
      const green = pixels[offset + 1]!;
      const blue = pixels[offset + 2]!;
      const luminance = red * 0.2126 + green * 0.7152 + blue * 0.0722;
      if (luminance < luminanceThreshold) inkPixels += 1;
    }
    if (inkPixels >= minimumInkPixels) rows[y] = 1;
  }

  const runLength = Math.min(3, Math.max(1, height));
  let first = -1;
  for (let y = 0; y <= height - runLength; y += 1) {
    let hasRun = true;
    for (let index = 0; index < runLength; index += 1) {
      if (!rows[y + index]) {
        hasRun = false;
        break;
      }
    }
    if (hasRun) {
      first = y;
      break;
    }
  }

  let last = -1;
  for (let y = height - 1; y >= runLength - 1; y -= 1) {
    let hasRun = true;
    for (let index = 0; index < runLength; index += 1) {
      if (!rows[y - index]) {
        hasRun = false;
        break;
      }
    }
    if (hasRun) {
      last = y;
      break;
    }
  }

  if (first < 0 || last < first) return null;
  return { top: first, bottom: last + 1 };
}

export function contentBoundsToVerticalTrim(
  bounds: VerticalContentBounds,
  analyzedHeight: number,
  segmentHeight: number,
  safetyPadding = 6,
): VerticalTrim {
  if (analyzedHeight <= 0 || segmentHeight <= 0) return { top: 0, bottom: 0 };
  const scale = segmentHeight / analyzedHeight;
  const top = Math.max(0, Math.floor(bounds.top * scale) - safetyPadding);
  const bottom = Math.max(0, Math.floor((analyzedHeight - bounds.bottom) * scale) - safetyPadding);
  return { top, bottom };
}
