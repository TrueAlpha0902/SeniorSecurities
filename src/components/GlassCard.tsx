import type { HTMLAttributes, ReactNode } from "react";

type GlassCardProps = HTMLAttributes<HTMLElement> & {
  children: ReactNode;
  interactive?: boolean;
  as?: "article" | "section" | "div";
};

export function GlassCard({ children, interactive = false, as: Element = "section", className = "", ...props }: GlassCardProps) {
  const classes = ["glass-card", interactive ? "glass-card-interactive" : "", className].filter(Boolean).join(" ");
  return (
    <Element className={classes} {...props}>
      {children}
    </Element>
  );
}
