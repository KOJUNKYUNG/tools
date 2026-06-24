"use client";

import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";

interface ImageCompressResultProps {
  doneTitle: string;
  settingsText: string;
  downloadLabel: string;
  recompressLabel: string;
  onDownload: () => void;
  onRecompress: () => void;
}

export function ImageCompressResult({
  doneTitle,
  settingsText,
  downloadLabel,
  recompressLabel,
  onDownload,
  onRecompress,
}: ImageCompressResultProps) {
  return (
    <ResultCard
      title={doneTitle}
      actions={
        <ResultActions
          download={{ label: downloadLabel, onClick: onDownload }}
          again={{ label: recompressLabel, onClick: onRecompress }}
        />
      }
    >
      <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {settingsText}
      </div>
    </ResultCard>
  );
}
