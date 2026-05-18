/**
 * Module-scoped in-memory store for handing `File[]` between tools via SPA
 * navigation. Producer (the tool that finished work) calls `stageFiles`;
 * consumer (the next tool's page) calls `consumeStagedFiles` on mount.
 *
 * Lifetime: lives in module memory across client-side route transitions;
 * cleared on consume; lost on full page reload (acceptable — user reloading
 * the destination tool is interpreted as "start fresh").
 *
 * No persistence layer (sessionStorage / IndexedDB) by design — that would
 * require Blob serialisation or a dedicated wrapper for marginal benefit.
 */

interface HandoffPayload {
  files: File[];
  source: string;
}

let staged: HandoffPayload | null = null;

export function stageFiles(files: File[], source: string): void {
  staged = { files, source };
}

export function consumeStagedFiles(): HandoffPayload | null {
  const s = staged;
  staged = null;
  return s;
}

/** Test-only escape hatch. Do not call from app code. */
export function __resetHandoffForTests(): void {
  staged = null;
}
