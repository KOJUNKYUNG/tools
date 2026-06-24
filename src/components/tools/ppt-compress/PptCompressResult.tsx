"use client";

import { formatBytes } from "@/lib/common/formatBytes";
import { computeSavings } from "@/lib/image/computeSavings";
import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";
import type { PptCompressLabels } from "./labels";

interface PptCompressResultProps {
  originalSize: number;
  compressedSize: number;
  onDownload: () => void;
  onAgain: () => void;
  labels: PptCompressLabels;
}

export function PptCompressResult({
  originalSize,
  compressedSize,
  onDownload,
  onAgain,
  labels,
}: PptCompressResultProps) {
  const { pct } = computeSavings(originalSize, compressedSize);

  return (
    <ResultCard
      title={labels.resultTitle}
      actions={
        <ResultActions
          download={{ label: labels.download, onClick: onDownload }}
          again={{ label: labels.again, onClick: onAgain }}
        />
      }
    >
      <div className="grid grid-cols-3 gap-2 text-center">
        <div>
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {labels.originalSizeLabel}
          </p>
          <p
            className="font-body text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {formatBytes(originalSize)}
          </p>
        </div>
        <div>
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {labels.compressedSizeLabel}
          </p>
          <p
            className="font-body text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {formatBytes(compressedSize)}
          </p>
        </div>
        <div>
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {labels.savingsLabel}
          </p>
          <p
            className="font-body text-[14px] font-semibold tabular-nums"
            style={{ color: "var(--ink-strong)" }}
          >
            {pct}%
          </p>
        </div>
      </div>
    </ResultCard>
  );
}
