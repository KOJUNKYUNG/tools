"use client";

import { useMemo } from "react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";
import type { SaveBackgroundAction } from "@/hooks/useSaveBackground";
import type { ImageToPptxLabels } from "./labels";
import type { ImageToPptxResultData } from "./ImageToPptx";

interface ImageToPptxResultProps {
  result: ImageToPptxResultData;
  labels: ImageToPptxLabels;
  onDownload: () => void;
  /** Saves the background picture the deck was given; absent when there is none. */
  saveBackground?: SaveBackgroundAction;
}

export function ImageToPptxResult({
  result,
  labels,
  onDownload,
  saveBackground,
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
          secondaryDownload={saveBackground}
        />
      }
    >
      <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {template(labels.slideCountTemplate, { n: result.slideCount })} · {sizeText}
      </div>
    </ResultCard>
  );
}
