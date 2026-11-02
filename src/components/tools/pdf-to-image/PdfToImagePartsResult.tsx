"use client";

import { useRef, useState } from "react";
import { CircleCheckIcon } from "lucide-react";
import { ResultActions } from "@/components/common/ResultActions";
import { ResultCard } from "@/components/common/ResultCard";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { createDownloadGuard, type DownloadGuard } from "@/lib/downloadGuard";
import type { ConvertedImage } from "@/lib/pdf/pdfToImage";
import type { PdfToImageLabels } from "./labels";

interface PdfToImagePartsResultProps {
  parts: ConvertedImage[][];
  labels: PdfToImageLabels;
  onSavePart: (images: ConvertedImage[], partNumber: number) => Promise<void>;
  onSaveFailed: (err: unknown) => void;
}

/**
 * A result too large for one zip: one save per part, each on its own click.
 * One part builds at a time: overlapping saves could draw the browser's
 * multiple-downloads prompt, and each build holds a part's bytes.
 */
export function PdfToImagePartsResult({ parts, labels, onSavePart, onSaveFailed }: PdfToImagePartsResultProps) {
  const [buildingPart, setBuildingPart] = useState<number | null>(null);
  const [savedParts, setSavedParts] = useState<ReadonlySet<number>>(new Set());
  const guardRef = useRef<DownloadGuard | null>(null);

  const save = (images: ConvertedImage[], partNumber: number) => {
    guardRef.current ??= createDownloadGuard({
      onBusyChange: (busy) => {
        if (!busy) setBuildingPart(null);
      },
      onFailure: onSaveFailed,
    });
    guardRef.current.click(async () => {
      setBuildingPart(partNumber);
      await onSavePart(images, partNumber);
      setSavedParts((prev) => new Set(prev).add(partNumber));
    });
  };

  const imageCount = parts.reduce((sum, part) => sum + part.length, 0);

  return (
    <div style={{ height: "var(--tray-h)" }}>
      <ResultCard title={labels.resultTitle} bounded>
        <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          {template(labels.partsSummary, { n: imageCount, m: parts.length })}
        </div>
        <ul className="ob-scroll flex min-h-0 flex-col gap-1.5 overflow-y-auto">
          {parts.map((images, i) => {
            const partNumber = i + 1;
            const bytes = images.reduce((sum, img) => sum + img.blob.size, 0);
            return (
              <li key={partNumber} className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <ResultActions
                  download={{
                    label: template(labels.downloadPart, { n: partNumber }),
                    onClick: () => save(images, partNumber),
                    busy: buildingPart === partNumber,
                    disabled: buildingPart !== null,
                  }}
                />
                <span className="font-body text-[11.5px] tabular-nums" style={{ color: "var(--ink-soft)" }}>
                  {template(labels.imageCountTemplate, { n: images.length })} · {formatBytes(bytes)}
                </span>
                {/* Space kept, so nothing moves when the mark appears. */}
                <span
                  className="inline-flex items-center gap-1 font-body text-[11.5px] font-medium"
                  style={{ color: "var(--ink-strong)", visibility: savedParts.has(partNumber) ? "visible" : "hidden" }}
                >
                  <CircleCheckIcon className="size-3.5" />
                  {labels.partDownloaded}
                </span>
              </li>
            );
          })}
        </ul>
      </ResultCard>
    </div>
  );
}
