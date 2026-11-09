"use client";

import { useEffect, useId, useRef } from "react";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  body: string;
  /** Goes ahead with what the dialog asks about. */
  confirmLabel: string;
  /** Closes the dialog without going ahead; Esc and the backdrop do the same. */
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * A question asked before an action whose outcome the user may not expect,
 * such as image-to-pptx's warning that some slides' pictures fall off the
 * slide. A native modal `<dialog>`: it traps focus, closes on Esc and sits
 * over the page, so nothing under it moves. Flat per DESIGN.md.
 */
export function ConfirmDialog({ open, title, body, confirmLabel, cancelLabel, onConfirm, onCancel }: ConfirmDialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const id = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-body`}
      // Esc closes a dialog natively; route it through the caller instead.
      onCancel={(e) => {
        e.preventDefault();
        onCancel();
      }}
      // A click on the backdrop lands on the dialog element itself.
      onClick={(e) => {
        if (e.target === e.currentTarget) onCancel();
      }}
      className="m-auto w-[min(420px,calc(100vw-32px))] rounded-[4px] border p-0 backdrop:bg-black/40"
      style={{ background: "var(--surface)", borderColor: "var(--border)", color: "var(--ink)" }}
    >
      <div className="flex flex-col gap-3 p-5">
        <h2
          id={`${id}-title`}
          className="font-ko text-[15px] font-medium leading-[1.3]"
          style={{ color: "var(--headline)" }}
        >
          {title}
        </h2>
        <p id={`${id}-body`} className="font-body text-[13px] leading-[1.5]">
          {body}
        </p>
        <div className="mt-1 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="subtle-action rounded-[5px] px-3 py-1.5 font-body text-[12px]"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="btn-primary rounded-[5px] px-3 py-1.5 font-body text-[12px] font-semibold"
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </dialog>
  );
}
