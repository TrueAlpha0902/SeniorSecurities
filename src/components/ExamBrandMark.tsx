import { useId } from "react";

export type ExamBrandKind = "certificate" | "securities" | "foreign-exchange";

type ExamBrandMarkProps = {
  kind: ExamBrandKind;
  size?: number;
  title?: string;
  className?: string;
};

export function ExamBrandMark({
  kind,
  size = 42,
  title,
  className = "",
}: ExamBrandMarkProps) {
  const filterId = useId().replace(/:/g, "");
  return (
    <span
      className={`v90-brand-logo is-${kind}${className ? ` ${className}` : ""}`}
      role={title ? "img" : undefined}
      aria-label={title}
      aria-hidden={title ? undefined : true}
      style={{ width: size, height: size }}
    >
      <svg
        width={size}
        height={size}
        viewBox="0 0 56 56"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <defs>
          <filter id={filterId} x="-18%" y="-18%" width="136%" height="136%">
            <feTurbulence
              type="fractalNoise"
              baseFrequency="0.025 0.095"
              numOctaves="1"
              seed="29"
              result="noise"
            />
            <feDisplacementMap
              in="SourceGraphic"
              in2="noise"
              scale="0.42"
              xChannelSelector="R"
              yChannelSelector="G"
            />
          </filter>
        </defs>
        <g
          className="v90-logo-art"
          filter={`url(#${filterId})`}
          stroke="currentColor"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          {kind === "certificate" ? (
            <>
              <path d="m7 15 21-10 21 10-21 10L7 15Z" />
              <path d="M13 19v24c8-2 16-1 23 2V21" />
              <path d="M19 28h12M19 34h12" />
              <path d="M42 17v14" />
              <path d="M39 31h6l-1 7-2-2-2 2-1-7Z" />
            </>
          ) : null}
          {kind === "securities" ? (
            <>
              <path d="M7 37c7-4 14-4 21 0v12c-7-4-14-4-21 0V37Z" />
              <path d="M28 37c7-4 14-4 21 0v12c-7-4-14-4-21 0V37Z" />
              <path d="M28 37v12" />
              <path d="M12 30V20m8 10V13m8 17V18m8 12V9m8 21V5" />
              <path className="v90-logo-emphasis" d="m10 24 10-9 8 5 8-10 10-5" />
              <path className="v90-logo-emphasis" d="m41 5 7-2-2 7" />
            </>
          ) : null}
          {kind === "foreign-exchange" ? (
            <>
              <circle cx="28" cy="28" r="16" />
              <ellipse cx="28" cy="28" rx="7" ry="16" />
              <path d="M12 28h32M15 20c9 4 17 4 26 0M15 36c9-4 17-4 26 0" />
              <path className="v90-logo-emphasis" d="M10 14C18 5 34 3 45 10" />
              <path className="v90-logo-emphasis" d="m41 6 6 4-7 2" />
              <path className="v90-logo-emphasis" d="M46 42c-8 9-24 11-35 4" />
              <path className="v90-logo-emphasis" d="m15 50-6-4 7-2" />
            </>
          ) : null}
        </g>
      </svg>
    </span>
  );
}
