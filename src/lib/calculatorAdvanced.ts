export type ComplexValue = { re: number; im: number };
export type Matrix = number[][];

export function complexOperate(left: ComplexValue, right: ComplexValue, operation: "+" | "-" | "*" | "/"): ComplexValue {
  if (operation === "+") return { re: left.re + right.re, im: left.im + right.im };
  if (operation === "-") return { re: left.re - right.re, im: left.im - right.im };
  if (operation === "*") return { re: left.re * right.re - left.im * right.im, im: left.re * right.im + left.im * right.re };
  const denominator = right.re ** 2 + right.im ** 2;
  if (denominator === 0) throw new Error("複數除數不可為 0。");
  return {
    re: (left.re * right.re + left.im * right.im) / denominator,
    im: (left.im * right.re - left.re * right.im) / denominator,
  };
}

export function formatComplex(value: ComplexValue): string {
  const re = normalizeTiny(value.re);
  const im = normalizeTiny(value.im);
  if (im === 0) return formatNumber(re);
  if (re === 0) return `${formatNumber(im)}i`;
  return `${formatNumber(re)} ${im >= 0 ? "+" : "−"} ${formatNumber(Math.abs(im))}i`;
}

export function parseIntegerForBase(value: string, radix: 2 | 8 | 10 | 16): number {
  const normalized = value.trim().replace(/^0[xob]/i, "");
  if (!normalized) throw new Error("請輸入整數。");
  const patterns: Record<2 | 8 | 10 | 16, RegExp> = {
    2: /^[01]+$/,
    8: /^[0-7]+$/,
    10: /^-?\d+$/,
    16: /^[0-9a-f]+$/i,
  };
  if (!patterns[radix].test(normalized)) throw new Error(`輸入內容不是有效的 ${radix} 進位整數。`);
  const parsed = Number.parseInt(normalized, radix);
  if (!Number.isSafeInteger(parsed)) throw new Error("數值超出安全整數範圍。");
  return parsed;
}

export function formatBaseResults(value: number): Record<"bin" | "oct" | "dec" | "hex", string> {
  if (!Number.isSafeInteger(value)) throw new Error("僅支援安全整數範圍。");
  const sign = value < 0 ? "−" : "";
  const absolute = Math.abs(value);
  return {
    bin: `${sign}${absolute.toString(2)}`,
    oct: `${sign}${absolute.toString(8)}`,
    dec: value.toString(10),
    hex: `${sign}${absolute.toString(16).toUpperCase()}`,
  };
}

export function parseMatrix(value: string): Matrix {
  const rows = value.trim().split(/[;\n]+/).map((row) => row.trim()).filter(Boolean);
  if (rows.length < 1 || rows.length > 3) throw new Error("矩陣僅支援 1×1 至 3×3。");
  const matrix = rows.map((row) => parseNumberList(row));
  const width = matrix[0]?.length ?? 0;
  if (width < 1 || width > 3 || matrix.some((row) => row.length !== width)) throw new Error("矩陣每列欄數必須相同，且最多 3 欄。");
  return matrix;
}

function matrixCell(matrix: Matrix, row: number, column: number): number {
  const value = matrix[row]?.[column];
  if (value === undefined) throw new Error("矩陣維度不完整。");
  return value;
}

function setMatrixCell(matrix: Matrix, row: number, column: number, value: number): void {
  const targetRow = matrix[row];
  if (!targetRow || column < 0 || column >= targetRow.length) throw new Error("矩陣維度不完整。");
  targetRow[column] = value;
}

export function matrixDeterminant(matrix: Matrix): number {
  assertSquare(matrix);
  if (matrix.length === 1) return matrixCell(matrix, 0, 0);
  if (matrix.length === 2) {
    return matrixCell(matrix, 0, 0) * matrixCell(matrix, 1, 1)
      - matrixCell(matrix, 0, 1) * matrixCell(matrix, 1, 0);
  }
  return matrixCell(matrix, 0, 0) * (
    matrixCell(matrix, 1, 1) * matrixCell(matrix, 2, 2)
      - matrixCell(matrix, 1, 2) * matrixCell(matrix, 2, 1)
  ) - matrixCell(matrix, 0, 1) * (
    matrixCell(matrix, 1, 0) * matrixCell(matrix, 2, 2)
      - matrixCell(matrix, 1, 2) * matrixCell(matrix, 2, 0)
  ) + matrixCell(matrix, 0, 2) * (
    matrixCell(matrix, 1, 0) * matrixCell(matrix, 2, 1)
      - matrixCell(matrix, 1, 1) * matrixCell(matrix, 2, 0)
  );
}

export function matrixInverse(matrix: Matrix): Matrix {
  assertSquare(matrix);
  const size = matrix.length;
  const augmented: Matrix = matrix.map((row, rowIndex) => [
    ...row,
    ...Array.from({ length: size }, (_, columnIndex) => rowIndex === columnIndex ? 1 : 0),
  ]);

  for (let column = 0; column < size; column += 1) {
    let pivotRow = column;
    for (let row = column + 1; row < size; row += 1) {
      if (Math.abs(matrixCell(augmented, row, column)) > Math.abs(matrixCell(augmented, pivotRow, column))) pivotRow = row;
    }
    if (Math.abs(matrixCell(augmented, pivotRow, column)) < 1e-12) throw new Error("矩陣不可逆。");

    if (pivotRow !== column) {
      const currentRow = augmented[column];
      const replacementRow = augmented[pivotRow];
      if (!currentRow || !replacementRow) throw new Error("矩陣維度不完整。");
      augmented[column] = replacementRow;
      augmented[pivotRow] = currentRow;
    }

    const pivot = matrixCell(augmented, column, column);
    const normalizedRow = augmented[column]?.map((entry) => entry / pivot);
    if (!normalizedRow) throw new Error("矩陣維度不完整。");
    augmented[column] = normalizedRow;

    for (let row = 0; row < size; row += 1) {
      if (row === column) continue;
      const factor = matrixCell(augmented, row, column);
      const sourceRow = augmented[column];
      const targetRow = augmented[row];
      if (!sourceRow || !targetRow) throw new Error("矩陣維度不完整。");
      for (let index = 0; index < targetRow.length; index += 1) {
        setMatrixCell(augmented, row, index, matrixCell(augmented, row, index) - factor * matrixCell(augmented, column, index));
      }
    }
  }
  return augmented.map((row) => row.slice(size).map(normalizeTiny));
}

export function matrixMultiply(left: Matrix, right: Matrix): Matrix {
  const leftWidth = left[0]?.length ?? 0;
  const rightWidth = right[0]?.length ?? 0;
  if (!left.length || !right.length || !leftWidth || !rightWidth || leftWidth !== right.length) {
    throw new Error("A 的欄數必須等於 B 的列數。");
  }
  if (left.some((row) => row.length !== leftWidth) || right.some((row) => row.length !== rightWidth)) {
    throw new Error("矩陣每列欄數必須相同。");
  }
  return left.map((row, rowIndex) => Array.from({ length: rightWidth }, (_, columnIndex) => {
    const value = row.reduce((sum, _entry, index) => sum + matrixCell(left, rowIndex, index) * matrixCell(right, index, columnIndex), 0);
    return normalizeTiny(value);
  }));
}

export function formatMatrix(matrix: Matrix): string {
  return matrix.map((row) => `[ ${row.map(formatNumber).join("  ")} ]`).join("\n");
}

export function parseVector(value: string): number[] {
  const vector = parseNumberList(value);
  if (vector.length < 2 || vector.length > 3) throw new Error("向量請輸入 2 或 3 個分量。");
  return vector;
}

function vectorComponent(vector: number[], index: number): number {
  const value = vector[index];
  if (value === undefined) throw new Error("向量維度不完整。");
  return value;
}

export function vectorDot(left: number[], right: number[]): number {
  if (left.length !== right.length) throw new Error("兩個向量維度必須相同。");
  return left.reduce((sum, entry, index) => sum + entry * vectorComponent(right, index), 0);
}

export function vectorCross(left: number[], right: number[]): number[] {
  if (left.length !== 3 || right.length !== 3) throw new Error("外積只支援三維向量。");
  return [
    vectorComponent(left, 1) * vectorComponent(right, 2) - vectorComponent(left, 2) * vectorComponent(right, 1),
    vectorComponent(left, 2) * vectorComponent(right, 0) - vectorComponent(left, 0) * vectorComponent(right, 2),
    vectorComponent(left, 0) * vectorComponent(right, 1) - vectorComponent(left, 1) * vectorComponent(right, 0),
  ].map(normalizeTiny);
}

export function vectorMagnitude(vector: number[]): number {
  return Math.sqrt(vector.reduce((sum, entry) => sum + entry ** 2, 0));
}

export type StatisticsSummary = {
  count: number;
  mean: number;
  median: number;
  populationStdDev: number;
  sampleStdDev: number;
  min: number;
  max: number;
  sum: number;
};

export function calculateStatistics(value: string): StatisticsSummary {
  const values = parseNumberList(value);
  const sorted = [...values].sort((a, b) => a - b);
  const sum = values.reduce((total, entry) => total + entry, 0);
  const mean = sum / values.length;
  const variance = values.reduce((total, entry) => total + (entry - mean) ** 2, 0) / values.length;
  const sampleVariance = values.length > 1
    ? values.reduce((total, entry) => total + (entry - mean) ** 2, 0) / (values.length - 1)
    : 0;
  const midpoint = Math.floor(sorted.length / 2);
  const median = sorted.length % 2
    ? sorted[midpoint]
    : ((sorted[midpoint - 1] ?? 0) + (sorted[midpoint] ?? 0)) / 2;
  const min = sorted[0];
  const max = sorted[sorted.length - 1];
  if (median === undefined || min === undefined || max === undefined) throw new Error("請輸入至少一筆資料。");
  return {
    count: values.length,
    mean,
    median,
    populationStdDev: Math.sqrt(variance),
    sampleStdDev: Math.sqrt(sampleVariance),
    min,
    max,
    sum,
  };
}

export function normalPdf(x: number, mean = 0, standardDeviation = 1): number {
  if (!(standardDeviation > 0)) throw new Error("標準差必須大於 0。");
  const z = (x - mean) / standardDeviation;
  return Math.exp(-0.5 * z * z) / (standardDeviation * Math.sqrt(2 * Math.PI));
}

export function normalCdf(x: number, mean = 0, standardDeviation = 1): number {
  if (!(standardDeviation > 0)) throw new Error("標準差必須大於 0。");
  const z = (x - mean) / (standardDeviation * Math.sqrt(2));
  return 0.5 * (1 + erf(z));
}

export function binomialProbability(n: number, p: number, k: number): number {
  if (!Number.isInteger(n) || !Number.isInteger(k) || n < 0 || k < 0 || k > n) throw new Error("n 與 k 必須為有效整數，且 0 ≤ k ≤ n。");
  if (p < 0 || p > 1) throw new Error("機率 p 必須介於 0 與 1。");
  return combination(n, k) * p ** k * (1 - p) ** (n - k);
}

export function solveRatio(a: number, b: number, c: number): number {
  if (Math.abs(a) < Number.EPSILON) throw new Error("比例左側第一項不可為 0。");
  return b * c / a;
}

export function solveQuadraticInequality(a: number, b: number, c: number, relation: ">" | ">=" | "<" | "<="): string {
  if (Math.abs(a) < 1e-12) return solveLinearInequality(b, c, relation);
  const discriminant = b * b - 4 * a * c;
  if (discriminant < 0) {
    const alwaysTrue = relation.startsWith(">") ? a > 0 : a < 0;
    return alwaysTrue ? "所有實數" : "無解";
  }
  const root = Math.sqrt(Math.max(0, discriminant));
  const x1 = (-b - root) / (2 * a);
  const x2 = (-b + root) / (2 * a);
  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const inclusive = relation.includes("=");
  const outside = relation.startsWith(">") === (a > 0);
  if (Math.abs(left - right) < 1e-10) {
    if (outside) return inclusive ? "所有實數" : `x ≠ ${formatNumber(left)}`;
    return inclusive ? `x = ${formatNumber(left)}` : "無解";
  }
  return outside
    ? `x ${inclusive ? "≤" : "<"} ${formatNumber(left)} 或 x ${inclusive ? "≥" : ">"} ${formatNumber(right)}`
    : `${formatNumber(left)} ${inclusive ? "≤" : "<"} x ${inclusive ? "≤" : "<"} ${formatNumber(right)}`;
}

export function parseNumberList(value: string): number[] {
  const entries = value.trim().split(/[\s,，]+/).filter(Boolean).map(Number);
  if (!entries.length || entries.some((entry) => !Number.isFinite(entry))) throw new Error("請以逗號或空白分隔有效數字。");
  return entries;
}

export function formatNumber(value: number): string {
  const normalized = normalizeTiny(value);
  if (Math.abs(normalized) >= 1e12 || (Math.abs(normalized) > 0 && Math.abs(normalized) < 1e-9)) return normalized.toExponential(8);
  return Number(normalized.toPrecision(12)).toLocaleString("en-US", { useGrouping: false, maximumFractionDigits: 12 });
}

function assertSquare(matrix: Matrix): void {
  if (!matrix.length || matrix.length > 3 || matrix.some((row) => row.length !== matrix.length)) throw new Error("此運算需要 1×1 至 3×3 方陣。");
}

function combination(n: number, k: number): number {
  const chosen = Math.min(k, n - k);
  let result = 1;
  for (let index = 1; index <= chosen; index += 1) result = result * (n - chosen + index) / index;
  return result;
}

function solveLinearInequality(a: number, b: number, relation: ">" | ">=" | "<" | "<="): string {
  if (Math.abs(a) < 1e-12) {
    const trueAtZero = relation.startsWith(">") ? b > 0 || (relation.includes("=") && b === 0) : b < 0 || (relation.includes("=") && b === 0);
    return trueAtZero ? "所有實數" : "無解";
  }
  const boundary = -b / a;
  const relationSymbol = relation === ">" ? (a > 0 ? ">" : "<")
    : relation === ">=" ? (a > 0 ? "≥" : "≤")
      : relation === "<" ? (a > 0 ? "<" : ">")
        : (a > 0 ? "≤" : "≥");
  return `x ${relationSymbol} ${formatNumber(boundary)}`;
}

function erf(value: number): number {
  const sign = value < 0 ? -1 : 1;
  const x = Math.abs(value);
  const t = 1 / (1 + 0.3275911 * x);
  const polynomial = (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t;
  return sign * (1 - polynomial * Math.exp(-x * x));
}

function normalizeTiny(value: number): number {
  return Math.abs(value) < 1e-12 ? 0 : value;
}
