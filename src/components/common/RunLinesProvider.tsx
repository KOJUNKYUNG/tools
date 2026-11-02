"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary } from "@/i18n/config";

type RunLines = Dictionary["common"]["runLines"];

const RunLinesContext = createContext<RunLines | null>(null);

/**
 * The page's copy for the line under a run's progress. Set once per language,
 * so that every tool's `ProcessingStatus` has it without passing it down.
 */
export function RunLinesProvider({
  runLines,
  children,
}: {
  runLines: RunLines;
  children: ReactNode;
}) {
  return <RunLinesContext.Provider value={runLines}>{children}</RunLinesContext.Provider>;
}

export function useRunLines(): RunLines | null {
  return useContext(RunLinesContext);
}
