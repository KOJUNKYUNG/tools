"use client";

import type { BgMode } from "@/lib/ppt/changeBackground";

interface ModeSelectorProps {
  value: BgMode;
  onChange: (next: BgMode) => void;
  labels: {
    label: string;          // "적용 범위"
    optionAll: string;
    optionMaster: string;
    optionSpecific: string;
  };
}

const ORDER: BgMode[] = ["all-slides", "master", "specific-slides"];

export function ModeSelector({ value, onChange, labels }: ModeSelectorProps) {
  return (
    <div>
      <div
        className="mb-1.5 font-display text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {labels.label}
      </div>
      <div
        className="flex overflow-hidden rounded-[6px] border"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        {ORDER.map((mode) => {
          const active = value === mode;
          const label =
            mode === "all-slides"
              ? labels.optionAll
              : mode === "master"
                ? labels.optionMaster
                : labels.optionSpecific;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              className="flex-1 py-2 font-display text-[12px] font-medium transition-colors"
              style={{
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                boxShadow: active ? "inset 0 -2px 0 var(--accent-electric)" : undefined,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
