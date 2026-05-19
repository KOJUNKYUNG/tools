"use client";

import { LockIcon, UnlockIcon } from "lucide-react";

interface ImageResizeControlsProps {
  widthLabel: string;
  heightLabel: string;
  lockAspectLabel: string;
  unlockAspectLabel: string;
  cropToggleLabel: string;
  cropToggleHint: string;
  widthValue: string;
  heightValue: string;
  onWidthChange: (next: string) => void;
  onHeightChange: (next: string) => void;
  lockAspect: boolean;
  onToggleLock: () => void;
  cropEnabled: boolean;
  onToggleCropEnabled: () => void;
}

export function ImageResizeControls({
  widthLabel,
  heightLabel,
  lockAspectLabel,
  unlockAspectLabel,
  cropToggleLabel,
  cropToggleHint,
  widthValue,
  heightValue,
  onWidthChange,
  onHeightChange,
  lockAspect,
  onToggleLock,
  cropEnabled,
  onToggleCropEnabled,
}: ImageResizeControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label
            className="mb-1 block font-display text-[11px] font-medium"
            style={{ color: "var(--ink-soft)" }}
            htmlFor="ir-w"
          >
            {widthLabel}
          </label>
          <input
            id="ir-w"
            type="number"
            min={1}
            value={widthValue}
            onChange={(e) => onWidthChange(e.target.value)}
            className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }}
          />
        </div>
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={lockAspect}
          aria-label={lockAspect ? unlockAspectLabel : lockAspectLabel}
          title={lockAspect ? unlockAspectLabel : lockAspectLabel}
          className="mb-0.5 rounded-[5px] border p-1.5 transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
          }}
        >
          {lockAspect ? (
            <LockIcon
              className="size-3.5"
              style={{ color: "var(--accent-electric)" }}
            />
          ) : (
            <UnlockIcon
              className="size-3.5"
              style={{ color: "var(--ink-soft)" }}
            />
          )}
        </button>
        <div className="flex-1">
          <label
            className="mb-1 block font-display text-[11px] font-medium"
            style={{ color: "var(--ink-soft)" }}
            htmlFor="ir-h"
          >
            {heightLabel}
          </label>
          <input
            id="ir-h"
            type="number"
            min={1}
            value={heightValue}
            onChange={(e) => onHeightChange(e.target.value)}
            className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={cropEnabled}
          onChange={onToggleCropEnabled}
          className="mt-0.5 size-4 accent-[color:var(--accent-electric)]"
        />
        <span className="font-body text-[11.5px]" style={{ color: "var(--ink)" }}>
          <span
            className="font-display font-medium"
            style={{ color: "var(--ink-strong)" }}
          >
            {cropToggleLabel}
          </span>
          <span className="ml-1" style={{ color: "var(--ink-soft)" }}>
            — {cropToggleHint}
          </span>
        </span>
      </label>
    </div>
  );
}
