import {
  type KeyboardEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  Brackets,
  ChevronDown,
  ChevronUp,
  Delete,
  Equal,
  FunctionSquare,
  History,
  RotateCcw,
  X,
} from "lucide-react";
import {
  equationResidual,
  evaluateCalculatorExpression,
  solveEquationForX,
  type CalculatorAngleUnit,
} from "../lib/calculatorCore";
import "../styles/calculator-premium-v68.css";

type CalculatorModalProps = {
  open: boolean;
  onClose: () => void;
};

type CalculatorMode = "calculate" | "solve";
type FractionResult = { numerator: number; denominator: number };
type HistoryRow = {
  mode: CalculatorMode;
  expression: string;
  result: string;
};

type KeySpec = {
  label: string;
  value?: string;
  tone?: "plain" | "function" | "operator" | "command" | "primary";
  action?: "clear" | "delete" | "equals" | "ans" | "fraction";
};

const EXAMPLE_EQUATIONS = [
  "(1+x)^2*(1.0613)=1.081",
  "0.16=0.1*0.2+0.9*(1-0.35)*x",
] as const;

const FUNCTION_KEYS: KeySpec[] = [
  { label: "x", value: "x", tone: "function" },
  { label: "(", value: "(", tone: "function" },
  { label: ")", value: ")", tone: "function" },
  { label: "x²", value: "^2", tone: "function" },
  { label: "xʸ", value: "^", tone: "function" },
  { label: "√", value: "sqrt(", tone: "function" },
  { label: "log", value: "log(", tone: "function" },
  { label: "ln", value: "ln(", tone: "function" },
  { label: "sin", value: "sin(", tone: "function" },
  { label: "cos", value: "cos(", tone: "function" },
  { label: "tan", value: "tan(", tone: "function" },
  { label: "π", value: "π", tone: "function" },
  { label: "a⁄b", action: "fraction", tone: "function" },
  { label: "%", value: "%", tone: "function" },
  { label: "Ans", action: "ans", tone: "function" },
];

const NUMBER_KEYS: KeySpec[] = [
  { label: "7", value: "7" },
  { label: "8", value: "8" },
  { label: "9", value: "9" },
  { label: "DEL", action: "delete", tone: "command" },
  { label: "AC", action: "clear", tone: "command" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "6", value: "6" },
  { label: "×", value: "*", tone: "operator" },
  { label: "÷", value: "/", tone: "operator" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "+", value: "+", tone: "operator" },
  { label: "−", value: "-", tone: "operator" },
  { label: "0", value: "0" },
  { label: ".", value: "." },
  { label: "=", value: "=", tone: "operator" },
  { label: "計算", action: "equals", tone: "primary" },
];

export function CalculatorModal({ open, onClose }: CalculatorModalProps) {
  const [mode, setMode] = useState<CalculatorMode>("calculate");
  const [angleUnit, setAngleUnit] = useState<CalculatorAngleUnit>("deg");
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const [resultValue, setResultValue] = useState<number | null>(null);
  const [fractionResult, setFractionResult] = useState<FractionResult | null>(null);
  const [showFractionResult, setShowFractionResult] = useState(false);
  const [error, setError] = useState("");
  const [answer, setAnswer] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [fractionOpen, setFractionOpen] = useState(false);
  const [fractionNumerator, setFractionNumerator] = useState("");
  const [fractionDenominator, setFractionDenominator] = useState("");
  const [resultPulse, setResultPulse] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  const modeHint = mode === "solve"
    ? "輸入含 x 的等式，按計算解出 x"
    : "輸入算式，支援括號、次方、根號與分數";

  const displayResult = useMemo(() => {
    if (showFractionResult && fractionResult) return null;
    return result;
  }, [fractionResult, result, showFractionResult]);

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
    return () => window.cancelAnimationFrame(frame);
  }, [open, mode]);

  useEffect(() => {
    if (!open) return;
    function handleGlobalKey(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    }
    window.addEventListener("keydown", handleGlobalKey);
    return () => window.removeEventListener("keydown", handleGlobalKey);
  }, [onClose, open]);

  if (!open) return null;

  function resetOutput(): void {
    setResult("");
    setResultValue(null);
    setFractionResult(null);
    setShowFractionResult(false);
    setError("");
  }

  function insertAtCursor(value: string): void {
    const input = inputRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? start;
    const next = `${expression.slice(0, start)}${value}${expression.slice(end)}`.slice(0, 320);
    setExpression(next);
    resetOutput();
    softFeedback();
    window.requestAnimationFrame(() => {
      inputRef.current?.focus({ preventScroll: true });
      const cursor = Math.min(next.length, start + value.length);
      inputRef.current?.setSelectionRange(cursor, cursor);
    });
  }

  function deleteAtCursor(): void {
    const input = inputRef.current;
    const start = input?.selectionStart ?? expression.length;
    const end = input?.selectionEnd ?? start;
    if (start !== end) {
      setExpression(`${expression.slice(0, start)}${expression.slice(end)}`);
      window.requestAnimationFrame(() => inputRef.current?.setSelectionRange(start, start));
    } else if (start > 0) {
      setExpression(`${expression.slice(0, start - 1)}${expression.slice(end)}`);
      window.requestAnimationFrame(() => inputRef.current?.setSelectionRange(start - 1, start - 1));
    }
    resetOutput();
    softFeedback();
  }

  function clear(): void {
    setExpression("");
    resetOutput();
    setFractionOpen(false);
    setFractionNumerator("");
    setFractionDenominator("");
    softFeedback();
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  function handleKey(key: KeySpec): void {
    switch (key.action) {
      case "clear": clear(); return;
      case "delete": deleteAtCursor(); return;
      case "equals": calculate(); return;
      case "ans": insertAtCursor("ans"); return;
      case "fraction": setFractionOpen((current) => !current); softFeedback(); return;
      default:
        if (key.value) insertAtCursor(key.value);
    }
  }

  function handleInputKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): void {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      calculate();
    }
  }

  function calculate(): void {
    const source = expression.trim();
    if (!source) {
      setError("請先輸入算式或方程式。");
      errorFeedback();
      return;
    }

    try {
      let numericResult: number;
      let formatted: string;
      if (mode === "solve") {
        numericResult = solveEquationForX(source);
        formatted = `x = ${formatCalculatorResult(numericResult)}`;
        const residual = equationResidual(source, { x: numericResult });
        setResult(`${formatted} · 代回誤差 ${formatResidual(residual)}`);
      } else {
        if (source.includes("=")) throw new Error("等式請切換到「解 x」模式。");
        numericResult = evaluateCalculatorExpression(source, { ans: answer }, { angleUnit });
        formatted = formatCalculatorResult(numericResult);
        setResult(formatted);
      }

      setAnswer(numericResult);
      setResultValue(numericResult);
      setFractionResult(toReasonableFraction(numericResult));
      setShowFractionResult(false);
      setError("");
      setHistory((rows) => [{ mode, expression: source, result: formatted }, ...rows].slice(0, 12));
      setResultPulse(false);
      window.requestAnimationFrame(() => setResultPulse(true));
      successFeedback();
    } catch (calculationError) {
      setResult("");
      setResultValue(null);
      setFractionResult(null);
      setError(calculationError instanceof Error ? localizeCalculatorError(calculationError.message) : "無法完成計算。");
      errorFeedback();
    }
  }

  function insertFraction(): void {
    const numerator = fractionNumerator.trim();
    const denominator = fractionDenominator.trim();
    if (!numerator || !denominator) {
      setError("請完整輸入分子與分母。");
      errorFeedback();
      return;
    }
    insertAtCursor(`((${numerator})/(${denominator}))`);
    setFractionNumerator("");
    setFractionDenominator("");
    setFractionOpen(false);
  }

  function restoreHistoryRow(row: HistoryRow): void {
    setMode(row.mode);
    setExpression(row.expression);
    setResult(row.result);
    setError("");
    setHistoryOpen(false);
    window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }

  return (
    <div className="premium-calculator-overlay" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) onClose();
    }}>
      <section className="premium-calculator" role="dialog" aria-modal="true" aria-labelledby="premium-calculator-title">
        <header className="premium-calculator-header">
          <div>
            <p className="eyebrow">Finance Calculator</p>
            <h2 id="premium-calculator-title">科學計算機</h2>
          </div>
          <button type="button" className="premium-calculator-close" onClick={onClose} aria-label="關閉計算機"><X size={21} /></button>
        </header>

        <div className="premium-calculator-mode" role="tablist" aria-label="計算模式">
          <button type="button" role="tab" aria-selected={mode === "calculate"} className={mode === "calculate" ? "is-active" : ""} onClick={() => { setMode("calculate"); resetOutput(); }}>
            <FunctionSquare size={17} />一般計算
          </button>
          <button type="button" role="tab" aria-selected={mode === "solve"} className={mode === "solve" ? "is-active" : ""} onClick={() => { setMode("solve"); resetOutput(); }}>
            <Equal size={17} />解 x
          </button>
          <button type="button" className="angle-unit-button" onClick={() => { setAngleUnit((unit) => unit === "deg" ? "rad" : "deg"); softFeedback(); }}>
            {angleUnit.toUpperCase()}
          </button>
        </div>

        <div className="premium-calculator-screen">
          <div className="screen-status"><span>{mode === "solve" ? "SOLVE" : "COMP"}</span><span>{angleUnit.toUpperCase()}</span></div>
          <textarea
            ref={inputRef}
            value={expression}
            spellCheck={false}
            inputMode="text"
            aria-label={mode === "solve" ? "輸入含 x 的方程式" : "輸入算式"}
            placeholder={mode === "solve" ? "例如 (1+x)^2*1.0613=1.081" : "例如 (1250*1.08)+sqrt(144)"}
            onChange={(event) => { setExpression(event.currentTarget.value.slice(0, 320)); resetOutput(); }}
            onKeyDown={handleInputKeyDown}
          />
          <div className={`screen-result${error ? " has-error" : ""}${resultPulse ? " result-pulse" : ""}`}>
            {error ? <span>{error}</span> : showFractionResult && fractionResult ? <FractionView numerator={fractionResult.numerator} denominator={fractionResult.denominator} /> : <strong>{displayResult || "0"}</strong>}
          </div>
          <div className="screen-hint"><span>{modeHint}</span>{resultValue !== null && fractionResult ? <button type="button" onClick={() => setShowFractionResult((current) => !current)}>S⇔D</button> : null}</div>
        </div>

        {mode === "solve" ? (
          <div className="equation-examples" aria-label="方程式範例">
            {EXAMPLE_EQUATIONS.map((example) => <button key={example} type="button" onClick={() => { setExpression(example); resetOutput(); }}>{example}</button>)}
          </div>
        ) : null}

        {fractionOpen ? (
          <div className="fraction-composer" aria-label="分數輸入">
            <div className="fraction-stack-input">
              <input value={fractionNumerator} onChange={(event) => setFractionNumerator(event.currentTarget.value.slice(0, 100))} placeholder="分子 a" aria-label="分子" />
              <span aria-hidden="true" />
              <input value={fractionDenominator} onChange={(event) => setFractionDenominator(event.currentTarget.value.slice(0, 100))} placeholder="分母 b" aria-label="分母" />
            </div>
            <button type="button" onClick={insertFraction}>插入分數</button>
          </div>
        ) : null}

        <div className="premium-function-grid" aria-label="科學函數">
          {FUNCTION_KEYS.map((key) => <CalculatorKey key={key.label} spec={key} onPress={handleKey} />)}
        </div>
        <div className="premium-number-grid" aria-label="數字鍵盤">
          {NUMBER_KEYS.map((key) => <CalculatorKey key={key.label} spec={key} onPress={handleKey} />)}
        </div>

        <footer className="premium-calculator-footer">
          <button type="button" onClick={() => setHistoryOpen((current) => !current)}><History size={16} />歷史{historyOpen ? <ChevronUp size={15} /> : <ChevronDown size={15} />}</button>
          <span><Brackets size={15} />支援隱式乘法，如 2x、2(x+1)</span>
        </footer>

        {historyOpen ? (
          <div className="premium-calculator-history">
            <div><strong>最近計算</strong><button type="button" onClick={() => setHistory([])}><RotateCcw size={15} />清除</button></div>
            {history.length ? history.map((row, index) => <button type="button" key={`${row.expression}-${index}`} onClick={() => restoreHistoryRow(row)}><span>{row.expression}</span><strong>{row.result}</strong></button>) : <p>尚無計算紀錄。</p>}
          </div>
        ) : null}
      </section>
    </div>
  );
}

function CalculatorKey({ spec, onPress }: { spec: KeySpec; onPress: (spec: KeySpec) => void }) {
  return <button type="button" className={`premium-calculator-key key-${spec.tone ?? "plain"}`} onClick={() => onPress(spec)}>{spec.action === "delete" ? <Delete size={17} /> : spec.label}</button>;
}

function FractionView({ numerator, denominator }: FractionResult) {
  return <span className="fraction-result-view"><span>{numerator}</span><span aria-hidden="true" /><span>{denominator}</span></span>;
}

function formatCalculatorResult(value: number): string {
  if (Object.is(value, -0) || Math.abs(value) < 1e-12) return "0";
  if (Math.abs(value) >= 1e12 || (Math.abs(value) > 0 && Math.abs(value) < 1e-9)) {
    return value.toExponential(10).replace(/\.0+e/, "e").replace(/(\.\d*?[1-9])0+e/, "$1e");
  }
  return Number(value.toPrecision(12)).toLocaleString("en-US", { maximumFractionDigits: 12, useGrouping: false });
}

function formatResidual(value: number): string {
  return value < 1e-10 ? "< 1×10⁻¹⁰" : formatCalculatorResult(value);
}

function localizeCalculatorError(message: string): string {
  if (message.includes("Invalid calculator expression")) return "算式格式不正確，請檢查括號與運算符號。";
  if (message.includes("Division by zero")) return "分母不可為 0。";
  if (message.includes("Missing variable")) return "一般計算模式不能包含未知數 x。";
  if (message.includes("Invalid square root")) return "根號內必須為非負數。";
  return message;
}

function toReasonableFraction(value: number): FractionResult | null {
  if (!Number.isFinite(value) || Math.abs(value) >= 1e8) return null;
  const sign = value < 0 ? -1 : 1;
  const target = Math.abs(value);
  let bestNumerator = Math.round(target);
  let bestDenominator = 1;
  let bestError = Math.abs(target - bestNumerator);
  for (let denominator = 1; denominator <= 10000; denominator += 1) {
    const numerator = Math.round(target * denominator);
    const error = Math.abs(target - numerator / denominator);
    if (error < bestError) {
      bestNumerator = numerator;
      bestDenominator = denominator;
      bestError = error;
    }
    if (error < 1e-10) break;
  }
  if (bestDenominator === 1 || bestError > 1e-8) return null;
  const divisor = greatestCommonDivisor(bestNumerator, bestDenominator);
  return { numerator: sign * bestNumerator / divisor, denominator: bestDenominator / divisor };
}

function greatestCommonDivisor(a: number, b: number): number {
  let left = Math.abs(Math.trunc(a));
  let right = Math.abs(Math.trunc(b));
  while (right !== 0) {
    const next = left % right;
    left = right;
    right = next;
  }
  return left || 1;
}

function softFeedback(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(5);
}
function successFeedback(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([8, 20, 8]);
}
function errorFeedback(): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([18, 25, 18]);
}
