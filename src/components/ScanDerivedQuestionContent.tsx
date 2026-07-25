import { type ReactNode } from "react";
import type { ImageQuizQuestion, NumericAnswer } from "../lib/imageQuiz";
import { formatAnswerKey, formatLearnerText } from "../lib/learnerText";

type ScanContentProps = {
  question: ImageQuizQuestion;
  label: string;
  prominent?: boolean;
};

export function ScanQuestionContent({
  question,
  label,
  prominent = false,
}: ScanContentProps) {
  const text = question.questionText?.trim();

  return (
    <section
      className={`scan-text-question${prominent ? " is-prominent" : ""}`}
      aria-label={label}
    >
      {text && question.optionTexts ? (
        <StructuredScanText text={text} />
      ) : (
        <ScanTextUnavailable kind="question" />
      )}
    </section>
  );
}

export function ScanExplanationContent({
  question,
  label,
}: ScanContentProps) {
  const text = question.explanationText?.trim();

  return (
    <section className="scan-text-explanation" aria-label={label}>
      {text ? (
        <StructuredScanText text={text} />
      ) : (
        <ScanTextUnavailable kind="explanation" />
      )}
    </section>
  );
}

export function ScanOptionText({
  question,
  answer,
}: {
  question: ImageQuizQuestion;
  answer: NumericAnswer;
}) {
  const text = question.optionTexts?.[answer]?.trim();
  return text ? <span className="answer-option-text">{formatLearnerText(text)}</span> : null;
}

export function ScanStaticOptionList({
  question,
}: {
  question: ImageQuizQuestion;
}) {
  if (!question.optionTexts) return null;
  const answers: NumericAnswer[] = ["1", "2", "3", "4"];
  return (
    <ol className="scan-static-options" aria-label="題目選項">
      {answers.map((answer) => (
        <li
          key={answer}
          className={answer === question.answer ? "is-correct" : undefined}
        >
          <span>{formatAnswerKey(answer)}</span>
          <p>{formatLearnerText(question.optionTexts?.[answer] ?? "")}</p>
        </li>
      ))}
    </ol>
  );
}

function ScanTextUnavailable({
  kind,
}: {
  kind: "question" | "explanation";
}) {
  return (
    <p className="scan-text-unavailable" role="status">
      {kind === "question"
        ? "題目文字暫時無法顯示，請重新整理後再試。"
        : "解析文字暫時無法顯示，請稍後再試。"}
    </p>
  );
}

export function StructuredScanText({ text }: { text: string }) {
  const blocks = toBlocks(formatLearnerText(text));
  return (
    <div className="structured-scan-text">
      {blocks.map((block, blockIndex) =>
        isMarkdownTable(block) ? (
          <ScanTable key={`table-${blockIndex}`} lines={block} />
        ) : (
          <p key={`paragraph-${blockIndex}`}>{renderPlainBlock(block)}</p>
        ),
      )}
    </div>
  );
}

function toBlocks(text: string): string[][] {
  const blocks: string[][] = [];
  let current: string[] = [];
  for (const rawLine of text.replace(/\r\n?/g, "\n").split("\n")) {
    const line = rawLine.trimEnd();
    if (!line.trim()) {
      if (current.length) blocks.push(current);
      current = [];
      continue;
    }
    current.push(line);
  }
  if (current.length) blocks.push(current);
  return blocks.length ? blocks : [[text]];
}

function isMarkdownTable(lines: string[]): boolean {
  if (lines.length < 2) return false;
  const separator = lines[1];
  return Boolean(
    separator &&
      /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(separator) &&
      lines.every((line) => line.trim().startsWith("|")),
  );
}

function parseCells(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  return trimmed.split("|").map((cell) => cell.trim());
}

function ScanTable({ lines }: { lines: string[] }) {
  const header = parseCells(lines[0] ?? "");
  const body = lines.slice(2).map(parseCells);
  return (
    <div className="scan-table-scroll" tabIndex={0}>
      <table className="scan-text-table">
        <thead>
          <tr>
            {header.map((cell, index) => (
              <th key={`${index}-${cell}`} scope="col">
                {cell}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {body.map((row, rowIndex) => (
            <tr key={`row-${rowIndex}`}>
              {row.map((cell, cellIndex) => (
                <td key={`${rowIndex}-${cellIndex}`}>{cell}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function renderPlainBlock(lines: string[]): ReactNode {
  return lines.map((line, index) => (
    <span key={`${index}-${line.slice(0, 24)}`}>
      {line}
      {index < lines.length - 1 ? <br /> : null}
    </span>
  ));
}
