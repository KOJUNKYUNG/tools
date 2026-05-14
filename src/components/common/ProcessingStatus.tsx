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
    <div className="space-y-3">
      {status === "processing" && (
        <div className="space-y-2">
          <div
            className="flex items-center gap-2 font-display text-[13px] font-medium"
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
          className="w-full rounded-[8px] border px-4 py-3"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "inset 2px 0 0 var(--accent-electric)",
          }}
        >
          <div className="flex min-w-0 items-start gap-3">
            <CheckCircle2Icon
              className="size-5 shrink-0"
              style={{ color: "var(--accent-electric)" }}
            />
            <div className="min-w-0 flex-1">
              <div
                className="font-display text-[13px] font-semibold"
                style={{ color: "var(--headline)" }}
              >
                {L.done}
              </div>
              <div
                className="mt-0.5 truncate font-body text-[12px]"
                style={{ color: "var(--ink)" }}
                title={downloadFileName}
              >
                {downloadFileName ?? L.doneBody}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {onTryAnother && (
              <button
                type="button"
                onClick={onTryAnother}
                className="inline-flex items-center gap-1.5 rounded-[5px] border px-3 h-9 font-display text-[12px] transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                <RefreshCwIcon className="size-3.5" />
                {L.retry}
              </button>
            )}
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="glint inline-flex items-center gap-1.5 rounded-[5px] px-4 h-9 font-display text-[12px] font-medium"
                style={{
                  background: "var(--accent-electric)",
                  color: "#fff",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                }}
              >
                <DownloadIcon className="size-3.5" />
                {L.download}
              </button>
            )}
          </div>
        </div>
      )}

      {status === "error" && (
        <div
          className="w-full rounded-[8px] border px-4 py-3"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "inset 2px 0 0 var(--accent-copper)",
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangleIcon
              className="size-5 shrink-0"
              style={{ color: "var(--accent-copper)" }}
            />
            <div className="flex-1 min-w-0">
              <div
                className="font-display text-[13px] font-semibold"
                style={{ color: "var(--headline)" }}
              >
                {L.error}
              </div>
              <div
                className="mt-0.5 font-body text-[12px]"
                style={{ color: "var(--ink)" }}
              >
                {errorMessage ?? L.errorBody}
              </div>
            </div>
          </div>
          {onRetry && (
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-[5px] border px-3 h-9 font-display text-[12px] transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                <RefreshCwIcon className="size-3.5" />
                {L.retry}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
