import {
  compressPdfCropSeam,
  contentBoundsToVerticalTrim,
  detectVerticalContentBounds,
  movePdfCropSegment,
  resizePdfCropSegment,
  trimPdfCropEdge,
} from "../src/lib/pdfCropEditor";
import type { PdfCropSegment } from "../src/lib/imageQuiz";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

const base: PdfCropSegment = {
  page: 1,
  src: "pdf-pages/test/page-1.webp",
  x: 100,
  y: 200,
  width: 500,
  height: 300,
  pageWidth: 1200,
  pageHeight: 1700,
};

const topTrimmed = trimPdfCropEdge(base, "top", 20);
assert(topTrimmed.y === 220, "Top trim must move only the top edge downward.");
assert(topTrimmed.height === 280, "Top trim must reduce height by the same amount.");

const bottomTrimmed = trimPdfCropEdge(base, "bottom", 20);
assert(bottomTrimmed.y === 200, "Bottom trim must not move the crop origin.");
assert(bottomTrimmed.height === 280, "Bottom trim must reduce height.");

const leftTrimmed = trimPdfCropEdge(base, "left", 25);
assert(leftTrimmed.x === 125 && leftTrimmed.width === 475, "Left trim must preserve the right edge.");

const rightTrimmed = trimPdfCropEdge(base, "right", 25);
assert(rightTrimmed.x === 100 && rightTrimmed.width === 475, "Right trim must preserve the left edge.");

const moved = movePdfCropSegment(base, -500, -500);
assert(moved.x === 0 && moved.y === 0, "Movement must remain inside the source page.");

const resized = resizePdfCropSegment(base, 900, 1600);
assert(resized.width === 1100 && resized.height === 1500, "Resize must clamp to the remaining page area.");

const [previous, current] = compressPdfCropSeam(base, { ...base, y: 600 }, 15);
assert(previous.height === 285, "Seam compression must trim the previous segment bottom.");
assert(current.y === 615 && current.height === 285, "Seam compression must trim the current segment top.");

const width = 200;
const height = 100;
const pixels = new Uint8ClampedArray(width * height * 4);
for (let index = 0; index < width * height; index += 1) {
  pixels[index * 4] = 255;
  pixels[index * 4 + 1] = 255;
  pixels[index * 4 + 2] = 255;
  pixels[index * 4 + 3] = 255;
}

// Add one-pixel border noise that must not count as text.
for (let y = 0; y < height; y += 1) {
  const offset = (y * width + width - 1) * 4;
  pixels[offset] = 40;
  pixels[offset + 1] = 40;
  pixels[offset + 2] = 40;
}

// Add a text-like block from row 25 through row 69.
for (let y = 25; y < 70; y += 1) {
  for (let x = 20; x < 80; x += 1) {
    const offset = (y * width + x) * 4;
    pixels[offset] = 20;
    pixels[offset + 1] = 20;
    pixels[offset + 2] = 20;
  }
}

const bounds = detectVerticalContentBounds(pixels, width, height);
assert(bounds?.top === 25, "Automatic whitespace detection must find the first content row.");
assert(bounds?.bottom === 70, "Automatic whitespace detection must find the last content row.");

const trim = contentBoundsToVerticalTrim(bounds, height, 300, 6);
assert(trim.top === 69, "Automatic top trim must keep the requested safety padding.");
assert(trim.bottom === 84, "Automatic bottom trim must keep the requested safety padding.");

console.log("PDF crop editor tests passed.");
