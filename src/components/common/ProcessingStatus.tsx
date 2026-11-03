"use client";

import type { ProcessingState } from "@/types";
import type { RunLine } from "@/lib/runPresence";
import { useProcessingStatusCopy } from "./ProcessingStatusCopyProvider";
import {
  DownloadIcon,
  RotateCcwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  Loader2Icon,
} from "lucide-react";

interface ProcessingStatusProps {
  status: ProcessingState;
  progress?: number;
  /** From `useToolProcessor`: the line under the progress. */
  runLine: RunLine;
  errorMessage?: string;
  onRetry?: () => void;
  onDownload?: () => void;
  downloadFileName?: string;
  /**
   * When present in the done state, renders a "Retry" button that resets
   * partial state (the caller decides what — typically: clear the chosen
   * output, keep inputs). Distinct from the error-state retry.
   */
  onTryAnother?: () => void;
  labels?: {
    processing?: string;
    done?: string;
    doneBody?: string;
    download?: string;
    error?: string;
    retry?: string;
    /** Done-state "do it again" button. Falls back to `retry` when unset. */
    tryAnother?: string;
  };
}

export function ProcessingStatus({
  status,
  progress = 0,
  runLine,
  errorMessage,
  onRetry,
  onDownload,
  downloadFileName,
  onTryAnother,
  labels,
}: ProcessingStatusProps) {
  const copy = useProcessingStatusCopy();
  if (status === "idle") return null;
  const L = { ...copy, ...labels };

  return (
    <div className="h-full">
      {status === "processing" && (
        <div className="flex h-full flex-col justify-center gap-2">
          <div
            className="flex items-center gap-2 font-body text-[12px] font-medium"
            style={{ color: "var(--ink-strong)" }}
          >
            <Loader2Icon
              className="size-4 animate-spin"
              style={{ color: "var(--ink-strong)" }}
            />
            <span>
              {L.processing} {Math.round(progress)}%
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(0, Math.min(100, progress))}%`,
                background: "var(--ink-strong)",
              }}
            />
          </div>
          {/* The hidden copies hold the longer line's space from the start of the
              run, so that the fixed landing workspace does not shift when one shows. */}
          <div
            role="status"
            className="grid break-keep font-body text-[11px] leading-snug [overflow-wrap:anywhere]"
            style={{ color: "var(--ink)" }}
          >
            <span aria-hidden className="invisible [grid-area:1/1]">
              {copy.stayOnScreen}
            </span>
            <span aria-hidden className="invisible [grid-area:1/1]">
              {copy.wasPaused}
            </span>
            {runLine && <span className="[grid-area:1/1]">{copy[runLine]}</span>}
          </div>
        </div>
      )}

      {status === "done" && (
        <div
          className="result-pop flex h-full w-full items-center gap-3 rounded-[8px] border px-3 py-2"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "inset 2px 0 0 var(--emphasis)",
          }}
        >
          <CheckCircle2Icon
            className="size-5 shrink-0"
            style={{ color: "var(--ink-strong)" }}
          />
          <div className="min-w-0 flex-1" />
          <div className="shrink-0 flex flex-col gap-1.5">
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="btn-download inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-body text-[11.5px] whitespace-nowrap font-medium"
              >
                <DownloadIcon className="size-3" />
                {L.download}
              </button>
            )}
            {onTryAnother && (
              <button
                type="button"
                onClick={onTryAnother}
                className="nameplate inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-body text-[11.5px] whitespace-nowrap"
                style={{ color: "var(--ink-strong)" }}
              >
                <RotateCcwIcon className="size-3" />
                {L.tryAnother ?? L.retry}
              </button>
            )}
          </div>
        </div>
      )}

      {status === "error" && (
        <div
          className="flex h-full w-full flex-wrap content-center items-center gap-3 rounded-[8px] border px-3 py-2"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "inset 2px 0 0 var(--ink-strong)",
          }}
        >
          <AlertTriangleIcon
            className="size-5 shrink-0"
            style={{ color: "var(--ink-strong)" }}
          />
          {/* In a narrow column the message takes its own row, rather than
              shrinking between the icon and the button to a letter per line. */}
          <div className="min-w-0 grow basis-40">
            <div
              className="font-ko text-[12px] font-medium"
              style={{ color: "var(--headline)" }}
            >
              {L.error}
            </div>
            {/* Wraps rather than truncates: the second sentence of an error
                says what to do, and phones have no hover tooltip. Korean
                breaks between words; an unbroken run (a file name) still wraps. */}
            <div
              className="break-keep font-body text-[11px] leading-snug [overflow-wrap:anywhere]"
              style={{ color: "var(--ink)" }}
            >
              {errorMessage}
            </div>
          </div>
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="nameplate shrink-0 inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-body text-[11.5px] whitespace-nowrap"
              style={{ color: "var(--ink-strong)" }}
            >
              <RotateCcwIcon className="size-3" />
              {L.retry}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
