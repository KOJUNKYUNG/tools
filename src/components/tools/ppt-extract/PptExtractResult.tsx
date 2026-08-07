"use client";

import { useEffect, useMemo, useState } from "react";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions, HandoffAction } from "@/components/common/ResultActions";
import type { ExtractedImage } from "@/lib/ppt/extractImages";
import {
  formatBreakdownString,
  getExt,
  isRenderable,
} from "@/lib/ppt/pptImageFormats";
import { ExtractedImageCard } from "./ExtractedImageCard";
import type { PptExtractLabels } from "./labels";

interface PptExtractResultProps {
  images: ExtractedImage[];
  labels: PptExtractLabels;
  onDownloadAll: () => void;
  onDownloadOne: (image: ExtractedImage) => void;
  onToPptx: () => void;
}

export function PptExtractResult({
  images,
  labels,
  onDownloadAll,
  onDownloadOne,
  onToPptx,
}: PptExtractResultProps) {
  // StrictMode-safe object URL batch — re-keyed on `images`.
  const [urls, setUrls] = useState<(string | null)[]>([]);
  useEffect(() => {
    const next: (string | null)[] = images.map((img) => {
      if (!isRenderable(getExt(img.name))) return null;
      // new Uint8Array(...) required for TS strict (BlobPart needs ArrayBuffer).
      return URL.createObjectURL(
        new Blob([new Uint8Array(img.data)], { type: img.mime }),
      );
    });
    // eslint-disable-next-line react-hooks/set-state-in-effect -- StrictMode-safe object URL batch; the cleanup revokes this exact batch (see comment above)
    setUrls(next);
    return () => {
      for (const u of next) if (u) URL.revokeObjectURL(u);
    };
  }, [images]);

  const totalSize = useMemo(
    () => images.reduce((sum, img) => sum + img.size, 0),
    [images],
  );

  // Stable per-image download callbacks; prevents re-creating 200 closures per
  // render once urls state updates (would defeat any memo on the card).
  const downloadCallbacks = useMemo(
    () => images.map((img) => () => onDownloadOne(img)),
    [images, onDownloadOne],
  );

  // Format breakdown chip — e.g. "PNG 12 · JPG 3 · EMF 2".
  const breakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const img of images) {
      const ext = (getExt(img.name) || "?").toUpperCase();
      counts[ext] = (counts[ext] ?? 0) + 1;
    }
    return formatBreakdownString(counts);
  }, [images]);

  return (
    <div
      className="grid grid-cols-1 gap-4 md:grid-cols-2"
      style={{ height: "var(--tray-h)" }}
    >
      <div className="ob-scroll min-h-0 overflow-y-auto pr-1">
        <div className="grid grid-cols-3 gap-2">
          {images.map((img, i) => (
            <ExtractedImageCard
              key={`${img.name}-${i}`}
              url={urls[i] ?? null}
              name={img.name}
              size={img.size}
              index={i + 1}
              placeholderLabel={labels.placeholderLabel}
              onDownload={downloadCallbacks[i]}
              downloadAria={template(labels.downloadOneAria, { name: img.name })}
            />
          ))}
        </div>
      </div>

      <div className="self-start">
        <ResultCard
          title={labels.resultTitle}
          actions={
            <ResultActions
              download={{ label: labels.downloadZip, onClick: onDownloadAll }}
              extra={
                images.length > 0 ? (
                  <HandoffAction label={labels.toPptx} onClick={onToPptx} />
                ) : undefined
              }
            />
          }
        >
          <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
            {template(labels.imageCountTemplate, { n: images.length })} · {formatBytes(totalSize)}
          </div>
          {breakdown && (
            <div className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
              {breakdown}
            </div>
          )}
        </ResultCard>
      </div>
    </div>
  );
}
