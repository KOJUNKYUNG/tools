"use client";

import { GRID_POSITIONS, type GridPosition } from "@/lib/pdf/overlayLayout";

interface PositionGridProps {
  value: GridPosition;
  onChange: (next: GridPosition) => void;
  label: string;
  disabled?: boolean;
}

// GRID_POSITIONS is already in natural 3×3 reading order
// (top-left … bottom-right), so it maps straight onto the grid.
export function PositionGrid({ value, onChange, label, disabled }: PositionGridProps) {
  return (
    <div className="space-y-1.5">
      <p
        className="font-mono text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {label}
      </p>
      <div
        className="grid w-[78px] grid-cols-3 gap-1 rounded-[6px] border p-1"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        {GRID_POSITIONS.map((pos) => {
          const active = value === pos;
          return (
            <button
              key={pos}
              type="button"
              aria-label={pos}
              aria-pressed={active}
              disabled={disabled}
              onClick={() => onChange(pos)}
              className="flex size-5 items-center justify-center rounded-[3px] transition-colors disabled:cursor-not-allowed disabled:opacity-50"
              style={{
                background: active ? "var(--emphasis)" : "var(--surface)",
                border: "1px solid var(--border)",
              }}
            >
              <span
                className="block size-1.5 rounded-full"
                style={{ background: active ? "var(--surface)" : "var(--ink-soft)" }}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
}
