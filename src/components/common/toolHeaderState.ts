// src/components/common/toolHeaderState.ts
import type { ProcessingState } from "@/types";

export type PrimaryState = "execute" | "processing" | "again";

/**
 * The header's primary button follows the run lifecycle:
 *   idle/error → execute, processing → processing (disabled), done → again.
 * Returns null when no file is loaded (header shows title + description only).
 */
export function derivePrimaryState(input: {
  hasFile: boolean;
  status: ProcessingState;
}): PrimaryState | null {
  if (!input.hasFile) return null;
  if (input.status === "processing") return "processing";
  if (input.status === "done") return "again";
  return "execute"; // idle | error
}
