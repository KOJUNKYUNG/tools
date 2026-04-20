"use client";

import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { ProcessingState } from "@/types";
import {
  DownloadIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  Loader2Icon,
} from "lucide-react";

interface ProcessingStatusProps {
  status: ProcessingState;
  progress?: number;
  errorMessage?: string;
  onRetry?: () => void;
  onDownload?: () => void;
  downloadFileName?: string;
}

export function ProcessingStatus({
  status,
  progress = 0,
  errorMessage,
  onRetry,
  onDownload,
  downloadFileName,
}: ProcessingStatusProps) {
  if (status === "idle") return null;

  return (
    <div className="space-y-3">
      {status === "processing" && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 text-sm font-medium">
            <Loader2Icon className="size-4 animate-spin text-primary" />
            <span>처리 중… {Math.round(progress)}%</span>
          </div>
          <Progress value={progress} className="h-2" />
        </div>
      )}

      {status === "done" && (
        <Alert>
          <CheckCircle2Icon className="size-4" />
          <AlertTitle>완료</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>파일이 준비되었습니다.</span>
            {onDownload && (
              <Button size="sm" onClick={onDownload}>
                <DownloadIcon className="size-4" />
                {downloadFileName ?? "다운로드"}
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}

      {status === "error" && (
        <Alert variant="destructive">
          <AlertTriangleIcon className="size-4" />
          <AlertTitle>오류 발생</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>{errorMessage ?? "처리 중 문제가 발생했습니다. 다시 시도해 주세요."}</span>
            {onRetry && (
              <Button variant="outline" size="sm" onClick={onRetry}>
                <RefreshCwIcon className="size-4" />
                재시도
              </Button>
            )}
          </AlertDescription>
        </Alert>
      )}
    </div>
  );
}
