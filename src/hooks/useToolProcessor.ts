"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import { getErrorMessage, type GetErrorMessageOptions } from "@/lib/errors";
import type { ProcessingState } from "@/types";
import type { NeedsScreen, RunLine } from "@/lib/runPresence";
import { useRunPresence } from "./useRunPresence";

export interface UseToolProcessorConfig<TResult> {
  processor: (
    files: File[],
    onProgress: (value: number) => void,
    needsScreen: NeedsScreen,
  ) => Promise<TResult>;
  onDownload: (result: TResult) => void | Promise<void>;
  /** Required: the page's error copy keeps every message in its language. */
  errorOptions: GetErrorMessageOptions;
}

export interface UseToolProcessorReturn<TResult> {
  files: File[];
  setFiles: Dispatch<SetStateAction<File[]>>;
  status: ProcessingState;
  progress: number;
  /** The line under the progress; pass it to `ProcessingStatus`. */
  runLine: RunLine;
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
  const { runLine, beginRun, endRun, startStretch, endStretch } = useRunPresence();

  const processorRef = useRef(processor);
  const onDownloadRef = useRef(onDownload);
  const errorOptionsRef = useRef(errorOptions);
  const generationRef = useRef(0);

  useEffect(() => {
    processorRef.current = processor;
    onDownloadRef.current = onDownload;
    errorOptionsRef.current = errorOptions;
  });

  useEffect(() => {
    return () => {
      generationRef.current++;
    };
  }, []);

  const run = useCallback(async () => {
    const gen = ++generationRef.current;
    setStatus("processing");
    setProgress(0);
    setErrorMessage("");
    setResult(null);
    beginRun();

    // A superseded run's stretch says nothing of the run now in progress.
    const needsScreen: NeedsScreen = async (work) => {
      if (gen === generationRef.current) startStretch();
      try {
        return await work();
      } finally {
        if (gen === generationRef.current) endStretch();
      }
    };

    try {
      const res = await processorRef.current(
        files,
        (value) => {
          // Ignore progress from a superseded run.
          if (gen === generationRef.current) setProgress(value);
        },
        needsScreen,
      );
      // A newer run (or a reset via retry) started while we awaited — discard.
      if (gen !== generationRef.current) return;
      endRun();
      setResult(res);
      setStatus("done");
    } catch (err) {
      if (gen !== generationRef.current) return;
      endRun();
      setErrorMessage(getErrorMessage(err, errorOptionsRef.current).message);
      setStatus("error");
    }
  }, [files, beginRun, endRun, startStretch, endStretch]);

  const retry = useCallback(() => {
    // Invalidate any in-flight run so its late result can't overwrite this reset.
    generationRef.current++;
    endRun();
    setStatus("idle");
    setProgress(0);
    setErrorMessage("");
    setResult(null);
  }, [endRun]);

  const download = useCallback(() => {
    if (!result) return;
    onDownloadRef.current(result);
  }, [result]);

  return {
    files,
    setFiles,
    status,
    progress,
    runLine,
    errorMessage,
    result,
    run,
    retry,
    download,
  };
}
