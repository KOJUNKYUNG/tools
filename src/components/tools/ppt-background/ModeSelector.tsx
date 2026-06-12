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
    <div className="flex border-b" style={{ borderColor: "var(--hairline)" }}>
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
            className="flex-1 border-b-2 py-2 font-body text-[12px] font-medium transition-colors"
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
