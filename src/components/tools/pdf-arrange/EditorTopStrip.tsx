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

const NP =
  "nameplate inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-50";

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
          className={`${NP} min-w-0`}
          style={{ color: "var(--ink-strong)" }}
        >
          <span className="truncate">{filesSummary}</span>
        </span>
        <button type="button" className={NP} onClick={onReupload} disabled={busy}>
          {reuploadLabel}
        </button>
      </div>

      <div className="flex items-center gap-2">
        <button type="button" className={NP} onClick={onSplitAll} disabled={busy}>
          {splitAllLabel}
        </button>
        <button
          type="button"
          className={NP}
          onClick={onClearSplits}
          disabled={busy}
        >
          {clearSplitsLabel}
        </button>
        <button
          type="button"
          onClick={onApply}
          disabled={applyDisabled || busy}
          className="glint inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
          // color = var(--bg) so the label inverts with the theme (light text on
          // the dark button in light mode; dark text in dark mode).
          style={{ background: "var(--ink-strong)", color: "var(--bg)" }}
        >
          {applyLabel}
        </button>
      </div>
    </div>
  );
}
