import {
  AlertTriangle,
  CheckCircle2,
  Eye,
  EyeOff,
  Info,
  X,
} from "lucide-react";
import {
  useId,
  useRef,
  useState,
  type ChangeEventHandler,
  type ReactNode,
} from "react";
import { useDialogFocusTrap } from "../hooks/useDialogFocusTrap";
import { GlassButton } from "./GlassButton";

export type V93NoticeTone = "info" | "success" | "warning" | "error";

export function V93InlineNotice({
  children,
  tone = "info",
  id,
  className = "",
}: {
  children: ReactNode;
  tone?: V93NoticeTone;
  id?: string;
  className?: string;
}) {
  const Icon = tone === "success"
    ? CheckCircle2
    : tone === "warning" || tone === "error"
      ? AlertTriangle
      : Info;

  return (
    <div
      id={id}
      className={`v93-inline-notice is-${tone}${className ? ` ${className}` : ""}`}
      role={tone === "error" ? "alert" : "status"}
      aria-live={tone === "error" ? "assertive" : "polite"}
      aria-atomic="true"
    >
      <Icon aria-hidden="true" size={18} />
      <span>{children}</span>
    </div>
  );
}

type V93PasswordFieldProps = {
  label: string;
  value: string;
  onChange: ChangeEventHandler<HTMLInputElement>;
  autoComplete: "current-password" | "new-password";
  placeholder?: string;
  minLength?: number;
  required?: boolean;
  disabled?: boolean;
  invalid?: boolean;
  hint?: string;
  describedBy?: string;
  name?: string;
};

export function V93PasswordField({
  label,
  value,
  onChange,
  autoComplete,
  placeholder,
  minLength,
  required = false,
  disabled = false,
  invalid = false,
  hint,
  describedBy,
  name,
}: V93PasswordFieldProps) {
  const generatedId = useId();
  const inputId = `v93-password-${generatedId.replace(/:/g, "")}`;
  const hintId = hint ? `${inputId}-hint` : undefined;
  const [visible, setVisible] = useState(false);
  const combinedDescription = [describedBy, hintId].filter(Boolean).join(" ") || undefined;

  return (
    <div className="v93-form-field">
      <label htmlFor={inputId}>{label}</label>
      <div className="v93-password-control">
        <input
          id={inputId}
          name={name}
          type={visible ? "text" : "password"}
          autoComplete={autoComplete}
          value={value}
          required={required}
          minLength={minLength}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          aria-describedby={combinedDescription}
          onChange={onChange}
          placeholder={placeholder}
        />
        <button
          type="button"
          className="v93-password-toggle"
          aria-label={visible ? "隱藏密碼" : "顯示密碼"}
          aria-pressed={visible}
          disabled={disabled}
          onClick={() => setVisible((current) => !current)}
        >
          {visible
            ? <EyeOff aria-hidden="true" size={18} />
            : <Eye aria-hidden="true" size={18} />}
        </button>
      </div>
      {hint ? <small id={hintId}>{hint}</small> : null}
    </div>
  );
}

type V93ConfirmDialogProps = {
  open: boolean;
  title: string;
  message: ReactNode;
  confirmLabel: string;
  cancelLabel?: string;
  tone?: "primary" | "danger";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

export function V93ConfirmDialog({
  open,
  title,
  message,
  confirmLabel,
  cancelLabel = "取消",
  tone = "danger",
  busy = false,
  onConfirm,
  onCancel,
}: V93ConfirmDialogProps) {
  const titleId = useId();
  const messageId = useId();
  const overlayRef = useRef<HTMLDivElement>(null);
  const cancelRef = useRef<HTMLButtonElement>(null);
  useDialogFocusTrap(open, overlayRef, cancelRef, busy ? undefined : onCancel);

  if (!open) return null;

  return (
    <div
      ref={overlayRef}
      className="v93-confirm-backdrop"
      role="presentation"
      onMouseDown={(event) => {
        if (!busy && event.target === event.currentTarget) onCancel();
      }}
    >
      <section
        className={`v93-confirm-dialog is-${tone}`}
        role="alertdialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={messageId}
        tabIndex={-1}
      >
        <header>
          <span className="v93-confirm-icon" aria-hidden="true">
            {tone === "danger"
              ? <AlertTriangle size={22} />
              : <Info size={22} />}
          </span>
          <div>
            <h2 id={titleId}>{title}</h2>
            <div id={messageId}>{message}</div>
          </div>
          <button
            type="button"
            aria-label="關閉確認視窗"
            disabled={busy}
            onClick={onCancel}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>
        <footer>
          <GlassButton
            ref={cancelRef}
            variant="secondary"
            disabled={busy}
            onClick={onCancel}
          >
            {cancelLabel}
          </GlassButton>
          <GlassButton
            variant={tone === "danger" ? "danger" : "primary"}
            busy={busy}
            disabled={busy}
            onClick={onConfirm}
          >
            {confirmLabel}
          </GlassButton>
        </footer>
      </section>
    </div>
  );
}
