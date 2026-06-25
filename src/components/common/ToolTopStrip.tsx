"use client";

import type { ReactNode } from "react";

/**
 * Unified tool top strip — one treatment site-wide so every tool's header row
 * and primary action match. Left: file meta + re-upload. Right: optional extra
 * actions + the primary execute button (image-to-pdf spec: h-9, min-w-[140px],
 * btn-primary). Execute is optional so the strip can persist (file meta +
 * re-upload) across done / processing while the execute button shows only in idle.
 */
const SUBTLE =
  "subtle-action shrink-0 rounded-[5px] px-2.5 py-1.5 font-body text-[11px]";

interface ToolTopStripProps {
  filesSummary: string;
  /** Optional extra meta after the file name (e.g. slide / page count). */
  meta?: ReactNode;
  onReupload: () => void;
  reuploadLabel: string;
  busy?: boolean;
  /** Optional buttons between re-upload and execute (e.g. Split all / Clear). */
  extraActions?: ReactNode;
  /** Primary execute action. Omit to render the strip without an execute button. */
  onExecute?: () => void;
  executeLabel?: string;
  executeDisabled?: boolean;
}

export function ToolTopStrip({
  filesSummary,
  meta,
  onReupload,
  reuploadLabel,
  busy = false,
  extraActions,
  onExecute,
  executeLabel,
  executeDisabled = false,
}: ToolTopStripProps) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5">
      <div className="flex min-w-0 items-center gap-2">
        <span
          className="min-w-0 truncate font-body text-[12px]"
          style={{ color: "var(--ink)" }}
          title={filesSummary}
        >
          {filesSummary}
        </span>
        {meta}
        <button
          type="button"
          className={SUBTLE}
          onClick={onReupload}
          disabled={busy}
        >
          {reuploadLabel}
        </button>
      </div>
      {(extraActions || onExecute) && (
        <div className="flex items-center gap-2">
          {extraActions}
          {onExecute && (
            <button
              type="button"
              onClick={onExecute}
              disabled={executeDisabled || busy}
              className="btn-primary inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
            >
              {executeLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
