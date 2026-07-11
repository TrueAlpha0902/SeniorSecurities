import { type KeyboardEvent, type PointerEvent, useEffect, useRef, useState } from "react";
import {
  Calculator,
  Delete,
  GripHorizontal,
  Landmark,
  RotateCcw,
  Sigma,
  Sparkles,
  X,
} from "lucide-react";
import {
  equationResidual,
  evaluateCalculatorExpression,
  solveEquationForX,
  solveLinearSystem,
} from "../lib/calculatorCore";
import "../styles/calculator-pro-v65.css";

const T = {
  title: "工程財務計算機",
  description: "一般運算、方程式與常用財務模型，所有算式都在裝置端安全計算。",
  close: "關閉計算機",
  clear: "AC",
  delete: "刪除一字元",
  calculate: "=",
  invalidExpression: "算式格式不正確，請檢查括號與運算符號。",
};

type CalculatorModalProps = {
  open: boolean;
  onClose: () => void;
};

type Position = {
  x: number;
  y: number;
};

type Mode = "basic" | "solve" | "finance";
type SolveMode = "single" | "system";
type FinanceMode = "yield" | "capm" | "wacc";

type FractionResult = {
  numerator: number;
  denominator: number;
};

type CalculationSummary = {
  label: string;
  value: string;
  detail: string;
};

type YieldFields = {
  faceValue: string;
  marketPrice: string;
  annualCoupon: string;
  years: string;
};

type CapmFields = {
  riskFreeRate: string;
  beta: string;
  marketReturn: string;
};

type WaccFields = {
  equityValue: string;
  debtValue: string;
  costOfEquity: string;
  costOfDebt: string;
  taxRate: string;
};

const FUNCTION_KEYS = [
  { label: "√", value: "sqrt(", title: "平方根" },
  { label: "x²", value: "^2", title: "平方" },
  { label: "xʸ", value: "^", title: "次方" },
  { label: "π", value: "π", title: "圓周率" },
  { label: "(", value: "(", title: "左括號" },
  { label: ")", value: ")", title: "右括號" },
] as const;

const KEYPAD_KEYS = [
  { label: "AC", value: "clear", kind: "command" },
  { label: "⌫", value: "delete", kind: "command", ariaLabel: T.delete },
  { label: "%", value: "%", kind: "operator" },
  { label: "÷", value: "/", kind: "operator" },
  { label: "7", value: "7" },
  { label: "8", value: "8" },
  { label: "9", value: "9" },
  { label: "×", value: "*", kind: "operator" },
  { label: "4", value: "4" },
  { label: "5", value: "5" },
  { label: "6", value: "6" },
  { label: "−", value: "-", kind: "operator" },
  { label: "1", value: "1" },
  { label: "2", value: "2" },
  { label: "3", value: "3" },
  { label: "+", value: "+", kind: "operator" },
  { label: "0", value: "0", kind: "zero" },
  { label: ".", value: "." },
  { label: "=", value: "calculate", kind: "equals" },
] as const;

const DEFAULT_YIELD_FIELDS: YieldFields = {
  faceValue: "1000",
  marketPrice: "950",
  annualCoupon: "50",
  years: "5",
};

const DEFAULT_CAPM_FIELDS: CapmFields = {
  riskFreeRate: "2",
  beta: "1.1",
  marketReturn: "8",
};

const DEFAULT_WACC_FIELDS: WaccFields = {
  equityValue: "600",
  debtValue: "400",
  costOfEquity: "10",
  costOfDebt: "5",
  taxRate: "20",
};

export function CalculatorModal({ open, onClose }: CalculatorModalProps) {
  const [mode, setMode] = useState<Mode>("basic");
  const [expression, setExpression] = useState("");
  const [basicResult, setBasicResult] = useState("");
  const [fractionResult, setFractionResult] = useState<FractionResult | null>(null);
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
  const [position, setPosition] = useState<Position>(() => ({ x: 24, y: 92 }));
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const expressionInputRef = useRef<HTMLInputElement | null>(null);
  const dragStartRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);

  useEffect(() => {
    if (!open) return;

    const keepDialogOnScreen = () => {
      setPosition((current) => clampPosition(current, dialogRef.current));
    };

    keepDialogOnScreen();
    window.addEventListener("resize", keepDialogOnScreen);
    return () => window.removeEventListener("resize", keepDialogOnScreen);
  }, [open]);

  useEffect(() => {
    if (!open) return;

    function calculateFromKeyboard(): void {
      if (!expression.trim()) {
        setBasicResult("");
        setFractionResult(null);
        setError("");
        return;
      }

      try {
        const calculated = evaluateCalculatorExpression(expression);
        setBasicResult(formatCalculatorResult(calculated));
        setFractionResult(toReasonableFraction(calculated));
        setError("");
        successFeedback();
      } catch {
        setBasicResult("");
        setFractionResult(null);
        setError(T.invalidExpression);
      }
    }

    function handleGlobalKeyDown(event: globalThis.KeyboardEvent): void {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        return;
      }

      if (mode !== "basic" || event.ctrlKey || event.metaKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      const isExpressionInput = target === expressionInputRef.current;

      if (isExpressionInput) return;

      if (target?.matches("input, textarea, [contenteditable='true']")) return;

      if (event.key === "Enter" || event.key === "=") {
        event.preventDefault();
        calculateFromKeyboard();
      } else if (event.key === "Backspace") {
        event.preventDefault();
        setExpression((current) => current.slice(0, -1));
        setBasicResult("");
        setFractionResult(null);
        setError("");
        softFeedback();
      } else if (event.key === "Delete") {
        event.preventDefault();
        setExpression("");
        setBasicResult("");
        setFractionResult(null);
        setError("");
        softFeedback();
      } else if (/^[0-9.+\-*/%^()]$/.test(event.key)) {
        event.preventDefault();
        setExpression((current) => `${current}${event.key}`.slice(0, 160));
        setBasicResult("");
        setFractionResult(null);
        setError("");
        softFeedback();
      }
    }

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [expression, mode, onClose, open]);

  useEffect(() => {
    if (open && mode === "basic") {
      window.requestAnimationFrame(() => expressionInputRef.current?.focus({ preventScroll: true }));
    }
  }, [mode, open]);

  if (!open) return null;

  function switchMode(nextMode: Mode): void {
    setMode(nextMode);
    setError("");
    softFeedback();
  }

  function appendValue(value: string): void {
    setExpression((current) => `${current}${value}`.slice(0, 160));
    setBasicResult("");
    setFractionResult(null);
    setError("");
    softFeedback();
  }

  function deleteLastCharacter(): void {
    setExpression((current) => current.slice(0, -1));
    setBasicResult("");
    setFractionResult(null);
    setError("");
    softFeedback();
  }

  function clearBasicExpression(): void {
    setExpression("");
    setBasicResult("");
    setFractionResult(null);
    setError("");
    softFeedback();
  }

  function calculateBasicExpression(): void {
    if (!expression.trim()) {
      clearBasicExpression();
      return;
    }

    try {
      const calculated = evaluateCalculatorExpression(expression);
      setBasicResult(formatCalculatorResult(calculated));
      setFractionResult(toReasonableFraction(calculated));
      setError("");
      successFeedback();
    } catch {
      setBasicResult("");
      setFractionResult(null);
      setError(T.invalidExpression);
    }
  }

  function handleExpressionKeyDown(event: KeyboardEvent<HTMLInputElement>): void {
    if (event.key === "Enter") {
      event.preventDefault();
      calculateBasicExpression();
    }
  }

  function handleKeypadAction(value: string): void {
    if (value === "clear") {
      clearBasicExpression();
    } else if (value === "delete") {
      deleteLastCharacter();
    } else if (value === "calculate") {
      calculateBasicExpression();
    } else {
      appendValue(value);
    }
  }

  function calculateEquation(): void {
    setError("");
    setSolveSummary(null);

    try {
      if (solveMode === "single") {
        const solved = solveEquationForX(singleEquation);
        const residual = equationResidual(singleEquation, { x: solved });
        setSolveSummary({
          label: "一元方程式解",
          value: `x = ${formatCalculatorResult(solved)}`,
          detail: `代回原式的誤差 ${formatResidual(residual)}`,
        });
      } else {
        const solved = solveLinearSystem(systemEquations[0], systemEquations[1]);
        setSolveSummary({
          label: "二元聯立方程式解",
          value: `x = ${formatCalculatorResult(solved.x)} / y = ${formatCalculatorResult(solved.y)}`,
          detail: `兩式代回誤差皆小於 ${formatResidual(solved.maxResidual)}`,
        });
      }
      successFeedback();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "目前無法解出這組方程式。");
    }
  }

  function calculateFinance(): void {
    setError("");
    setFinanceSummary(null);

    try {
      if (financeMode === "yield") {
        const faceValue = requirePositiveNumber(yieldFields.faceValue, "票面金額");
        const marketPrice = requirePositiveNumber(yieldFields.marketPrice, "市價");
        const annualCoupon = requireNonNegativeNumber(yieldFields.annualCoupon, "年息");
        const years = requirePositiveNumber(yieldFields.years, "剩餘年期");
        const approximateYield = (
          (annualCoupon + (faceValue - marketPrice) / years)
          / ((faceValue + marketPrice) / 2)
        ) * 100;
        const currentYield = (annualCoupon / marketPrice) * 100;
        setFinanceSummary({
          label: "近似到期殖利率（YTM）",
          value: formatPercent(approximateYield),
          detail: `當期殖利率 ${formatPercent(currentYield)} · 此為年付息債券近似值`,
        });
      } else if (financeMode === "capm") {
        const riskFreeRate = requireNumber(capmFields.riskFreeRate, "無風險利率");
        const beta = requireNumber(capmFields.beta, "Beta");
        const marketReturn = requireNumber(capmFields.marketReturn, "市場報酬率");
        const marketRiskPremium = marketReturn - riskFreeRate;
        const expectedReturn = riskFreeRate + beta * marketRiskPremium;
        setFinanceSummary({
          label: "CAPM 必要報酬率",
          value: formatPercent(expectedReturn),
          detail: `市場風險溢酬 ${formatPercent(marketRiskPremium)} · β ${formatCalculatorResult(beta)}`,
        });
      } else {
        const equityValue = requireNonNegativeNumber(waccFields.equityValue, "權益市值");
        const debtValue = requireNonNegativeNumber(waccFields.debtValue, "負債市值");
        const costOfEquity = requireNumber(waccFields.costOfEquity, "權益成本");
        const costOfDebt = requireNumber(waccFields.costOfDebt, "負債成本");
        const taxRate = requireRate(waccFields.taxRate, "稅率");
        const capital = equityValue + debtValue;
        if (capital <= 0) throw new Error("權益市值與負債市值不可同時為 0。");
        const equityWeight = equityValue / capital;
        const debtWeight = debtValue / capital;
        const wacc = equityWeight * costOfEquity + debtWeight * costOfDebt * (1 - taxRate / 100);
        setFinanceSummary({
          label: "加權平均資金成本（WACC）",
          value: formatPercent(wacc),
          detail: `權益權重 ${formatPercent(equityWeight * 100)} · 負債權重 ${formatPercent(debtWeight * 100)}`,
        });
      }
      successFeedback();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : "請檢查輸入欄位。");
    }
  }

  function resetFinanceExample(): void {
    if (financeMode === "yield") setYieldFields(DEFAULT_YIELD_FIELDS);
    if (financeMode === "capm") setCapmFields(DEFAULT_CAPM_FIELDS);
    if (financeMode === "wacc") setWaccFields(DEFAULT_WACC_FIELDS);
    setFinanceSummary(null);
    setError("");
    softFeedback();
  }

  function handleDragStart(event: PointerEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    if (target.closest("button") || target.closest("input") || target.closest("textarea")) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    dragStartRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: position.x,
      originY: position.y,
    };
  }

  function handleDragMove(event: PointerEvent<HTMLDivElement>): void {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    setPosition(clampPosition({
      x: dragStart.originX + event.clientX - dragStart.startX,
      y: dragStart.originY + event.clientY - dragStart.startY,
    }, dialogRef.current));
  }

  function handleDragEnd(event: PointerEvent<HTMLDivElement>): void {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) return;
    dragStartRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  return (
    <div
      ref={dialogRef}
      className="glass-card calculator-floating-dialog calculator-pro-dialog"
      role="dialog"
      aria-label={T.title}
      aria-modal="false"
      style={{ transform: `translate3d(${position.x}px, ${position.y}px, 0)` }}
    >
      <div
        className="calculator-drag-header calculator-pro-header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div className="calculator-pro-heading">
          <span className="calculator-pro-mark" aria-hidden="true"><Calculator size={20} /></span>
          <div>
            <p className="calculator-pro-eyebrow">FINANCE CALCULATOR <span>PRO</span></p>
            <h2>{T.title}</h2>
            <p>{T.description}</p>
          </div>
        </div>
        <div className="calculator-header-actions">
          <GripHorizontal className="calculator-drag-icon" aria-hidden="true" size={22} />
          <button type="button" className="calculator-close-button" aria-label={T.close} title={T.close} onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      <div className="calculator-pro-body">
        <div className="calculator-mode-tabs" aria-label="計算機模式">
          <ModeButton active={mode === "basic"} onClick={() => switchMode("basic")} icon={<Calculator size={17} />} label="工程運算" />
          <ModeButton active={mode === "solve"} onClick={() => switchMode("solve")} icon={<Sigma size={17} />} label="解方程式" />
          <ModeButton active={mode === "finance"} onClick={() => switchMode("finance")} icon={<Landmark size={17} />} label="財務公式" />
        </div>

        {mode === "basic" ? (
          <section className="calculator-mode-panel" aria-label="工程運算">
            <div className={`calculator-display calculator-natural-display${error ? " has-error" : ""}`} aria-live="polite">
              <label className="sr-only" htmlFor="calculator-expression-input">輸入算式</label>
              <input
                id="calculator-expression-input"
                ref={expressionInputRef}
                className="calculator-expression-input"
                value={expression}
                onChange={(event) => {
                  setExpression(event.target.value.slice(0, 160));
                  setBasicResult("");
                  setFractionResult(null);
                  setError("");
                }}
                onKeyDown={handleExpressionKeyDown}
                placeholder="例如：(1250 × 1.08) + √144"
                autoComplete="off"
                spellCheck="false"
                inputMode="text"
              />
              <div className="calculator-output">
                {error ? <span className="calculator-error-text">{error}</span> : null}
                {!error && basicResult ? <CalculatorResult value={basicResult} fraction={fractionResult} /> : null}
                {!error && !basicResult ? <span className="calculator-idle-result">按 Enter 或 = 計算</span> : null}
              </div>
            </div>

            <div className="calculator-keyboard-hint">支援實體鍵盤：Enter 計算、Backspace 刪除、Delete 清除</div>

            <div className="calculator-function-row" aria-label="工程函數">
              {FUNCTION_KEYS.map((key) => (
                <button key={key.label} type="button" title={key.title} onClick={() => appendValue(key.value)}>
                  {key.label}
                </button>
              ))}
            </div>

            <div className="calculator-keypad" aria-label="計算機鍵盤">
              {KEYPAD_KEYS.map((key) => (
                <button
                  key={key.label}
                  type="button"
                  aria-label={"ariaLabel" in key ? key.ariaLabel : key.label}
                  className={`calculator-key calculator-key-${"kind" in key ? key.kind : "number"}`}
                  onClick={() => handleKeypadAction(key.value)}
                >
                  {key.value === "delete" ? <Delete aria-hidden="true" size={20} /> : key.label}
                </button>
              ))}
            </div>
          </section>
        ) : null}

        {mode === "solve" ? (
          <section className="calculator-mode-panel solve-equation-panel" aria-label="解方程式">
            <div className="calculator-subtabs" aria-label="方程式類型">
              <button type="button" className={solveMode === "single" ? "active" : ""} onClick={() => { setSolveMode("single"); setError(""); setSolveSummary(null); }}>
                一元 x
              </button>
              <button type="button" className={solveMode === "system" ? "active" : ""} onClick={() => { setSolveMode("system"); setError(""); setSolveSummary(null); }}>
                二元 x / y
              </button>
            </div>

            <div className="calculator-guide-card">
              <div>
                <span className="calculator-guide-icon" aria-hidden="true"><Sparkles size={18} /></span>
                <div>
                  <strong>{solveMode === "single" ? "一元方程式" : "二元一次聯立方程式"}</strong>
                  <p>{solveMode === "single" ? "可解線性與常見財務型非線性算式。" : "每一式都需使用 =，支援省略乘號，如 2x + y。"}</p>
                </div>
              </div>
            </div>

            {solveMode === "single" ? (
              <>
                <EquationInput
                  label="方程式"
                  value={singleEquation}
                  onChange={(value) => { setSingleEquation(value); setSolveSummary(null); setError(""); }}
                  onEnter={calculateEquation}
                  placeholder="2x + 3 = 11"
                />
                <div className="calculator-example-row" aria-label="一元方程式範例">
                  <span>快速範例</span>
                  <button type="button" onClick={() => setSingleEquation("2x + 3 = 11")}>2x + 3 = 11</button>
                  <button type="button" onClick={() => setSingleEquation("100/(1+x)^2 = 90")}>殖利率型</button>
                </div>
              </>
            ) : (
              <>
                <EquationInput
                  label="方程式 ①"
                  value={systemEquations[0]}
                  onChange={(value) => { setSystemEquations((current) => [value, current[1]]); setSolveSummary(null); setError(""); }}
                  onEnter={calculateEquation}
                  placeholder="2x + y = 7"
                />
                <EquationInput
                  label="方程式 ②"
                  value={systemEquations[1]}
                  onChange={(value) => { setSystemEquations((current) => [current[0], value]); setSolveSummary(null); setError(""); }}
                  onEnter={calculateEquation}
                  placeholder="x - y = 2"
                />
                <div className="calculator-example-row" aria-label="聯立方程式範例">
                  <span>快速範例</span>
                  <button type="button" onClick={() => setSystemEquations(["2x + y = 7", "x - y = 2"])}>載入範例</button>
                </div>
              </>
            )}

            <ResultSummary summary={solveSummary} error={error} idleText="輸入方程式後即可求解" />

            <div className="calculator-panel-actions">
              <button type="button" className="calculator-primary-action" onClick={calculateEquation}>
                <Sigma aria-hidden="true" size={18} />求解
              </button>
              <button type="button" className="calculator-secondary-action" onClick={() => { setSolveSummary(null); setError(""); }}>
                <RotateCcw aria-hidden="true" size={17} />清除結果
              </button>
            </div>
          </section>
        ) : null}

        {mode === "finance" ? (
          <section className="calculator-mode-panel finance-calculator-panel" aria-label="財務公式">
            <div className="calculator-subtabs finance-subtabs" aria-label="財務計算模式">
              <button type="button" className={financeMode === "yield" ? "active" : ""} onClick={() => { setFinanceMode("yield"); setFinanceSummary(null); setError(""); }}>殖利率</button>
              <button type="button" className={financeMode === "capm" ? "active" : ""} onClick={() => { setFinanceMode("capm"); setFinanceSummary(null); setError(""); }}>CAPM</button>
              <button type="button" className={financeMode === "wacc" ? "active" : ""} onClick={() => { setFinanceMode("wacc"); setFinanceSummary(null); setError(""); }}>WACC</button>
            </div>

            <FinanceFormulaGuide mode={financeMode} onReset={resetFinanceExample} />

            {financeMode === "yield" ? (
              <div className="finance-input-grid">
                <FinanceInput label="票面金額 F" suffix="元" value={yieldFields.faceValue} onChange={(value) => setYieldFields((current) => ({ ...current, faceValue: value }))} onEnter={calculateFinance} />
                <FinanceInput label="債券市價 P" suffix="元" value={yieldFields.marketPrice} onChange={(value) => setYieldFields((current) => ({ ...current, marketPrice: value }))} onEnter={calculateFinance} />
                <FinanceInput label="每年利息 C" suffix="元" value={yieldFields.annualCoupon} onChange={(value) => setYieldFields((current) => ({ ...current, annualCoupon: value }))} onEnter={calculateFinance} />
                <FinanceInput label="剩餘年期 n" suffix="年" value={yieldFields.years} onChange={(value) => setYieldFields((current) => ({ ...current, years: value }))} onEnter={calculateFinance} />
              </div>
            ) : null}

            {financeMode === "capm" ? (
              <div className="finance-input-grid finance-input-grid-three">
                <FinanceInput label="無風險利率 Rf" suffix="%" value={capmFields.riskFreeRate} onChange={(value) => setCapmFields((current) => ({ ...current, riskFreeRate: value }))} onEnter={calculateFinance} />
                <FinanceInput label="Beta β" value={capmFields.beta} onChange={(value) => setCapmFields((current) => ({ ...current, beta: value }))} onEnter={calculateFinance} />
                <FinanceInput label="市場報酬率 Rm" suffix="%" value={capmFields.marketReturn} onChange={(value) => setCapmFields((current) => ({ ...current, marketReturn: value }))} onEnter={calculateFinance} />
              </div>
            ) : null}

            {financeMode === "wacc" ? (
              <div className="finance-input-grid">
                <FinanceInput label="權益市值 E" value={waccFields.equityValue} onChange={(value) => setWaccFields((current) => ({ ...current, equityValue: value }))} onEnter={calculateFinance} />
                <FinanceInput label="負債市值 D" value={waccFields.debtValue} onChange={(value) => setWaccFields((current) => ({ ...current, debtValue: value }))} onEnter={calculateFinance} />
                <FinanceInput label="權益成本 Re" suffix="%" value={waccFields.costOfEquity} onChange={(value) => setWaccFields((current) => ({ ...current, costOfEquity: value }))} onEnter={calculateFinance} />
                <FinanceInput label="稅前負債成本 Rd" suffix="%" value={waccFields.costOfDebt} onChange={(value) => setWaccFields((current) => ({ ...current, costOfDebt: value }))} onEnter={calculateFinance} />
                <FinanceInput label="公司稅率 T" suffix="%" value={waccFields.taxRate} onChange={(value) => setWaccFields((current) => ({ ...current, taxRate: value }))} onEnter={calculateFinance} />
              </div>
            ) : null}

            <ResultSummary summary={financeSummary} error={error} idleText="欄位已載入範例值，可直接計算" />

            <div className="calculator-panel-actions">
              <button type="button" className="calculator-primary-action" onClick={calculateFinance}>
                <Calculator aria-hidden="true" size={18} />計算結果
              </button>
              <button type="button" className="calculator-secondary-action" onClick={resetFinanceExample}>
                <RotateCcw aria-hidden="true" size={17} />還原範例
              </button>
            </div>
          </section>
        ) : null}
      </div>
    </div>
  );
}

function ModeButton({ active, onClick, icon, label }: { active: boolean; onClick: () => void; icon: React.ReactNode; label: string }) {
  return (
    <button type="button" className={active ? "active" : ""} aria-pressed={active} onClick={onClick}>
      {icon}<span>{label}</span>
    </button>
  );
}

function EquationInput({
  label,
  value,
  onChange,
  onEnter,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (value: string) => void;
  onEnter: () => void;
  placeholder: string;
}) {
  return (
    <label className="solve-input-label">
      <span>{label}</span>
      <input
        value={value}
        onChange={(event) => onChange(event.target.value.slice(0, 180))}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            onEnter();
          }
        }}
        placeholder={placeholder}
        autoComplete="off"
        spellCheck="false"
      />
    </label>
  );
}

function FinanceInput({
  label,
  value,
  suffix,
  onChange,
  onEnter,
}: {
  label: string;
  value: string;
  suffix?: string;
  onChange: (value: string) => void;
  onEnter: () => void;
}) {
  return (
    <label className="finance-input-label">
      <span>{label}</span>
      <span className="finance-input-control">
        <input
          value={value}
          inputMode="decimal"
          onChange={(event) => onChange(event.target.value.slice(0, 30))}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              onEnter();
            }
          }}
          placeholder="輸入數值"
          autoComplete="off"
        />
        {suffix ? <span>{suffix}</span> : null}
      </span>
    </label>
  );
}

function FinanceFormulaGuide({ mode, onReset }: { mode: FinanceMode; onReset: () => void }) {
  const content = mode === "yield"
    ? { title: "近似到期殖利率", formula: "[ C + (F − P) ÷ n ] ÷ [ (F + P) ÷ 2 ]", note: "適合快速估算年付息債券；實際 YTM 仍以現金流折現求解為準。" }
    : mode === "capm"
      ? { title: "資本資產定價模型", formula: "Re = Rf + β × (Rm − Rf)", note: "以無風險利率、市場風險溢酬與 Beta 推估必要報酬率。" }
      : { title: "加權平均資金成本", formula: "WACC = E/V × Re + D/V × Rd × (1 − T)", note: "V = E + D；負債成本使用稅後成本，權重採市場價值。" };

  return (
    <div className="calculator-guide-card finance-formula-guide">
      <div>
        <span className="calculator-guide-icon" aria-hidden="true"><Landmark size={18} /></span>
        <div>
          <strong>{content.title}</strong>
          <code>{content.formula}</code>
          <p>{content.note}</p>
        </div>
      </div>
      <button type="button" onClick={onReset}>套用範例</button>
    </div>
  );
}

function ResultSummary({ summary, error, idleText }: { summary: CalculationSummary | null; error: string; idleText: string }) {
  return (
    <div className={`calculator-result-card${error ? " has-error" : ""}`} aria-live="polite">
      {error ? (
        <>
          <span>請檢查輸入</span>
          <strong>{error}</strong>
        </>
      ) : summary ? (
        <>
          <span>{summary.label}</span>
          <strong>{summary.value}</strong>
          <small>{summary.detail}</small>
        </>
      ) : (
        <>
          <span>計算結果</span>
          <strong className="calculator-result-idle">{idleText}</strong>
        </>
      )}
    </div>
  );
}

function CalculatorResult({ value, fraction }: { value: string; fraction: FractionResult | null }) {
  if (!fraction || fraction.denominator === 1) {
    return <span className="calculator-result-number">= {value}</span>;
  }
  return (
    <span className="calculator-result-with-fraction">
      <span className="calculator-result-number">= {value}</span>
      <span className="calculator-fraction-chip" title="分數近似值">
        ≈ <StackedFraction numerator={fraction.numerator} denominator={fraction.denominator} />
      </span>
    </span>
  );
}

function StackedFraction({ numerator, denominator }: { numerator: string | number; denominator: string | number }) {
  return (
    <span className="stacked-fraction" aria-label={`${numerator} 除以 ${denominator}`}>
      <span>{numerator}</span>
      <span>{denominator}</span>
    </span>
  );
}

function clampPosition(position: Position, dialog: HTMLElement | null): Position {
  if (typeof window === "undefined") return position;
  const dialogWidth = dialog?.offsetWidth ?? Math.min(620, Math.max(320, window.innerWidth - 24));
  const dialogHeight = dialog?.offsetHeight ?? Math.min(760, Math.max(360, window.innerHeight - 68));
  const maxX = Math.max(8, window.innerWidth - dialogWidth - 8);
  const maxY = Math.max(56, window.innerHeight - dialogHeight - 8);
  return {
    x: Math.min(Math.max(8, position.x), maxX),
    y: Math.min(Math.max(56, position.y), maxY),
  };
}

function softFeedback(): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate(5);
  }
}

function successFeedback(): void {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    navigator.vibrate([7, 20, 7]);
  }
}

function requireNumber(value: string, label: string): number {
  const normalized = value.trim().replace(/,/g, "");
  if (!normalized) throw new Error(`請輸入${label}。`);
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed)) throw new Error(`${label}必須是有效數字。`);
  return parsed;
}

function requirePositiveNumber(value: string, label: string): number {
  const parsed = requireNumber(value, label);
  if (parsed <= 0) throw new Error(`${label}必須大於 0。`);
  return parsed;
}

function requireNonNegativeNumber(value: string, label: string): number {
  const parsed = requireNumber(value, label);
  if (parsed < 0) throw new Error(`${label}不可小於 0。`);
  return parsed;
}

function requireRate(value: string, label: string): number {
  const parsed = requireNumber(value, label);
  if (parsed < 0 || parsed > 100) throw new Error(`${label}必須介於 0% 到 100%。`);
  return parsed;
}

function formatCalculatorResult(value: number): string {
  const normalized = Math.abs(value) < 1e-12 ? 0 : value;
  if (Math.abs(normalized) >= 1e12 || (Math.abs(normalized) > 0 && Math.abs(normalized) < 1e-8)) {
    return normalized.toExponential(8).replace(/\.?(?:0+)e/, "e");
  }
  return Number.isInteger(normalized)
    ? normalized.toLocaleString("zh-TW")
    : Number(normalized.toFixed(10)).toLocaleString("zh-TW", { maximumFractionDigits: 10 });
}

function formatPercent(value: number): string {
  return `${Number(value.toFixed(4)).toLocaleString("zh-TW", { maximumFractionDigits: 4 })}%`;
}

function formatResidual(value: number): string {
  return value < 1e-10 ? "1 × 10⁻¹⁰" : formatCalculatorResult(value);
}

function toReasonableFraction(value: number): FractionResult | null {
  if (!Number.isFinite(value) || Math.abs(value) > 1_000_000) return null;
  const sign = value < 0 ? -1 : 1;
  const absolute = Math.abs(value);
  let bestNumerator = Math.round(absolute);
  let bestDenominator = 1;
  let bestError = Math.abs(absolute - bestNumerator);

  for (let denominator = 2; denominator <= 999; denominator += 1) {
    const numerator = Math.round(absolute * denominator);
    const error = Math.abs(absolute - numerator / denominator);
    if (error < bestError) {
      bestError = error;
      bestNumerator = numerator;
      bestDenominator = denominator;
    }
    if (error < 1e-10) break;
  }

  if (bestDenominator === 1 || bestError > 1e-8) return null;
  const divisor = gcd(bestNumerator, bestDenominator);
  return {
    numerator: sign * (bestNumerator / divisor),
    denominator: bestDenominator / divisor,
  };
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y) {
    const remainder = x % y;
    x = y;
    y = remainder;
  }
  return x || 1;
}
