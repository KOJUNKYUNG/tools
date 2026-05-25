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

const NP =
  "nameplate inline-flex h-9 items-center gap-1.5 rounded-[9px] px-3 text-[13px] disabled:cursor-not-allowed disabled:opacity-50";

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
        <span className={`${NP} min-w-0`} style={{ color: "var(--ink-strong)" }}>
          <span className="truncate">{filesSummary}</span>
        </span>
        <button type="button" className={NP} onClick={onReupload} disabled={busy}>
          {reuploadLabel}
        </button>
      </div>

      <button
        type="button"
        onClick={onConvert}
        disabled={convertDisabled || busy}
        className="btn-primary glint inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
      >
        {convertLabel}
      </button>
    </div>
  );
}
