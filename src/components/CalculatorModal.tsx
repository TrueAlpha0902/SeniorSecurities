import { type KeyboardEvent, type PointerEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Calculator,
  ChevronDown,
  GripHorizontal,
  History,
  LayoutGrid,
  Landmark,
  RotateCcw,
  Sigma,
  X,
} from "lucide-react";
import {
  equationResidual,
  evaluateCalculatorExpression,
  solveEquationForX,
  solveLinearSystem,
  type CalculatorAngleUnit,
} from "../lib/calculatorCore";
import {
  binomialProbability,
  calculateStatistics,
  complexOperate,
  formatBaseResults,
  formatComplex,
  formatMatrix,
  formatNumber,
  matrixDeterminant,
  matrixInverse,
  matrixMultiply,
  normalCdf,
  normalPdf,
  parseIntegerForBase,
  parseMatrix,
  parseVector,
  solveQuadraticInequality,
  solveRatio,
  vectorCross,
  vectorDot,
  vectorMagnitude,
} from "../lib/calculatorAdvanced";
import "../styles/calculator-classwiz-v66.css";

const T = {
  title: "科學財務計算機",
  description: "整合科學函數、方程式、記憶功能與財務公式，操作方式接近 ClassWiz。",
  invalidExpression: "算式格式不正確，請檢查括號、函數或運算符號。",
};

type CalculatorModalProps = { open: boolean; onClose: () => void };
type Position = { x: number; y: number };
type ToolPanel = "advanced" | "solve" | "finance" | "history" | null;
type SolveMode = "single" | "system";
type FinanceMode = "yield" | "capm" | "wacc";
type FractionResult = { numerator: number; denominator: number };
type CalculationSummary = { label: string; value: string; detail: string };
type YieldFields = { faceValue: string; marketPrice: string; annualCoupon: string; years: string };
type CapmFields = { riskFreeRate: string; beta: string; marketReturn: string };
type WaccFields = { equityValue: string; debtValue: string; costOfEquity: string; costOfDebt: string; taxRate: string };
type HistoryRow = { expression: string; result: string; value: number };

type KeySpec = {
  label: string;
  value?: string;
  shiftLabel?: string;
  shiftValue?: string;
  kind?: "function" | "number" | "operator" | "command" | "equals" | "memory";
  action?: "shift" | "angle" | "fraction" | "delete" | "clear" | "calculate" | "memory-plus" | "memory-minus" | "memory-recall" | "memory-clear" | "ans";
  title?: string;
};

const SCIENTIFIC_KEYS: KeySpec[] = [
  { label: "SHIFT", action: "shift", kind: "command", title: "切換黃色第二功能" },
  { label: "DEG", action: "angle", kind: "command", title: "角度單位 DEG / RAD" },
  { label: "S⇔D", action: "fraction", kind: "command", title: "小數與分數切換" },
  { label: "x⁻¹", value: "^(-1)", shiftLabel: "x!", shiftValue: "!", kind: "function" },
  { label: "x²", value: "^2", shiftLabel: "x³", shiftValue: "^3", kind: "function" },
  { label: "xʸ", value: "^", shiftLabel: "ʸ√x", shiftValue: "root(", kind: "function" },
  { label: "√", value: "sqrt(", shiftLabel: "∛", shiftValue: "cbrt(", kind: "function" },
  { label: "log", value: "log(", shiftLabel: "10ˣ", shiftValue: "10^(", kind: "function" },
  { label: "ln", value: "ln(", shiftLabel: "eˣ", shiftValue: "exp(", kind: "function" },
  { label: "sin", value: "sin(", shiftLabel: "sin⁻¹", shiftValue: "asin(", kind: "function" },
  { label: "cos", value: "cos(", shiftLabel: "cos⁻¹", shiftValue: "acos(", kind: "function" },
  { label: "tan", value: "tan(", shiftLabel: "tan⁻¹", shiftValue: "atan(", kind: "function" },
  { label: "(", value: "(", shiftLabel: "Abs", shiftValue: "abs(", kind: "function" },
  { label: ")", value: ")", shiftLabel: ",", shiftValue: ",", kind: "function" },
  { label: "nPr", value: "npr(", shiftLabel: "nCr", shiftValue: "ncr(", kind: "function" },
  { label: "π", value: "π", shiftLabel: "e", shiftValue: "e", kind: "function" },
];

const KEYPAD_KEYS: KeySpec[] = [
  { label: "MC", action: "memory-clear", kind: "memory" },
  { label: "MR", action: "memory-recall", kind: "memory" },
  { label: "M−", action: "memory-minus", kind: "memory" },
  { label: "M+", action: "memory-plus", kind: "memory" },
  { label: "7", value: "7", kind: "number" },
  { label: "8", value: "8", kind: "number" },
  { label: "9", value: "9", kind: "number" },
  { label: "DEL", action: "delete", kind: "command" },
  { label: "AC", action: "clear", kind: "command" },
  { label: "4", value: "4", kind: "number" },
  { label: "5", value: "5", kind: "number" },
  { label: "6", value: "6", kind: "number" },
  { label: "×", value: "*", kind: "operator" },
  { label: "÷", value: "/", kind: "operator" },
  { label: "1", value: "1", kind: "number" },
  { label: "2", value: "2", kind: "number" },
  { label: "3", value: "3", kind: "number" },
  { label: "+", value: "+", kind: "operator" },
  { label: "−", value: "-", kind: "operator" },
  { label: "0", value: "0", kind: "number" },
  { label: ".", value: ".", kind: "number" },
  { label: "×10ˣ", value: "*10^(", kind: "function" },
  { label: "Ans", action: "ans", kind: "memory" },
  { label: "=", action: "calculate", kind: "equals" },
];

const DEFAULT_YIELD_FIELDS: YieldFields = { faceValue: "1000", marketPrice: "950", annualCoupon: "50", years: "5" };
const DEFAULT_CAPM_FIELDS: CapmFields = { riskFreeRate: "2", beta: "1.1", marketReturn: "8" };
const DEFAULT_WACC_FIELDS: WaccFields = { equityValue: "600", debtValue: "400", costOfEquity: "10", costOfDebt: "5", taxRate: "20" };

export function CalculatorModal({ open, onClose }: CalculatorModalProps) {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const [resultValue, setResultValue] = useState<number | null>(null);
  const [fractionResult, setFractionResult] = useState<FractionResult | null>(null);
  const [preferFraction, setPreferFraction] = useState(false);
  const [angleUnit, setAngleUnit] = useState<CalculatorAngleUnit>("deg");
  const [shift, setShift] = useState(false);
  const [memory, setMemory] = useState(0);
  const [ans, setAns] = useState(0);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [toolPanel, setToolPanel] = useState<ToolPanel>(null);
  const [solveMode, setSolveMode] = useState<SolveMode>("single");
  const [singleEquation, setSingleEquation] = useState("2x + 3 = 11");
  const [systemEquations, setSystemEquations] = useState<[string, string]>(["2x + y = 7", "x - y = 2"]);
  const [solveSummary, setSolveSummary] = useState<CalculationSummary | null>(null);
  const [financeMode, setFinanceMode] = useState<FinanceMode>("yield");
  const [yieldFields, setYieldFields] = useState<YieldFields>(DEFAULT_YIELD_FIELDS);
  const [capmFields, setCapmFields] = useState<CapmFields>(DEFAULT_CAPM_FIELDS);
  const [waccFields, setWaccFields] = useState<WaccFields>(DEFAULT_WACC_FIELDS);
  const [financeSummary, setFinanceSummary] = useState<CalculationSummary | null>(null);
  const [error, setError] = useState("");
  const [position, setPosition] = useState<Position>(() => ({ x: 24, y: 82 }));
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const dragStartRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  const displayResult = useMemo(() => {
    if (!result) return "";
    if (preferFraction && fractionResult) return `${fractionResult.numerator}/${fractionResult.denominator}`;
    return result;
  }, [fractionResult, preferFraction, result]);

  useEffect(() => {
    if (!open) return;
    const keepOnScreen = () => setPosition((current) => clampPosition(current, dialogRef.current));
    keepOnScreen();
    window.addEventListener("resize", keepOnScreen);
    return () => window.removeEventListener("resize", keepOnScreen);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const handleKey = (event: globalThis.KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); onClose(); return; }
      if (event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.matches("input, textarea, [contenteditable='true']")) return;
      if (event.key === "Enter" || event.key === "=") { event.preventDefault(); calculate(); }
      else if (event.key === "Backspace") { event.preventDefault(); deleteLast(); }
      else if (event.key === "Delete") { event.preventDefault(); clear(); }
      else if (/^[0-9.+\-*/%^(),!]$/.test(event.key)) { event.preventDefault(); append(event.key); }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  });

  useEffect(() => {
    if (open) window.requestAnimationFrame(() => inputRef.current?.focus({ preventScroll: true }));
  }, [open]);

  if (!open) return null;

  function append(value: string): void {
    setExpression((current) => `${current}${value}`.slice(0, 300));
    setResult(""); setResultValue(null); setFractionResult(null); setError("");
    softFeedback();
  }

  function deleteLast(): void {
    setExpression((current) => current.slice(0, -1));
    setResult(""); setResultValue(null); setFractionResult(null); setError("");
    softFeedback();
  }

  function clear(): void {
    setExpression(""); setResult(""); setResultValue(null); setFractionResult(null); setError("");
    softFeedback();
  }

  function calculate(): number | null {
    if (!expression.trim()) return null;
    try {
      const value = evaluateCalculatorExpression(expression, { ans, mem: memory }, { angleUnit });
      const formatted = formatCalculatorResult(value);
      setResult(formatted);
      setResultValue(value);
      setFractionResult(toReasonableFraction(value));
      setAns(value);
      setError("");
      setHistory((rows) => [{ expression, result: formatted, value }, ...rows.filter((row) => row.expression !== expression)].slice(0, 12));
      successFeedback();
      return value;
    } catch {
      setResult(""); setResultValue(null); setFractionResult(null); setError(T.invalidExpression);
      return null;
    }
  }

  function currentNumericValue(): number | null {
    if (resultValue !== null) return resultValue;
    return calculate();
  }

  function handleKey(spec: KeySpec): void {
    if (spec.action === "shift") { setShift((value) => !value); softFeedback(); return; }
    if (spec.action === "angle") { setAngleUnit((unit) => unit === "deg" ? "rad" : "deg"); softFeedback(); return; }
    if (spec.action === "fraction") { setPreferFraction((value) => !value); softFeedback(); return; }
    if (spec.action === "delete") { deleteLast(); return; }
    if (spec.action === "clear") { clear(); return; }
    if (spec.action === "calculate") { calculate(); return; }
    if (spec.action === "ans") { append("ans"); return; }
    if (spec.action === "memory-recall") { append("mem"); return; }
    if (spec.action === "memory-clear") { setMemory(0); softFeedback(); return; }
    if (spec.action === "memory-plus" || spec.action === "memory-minus") {
      const value = currentNumericValue();
      if (value !== null) setMemory((current) => spec.action === "memory-plus" ? current + value : current - value);
      return;
    }
    const value = shift && spec.shiftValue ? spec.shiftValue : spec.value;
    if (value) append(value);
    if (shift) setShift(false);
  }

  function calculateEquation(): void {
    setError(""); setSolveSummary(null);
    try {
      if (solveMode === "single") {
        const solved = solveEquationForX(singleEquation);
        setSolveSummary({ label: "一元方程式解", value: `x = ${formatCalculatorResult(solved)}`, detail: `代回誤差 ${formatResidual(equationResidual(singleEquation, { x: solved }))}` });
      } else {
        const solved = solveLinearSystem(systemEquations[0], systemEquations[1]);
        setSolveSummary({ label: "二元聯立方程式解", value: `x = ${formatCalculatorResult(solved.x)} / y = ${formatCalculatorResult(solved.y)}`, detail: `最大代回誤差 ${formatResidual(solved.maxResidual)}` });
      }
      successFeedback();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "無法解出方程式。"); }
  }

  function calculateFinance(): void {
    setError(""); setFinanceSummary(null);
    try {
      if (financeMode === "yield") {
        const face = requirePositiveNumber(yieldFields.faceValue, "票面金額");
        const price = requirePositiveNumber(yieldFields.marketPrice, "市價");
        const coupon = requireNonNegativeNumber(yieldFields.annualCoupon, "年息");
        const years = requirePositiveNumber(yieldFields.years, "剩餘年期");
        const ytm = ((coupon + (face - price) / years) / ((face + price) / 2)) * 100;
        setFinanceSummary({ label: "近似到期殖利率", value: formatPercent(ytm), detail: `當期殖利率 ${formatPercent(coupon / price * 100)}` });
      } else if (financeMode === "capm") {
        const rf = requireNumber(capmFields.riskFreeRate, "無風險利率");
        const beta = requireNumber(capmFields.beta, "Beta");
        const rm = requireNumber(capmFields.marketReturn, "市場報酬率");
        setFinanceSummary({ label: "CAPM 必要報酬率", value: formatPercent(rf + beta * (rm - rf)), detail: `市場風險溢酬 ${formatPercent(rm - rf)}` });
      } else {
        const equity = requireNonNegativeNumber(waccFields.equityValue, "權益市值");
        const debt = requireNonNegativeNumber(waccFields.debtValue, "負債市值");
        const re = requireNumber(waccFields.costOfEquity, "權益成本");
        const rd = requireNumber(waccFields.costOfDebt, "負債成本");
        const tax = requireRate(waccFields.taxRate, "稅率");
        const total = equity + debt;
        if (total <= 0) throw new Error("權益與負債不可同時為 0。");
        const wacc = equity / total * re + debt / total * rd * (1 - tax / 100);
        setFinanceSummary({ label: "加權平均資金成本", value: formatPercent(wacc), detail: `權益權重 ${formatPercent(equity / total * 100)} · 負債權重 ${formatPercent(debt / total * 100)}` });
      }
      successFeedback();
    } catch (caught) { setError(caught instanceof Error ? caught.message : "請檢查輸入欄位。"); }
  }

  function handleDragStart(event: PointerEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest("input")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = { pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, originX: position.x, originY: position.y };
  }
  function handleDragMove(event: PointerEvent<HTMLDivElement>): void {
    const start = dragStartRef.current;
    if (!start || start.pointerId !== event.pointerId) return;
    setPosition(clampPosition({ x: start.originX + event.clientX - start.startX, y: start.originY + event.clientY - start.startY }, dialogRef.current));
  }
  function handleDragEnd(event: PointerEvent<HTMLDivElement>): void {
    if (dragStartRef.current?.pointerId !== event.pointerId) return;
    dragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <div ref={dialogRef} className="calculator-classwiz" role="dialog" aria-label={T.title} aria-modal="false" style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}>
      <header className="classwiz-header" onPointerDown={handleDragStart} onPointerMove={handleDragMove} onPointerUp={handleDragEnd} onPointerCancel={handleDragEnd}>
        <div className="classwiz-brand"><Calculator size={20} /><div><span>CLASSWIZ FINANCE</span><strong>{T.title}</strong></div></div>
        <div className="classwiz-header-actions"><GripHorizontal size={21} aria-hidden="true" /><button type="button" onClick={onClose} aria-label="關閉計算機"><X size={20} /></button></div>
      </header>

      <div className="classwiz-body">
        <section className={`classwiz-screen${error ? " has-error" : ""}`} aria-live="polite">
          <div className="classwiz-status"><span>{shift ? "SHIFT" : "COMP"}</span><span>{angleUnit.toUpperCase()}</span><span>{Math.abs(memory) > Number.EPSILON ? "M" : ""}</span></div>
          <input ref={inputRef} value={expression} onChange={(event) => { setExpression(event.target.value.slice(0, 300)); setResult(""); setResultValue(null); setFractionResult(null); setError(""); }} onKeyDown={(event: KeyboardEvent<HTMLInputElement>) => { if (event.key === "Enter") { event.preventDefault(); calculate(); } }} placeholder="輸入算式，例如 sin(30)+√144" autoComplete="off" spellCheck="false" />
          <div className="classwiz-result">{error ? <span className="classwiz-error">{error}</span> : <strong>{displayResult || "0"}</strong>}</div>
          <div className="classwiz-screen-meta"><span>Ans {formatCalculatorResult(ans)}</span><span>M {formatCalculatorResult(memory)}</span></div>
        </section>

        <div className="classwiz-tools" aria-label="計算工具">
          <button type="button" className={toolPanel === "advanced" ? "is-active" : ""} onClick={() => setToolPanel((panel) => panel === "advanced" ? null : "advanced")}><LayoutGrid size={16} />MODE</button>
          <button type="button" className={toolPanel === "solve" ? "is-active" : ""} onClick={() => setToolPanel((panel) => panel === "solve" ? null : "solve")}><Sigma size={16} />方程式</button>
          <button type="button" className={toolPanel === "finance" ? "is-active" : ""} onClick={() => setToolPanel((panel) => panel === "finance" ? null : "finance")}><Landmark size={16} />財務</button>
          <button type="button" className={toolPanel === "history" ? "is-active" : ""} onClick={() => setToolPanel((panel) => panel === "history" ? null : "history")}><History size={16} />歷史</button>
          <span>{T.description}</span>
        </div>

        {toolPanel ? (
          <section className="classwiz-drawer">
            <button type="button" className="classwiz-drawer-close" onClick={() => setToolPanel(null)} aria-label="收合工具"><ChevronDown size={18} /></button>
            {toolPanel === "advanced" ? <AdvancedModePanel angleUnit={angleUnit} /> : null}
            {toolPanel === "solve" ? <SolvePanel mode={solveMode} setMode={setSolveMode} single={singleEquation} setSingle={setSingleEquation} system={systemEquations} setSystem={setSystemEquations} summary={solveSummary} error={error} onCalculate={calculateEquation} /> : null}
            {toolPanel === "finance" ? <FinancePanel mode={financeMode} setMode={setFinanceMode} yieldFields={yieldFields} setYieldFields={setYieldFields} capmFields={capmFields} setCapmFields={setCapmFields} waccFields={waccFields} setWaccFields={setWaccFields} summary={financeSummary} error={error} onCalculate={calculateFinance} /> : null}
            {toolPanel === "history" ? <HistoryPanel rows={history} onUse={(row) => { setExpression(row.expression); setResult(row.result); setResultValue(row.value); setFractionResult(toReasonableFraction(row.value)); setToolPanel(null); }} onClear={() => setHistory([])} /> : null}
          </section>
        ) : null}

        <div className="classwiz-scientific-grid">
          {SCIENTIFIC_KEYS.map((key) => <CalcKey key={`${key.label}-${key.shiftLabel ?? ""}`} spec={key} shift={shift} angleUnit={angleUnit} onClick={() => handleKey(key)} />)}
        </div>
        <div className="classwiz-keypad">
          {KEYPAD_KEYS.map((key) => <CalcKey key={key.label} spec={key} shift={false} angleUnit={angleUnit} onClick={() => handleKey(key)} />)}
        </div>
      </div>
    </div>
  );
}

function CalcKey({ spec, shift, angleUnit, onClick }: { spec: KeySpec; shift: boolean; angleUnit: CalculatorAngleUnit; onClick: () => void }) {
  const label = spec.action === "angle" ? angleUnit.toUpperCase() : shift && spec.shiftLabel ? spec.shiftLabel : spec.label;
  return <button type="button" className={`classwiz-key is-${spec.kind ?? "function"}${shift && spec.shiftLabel ? " is-shifted" : ""}`} title={spec.title} onClick={onClick}>{spec.shiftLabel ? <small>{spec.shiftLabel}</small> : null}<span>{label}</span></button>;
}

function SolvePanel({ mode, setMode, single, setSingle, system, setSystem, summary, error, onCalculate }: { mode: SolveMode; setMode: (mode: SolveMode) => void; single: string; setSingle: (value: string) => void; system: [string, string]; setSystem: (value: [string, string]) => void; summary: CalculationSummary | null; error: string; onCalculate: () => void }) {
  return <div className="classwiz-tool-panel"><div className="classwiz-segmented"><button className={mode === "single" ? "is-active" : ""} onClick={() => setMode("single")}>一元方程式</button><button className={mode === "system" ? "is-active" : ""} onClick={() => setMode("system")}>二元聯立</button></div>{mode === "single" ? <label>方程式<input value={single} onChange={(event) => setSingle(event.target.value)} placeholder="2x + 3 = 11" /></label> : <div className="classwiz-field-grid"><label>方程式 ①<input value={system[0]} onChange={(event) => setSystem([event.target.value, system[1]])} /></label><label>方程式 ②<input value={system[1]} onChange={(event) => setSystem([system[0], event.target.value])} /></label></div>}<ResultSummary summary={summary} error={error} idleText="輸入方程式後求解" /><button className="classwiz-primary" onClick={onCalculate}><Sigma size={17} />求解</button></div>;
}


type AdvancedMode = "complex" | "base" | "matrix" | "vector" | "statistics" | "distribution" | "table" | "ratio" | "inequality";

const ADVANCED_MODES: { id: AdvancedMode; label: string; short: string }[] = [
  { id: "complex", label: "複數", short: "a+bi" },
  { id: "base", label: "進位制", short: "BASE-N" },
  { id: "matrix", label: "矩陣", short: "MAT" },
  { id: "vector", label: "向量", short: "VCT" },
  { id: "statistics", label: "統計", short: "STAT" },
  { id: "distribution", label: "機率分布", short: "DIST" },
  { id: "table", label: "函數表", short: "TABLE" },
  { id: "ratio", label: "比例", short: "RATIO" },
  { id: "inequality", label: "不等式", short: "INEQ" },
];

const DEFAULT_ADVANCED_FIELDS = {
  aRe: "2", aIm: "3", bRe: "1", bIm: "-4", complexOp: "+",
  baseValue: "255", baseRadix: "10",
  matrixA: "1,2;3,4", matrixB: "2,0;1,2", matrixOp: "det",
  vectorA: "1,2,3", vectorB: "4,5,6", vectorOp: "dot",
  statValues: "12, 18, 21, 21, 28",
  distKind: "normal", distX: "1.96", distMean: "0", distSd: "1", distN: "10", distP: "0.5", distK: "5",
  tableExpression: "x^2-2*x+1", tableStart: "-2", tableEnd: "2", tableStep: "1",
  ratioA: "2", ratioB: "3", ratioC: "8",
  ineqA: "1", ineqB: "-5", ineqC: "6", ineqRelation: ">=",
};
type AdvancedFieldKey = keyof typeof DEFAULT_ADVANCED_FIELDS;

function AdvancedModePanel({ angleUnit }: { angleUnit: CalculatorAngleUnit }) {
  const [mode, setMode] = useState<AdvancedMode>("complex");
  const [fields, setFields] = useState({ ...DEFAULT_ADVANCED_FIELDS });
  const [output, setOutput] = useState("選擇模式並輸入資料後計算。");
  const [modeError, setModeError] = useState("");

  function setField(key: AdvancedFieldKey, value: string): void {
    setFields((current) => ({ ...current, [key]: value }));
    setModeError("");
  }

  function numberField(key: AdvancedFieldKey, label: string): number {
    const value = Number(fields[key]);
    if (!Number.isFinite(value)) throw new Error(`${label}需為有效數字。`);
    return value;
  }

  function calculateAdvanced(): void {
    try {
      let nextOutput = "";
      if (mode === "complex") {
        const value = complexOperate(
          { re: numberField("aRe", "A 實部"), im: numberField("aIm", "A 虛部") },
          { re: numberField("bRe", "B 實部"), im: numberField("bIm", "B 虛部") },
          fields.complexOp as "+" | "-" | "*" | "/",
        );
        nextOutput = formatComplex(value);
      } else if (mode === "base") {
        const radix = Number(fields.baseRadix) as 2 | 8 | 10 | 16;
        const values = formatBaseResults(parseIntegerForBase(fields.baseValue, radix));
        nextOutput = `BIN ${values.bin}\nOCT ${values.oct}\nDEC ${values.dec}\nHEX ${values.hex}`;
      } else if (mode === "matrix") {
        const left = parseMatrix(fields.matrixA);
        if (fields.matrixOp === "det") nextOutput = `det(A) = ${formatNumber(matrixDeterminant(left))}`;
        else if (fields.matrixOp === "inverse") nextOutput = formatMatrix(matrixInverse(left));
        else nextOutput = formatMatrix(matrixMultiply(left, parseMatrix(fields.matrixB)));
      } else if (mode === "vector") {
        const left = parseVector(fields.vectorA);
        const right = parseVector(fields.vectorB);
        if (fields.vectorOp === "dot") nextOutput = `A·B = ${formatNumber(vectorDot(left, right))}`;
        else if (fields.vectorOp === "cross") nextOutput = `A×B = [${vectorCross(left, right).map(formatNumber).join(", ")}]`;
        else nextOutput = `|A| = ${formatNumber(vectorMagnitude(left))}\n|B| = ${formatNumber(vectorMagnitude(right))}`;
      } else if (mode === "statistics") {
        const stats = calculateStatistics(fields.statValues);
        nextOutput = `n = ${stats.count}\nΣx = ${formatNumber(stats.sum)}\n平均 = ${formatNumber(stats.mean)}\n中位數 = ${formatNumber(stats.median)}\nσ = ${formatNumber(stats.populationStdDev)}\ns = ${formatNumber(stats.sampleStdDev)}\nMin / Max = ${formatNumber(stats.min)} / ${formatNumber(stats.max)}`;
      } else if (mode === "distribution") {
        if (fields.distKind === "normal") {
          const x = numberField("distX", "x");
          const mean = numberField("distMean", "平均數");
          const sd = numberField("distSd", "標準差");
          nextOutput = `PDF = ${formatNumber(normalPdf(x, mean, sd))}\nCDF P(X≤x) = ${formatNumber(normalCdf(x, mean, sd))}\nz = ${formatNumber((x - mean) / sd)}`;
        } else {
          nextOutput = `P(X=k) = ${formatNumber(binomialProbability(numberField("distN", "n"), numberField("distP", "p"), numberField("distK", "k")))}`;
        }
      } else if (mode === "table") {
        const start = numberField("tableStart", "起點");
        const end = numberField("tableEnd", "終點");
        const step = numberField("tableStep", "間距");
        if (step === 0 || Math.sign(end - start || step) !== Math.sign(step)) throw new Error("函數表的起點、終點與間距方向不一致。");
        const rows: string[] = [];
        for (let x = start, count = 0; count < 40 && (step > 0 ? x <= end + 1e-12 : x >= end - 1e-12); x += step, count += 1) {
          const y = evaluateCalculatorExpression(fields.tableExpression, { x, ans: 0, mem: 0 }, { angleUnit });
          rows.push(`${formatNumber(x)} → ${formatNumber(y)}`);
        }
        nextOutput = rows.join("\n");
      } else if (mode === "ratio") {
        nextOutput = `${fields.ratioA} : ${fields.ratioB} = ${fields.ratioC} : x\nx = ${formatNumber(solveRatio(numberField("ratioA", "a"), numberField("ratioB", "b"), numberField("ratioC", "c")))}`;
      } else {
        nextOutput = solveQuadraticInequality(
          numberField("ineqA", "a"), numberField("ineqB", "b"), numberField("ineqC", "c"),
          fields.ineqRelation as ">" | ">=" | "<" | "<=",
        );
      }
      setOutput(nextOutput);
      setModeError("");
      successFeedback();
    } catch (caught) {
      setModeError(caught instanceof Error ? caught.message : "無法完成計算。");
    }
  }

  return <div className="classwiz-tool-panel classwiz-advanced-panel">
    <div className="classwiz-mode-menu" role="tablist" aria-label="991EX 模式">
      {ADVANCED_MODES.map((item) => <button key={item.id} type="button" className={mode === item.id ? "is-active" : ""} onClick={() => { setMode(item.id); setModeError(""); }}><strong>{item.short}</strong><span>{item.label}</span></button>)}
    </div>
    <div className="classwiz-mode-workspace">
      {mode === "complex" ? <div className="classwiz-field-grid"><FinanceInput label="A 實部" value={fields.aRe} onChange={(value) => setField("aRe", value)} /><FinanceInput label="A 虛部" value={fields.aIm} onChange={(value) => setField("aIm", value)} /><FinanceInput label="B 實部" value={fields.bRe} onChange={(value) => setField("bRe", value)} /><FinanceInput label="B 虛部" value={fields.bIm} onChange={(value) => setField("bIm", value)} /><SelectField label="運算" value={fields.complexOp} onChange={(value) => setField("complexOp", value)} options={[["+", "加"], ["-", "減"], ["*", "乘"], ["/", "除"]]} /></div> : null}
      {mode === "base" ? <div className="classwiz-field-grid"><FinanceInput label="整數" value={fields.baseValue} onChange={(value) => setField("baseValue", value)} /><SelectField label="輸入進位" value={fields.baseRadix} onChange={(value) => setField("baseRadix", value)} options={[["2", "BIN 2"], ["8", "OCT 8"], ["10", "DEC 10"], ["16", "HEX 16"]]} /></div> : null}
      {mode === "matrix" ? <><div className="classwiz-field-grid"><label>矩陣 A<textarea value={fields.matrixA} onChange={(event) => setField("matrixA", event.target.value)} placeholder="1,2;3,4" /></label>{fields.matrixOp === "multiply" ? <label>矩陣 B<textarea value={fields.matrixB} onChange={(event) => setField("matrixB", event.target.value)} /></label> : null}<SelectField label="運算" value={fields.matrixOp} onChange={(value) => setField("matrixOp", value)} options={[["det", "行列式 det(A)"], ["inverse", "反矩陣 A⁻¹"], ["multiply", "A × B"]]} /></div><small className="classwiz-mode-hint">列用分號或換行分隔，欄用逗號分隔；支援最高 3×3。</small></> : null}
      {mode === "vector" ? <div className="classwiz-field-grid"><FinanceInput label="向量 A" value={fields.vectorA} onChange={(value) => setField("vectorA", value)} /><FinanceInput label="向量 B" value={fields.vectorB} onChange={(value) => setField("vectorB", value)} /><SelectField label="運算" value={fields.vectorOp} onChange={(value) => setField("vectorOp", value)} options={[["dot", "內積 A·B"], ["cross", "外積 A×B"], ["magnitude", "向量長度"]]} /></div> : null}
      {mode === "statistics" ? <label>資料列<textarea value={fields.statValues} onChange={(event) => setField("statValues", event.target.value)} placeholder="12, 18, 21, 21, 28" /></label> : null}
      {mode === "distribution" ? <><SelectField label="分布" value={fields.distKind} onChange={(value) => setField("distKind", value)} options={[["normal", "常態分布"], ["binomial", "二項分布"]]} />{fields.distKind === "normal" ? <div className="classwiz-field-grid"><FinanceInput label="x" value={fields.distX} onChange={(value) => setField("distX", value)} /><FinanceInput label="平均數 μ" value={fields.distMean} onChange={(value) => setField("distMean", value)} /><FinanceInput label="標準差 σ" value={fields.distSd} onChange={(value) => setField("distSd", value)} /></div> : <div className="classwiz-field-grid"><FinanceInput label="試驗次數 n" value={fields.distN} onChange={(value) => setField("distN", value)} /><FinanceInput label="成功機率 p" value={fields.distP} onChange={(value) => setField("distP", value)} /><FinanceInput label="成功次數 k" value={fields.distK} onChange={(value) => setField("distK", value)} /></div>}</> : null}
      {mode === "table" ? <div className="classwiz-field-grid"><label className="classwiz-wide-field">f(x)<input value={fields.tableExpression} onChange={(event) => setField("tableExpression", event.target.value)} /></label><FinanceInput label="起點" value={fields.tableStart} onChange={(value) => setField("tableStart", value)} /><FinanceInput label="終點" value={fields.tableEnd} onChange={(value) => setField("tableEnd", value)} /><FinanceInput label="間距" value={fields.tableStep} onChange={(value) => setField("tableStep", value)} /></div> : null}
      {mode === "ratio" ? <div className="classwiz-field-grid"><FinanceInput label="a" value={fields.ratioA} onChange={(value) => setField("ratioA", value)} /><FinanceInput label="b" value={fields.ratioB} onChange={(value) => setField("ratioB", value)} /><FinanceInput label="c" value={fields.ratioC} onChange={(value) => setField("ratioC", value)} /><div className="classwiz-mode-hint">解 a : b = c : x</div></div> : null}
      {mode === "inequality" ? <div className="classwiz-field-grid"><FinanceInput label="a" value={fields.ineqA} onChange={(value) => setField("ineqA", value)} /><FinanceInput label="b" value={fields.ineqB} onChange={(value) => setField("ineqB", value)} /><FinanceInput label="c" value={fields.ineqC} onChange={(value) => setField("ineqC", value)} /><SelectField label="關係" value={fields.ineqRelation} onChange={(value) => setField("ineqRelation", value)} options={[[">", "> 0"], [">=", "≥ 0"], ["<", "< 0"], ["<=", "≤ 0"]]} /><div className="classwiz-mode-hint">解 ax² + bx + c 與 0 的關係。</div></div> : null}
    </div>
    <div className={`classwiz-advanced-output${modeError ? " has-error" : ""}`}><span>{modeError ? "輸入錯誤" : ADVANCED_MODES.find((item) => item.id === mode)?.label}</span><pre>{modeError || output}</pre></div>
    <button type="button" className="classwiz-primary" onClick={calculateAdvanced}><Calculator size={17} />執行計算</button>
  </div>;
}

function SelectField({ label, value, onChange, options }: { label: string; value: string; onChange: (value: string) => void; options: [string, string][] }) {
  return <label>{label}<select value={value} onChange={(event) => onChange(event.target.value)}>{options.map(([optionValue, optionLabel]) => <option key={optionValue} value={optionValue}>{optionLabel}</option>)}</select></label>;
}

function FinancePanel({ mode, setMode, yieldFields, setYieldFields, capmFields, setCapmFields, waccFields, setWaccFields, summary, error, onCalculate }: { mode: FinanceMode; setMode: (mode: FinanceMode) => void; yieldFields: YieldFields; setYieldFields: React.Dispatch<React.SetStateAction<YieldFields>>; capmFields: CapmFields; setCapmFields: React.Dispatch<React.SetStateAction<CapmFields>>; waccFields: WaccFields; setWaccFields: React.Dispatch<React.SetStateAction<WaccFields>>; summary: CalculationSummary | null; error: string; onCalculate: () => void }) {
  return <div className="classwiz-tool-panel"><div className="classwiz-segmented"><button className={mode === "yield" ? "is-active" : ""} onClick={() => setMode("yield")}>債券殖利率</button><button className={mode === "capm" ? "is-active" : ""} onClick={() => setMode("capm")}>CAPM</button><button className={mode === "wacc" ? "is-active" : ""} onClick={() => setMode("wacc")}>WACC</button></div>{mode === "yield" ? <div className="classwiz-field-grid"><FinanceInput label="票面金額" value={yieldFields.faceValue} onChange={(value) => setYieldFields((row) => ({ ...row, faceValue: value }))} /><FinanceInput label="市價" value={yieldFields.marketPrice} onChange={(value) => setYieldFields((row) => ({ ...row, marketPrice: value }))} /><FinanceInput label="年息" value={yieldFields.annualCoupon} onChange={(value) => setYieldFields((row) => ({ ...row, annualCoupon: value }))} /><FinanceInput label="剩餘年期" value={yieldFields.years} onChange={(value) => setYieldFields((row) => ({ ...row, years: value }))} /></div> : null}{mode === "capm" ? <div className="classwiz-field-grid"><FinanceInput label="無風險利率 %" value={capmFields.riskFreeRate} onChange={(value) => setCapmFields((row) => ({ ...row, riskFreeRate: value }))} /><FinanceInput label="Beta" value={capmFields.beta} onChange={(value) => setCapmFields((row) => ({ ...row, beta: value }))} /><FinanceInput label="市場報酬率 %" value={capmFields.marketReturn} onChange={(value) => setCapmFields((row) => ({ ...row, marketReturn: value }))} /></div> : null}{mode === "wacc" ? <div className="classwiz-field-grid"><FinanceInput label="權益市值" value={waccFields.equityValue} onChange={(value) => setWaccFields((row) => ({ ...row, equityValue: value }))} /><FinanceInput label="負債市值" value={waccFields.debtValue} onChange={(value) => setWaccFields((row) => ({ ...row, debtValue: value }))} /><FinanceInput label="權益成本 %" value={waccFields.costOfEquity} onChange={(value) => setWaccFields((row) => ({ ...row, costOfEquity: value }))} /><FinanceInput label="負債成本 %" value={waccFields.costOfDebt} onChange={(value) => setWaccFields((row) => ({ ...row, costOfDebt: value }))} /><FinanceInput label="稅率 %" value={waccFields.taxRate} onChange={(value) => setWaccFields((row) => ({ ...row, taxRate: value }))} /></div> : null}<ResultSummary summary={summary} error={error} idleText="輸入資料後計算" /><button className="classwiz-primary" onClick={onCalculate}><Landmark size={17} />計算</button></div>;
}

function HistoryPanel({ rows, onUse, onClear }: { rows: HistoryRow[]; onUse: (row: HistoryRow) => void; onClear: () => void }) {
  return <div className="classwiz-history"><div className="classwiz-history-head"><strong>最近計算</strong><button type="button" onClick={onClear}><RotateCcw size={15} />清除</button></div>{rows.length ? rows.map((row, index) => <button type="button" key={`${row.expression}-${index}`} onClick={() => onUse(row)}><span>{row.expression}</span><strong>{row.result}</strong></button>) : <p>尚無計算紀錄。</p>}</div>;
}

function FinanceInput({ label, value, onChange }: { label: string; value: string; onChange: (value: string) => void }) { return <label>{label}<input value={value} inputMode="decimal" onChange={(event) => onChange(event.target.value.slice(0, 30))} /></label>; }
function ResultSummary({ summary, error, idleText }: { summary: CalculationSummary | null; error: string; idleText: string }) { return <div className={`classwiz-summary${error ? " has-error" : ""}`}>{error ? <><span>請檢查輸入</span><strong>{error}</strong></> : summary ? <><span>{summary.label}</span><strong>{summary.value}</strong><small>{summary.detail}</small></> : <span>{idleText}</span>}</div>; }

function formatCalculatorResult(value: number): string { if (Object.is(value, -0) || Math.abs(value) < 1e-12) return "0"; if (Math.abs(value) >= 1e12 || (Math.abs(value) > 0 && Math.abs(value) < 1e-9)) return value.toExponential(10).replace(/\.0+e/, "e").replace(/(\.\d*?[1-9])0+e/, "$1e"); return Number(value.toPrecision(12)).toLocaleString("en-US", { maximumFractionDigits: 12, useGrouping: false }); }
function formatResidual(value: number): string { return value < 1e-10 ? "< 1×10⁻¹⁰" : formatCalculatorResult(value); }
function formatPercent(value: number): string { return `${Number(value.toFixed(4)).toLocaleString("zh-TW", { maximumFractionDigits: 4 })}%`; }
function requireNumber(value: string, label: string): number { const parsed = Number(value); if (!Number.isFinite(parsed)) throw new Error(`${label}需為有效數字。`); return parsed; }
function requirePositiveNumber(value: string, label: string): number { const parsed = requireNumber(value, label); if (parsed <= 0) throw new Error(`${label}必須大於 0。`); return parsed; }
function requireNonNegativeNumber(value: string, label: string): number { const parsed = requireNumber(value, label); if (parsed < 0) throw new Error(`${label}不可小於 0。`); return parsed; }
function requireRate(value: string, label: string): number { const parsed = requireNumber(value, label); if (parsed < 0 || parsed > 100) throw new Error(`${label}需介於 0% 至 100%。`); return parsed; }
function toReasonableFraction(value: number): FractionResult | null { if (!Number.isFinite(value) || Math.abs(value) >= 1e8) return null; const sign = value < 0 ? -1 : 1; const target = Math.abs(value); let bestNumerator = Math.round(target); let bestDenominator = 1; let bestError = Math.abs(target - bestNumerator); for (let denominator = 1; denominator <= 10000; denominator += 1) { const numerator = Math.round(target * denominator); const error = Math.abs(target - numerator / denominator); if (error < bestError) { bestNumerator = numerator; bestDenominator = denominator; bestError = error; } if (error < 1e-10) break; } if (bestDenominator === 1 || bestError > 1e-8) return null; const divisor = greatestCommonDivisor(bestNumerator, bestDenominator); return { numerator: sign * bestNumerator / divisor, denominator: bestDenominator / divisor }; }
function greatestCommonDivisor(a: number, b: number): number { let left = Math.abs(Math.trunc(a)); let right = Math.abs(Math.trunc(b)); while (right !== 0) { const next = left % right; left = right; right = next; } return left || 1; }
function clampPosition(position: Position, dialog: HTMLDivElement | null): Position { const width = dialog?.offsetWidth ?? Math.min(610, window.innerWidth - 16); const height = dialog?.offsetHeight ?? Math.min(900, window.innerHeight - 16); const minX = 8; const minY = 8; const maxX = Math.max(minX, window.innerWidth - width - 8); const maxY = Math.max(minY, window.innerHeight - height - 8); return { x: Math.min(maxX, Math.max(minX, position.x)), y: Math.min(maxY, Math.max(minY, position.y)) }; }
function softFeedback(): void { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.(5); }
function successFeedback(): void { if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate?.([8, 24, 8]); }
