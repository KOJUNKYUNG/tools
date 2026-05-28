/**
 * Module-scoped in-memory store for handing `File[]` between tools via SPA
 * navigation. Producer (the tool that finished work) calls `stageFiles`;
 * consumer (the next tool's page) calls `consumeStagedFiles` on mount.
 *
 * Lifetime: lives in module memory across client-side route transitions;
 * cleared on consume; lost on full page reload (acceptable — user reloading
 * the destination tool is interpreted as "start fresh").
 *
 * Guards:
 *  - TTL: payloads older than HANDOFF_TTL_MS are dropped on next access, so
 *    a user who stages then closes the destination tab does not pin bytes
 *    for the rest of the SPA session.
 *  - Size cap: stageFiles refuses payloads whose total byte size exceeds
 *    HANDOFF_MAX_BYTES — guards against accidental hundreds-of-megabytes
 *    handoffs being parked in memory.
 */

export const HANDOFF_TTL_MS = 10 * 60 * 1000; // 10 minutes
export const HANDOFF_MAX_BYTES = 500 * 1024 * 1024; // 500 MB

interface HandoffPayload {
  files: File[];
  source: string;
  stagedAt: number;
}

let staged: HandoffPayload | null = null;

function dropIfExpired(now: number): void {
  if (staged && now - staged.stagedAt > HANDOFF_TTL_MS) {
    staged = null;
  }
}

function totalBytes(files: File[]): number {
  let sum = 0;
  for (const f of files) sum += f.size;
  return sum;
}

export function stageFiles(files: File[], source: string): void {
  const now = Date.now();
  dropIfExpired(now);
  if (totalBytes(files) > HANDOFF_MAX_BYTES) {
    staged = null;
    return;
  }
  staged = { files, source, stagedAt: now };
}

export function consumeStagedFiles(): { files: File[]; source: string } | null {
  dropIfExpired(Date.now());
  const s = staged;
  staged = null;
  if (!s) return null;
  return { files: s.files, source: s.source };
}

/** Test-only escape hatch. Do not call from app code. */
export function __resetHandoffForTests(): void {
  staged = null;
}
