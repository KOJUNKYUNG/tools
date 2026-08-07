// src/components/common/toolHeaderState.ts
import type { ProcessingState } from "@/types";

export type PrimaryState = "execute" | "processing" | "again";

/**
 * The header's primary button follows the run lifecycle:
 *   idle → execute, processing → processing (disabled), done → again.
 * Returns null when no file is loaded (header shows title + description only)
 * OR on error — the body's ProcessingStatus owns retry in the error state, so
 * the header shows no primary to avoid a duplicate recovery affordance.
 */
export function derivePrimaryState(input: {
  hasFile: boolean;
  status: ProcessingState;
}): PrimaryState | null {
  if (!input.hasFile) return null;
  if (input.status === "processing") return "processing";
  if (input.status === "done") return "again";
  if (input.status === "error") return null; // body ProcessingStatus owns retry
  return "execute"; // idle
}
