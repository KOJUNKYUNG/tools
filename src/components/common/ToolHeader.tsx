"use client";

import type { ReactNode } from "react";
import { derivePrimaryState } from "./toolHeaderState";
import type { ProcessingState } from "@/types";

const SUBTLE =
  "file-action shrink-0 rounded-[5px] px-2.5 py-1.5 font-body text-[11px] min-w-[68px] text-center";
const PRIMARY =
  "btn-primary inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50";

interface ToolHeaderProps {
  title: string;
  description: string;
  fileSummary?: string;
  meta?: ReactNode;
  status?: ProcessingState;
  hasFile?: boolean;
  onReupload?: () => void;
  reuploadLabel?: string;
  busy?: boolean;
  busyReuploadLabel?: string;
  executeLabel?: string;
  processingLabel?: string;
  againLabel?: string;
  onExecute?: () => void;
  onAgain?: () => void;
  executeDisabled?: boolean;
  /**
   * Optional momentary editing actions (e.g. Split all / Clear dividers),
   * rendered between re-upload and the primary button — the slot the old
   * ToolTopStrip exposed for tools with in-strip editing controls.
   */
  extraActions?: ReactNode;
}

export function ToolHeader({
  title,
  description,
  fileSummary,
  meta,
  status = "idle",
  hasFile = false,
  onReupload,
  reuploadLabel,
  busy = false,
  busyReuploadLabel,
  executeLabel,
  processingLabel,
  againLabel,
  onExecute,
  onAgain,
  executeDisabled = false,
  extraActions,
}: ToolHeaderProps) {
  const primary = derivePrimaryState({ hasFile, status });

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1
          className="font-ko text-[16px] font-medium leading-[1.2] tracking-[0.005em]"
          style={{ color: "var(--headline)" }}
        >
          {title}
        </h1>
        <div
          className="mt-1 flex min-w-0 items-center gap-1 font-body text-[12px] leading-[1.45]"
          style={{ color: "var(--ink)" }}
        >
          {hasFile && fileSummary ? (
            <>
              <span className="min-w-0 truncate" title={fileSummary}>
                {fileSummary}
              </span>
              {meta}
            </>
          ) : (
            description
          )}
        </div>
      </div>

      {hasFile && (
        <div className="flex shrink-0 items-center gap-2">
          {onReupload && (
            <button
              type="button"
              className={SUBTLE}
              onClick={onReupload}
              disabled={busy}
            >
              {busy && busyReuploadLabel ? busyReuploadLabel : reuploadLabel}
            </button>
          )}
          {extraActions}
          {primary === "execute" && (
            <button
              type="button"
              onClick={onExecute}
              disabled={executeDisabled || busy}
              className={PRIMARY}
            >
              {executeLabel}
            </button>
          )}
          {primary === "processing" && (
            <button type="button" disabled className={PRIMARY}>
              {processingLabel}
            </button>
          )}
          {primary === "again" && (
            <button type="button" onClick={onAgain} className={PRIMARY}>
              {againLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
