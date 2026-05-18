import { useEffect, useState } from "react";

interface ConfirmationModalProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  nodeId?: string;
  onCancel: () => void;
  onConfirm: () => void;
}

function ConfirmationModal({
  open,
  title,
  description,
  confirmLabel = "Delete",
  cancelLabel = "Cancel",
  nodeId = "17034:780",
  onCancel,
  onConfirm,
}: ConfirmationModalProps) {
  const [shouldRender, setShouldRender] = useState(open);

  useEffect(() => {
    if (open) {
      setShouldRender(true);
      return;
    }

    const timeout = window.setTimeout(() => {
      setShouldRender(false);
    }, 190);
    return () => window.clearTimeout(timeout);
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onCancel();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onCancel, open]);

  if (!shouldRender) {
    return null;
  }

  return (
    <div
      className={open ? "confirmationOverlay" : "confirmationOverlay is-leaving"}
      role="presentation"
      onPointerDown={onCancel}
    >
      <div
        className={open ? "confirmationModal" : "confirmationModal is-leaving"}
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirmation-title"
        aria-describedby="confirmation-description"
        data-node-id={nodeId}
        data-name="Confirmation modal"
        onPointerDown={(event) => event.stopPropagation()}
      >
        <div className="confirmationCopy" data-node-id="17034:781">
          <h2 id="confirmation-title" data-node-id="17034:782">
            {title}
          </h2>
          <p id="confirmation-description" data-node-id="17034:783">
            {description}
          </p>
        </div>
        <div className="confirmationActions" data-node-id="17034:784">
          <button
            className="confirmationButton secondary"
            type="button"
            onClick={onCancel}
            data-node-id="17034:785"
          >
            {cancelLabel}
          </button>
          <button
            className="confirmationButton primary"
            type="button"
            onClick={onConfirm}
            data-node-id="17034:786"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

export default ConfirmationModal;
