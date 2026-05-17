"use client";

import type { BgMode } from "@/lib/ppt/changeBackground";

interface ModeSelectorProps {
  value: BgMode;
  onChange: (next: BgMode) => void;
  labels: {
    optionAll: string;
    optionMaster: string;
    optionSpecific: string;
  };
}

const ORDER: BgMode[] = ["all-slides", "master", "specific-slides"];

export function ModeSelector({ value, onChange, labels }: ModeSelectorProps) {
  return (
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
  );
}
