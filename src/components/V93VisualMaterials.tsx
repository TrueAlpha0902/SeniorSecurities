import type { ReactNode } from "react";
import { ExamBrandMark, type ExamBrandKind } from "./ExamBrandMark";

type V93BrandLockupProps = {
  kind: ExamBrandKind;
  title: string;
  subtitle: string;
  className?: string;
  compact?: boolean;
};

export function V93BrandLockup({
  kind,
  title,
  subtitle,
  className = "",
  compact = false,
}: V93BrandLockupProps) {
  const classes = [
    "v93-brand-lockup",
    `is-${kind}`,
    compact ? "is-compact" : "",
    className,
  ].filter(Boolean).join(" ");

  return (
    <span className={classes}>
      <span className="v93-brand-mark" aria-hidden="true">
        <ExamBrandMark kind={kind} size={compact ? 30 : 42} />
      </span>
      <span className="v93-brand-copy">
        <strong>{title}</strong>
        <small>{subtitle}</small>
      </span>
    </span>
  );
}

export function V93SectionTitle({
  children,
  className = "",
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`v93-section-title${className ? ` ${className}` : ""}`}>
      <span className="v93-section-marker" aria-hidden="true" />
      <span>{children}</span>
    </span>
  );
}

export type V93StateIllustrationKind =
  | "empty"
  | "error"
  | "search"
  | "offline"
  | "complete";

export function V93StateIllustration({
  kind = "empty",
}: {
  kind?: V93StateIllustrationKind;
}) {
  return (
    <span className={`v93-state-illustration is-${kind}`} aria-hidden="true">
      <svg viewBox="0 0 160 120" fill="none">
        <path className="v93-material-faint" d="M23 98c33 7 78 8 116-2" />
        {kind === "empty" ? (
          <>
            <rect x="35" y="28" width="88" height="62" rx="13" />
            <path d="M51 48h54M51 62h38M51 76h28" />
            <path className="v93-material-accent" d="m112 27 4-10 4 10 10 4-10 4-4 10-4-10-10-4 10-4Z" />
          </>
        ) : null}
        {kind === "error" ? (
          <>
            <path d="M80 19 130 98H30L80 19Z" />
            <path className="v93-material-accent" d="M80 48v24" />
            <circle className="v93-material-accent" cx="80" cy="83" r="2.5" />
          </>
        ) : null}
        {kind === "search" ? (
          <>
            <circle cx="69" cy="55" r="27" />
            <path d="m89 75 24 24" />
            <path className="v93-material-accent" d="M56 55h26M69 42v26" />
          </>
        ) : null}
        {kind === "offline" ? (
          <>
            <path d="M35 54c26-24 64-24 90 0" />
            <path d="M51 71c17-15 41-15 58 0" />
            <path d="M67 87c8-7 18-7 26 0" />
            <path className="v93-material-accent" d="m39 28 82 72" />
          </>
        ) : null}
        {kind === "complete" ? (
          <>
            <circle cx="80" cy="59" r="39" />
            <path className="v93-material-accent" d="m58 60 15 15 31-34" />
            <path d="m39 30-9-6M123 33l9-7M36 84l-10 5M125 85l9 6" />
          </>
        ) : null}
      </svg>
    </span>
  );
}

export type V93AnswerStatus = "correct" | "wrong";

export function V93AnswerBadge({ status }: { status: V93AnswerStatus }) {
  const correct = status === "correct";
  const label = correct ? "正解" : "錯誤";
  const symbol = correct ? "✓" : "×";

  return (
    <span
      className={`answer-result-label v93-answer-badge is-${status}`}
      role="status"
      aria-label={label}
    >
      <span className="v93-answer-symbol" aria-hidden="true">{symbol}</span>
      <span>{label}</span>
    </span>
  );
}
