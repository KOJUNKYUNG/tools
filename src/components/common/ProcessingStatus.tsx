"use client";

import type { ProcessingState } from "@/types";
import {
  DownloadIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  Loader2Icon,
} from "lucide-react";

interface ProcessingStatusProps {
  status: ProcessingState;
  progress?: number;
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
    errorBody?: string;
    retry?: string;
  };
}

const DEFAULTS = {
  processing: "처리 중…",
  done: "완료",
  doneBody: "파일이 준비되었습니다.",
  download: "다운로드",
  error: "오류 발생",
  errorBody: "처리 중 문제가 발생했습니다. 다시 시도해 주세요.",
  retry: "재시도",
} as const;

export function ProcessingStatus({
  status,
  progress = 0,
  errorMessage,
  onRetry,
  onDownload,
  downloadFileName,
  onTryAnother,
  labels,
}: ProcessingStatusProps) {
  if (status === "idle") return null;
  const L = { ...DEFAULTS, ...labels };

  return (
    <div className="h-full">
      {status === "processing" && (
        <div className="flex h-full flex-col justify-center gap-2">
          <div
            className="flex items-center gap-2 font-display text-[12px] font-medium"
            style={{ color: "var(--ink-strong)" }}
          >
            <Loader2Icon
              className="size-4 animate-spin"
              style={{ color: "var(--accent-electric)" }}
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
                background: "var(--accent-electric)",
              }}
            />
          </div>
        </div>
      )}

      {status === "done" && (
        <div
          className="flex h-full w-full items-center gap-3 rounded-[8px] border px-3 py-2"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "inset 2px 0 0 var(--accent-electric)",
          }}
        >
          <CheckCircle2Icon
            className="size-5 shrink-0"
            style={{ color: "var(--accent-electric)" }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="font-display text-[12px] font-semibold"
              style={{ color: "var(--headline)" }}
            >
              {L.done}
            </div>
            <div
              className="truncate font-body text-[11px]"
              style={{ color: "var(--ink)" }}
              title={downloadFileName}
            >
              {downloadFileName ?? L.doneBody}
            </div>
          </div>
          <div className="shrink-0 flex flex-col gap-1.5">
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="glint inline-flex items-center justify-center gap-1.5 rounded-[5px] px-3 h-8 font-display text-[11.5px] whitespace-nowrap font-medium"
                style={{
                  background: "var(--accent-electric)",
                  color: "#fff",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                }}
              >
                <DownloadIcon className="size-3" />
                {L.download}
              </button>
            )}
            {onTryAnother && (
              <button
                type="button"
                onClick={onTryAnother}
                className="inline-flex items-center justify-center gap-1.5 rounded-[5px] border px-3 h-8 font-display text-[11.5px] whitespace-nowrap transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                <RefreshCwIcon className="size-3" />
                {L.retry}
              </button>
            )}
          </div>
        </div>
      )}

      {status === "error" && (
        <div
          className="flex h-full w-full items-center gap-3 rounded-[8px] border px-3 py-2"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "inset 2px 0 0 var(--accent-copper)",
          }}
        >
          <AlertTriangleIcon
            className="size-5 shrink-0"
            style={{ color: "var(--accent-copper)" }}
          />
          <div className="min-w-0 flex-1">
            <div
              className="font-display text-[12px] font-semibold"
              style={{ color: "var(--headline)" }}
            >
              {L.error}
            </div>
            <div
              className="truncate font-body text-[11px]"
              style={{ color: "var(--ink)" }}
              title={errorMessage}
            >
              {errorMessage ?? L.errorBody}
            </div>
          </div>
          {onRetry && (
            <div className="shrink-0">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center justify-center gap-1.5 rounded-[5px] border px-3 h-8 font-display text-[11.5px] whitespace-nowrap transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                <RefreshCwIcon className="size-3" />
                {L.retry}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
