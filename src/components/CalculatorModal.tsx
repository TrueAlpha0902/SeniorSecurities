import { type PointerEvent, useEffect, useRef, useState } from "react";
import { GripHorizontal, X } from "lucide-react";
import { GlassButton } from "./GlassButton";
import { GlassCard } from "./GlassCard";

const T = {
  title: "計算機",
  description: "可拖曳視窗位置，避免擋到題目。",
  close: "關閉計算機",
  clear: "清除",
  delete: "刪除",
  calculate: "=",
  error: "算式格式不正確",
};

type CalculatorModalProps = {
  open: boolean;
  onClose: () => void;
};

type Position = {
  x: number;
  y: number;
};

const FUNCTION_KEYS = [
  { label: "√", value: "sqrt(" },
  { label: "x²", value: "^2" },
  { label: "xʸ", value: "^" },
  { label: "(", value: "(" },
  { label: ")", value: ")" },
];

const KEY_ROWS = [
  ["清除", "刪除", "%", "÷"],
  ["7", "8", "9", "×"],
  ["4", "5", "6", "-"],
  ["1", "2", "3", "+"],
  ["0", ".", "="],
] as const;

export function CalculatorModal({ open, onClose }: CalculatorModalProps) {
  const [expression, setExpression] = useState("");
  const [result, setResult] = useState("");
  const [error, setError] = useState("");
  const [position, setPosition] = useState<Position>(() => ({ x: 24, y: 92 }));
  const dragStartRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    setPosition((current) => clampPosition(current));
  }, [open]);

  if (!open) {
    return null;
  }

  function appendValue(value: string): void {
    setExpression((current) => current + value);
    setError("");
  }

  function handleDelete(): void {
    setExpression((current) => current.slice(0, -1));
    setError("");
  }

  function handleClear(): void {
    setExpression("");
    setResult("");
    setError("");
  }

  function handleCalculate(): void {
    if (!expression.trim()) {
      setResult("");
      setError("");
      return;
    }

    try {
      const calculated = evaluateCalculatorExpression(expression);
      setResult(formatCalculatorResult(calculated));
      setError("");
    } catch {
      setResult("");
      setError(T.error);
    }
  }

  function handleDragStart(event: PointerEvent<HTMLDivElement>): void {
    const target = event.target as HTMLElement;
    if (target.closest("button")) {
      return;
    }
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
    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return;
    }
    const nextPosition = {
      x: dragStart.originX + event.clientX - dragStart.startX,
      y: dragStart.originY + event.clientY - dragStart.startY,
    };
    setPosition(clampPosition(nextPosition));
  }

  function handleDragEnd(event: PointerEvent<HTMLDivElement>): void {
    const dragStart = dragStartRef.current;
    if (!dragStart || dragStart.pointerId !== event.pointerId) {
      return;
    }
    dragStartRef.current = null;
    event.currentTarget.releasePointerCapture(event.pointerId);
  }

  return (
    <GlassCard
      className="calculator-floating-dialog"
      as="div"
      role="dialog"
      aria-label={T.title}
      style={{ transform: `translate(${position.x}px, ${position.y}px)` }}
    >
      <div
        className="calculator-drag-header"
        onPointerDown={handleDragStart}
        onPointerMove={handleDragMove}
        onPointerUp={handleDragEnd}
        onPointerCancel={handleDragEnd}
      >
        <div>
          <p className="eyebrow">Calculator</p>
          <h2>{T.title}</h2>
          <p>{T.description}</p>
        </div>
        <div className="calculator-header-actions">
          <GripHorizontal aria-hidden="true" size={22} />
          <button type="button" className="nav-icon-button" aria-label={T.close} title={T.close} onClick={onClose}>
            <X aria-hidden="true" size={20} />
          </button>
        </div>
      </div>

      <div className="calculator-display" aria-live="polite">
        <div className="calculator-expression">{expression || "0"}</div>
        <div className="calculator-output">{error || (result ? `= ${result}` : " ")}</div>
      </div>

      <div className="calculator-function-row" aria-label="進階功能">
        {FUNCTION_KEYS.map((key) => (
          <button key={key.label} type="button" onClick={() => appendValue(key.value)}>
            {key.label}
          </button>
        ))}
      </div>

      <div className="calculator-keypad" aria-label="計算機鍵盤">
        {KEY_ROWS.flat().map((key) => {
          if (key === T.clear) {
            return <button key={key} type="button" className="calculator-command-key" onClick={handleClear}>{T.clear}</button>;
          }
          if (key === T.delete) {
            return <button key={key} type="button" className="calculator-command-key" onClick={handleDelete}>{T.delete}</button>;
          }
          if (key === T.calculate) {
            return (
              <GlassButton key={key} variant="primary" className="calculator-equals-key" onClick={handleCalculate}>
                {T.calculate}
              </GlassButton>
            );
          }
          return (
            <button key={key} type="button" onClick={() => appendValue(normalizeKeyValue(key))}>
              {key}
            </button>
          );
        })}
      </div>
    </GlassCard>
  );
}

function normalizeKeyValue(key: string): string {
  if (key === "×") {
    return "*";
  }
  if (key === "÷") {
    return "/";
  }
  return key;
}

function clampPosition(position: Position): Position {
  if (typeof window === "undefined") {
    return position;
  }
  const maxX = Math.max(12, window.innerWidth - 360);
  const maxY = Math.max(72, window.innerHeight - 520);
  return {
    x: Math.min(Math.max(12, position.x), maxX),
    y: Math.min(Math.max(72, position.y), maxY),
  };
}

function evaluateCalculatorExpression(rawExpression: string): number {
  const normalized = rawExpression
    .replace(/×/g, "*")
    .replace(/÷/g, "/")
    .replace(/％/g, "%")
    .replace(/√/g, "sqrt")
    .replace(/，/g, ",")
    .replace(/,/g, "")
    .replace(/\s+/g, "");

  if (!normalized || /[^0-9.+\-*/%^()sqrt]/.test(normalized)) {
    throw new Error("Invalid calculator expression");
  }

  const matchedTokens = normalized.match(/sqrt|\d*\.?\d+|[()+\-*/%^]/g);
  if (!matchedTokens || matchedTokens.join("") !== normalized) {
    throw new Error("Invalid calculator expression");
  }
  const tokens: string[] = matchedTokens;
  let position = 0;

  function parseExpression(): number {
    let value = parseTerm();
    while (tokens[position] === "+" || tokens[position] === "-") {
      const operator = tokens[position++];
      const right = parseTerm();
      value = operator === "+" ? value + right : value - right;
    }
    return value;
  }

  function parseTerm(): number {
    let value = parsePower();
    while (tokens[position] === "*" || tokens[position] === "/") {
      const operator = tokens[position++];
      const right = parsePower();
      if (operator === "/" && right === 0) {
        throw new Error("Invalid calculator expression");
      }
      value = operator === "*" ? value * right : value / right;
    }
    return value;
  }

  function parsePower(): number {
    let value = parseFactor();
    if (tokens[position] === "^") {
      position += 1;
      value = Math.pow(value, parsePower());
    }
    if (!Number.isFinite(value)) {
      throw new Error("Invalid calculator expression");
    }
    return value;
  }

  function parseFactor(): number {
    let value: number;
    const token = tokens[position];

    if (token === "+") {
      position += 1;
      value = parseFactor();
    } else if (token === "-") {
      position += 1;
      value = -parseFactor();
    } else if (token === "sqrt") {
      position += 1;
      if (tokens[position] !== "(") {
        throw new Error("Invalid calculator expression");
      }
      position += 1;
      value = parseExpression();
      if (tokens[position] !== ")" || value < 0) {
        throw new Error("Invalid calculator expression");
      }
      position += 1;
      value = Math.sqrt(value);
    } else if (token === "(") {
      position += 1;
      value = parseExpression();
      if (tokens[position] !== ")") {
        throw new Error("Invalid calculator expression");
      }
      position += 1;
    } else if (token && /\d/.test(token)) {
      position += 1;
      value = Number(token);
    } else {
      throw new Error("Invalid calculator expression");
    }

    while (tokens[position] === "%") {
      position += 1;
      value /= 100;
    }

    if (!Number.isFinite(value)) {
      throw new Error("Invalid calculator expression");
    }
    return value;
  }

  const result = parseExpression();
  if (position !== tokens.length || !Number.isFinite(result)) {
    throw new Error("Invalid calculator expression");
  }
  return result;
}

function formatCalculatorResult(value: number): string {
  return Number.isInteger(value) ? value.toString() : Number(value.toFixed(10)).toString();
}
