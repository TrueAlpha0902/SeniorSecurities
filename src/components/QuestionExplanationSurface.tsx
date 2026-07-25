import type { ReactNode } from "react";

type QuestionExplanationSurfaceProps = {
  children: ReactNode;
  className?: string;
  summary?: ReactNode;
  title?: string;
  role?: "status" | "region";
};

export function QuestionExplanationSurface({
  children,
  className = "",
  summary,
  title = "解析",
  role = "region",
}: QuestionExplanationSurfaceProps) {
  return (
    <section
      className={["unified-explanation-surface", className].filter(Boolean).join(" ")}
      role={role}
      aria-label={title}
    >
      {summary}
      <h2>{title}</h2>
      <div className="unified-explanation-content">{children}</div>
    </section>
  );
}
