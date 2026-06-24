"use client";

import type { ReactNode } from "react";
import { DownloadIcon, RotateCcwIcon, ArrowRightIcon } from "lucide-react";

interface ActionSpec {
  label: string;
  onClick: () => void;
}

interface ResultActionsProps {
  /**
   * Primary download (`.btn-download`). Omit when there is nothing to download
   * (e.g. pdf-to-image streamed already saved its zips during processing).
   */
  download?: ActionSpec;
  /** "다시 / Again" reset (`.nameplate`, RotateCcw — the one canonical retry icon). */
  again: ActionSpec;
  /** Optional cross-tool handoff button(s), placed between download and again. */
  extra?: ReactNode;
}

/**
 * The one result-action button set — identical size, icon, and treatment on
 * every tool. Canonical order: download → handoff (`extra`) → again. Spacing
 * above is owned by the parent (`ResultCard` gap), so this adds none.
 */
export function ResultActions({ download, again, extra }: ResultActionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {download && (
        <button
          type="button"
          onClick={download.onClick}
          className="btn-download inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[12px] font-medium"
        >
          <DownloadIcon className="size-3.5" />
          {download.label}
        </button>
      )}
      {extra}
      <button
        type="button"
        onClick={again.onClick}
        className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-body text-[12px]"
        style={{ color: "var(--ink-strong)" }}
      >
        <RotateCcwIcon className="size-3.5" />
        {again.label}
      </button>
    </div>
  );
}

/**
 * Canonical cross-tool handoff button (e.g. "압축하기 →"). Pass to
 * `<ResultActions extra={…} />` so it lands in the standard slot/treatment.
 */
export function HandoffAction({ label, onClick }: ActionSpec) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="handoff-action inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] border px-3 font-body text-[12px]"
    >
      {label}
      <ArrowRightIcon className="size-3.5" />
    </button>
  );
}
