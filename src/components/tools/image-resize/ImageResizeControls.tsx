"use client";

import { LockIcon, RotateCcwIcon, UnlockIcon } from "lucide-react";
import { useState } from "react";
import { MAX_DIMENSION } from "@/lib/image/resizeImage";

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
  originalSizeLabel: string;
  revertToOriginalLabel: string;
  origDims: { w: number; h: number } | null;
  onRevertToOriginal: () => void;
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
  originalSizeLabel,
  revertToOriginalLabel,
  origDims,
  onRevertToOriginal,
}: ImageResizeControlsProps) {
  const [localW, setLocalW] = useState(widthValue);
  const [localH, setLocalH] = useState(heightValue);
  const [wFocused, setWFocused] = useState(false);
  const [hFocused, setHFocused] = useState(false);

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
            max={MAX_DIMENSION}
            value={wFocused ? localW : widthValue}
            onFocus={() => {
              setWFocused(true);
              setLocalW(widthValue);
            }}
            onChange={(e) => setLocalW(e.target.value)}
            onBlur={() => {
              setWFocused(false);
              const parsed = parseInt(localW || "0", 10);
              if (Number.isNaN(parsed) || parsed <= 0) {
                if (localW !== widthValue) onWidthChange(localW);
                return;
              }
              const clamped = String(Math.min(MAX_DIMENSION, Math.max(1, parsed)));
              if (clamped !== widthValue) onWidthChange(clamped);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
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
          className="nameplate mb-0.5 rounded-[9px] p-1.5"
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
            max={MAX_DIMENSION}
            value={hFocused ? localH : heightValue}
            onFocus={() => {
              setHFocused(true);
              setLocalH(heightValue);
            }}
            onChange={(e) => setLocalH(e.target.value)}
            onBlur={() => {
              setHFocused(false);
              const parsed = parseInt(localH || "0", 10);
              if (Number.isNaN(parsed) || parsed <= 0) {
                if (localH !== heightValue) onHeightChange(localH);
                return;
              }
              const clamped = String(Math.min(MAX_DIMENSION, Math.max(1, parsed)));
              if (clamped !== heightValue) onHeightChange(clamped);
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.currentTarget.blur();
              }
            }}
            className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }}
          />
        </div>
      </div>

      {origDims && (
        <div className="flex items-center justify-between gap-2">
          <p
            className="font-body text-[11.5px]"
            style={{ color: "var(--ink-soft)" }}
          >
            {originalSizeLabel}: {origDims.w} × {origDims.h}px
          </p>
          <button
            type="button"
            onClick={onRevertToOriginal}
            aria-label={revertToOriginalLabel}
            title={revertToOriginalLabel}
            className="nameplate rounded-[9px] p-1"
          >
            <RotateCcwIcon
              className="size-3.5"
              style={{ color: "var(--ink-soft)" }}
            />
          </button>
        </div>
      )}

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
