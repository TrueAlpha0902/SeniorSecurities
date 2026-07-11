export type CalculatorAngleUnit = "deg" | "rad";

export type CalculatorEvaluationOptions = {
  angleUnit?: CalculatorAngleUnit;
};

const ROOT_SCAN_POINTS = [
  -1_000_000, -100_000, -10_000, -1_000, -100, -20, -10, -5, -2, -1.5, -1.1,
  -0.99, -0.9, -0.75, -0.5, -0.25, -0.1, -0.01, -0.001, 0, 0.001, 0.01, 0.05,
  0.1, 0.25, 0.5, 0.75, 1, 1.5, 2, 5, 10, 20, 100, 1_000, 10_000, 100_000,
  1_000_000,
] as const;

const ROOT_RESIDUAL_TOLERANCE = 1e-8;
const ROOT_DEDUPLICATION_TOLERANCE = 1e-7;

const UNARY_FUNCTIONS = new Set([
  "sqrt", "cbrt", "sin", "cos", "tan", "asin", "acos", "atan",
  "log", "ln", "abs", "exp", "floor", "ceil", "round", "fact",
]);
const BINARY_FUNCTIONS = new Set(["ncr", "npr", "root"]);
const FUNCTION_NAMES = [...UNARY_FUNCTIONS, ...BINARY_FUNCTIONS].sort((a, b) => b.length - a.length);
const FUNCTION_PATTERN = FUNCTION_NAMES.join("|");

type EquationMetrics = {
  residual: number;
  normalizedResidual: number;
};

function tokenizeExpression(rawExpression: string): string[] {
  const normalized = normalizeExpression(rawExpression);
  const allowedPattern = new RegExp(`^(?:${FUNCTION_PATTERN}|ans|mem|pi|[xy]|e|(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+\\-]?\\d+)?|[(),+\\-*/%^!])+$`);
  if (!normalized || normalized.length > 320 || !allowedPattern.test(normalized)) {
    throw new Error("Invalid calculator expression");
  }

  const tokenPattern = new RegExp(`${FUNCTION_PATTERN}|ans|mem|pi|[xy]|e|(?:\\d+\\.?\\d*|\\.\\d+)(?:e[+\\-]?\\d+)?|[(),+\\-*/%^!]`, "g");
  const rawTokens = normalized.match(tokenPattern);
  if (!rawTokens || rawTokens.join("") !== normalized || rawTokens.length > 240) {
    throw new Error("Invalid calculator expression");
  }

  const tokens: string[] = [];
  for (const token of rawTokens) {
    const previous = tokens[tokens.length - 1];
    if (previous && needsImplicitMultiplication(previous, token)) tokens.push("*");
    tokens.push(token);
  }
  return tokens;
}

function isFunctionToken(token: string): boolean {
  return UNARY_FUNCTIONS.has(token) || BINARY_FUNCTIONS.has(token);
}

function needsImplicitMultiplication(previous: string, current: string): boolean {
  const previousCanEndValue = previous === ")" || previous === "x" || previous === "y" || previous === "pi"
    || previous === "e" || previous === "ans" || previous === "mem" || isNumberToken(previous)
    || previous === "%" || previous === "!";
  const currentCanStartValue = current === "(" || isFunctionToken(current) || current === "x" || current === "y"
    || current === "pi" || current === "e" || current === "ans" || current === "mem" || isNumberToken(current);
  return previousCanEndValue && currentCanStartValue;
}

export function evaluateCalculatorExpression(
  rawExpression: string,
  variables: Record<string, number> = {},
  options: CalculatorEvaluationOptions = {},
): number {
  const tokens = tokenizeExpression(rawExpression);
  const angleUnit = options.angleUnit ?? "deg";
  let position = 0;

  function parseExpression(): number {
    let value = parseTerm();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position];
      position += 1;
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
      ensureFinite(value);
    }
    return value;
  }

  function parseTerm(): number {
    let value = parseUnary();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position];
      position += 1;
      const right = parseUnary();
      if (operator === "/" && Math.abs(right) < Number.EPSILON) throw new Error("Division by zero");
      value = operator === "*" ? value * right : value / right;
      ensureFinite(value);
    }
    return value;
  }

  function parseUnary(): number {
    if (tokens[position] === "+") {
      position += 1;
      return parseUnary();
    }
    if (tokens[position] === "-") {
      position += 1;
      return -parseUnary();
    }
    return parsePower();
  }

  function parsePower(): number {
    let value = parsePrimary();
    if (tokens[position] === "^") {
      position += 1;
      value = Math.pow(value, parseUnary());
      ensureFinite(value);
    }
    return value;
  }

  function parsePrimary(): number {
    const token = tokens[position];
    let value: number;

    if (token && isFunctionToken(token)) {
      position += 1;
      if (tokens[position] !== "(") throw new Error(`${token} needs parentheses`);
      position += 1;
      const firstArgument = parseExpression();
      let secondArgument: number | undefined;
      if (tokens[position] === ",") {
        position += 1;
        secondArgument = parseExpression();
      }
      if (tokens[position] !== ")") throw new Error("Missing closing parenthesis");
      position += 1;
      value = applyFunction(token, firstArgument, secondArgument, angleUnit);
    } else if (token === "(") {
      position += 1;
      value = parseExpression();
      if (tokens[position] !== ")") throw new Error("Missing closing parenthesis");
      position += 1;
    } else if (token === "pi") {
      position += 1;
      value = Math.PI;
    } else if (token === "e") {
      position += 1;
      value = Math.E;
    } else if (token === "x" || token === "y" || token === "ans" || token === "mem") {
      position += 1;
      const variableValue = variables[token];
      if (typeof variableValue !== "number" || !Number.isFinite(variableValue)) throw new Error("Missing variable");
      value = variableValue;
    } else if (token && isNumberToken(token)) {
      position += 1;
      value = Number(token);
    } else {
      throw new Error("Invalid calculator expression");
    }

    while (tokens[position] === "%" || tokens[position] === "!") {
      const postfix = tokens[position];
      position += 1;
      value = postfix === "%" ? value / 100 : factorial(value);
    }
    ensureFinite(value);
    return value;
  }

  const evaluated = parseExpression();
  if (position !== tokens.length) throw new Error("Invalid calculator expression");
  ensureFinite(evaluated);
  return evaluated;
}

function applyFunction(
  name: string,
  first: number,
  second: number | undefined,
  angleUnit: CalculatorAngleUnit,
): number {
  const radians = angleUnit === "deg" ? first * Math.PI / 180 : first;
  let value: number;
  switch (name) {
    case "sqrt":
      if (first < 0) throw new Error("Invalid square root");
      value = Math.sqrt(first);
      break;
    case "cbrt": value = Math.cbrt(first); break;
    case "sin": value = Math.sin(radians); break;
    case "cos": value = Math.cos(radians); break;
    case "tan": value = Math.tan(radians); break;
    case "asin":
      value = Math.asin(first);
      if (angleUnit === "deg") value = value * 180 / Math.PI;
      break;
    case "acos":
      value = Math.acos(first);
      if (angleUnit === "deg") value = value * 180 / Math.PI;
      break;
    case "atan":
      value = Math.atan(first);
      if (angleUnit === "deg") value = value * 180 / Math.PI;
      break;
    case "log":
      if (first <= 0) throw new Error("Invalid logarithm");
      value = Math.log10(first);
      break;
    case "ln":
      if (first <= 0) throw new Error("Invalid logarithm");
      value = Math.log(first);
      break;
    case "abs": value = Math.abs(first); break;
    case "exp": value = Math.exp(first); break;
    case "floor": value = Math.floor(first); break;
    case "ceil": value = Math.ceil(first); break;
    case "round": value = Math.round(first); break;
    case "fact": value = factorial(first); break;
    case "ncr":
      if (second === undefined) throw new Error("nCr needs two arguments");
      value = combinations(first, second);
      break;
    case "npr":
      if (second === undefined) throw new Error("nPr needs two arguments");
      value = permutations(first, second);
      break;
    case "root":
      if (second === undefined || first === 0) throw new Error("root needs degree and value");
      if (second < 0 && Math.abs(first % 2) < Number.EPSILON) throw new Error("Invalid even root");
      value = second < 0 ? -Math.pow(-second, 1 / first) : Math.pow(second, 1 / first);
      break;
    default:
      throw new Error("Unsupported function");
  }
  ensureFinite(value);
  return value;
}

function factorial(input: number): number {
  if (!Number.isInteger(input) || input < 0 || input > 170) throw new Error("Factorial supports integers 0–170");
  let result = 1;
  for (let value = 2; value <= input; value += 1) result *= value;
  return result;
}

function permutations(n: number, r: number): number {
  assertCombinatoricInput(n, r);
  let result = 1;
  for (let value = n - r + 1; value <= n; value += 1) result *= value;
  ensureFinite(result);
  return result;
}

function combinations(n: number, r: number): number {
  assertCombinatoricInput(n, r);
  const effectiveR = Math.min(r, n - r);
  let result = 1;
  for (let value = 1; value <= effectiveR; value += 1) {
    result = result * (n - effectiveR + value) / value;
  }
  ensureFinite(result);
  return Math.round(result);
}

function assertCombinatoricInput(n: number, r: number): void {
  if (!Number.isInteger(n) || !Number.isInteger(r) || n < 0 || r < 0 || r > n || n > 170) {
    throw new Error("nPr/nCr supports integers with 0 ≤ r ≤ n ≤ 170");
  }
}

function normalizeExpression(rawExpression: string): string {
  return rawExpression
    .toLowerCase()
    .replace(/[×✕]/g, "*")
    .replace(/÷/g, "/")
    .replace(/[−–—]/g, "-")
    .replace(/％/g, "%")
    .replace(/√\s*(\d+\.?\d*|\.\d+|π|pi|[xye])/gi, "sqrt($1)")
    .replace(/∛\s*(\d+\.?\d*|\.\d+|π|pi|[xye])/gi, "cbrt($1)")
    .replace(/√/g, "sqrt")
    .replace(/∛/g, "cbrt")
    .replace(/π/g, "pi")
    .replace(/\bans\b/g, "ans")
    .replace(/\bm\b/g, "mem")
    .replace(/\s+/g, "");
}

function isNumberToken(token: string): boolean {
  return /^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/.test(token);
}

function ensureFinite(value: number): void {
  if (!Number.isFinite(value)) throw new Error("Invalid calculator result");
}

function splitEquation(equation: string): [string, string] {
  const parts = equation.split("=");
  if (parts.length !== 2 || !parts[0]?.trim() || !parts[1]?.trim()) {
    throw new Error("每個方程式必須包含一個等號 =。");
  }
  return [parts[0], parts[1]];
}

function getEquationMetrics(
  leftExpression: string,
  rightExpression: string,
  variables: Record<string, number>,
): EquationMetrics {
  const left = evaluateCalculatorExpression(leftExpression, variables);
  const right = evaluateCalculatorExpression(rightExpression, variables);
  const residual = Math.abs(left - right);
  return {
    residual,
    normalizedResidual: residual / Math.max(1, Math.abs(left), Math.abs(right)),
  };
}

export function equationResidual(equation: string, variables: Record<string, number>): number {
  const [left, right] = splitEquation(equation);
  return getEquationMetrics(left, right, variables).residual;
}

export function solveEquationForX(equation: string): number {
  if (!/(?:^|[^a-z])x(?:[^a-z]|$)/i.test(equation) || /(?:^|[^a-z])y(?:[^a-z]|$)/i.test(equation)) {
    throw new Error("一元模式請輸入只含未知數 x 的方程式。");
  }

  const [leftExpression, rightExpression] = splitEquation(equation);
  const f = (x: number): number => (
    evaluateCalculatorExpression(leftExpression, { x })
    - evaluateCalculatorExpression(rightExpression, { x })
  );
  const candidates: number[] = [];
  const sampled = ROOT_SCAN_POINTS.map((point) => ({ point, value: safelyEvaluateAt(f, point) }));

  for (const sample of sampled) {
    if (sample.value !== null && Math.abs(sample.value) < 1e-10) candidates.push(sample.point);
  }

  for (let index = 1; index < sampled.length; index += 1) {
    const previous = sampled[index - 1];
    const current = sampled[index];
    if (!previous || !current) continue;
    if (previous.value === null || current.value === null) continue;

    if (previous.value * current.value < 0) {
      const candidate = bisectRoot(f, previous.point, current.point, previous.value);
      if (candidate !== null) candidates.push(candidate);
      continue;
    }

    const midpoint = (previous.point + current.point) / 2;
    const midpointValue = safelyEvaluateAt(f, midpoint);
    if (
      midpointValue !== null
      && Math.abs(midpointValue) < Math.min(Math.abs(previous.value), Math.abs(current.value))
    ) {
      const minimumCandidate = minimizeAbsoluteValue(f, previous.point, current.point);
      if (minimumCandidate !== null) candidates.push(minimumCandidate);
    }
  }

  for (let index = 1; index < sampled.length - 1; index += 1) {
    const previous = sampled[index - 1];
    const current = sampled[index];
    const next = sampled[index + 1];
    if (!previous || !current || !next) continue;
    if (previous.value === null || current.value === null || next.value === null) continue;
    if (
      Math.abs(current.value) <= Math.abs(previous.value)
      && Math.abs(current.value) <= Math.abs(next.value)
    ) {
      const minimumCandidate = minimizeAbsoluteValue(f, previous.point, next.point);
      if (minimumCandidate !== null) candidates.push(minimumCandidate);
    }
  }

  const validCandidates = deduplicateRoots(candidates)
    .map((root) => ({ root, metrics: safelyGetEquationMetrics(leftExpression, rightExpression, { x: root }) }))
    .filter((candidate): candidate is { root: number; metrics: EquationMetrics } => (
      candidate.metrics !== null
      && candidate.metrics.normalizedResidual <= ROOT_RESIDUAL_TOLERANCE
    ));

  if (validCandidates.length === 0) {
    throw new Error("找不到可驗證的實數解；請確認方程式有解，且解位於 ±1,000,000 內。");
  }

  validCandidates.sort((first, second) => {
    const firstIsNonNegative = first.root >= -ROOT_DEDUPLICATION_TOLERANCE;
    const secondIsNonNegative = second.root >= -ROOT_DEDUPLICATION_TOLERANCE;
    if (firstIsNonNegative !== secondIsNonNegative) return firstIsNonNegative ? -1 : 1;
    if (Math.abs(first.root) !== Math.abs(second.root)) return Math.abs(first.root) - Math.abs(second.root);
    return first.metrics.normalizedResidual - second.metrics.normalizedResidual;
  });

  const selectedCandidate = validCandidates[0];
  if (!selectedCandidate) {
    throw new Error("找不到可驗證的實數解；請確認方程式有解，且解位於 ±1,000,000 內。");
  }
  const selectedRoot = selectedCandidate.root;
  return Math.abs(selectedRoot) < ROOT_DEDUPLICATION_TOLERANCE ? 0 : selectedRoot;
}

function safelyGetEquationMetrics(
  leftExpression: string,
  rightExpression: string,
  variables: Record<string, number>,
): EquationMetrics | null {
  try {
    const metrics = getEquationMetrics(leftExpression, rightExpression, variables);
    return Number.isFinite(metrics.normalizedResidual) ? metrics : null;
  } catch {
    return null;
  }
}

function safelyEvaluateAt(f: (x: number) => number, x: number): number | null {
  try {
    const value = f(x);
    return Number.isFinite(value) ? value : null;
  } catch {
    return null;
  }
}

function bisectRoot(
  f: (x: number) => number,
  initialLeft: number,
  initialRight: number,
  initialLeftValue: number,
): number | null {
  let left = initialLeft;
  let right = initialRight;
  let leftValue = initialLeftValue;

  for (let step = 0; step < 120; step += 1) {
    const mid = (left + right) / 2;
    const midValue = safelyEvaluateAt(f, mid);
    if (midValue === null) return null;
    if (Math.abs(midValue) < 1e-12) return mid;
    if (Math.abs(right - left) <= 1e-13 * Math.max(1, Math.abs(mid))) return mid;
    if (leftValue * midValue <= 0) {
      right = mid;
    } else {
      left = mid;
      leftValue = midValue;
    }
  }

  return (left + right) / 2;
}

function minimizeAbsoluteValue(f: (x: number) => number, initialLeft: number, initialRight: number): number | null {
  let left = initialLeft;
  let right = initialRight;

  for (let step = 0; step < 90; step += 1) {
    const firstPoint = left + (right - left) / 3;
    const secondPoint = right - (right - left) / 3;
    const firstValue = safelyEvaluateAt(f, firstPoint);
    const secondValue = safelyEvaluateAt(f, secondPoint);
    const firstMagnitude = firstValue === null ? Number.POSITIVE_INFINITY : Math.abs(firstValue);
    const secondMagnitude = secondValue === null ? Number.POSITIVE_INFINITY : Math.abs(secondValue);

    if (!Number.isFinite(firstMagnitude) && !Number.isFinite(secondMagnitude)) return null;
    if (firstMagnitude <= secondMagnitude) {
      right = secondPoint;
    } else {
      left = firstPoint;
    }
  }

  const candidates = [initialLeft, (left + right) / 2, initialRight]
    .map((point) => ({ point, value: safelyEvaluateAt(f, point) }))
    .filter((candidate): candidate is { point: number; value: number } => candidate.value !== null)
    .sort((first, second) => Math.abs(first.value) - Math.abs(second.value));

  return candidates[0]?.point ?? null;
}

function deduplicateRoots(roots: number[]): number[] {
  const sorted = roots.filter(Number.isFinite).sort((first, second) => first - second);
  const unique: number[] = [];
  for (const root of sorted) {
    const previous = unique[unique.length - 1];
    if (previous === undefined || Math.abs(root - previous) > ROOT_DEDUPLICATION_TOLERANCE * Math.max(1, Math.abs(root))) {
      unique.push(root);
    }
  }
  return unique;
}

export function solveLinearSystem(firstEquation: string, secondEquation: string): { x: number; y: number; maxResidual: number } {
  if (!/[xy]/i.test(`${firstEquation}${secondEquation}`)) {
    throw new Error("聯立方程式必須包含未知數 x 或 y。");
  }
  const first = linearCoefficients(firstEquation);
  const second = linearCoefficients(secondEquation);
  const determinant = first.a * second.b - second.a * first.b;
  if (Math.abs(determinant) < 1e-12) {
    throw new Error("兩條方程式無唯一解，可能互相平行或是同一條線。");
  }

  const x = (-first.c * second.b + second.c * first.b) / determinant;
  const y = (-first.a * second.c + second.a * first.c) / determinant;
  ensureFinite(x);
  ensureFinite(y);
  const maxResidual = Math.max(
    equationResidual(firstEquation, { x, y }),
    equationResidual(secondEquation, { x, y }),
  );
  if (maxResidual > 1e-7) throw new Error("方程式不是二元一次式，請移除 x²、xy 或其他非線性項。");
  return { x, y, maxResidual };
}

function linearCoefficients(equation: string): { a: number; b: number; c: number } {
  const [left, right] = splitEquation(equation);
  const f = (x: number, y: number) => (
    evaluateCalculatorExpression(left, { x, y })
    - evaluateCalculatorExpression(right, { x, y })
  );
  const c = f(0, 0);
  const a = f(1, 0) - c;
  const b = f(0, 1) - c;
  for (const [x, y] of [[2, -1], [-3, 2], [0.5, 4]] as const) {
    const expected = a * x + b * y + c;
    if (Math.abs(f(x, y) - expected) > 1e-7 * Math.max(1, Math.abs(expected))) {
      throw new Error("二元模式目前支援一次聯立方程式，請移除 x²、xy 或分母中的未知數。");
    }
  }
  return { a, b, c };
}
