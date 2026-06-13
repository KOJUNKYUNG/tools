"use client";

interface EditorTopStripProps {
  filesSummary: string;
  onReupload: () => void;
  reuploadLabel: string;
  onSplitAll: () => void;
  splitAllLabel: string;
  onClearSplits: () => void;
  clearSplitsLabel: string;
  onApply: () => void;
  applyLabel: string;
  applyDisabled: boolean;
  busy: boolean;
}

// Shared subtle button — reupload / Split all / Clear dividers share this with
// the PageRangeSelector's All/Clear across tools (req: unified secondary button).
const SUBTLE =
  "shrink-0 rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--emphasis)] disabled:cursor-not-allowed disabled:opacity-50";
const SUBTLE_STYLE = {
  background: "var(--surface-2)",
  borderColor: "var(--border)",
  color: "var(--ink-strong)",
} as const;

export function EditorTopStrip({
  filesSummary,
  onReupload,
  reuploadLabel,
  onSplitAll,
  splitAllLabel,
  onClearSplits,
  clearSplitsLabel,
  onApply,
  applyLabel,
  applyDisabled,
  busy,
}: EditorTopStripProps) {
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
        <button
          type="button"
          className={SUBTLE}
          style={SUBTLE_STYLE}
          onClick={onReupload}
          disabled={busy}
        >
          {reuploadLabel}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button
          type="button"
          className={SUBTLE}
          style={SUBTLE_STYLE}
          onClick={onSplitAll}
          disabled={busy}
        >
          {splitAllLabel}
        </button>
        <button
          type="button"
          className={SUBTLE}
          style={SUBTLE_STYLE}
          onClick={onClearSplits}
          disabled={busy}
        >
          {clearSplitsLabel}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applyDisabled || busy}
          className="btn-primary inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applyLabel}
        </button>
      </div>
    </div>
  );
}
