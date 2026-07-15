"use client";

import { LockIcon, UnlockIcon } from "lucide-react";
import { template } from "@/lib/common/template";
import { formatBytes } from "@/lib/common/formatBytes";
import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";
import type { LockMode } from "@/lib/pdf/pdfLockNaming";
import type { PdfLockLabels } from "./labels";

interface PdfLockResultProps {
  mode: LockMode;
  outputSize: number;
  onDownload: () => void;
  labels: PdfLockLabels;
}

export function PdfLockResult({
  mode,
  outputSize,
  onDownload,
  labels,
}: PdfLockResultProps) {
  const title = mode === "lock" ? labels.resultLockTitle : labels.resultUnlockTitle;
  const Icon = mode === "lock" ? LockIcon : UnlockIcon;
  return (
    <ResultCard
      title={title}
      icon={Icon}
      actions={
        <ResultActions
          download={{ label: labels.download, onClick: onDownload }}
        />
      }
    >
      <p className="font-body text-[12px] tabular-nums" style={{ color: "var(--ink-soft)" }}>
        {template(labels.resultSizeTemplate, { size: formatBytes(outputSize) })}
      </p>
    </ResultCard>
  );
}
