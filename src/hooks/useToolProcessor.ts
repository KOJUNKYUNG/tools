"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { getErrorMessage, type GetErrorMessageOptions } from "@/lib/errors";
import type { ProcessingState } from "@/types";

export interface UseToolProcessorConfig<TResult> {
  processor: (
    files: File[],
    onProgress: (value: number) => void,
  ) => Promise<TResult>;
  onDownload: (result: TResult) => void | Promise<void>;
  errorOptions?: GetErrorMessageOptions;
}

export interface UseToolProcessorReturn<TResult> {
  files: File[];
  setFiles: (files: File[]) => void;
  status: ProcessingState;
  progress: number;
  errorMessage: string;
  result: TResult | null;
  run: () => Promise<void>;
  retry: () => void;
  download: () => void;
}

export function useToolProcessor<TResult>({
  processor,
  onDownload,
  errorOptions,
}: UseToolProcessorConfig<TResult>): UseToolProcessorReturn<TResult> {
  const [files, setFiles] = useState<File[]>([]);
  const [status, setStatus] = useState<ProcessingState>("idle");
  const [progress, setProgress] = useState(0);
  const [errorMessage, setErrorMessage] = useState("");
  const [result, setResult] = useState<TResult | null>(null);

  const processorRef = useRef(processor);
  const onDownloadRef = useRef(onDownload);
  const errorOptionsRef = useRef(errorOptions);
  const generationRef = useRef(0);

  useEffect(() => {
    processorRef.current = processor;
    onDownloadRef.current = onDownload;
    errorOptionsRef.current = errorOptions;
  });

  const run = useCallback(async () => {
    const gen = ++generationRef.current;
    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    setResult(null);

    try {
      const res = await processorRef.current(files, (value) => {
        // Ignore progress from a superseded run.
        if (gen === generationRef.current) setProgress(value);
      });
      // A newer run (or a reset via retry) started while we awaited — discard.
      if (gen !== generationRef.current) return;
      setResult(res);
      setStatus("done");
    } catch (err) {
      if (gen !== generationRef.current) return;
      setErrorMessage(getErrorMessage(err, errorOptionsRef.current).message);
      setStatus("error");
    }
  }, [files]);

  const retry = useCallback(() => {
    // Invalidate any in-flight run so its late result can't overwrite this reset.
    generationRef.current++;
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    setResult(null);
  }, []);

  const download = useCallback(() => {
    if (!result) return;
    onDownloadRef.current(result);
  }, [result]);

  return {
    files,
    setFiles,
    status,
    progress,
    errorMessage,
    result,
    run,
    retry,
    download,
  };
}
