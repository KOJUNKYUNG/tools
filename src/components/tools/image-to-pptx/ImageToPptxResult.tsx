"use client";

import { useMemo } from "react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";
import type { ImageToPptxLabels } from "./labels";
import type { ImageToPptxResultData } from "./ImageToPptx";

interface ImageToPptxResultProps {
  result: ImageToPptxResultData;
  labels: ImageToPptxLabels;
  onDownload: () => void;
  onSaveBackground: () => void;
}

export function ImageToPptxResult({
  result,
  labels,
  onDownload,
  onSaveBackground,
}: ImageToPptxResultProps) {
  const sizeText = useMemo(() => formatBytes(result.bytes.byteLength), [result.bytes]);

  // Fills the right half of the workspace (polishing checklist E: the result
  // card spans its column, never hugging its content).
  return (
    <ResultCard
      title={labels.resultTitle}
      actions={
        <ResultActions
          download={{ label: labels.download, onClick: onDownload }}
          secondaryDownload={result.saved ? { label: labels.downloadBackground, onClick: onSaveBackground } : undefined}
        />
      }
    >
      <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {template(labels.slideCountTemplate, { n: result.slideCount })} · {sizeText}
      </div>
    </ResultCard>
  );
}
