"use client";

import { createContext, useContext, type ReactNode } from "react";
import type { Dictionary } from "@/i18n/config";

type ProcessingStatusCopy = Dictionary["common"]["processingStatus"];

const ProcessingStatusCopyContext = createContext<ProcessingStatusCopy | null>(null);

/**
 * The page's shared copy for `ProcessingStatus`. Set once per language, so that
 * every tool has it in the page's language without passing it down.
 */
export function ProcessingStatusCopyProvider({
  copy,
  children,
}: {
  copy: ProcessingStatusCopy;
  children: ReactNode;
}) {
  return (
    <ProcessingStatusCopyContext.Provider value={copy}>
      {children}
    </ProcessingStatusCopyContext.Provider>
  );
}

export function useProcessingStatusCopy(): ProcessingStatusCopy {
  const copy = useContext(ProcessingStatusCopyContext);
  if (!copy) throw new Error("useProcessingStatusCopy needs a ProcessingStatusCopyProvider above it");
  return copy;
}
