// src/components/tools/ppt-background/PptBackgroundResult.tsx
"use client";

import { ResultCard } from "@/components/common/ResultCard";
import { ResultActions } from "@/components/common/ResultActions";

interface PptBackgroundResultProps {
  /** e.g. "완료" — labels.processing.done */
  title: string;
  /** Short summary line, e.g. "20개 슬라이드 배경을 변경했습니다." (optional) */
  summary?: string;
  downloadLabel: string;
  againLabel: string;
  onDownload: () => void;
  onAgain: () => void;
}

export function PptBackgroundResult({
  title,
  summary,
  downloadLabel,
  againLabel,
  onDownload,
  onAgain,
}: PptBackgroundResultProps) {
  return (
    <ResultCard
      title={title}
      actions={
        <ResultActions
          download={{ label: downloadLabel, onClick: onDownload }}
          again={{ label: againLabel, onClick: onAgain }}
        />
      }
    >
      {summary && (
        <p className="font-body text-[12px]" style={{ color: "var(--ink)" }}>
          {summary}
        </p>
      )}
    </ResultCard>
  );
}
