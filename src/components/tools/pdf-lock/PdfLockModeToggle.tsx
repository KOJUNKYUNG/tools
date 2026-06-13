"use client";

import type { LockMode } from "@/lib/pdf/pdfLockNaming";
import type { PdfLockLabels } from "./labels";

interface PdfLockModeToggleProps {
  value: LockMode;
  onChange: (next: LockMode) => void;
  labels: PdfLockLabels;
  disabled?: boolean;
}

const ORDER: LockMode[] = ["lock", "unlock"];

export function PdfLockModeToggle({
  value,
  onChange,
  labels,
  disabled = false,
}: PdfLockModeToggleProps) {
  return (
    <div className="flex shrink-0 border-b" style={{ borderColor: "var(--hairline)" }}>
      {ORDER.map((mode) => {
        const active = value === mode;
        const label = mode === "lock" ? labels.modeLock : labels.modeUnlock;
        return (
          <button
            key={mode}
            type="button"
            onClick={() => onChange(mode)}
            disabled={disabled}
            className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50"
            style={{
              color: active ? "var(--ink-strong)" : "var(--ink-soft)",
              borderBottomColor: active ? "var(--emphasis)" : "transparent",
            }}
          >
            {label}
          </button>
        );
      })}
    </div>
  );
}
