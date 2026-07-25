type ModalLoadingFallbackProps = {
  label: string;
};

export function ModalLoadingFallback({ label }: ModalLoadingFallbackProps) {
  return (
    <div className="v93-modal-loading-backdrop" role="status" aria-live="polite">
      <div className="v93-modal-loading-card">
        <span className="loading-spinner" aria-hidden="true" />
        <strong>{label}</strong>
        <small>正在準備介面，請稍候。</small>
      </div>
    </div>
  );
}
