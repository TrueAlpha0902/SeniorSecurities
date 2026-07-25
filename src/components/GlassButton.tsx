import {
  forwardRef,
  type ButtonHTMLAttributes,
  type ReactNode,
} from "react";
import { Link, type LinkProps } from "react-router-dom";

type ButtonVariant = "primary" | "secondary" | "danger";

function variantClass(variant: ButtonVariant): string {
  if (variant === "primary") return "glass-button-primary";
  if (variant === "danger") return "glass-button-danger";
  return "glass-button-secondary";
}

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
  busy?: boolean;
};

export const GlassButton = forwardRef<HTMLButtonElement, GlassButtonProps>(
  function GlassButton(
    {
      children,
      variant = "secondary",
      className = "",
      type = "button",
      busy = false,
      disabled,
      ...props
    },
    ref,
  ) {
    const classes = ["glass-button", variantClass(variant), className]
      .filter(Boolean)
      .join(" ");
    return (
      <button
        ref={ref}
        className={classes}
        type={type}
        disabled={disabled || busy}
        aria-busy={busy || undefined}
        data-busy={busy ? "true" : undefined}
        {...props}
      >
        {busy ? <span className="v93-button-spinner" aria-hidden="true" /> : null}
        {children}
      </button>
    );
  },
);

type GlassLinkButtonProps = LinkProps & {
  children: ReactNode;
  variant?: ButtonVariant;
};

export function GlassLinkButton({ children, variant = "secondary", className = "", ...props }: GlassLinkButtonProps) {
  const classes = ["glass-button", variantClass(variant), className].filter(Boolean).join(" ");
  return <Link className={classes} {...props}>{children}</Link>;
}
