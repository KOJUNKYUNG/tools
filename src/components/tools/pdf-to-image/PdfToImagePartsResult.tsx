"use client";

import { useRef, useState } from "react";
import { CheckIcon } from "lucide-react";
import { ResultActions } from "@/components/common/ResultActions";
import { ResultCard } from "@/components/common/ResultCard";
import { formatBytes } from "@/lib/common/formatBytes";
import { template } from "@/lib/common/template";
import { createDownloadGuard, type DownloadGuard } from "@/lib/downloadGuard";
import type { ConvertedImage } from "@/lib/pdf/pdfToImage";
import type { PdfToImageLabels } from "./labels";

interface PartRowProps {
  images: ConvertedImage[];
  partNumber: number;
  labels: PdfToImageLabels;
  onSave: () => Promise<void>;
  onSaveFailed: (err: unknown) => void;
}

function PartRow({ images, partNumber, labels, onSave, onSaveFailed }: PartRowProps) {
  const [building, setBuilding] = useState(false);
  const [saved, setSaved] = useState(false);
  const guardRef = useRef<DownloadGuard | null>(null);

  const save = () => {
    guardRef.current ??= createDownloadGuard({ onBusyChange: setBuilding, onFailure: onSaveFailed });
    guardRef.current.click(async () => {
      await onSave();
      setSaved(true);
    });
  };

  const bytes = images.reduce((sum, img) => sum + img.blob.size, 0);

  return (
    <li className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <ResultActions
        download={{ label: template(labels.savePart, { n: partNumber }), onClick: save, busy: building }}
      />
      <span className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
        {template(labels.imageCountTemplate, { n: images.length })} · {formatBytes(bytes)}
      </span>
      {/* Space kept, so nothing moves when the mark appears. */}
      <span
        className="inline-flex items-center gap-1 font-body text-[11.5px] font-medium"
        style={{ color: "var(--ink-strong)", visibility: saved ? "visible" : "hidden" }}
      >
        <CheckIcon className="size-3.5" />
        {labels.partSaved}
      </span>
    </li>
  );
}

interface PdfToImagePartsResultProps {
  parts: ConvertedImage[][];
  labels: PdfToImageLabels;
  onSavePart: (images: ConvertedImage[], partNumber: number) => Promise<void>;
  onSaveFailed: (err: unknown) => void;
}

/** A result too large for one zip: one save per part, each on its own click. */
export function PdfToImagePartsResult({ parts, labels, onSavePart, onSaveFailed }: PdfToImagePartsResultProps) {
  const imageCount = parts.reduce((sum, part) => sum + part.length, 0);

  return (
    <div style={{ height: "var(--tray-h)" }}>
      <ResultCard title={labels.resultTitle} className="max-h-full">
        <div className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
          {template(labels.partsSummary, { n: imageCount, m: parts.length })}
        </div>
        <ul className="ob-scroll flex min-h-0 flex-col gap-1.5 overflow-y-auto">
          {parts.map((images, i) => (
            <PartRow
              key={i}
              images={images}
              partNumber={i + 1}
              labels={labels}
              onSave={() => onSavePart(images, i + 1)}
              onSaveFailed={onSaveFailed}
            />
          ))}
        </ul>
      </ResultCard>
    </div>
  );
}
