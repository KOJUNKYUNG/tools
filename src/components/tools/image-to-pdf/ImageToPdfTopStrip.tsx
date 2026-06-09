"use client";

interface ImageToPdfTopStripProps {
  filesSummary: string;
  onReupload: () => void;
  reuploadLabel: string;
  onConvert: () => void;
  convertLabel: string;
  convertDisabled: boolean;
  busy: boolean;
}

// Shared subtle button — reupload / All / Clear / Split share this across tools.
const SUBTLE =
  "shrink-0 rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--emphasis)] disabled:cursor-not-allowed disabled:opacity-50";
const SUBTLE_STYLE = {
  background: "var(--surface-2)",
  borderColor: "var(--border)",
  color: "var(--ink-strong)",
} as const;

export function ImageToPdfTopStrip({
  filesSummary,
  onReupload,
  reuploadLabel,
  onConvert,
  convertLabel,
  convertDisabled,
  busy,
}: ImageToPdfTopStripProps) {
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

      <button
        type="button"
        onClick={onConvert}
        disabled={convertDisabled || busy}
        className="btn-primary inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
      >
        {convertLabel}
      </button>
    </div>
  );
}
