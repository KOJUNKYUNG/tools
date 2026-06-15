"use client";

import { XIcon } from "lucide-react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";

interface OversizeNoticeProps {
  /** Sum of the selected input files' bytes. */
  totalBytes: number;
  /** Warning template with a `{size}` placeholder. */
  warning: string;
  dismissLabel: string;
  onDismiss: () => void;
}

/**
 * Advisory banner for multi-file tools when the TOTAL input size crosses the
 * warning threshold. The per-file cap bounds each file; this warns about the
 * sum (the "many medium files" OOM path). Dismissable, never blocks the run.
 */
export function OversizeNotice({
  totalBytes,
  warning,
  dismissLabel,
  onDismiss,
}: OversizeNoticeProps) {
  return (
    <div
      className="flex items-center justify-between gap-2 rounded-[8px] border px-3 py-2 text-[12px]"
      style={{
        background: "var(--surface-2)",
        borderColor: "var(--ink-soft)",
        color: "var(--ink-strong)",
      }}
    >
      <span>{template(warning, { size: formatBytes(totalBytes) })}</span>
      <button
        type="button"
        onClick={onDismiss}
        aria-label={dismissLabel}
        title={dismissLabel}
        className="shrink-0 rounded p-1 transition-colors hover:text-[color:var(--ink-strong)]"
        style={{ color: "var(--ink-soft)" }}
      >
        <XIcon className="size-3.5" />
      </button>
    </div>
  );
}
