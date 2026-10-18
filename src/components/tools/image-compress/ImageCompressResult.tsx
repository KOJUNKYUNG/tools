"use client";

import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";

interface ImageCompressResultProps {
  doneTitle: string;
  settingsText: string;
  /** A batch zip that holds originals for files that could not shrink. */
  keptOriginalsText?: string;
  downloadLabel: string;
  onDownload: () => void;
}

export function ImageCompressResult({
  doneTitle,
  settingsText,
  keptOriginalsText,
  downloadLabel,
  onDownload,
}: ImageCompressResultProps) {
  return (
    <ResultCard
      title={doneTitle}
      actions={
        <ResultActions
          download={{ label: downloadLabel, onClick: onDownload }}
        />
      }
    >
      <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {settingsText}
      </div>
      {keptOriginalsText && (
        <p className="font-body text-[11.5px] leading-[1.5]" style={{ color: "var(--ink-soft)" }}>
          {keptOriginalsText}
        </p>
      )}
    </ResultCard>
  );
}
