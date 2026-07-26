const CJK_CLASS = "\\u3400-\\u4dbf\\u4e00-\\u9fff\\uf900-\\ufaff\\u3040-\\u30ff";
const CJK = new RegExp(`[${CJK_CLASS}]`);
const PLACEHOLDER_PREFIX = "\uE000";
const PLACEHOLDER_SUFFIX = "\uE001";

/**
 * Formats learner-facing text with Traditional Chinese full-width punctuation.
 *
 * This is a presentation-only transform. The source question bank remains
 * byte-for-byte unchanged. URLs, e-mail addresses, decimal numbers and
 * thousands separators are protected before punctuation is converted, so the
 * displayed typography cannot change a financial value.
 */
export function formatLearnerText(value: string): string {
  return value
    .normalize("NFC")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map(formatLearnerLine)
    .join("\n");
}

export function formatAnswerKey(value: string | number): string {
  return `（${String(value)}）`;
}

function formatLearnerLine(rawLine: string): string {
  if (!rawLine) return rawLine;
  const leading = rawLine.match(/^\s*/)?.[0] ?? "";
  const trailing = rawLine.match(/\s*$/)?.[0] ?? "";
  const endIndex = trailing.length ? rawLine.length - trailing.length : rawLine.length;
  let line = rawLine.slice(leading.length, endIndex);
  if (!line) return rawLine;

  // Markdown table separators must remain machine-readable by the renderer.
  if (/^\|?(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line)) return rawLine;

  const protectedTokens: string[] = [];
  const protect = (token: string): string => {
    const index = protectedTokens.push(token) - 1;
    return `${PLACEHOLDER_PREFIX}${index}${PLACEHOLDER_SUFFIX}`;
  };

  // Values whose punctuation is part of the value itself are not changed.
  line = line
    .replace(/https?:\/\/[^\s<>()]+/gi, protect)
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, protect)
    .replace(/\b\d{1,3}(?:,\d{3})+(?:\.\d+)?\b/g, protect)
    .replace(/\b\d+\.\d+\b/g, protect);

  // Quotation marks and ellipses are normalized before the general pass.
  line = line
    .replace(/^\(([1-4A-Da-d])\)(?=\s*)/, "（$1）")
    .replace(/"([^"\n]+)"/g, "「$1」")
    .replace(/([A-Za-z])'(?=\s|[A-Za-z])/g, "$1’")
    .replace(/'([^'\n]*[\u3400-\u9fff][^'\n]*)'/g, "『$1』")
    .replace(/\.{3,}/g, "……")
    .replace(/-{2,}/g, "——");

  // List markers use a full-width dot, while sentence-ending periods use 。.
  line = line
    .replace(/([甲乙丙丁戊己庚辛壬癸ⅠⅡⅢⅣⅤⅥⅦⅧⅨⅩA-Za-z0-9])\.(?=\s*[\u3400-\u9fffA-Za-z])/g, "$1．")
    .replace(/\((?=[^\n]*\))/g, "（")
    .replace(/\)/g, "）")
    .replace(/\[/g, "［")
    .replace(/\]/g, "］")
    .replace(/\{/g, "｛")
    .replace(/\}/g, "｝")
    .replace(/,/g, "，")
    .replace(/;/g, "；")
    .replace(/:/g, "：")
    .replace(/\?/g, "？")
    .replace(/!/g, "！")
    .replace(/%/g, "％")
    .replace(/~/g, "～")
    .replace(/\//g, "／")
    .replace(/&/g, "＆")
    .replace(/\./g, "。");

  // Restore protected values after the display punctuation has been applied.
  line = line.replace(
    new RegExp(`${PLACEHOLDER_PREFIX}(\\d+)${PLACEHOLDER_SUFFIX}`, "g"),
    (_match, index: string) => protectedTokens[Number(index)] ?? "",
  );

  // Remove OCR-era spacing around punctuation. A small space is kept after
  // Chinese punctuation when the next token starts with Latin text.
  line = line
    .replace(/\s+([，。；：？！、％）》」』】］）])/g, "$1")
    .replace(/([（《「『【［｛])\s+/g, "$1")
    .replace(/([，。；：？！、])(?=[A-Za-z])/g, "$1 ")
    .replace(/[ \t]{2,}/g, " ");

  return `${leading}${line}${trailing}`;
}

export function containsCjk(value: string): boolean {
  return CJK.test(value);
}
