import type { ButtonHTMLAttributes, ReactNode } from "react";
import { Link, type LinkProps } from "react-router-dom";

type ButtonVariant = "primary" | "secondary" | "danger";

function variantClass(variant: ButtonVariant): string {
  if (variant === "primary") {
    return "glass-button-primary";
  }
  if (variant === "danger") {
    return "glass-button-danger";
  }
  return "glass-button-secondary";
}

type GlassButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  children: ReactNode;
  variant?: ButtonVariant;
};

export function GlassButton({ children, variant = "secondary", className = "", type = "button", ...props }: GlassButtonProps) {
  const classes = ["glass-button", variantClass(variant), className].filter(Boolean).join(" ");
  return (
    <button className={classes} type={type} {...props}>
      {children}
    </button>
  );
}

type GlassLinkButtonProps = LinkProps & {
  children: ReactNode;
  variant?: ButtonVariant;
};

export function GlassLinkButton({ children, variant = "secondary", className = "", ...props }: GlassLinkButtonProps) {
  const classes = ["glass-button", variantClass(variant), className].filter(Boolean).join(" ");
  return (
    <Link className={classes} {...props}>
      {children}
    </Link>
  );
}
