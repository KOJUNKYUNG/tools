# useToolProcessor / toolHandoff Robustness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Eliminate three latent bugs in the shared `useToolProcessor` hook and the `toolHandoff` store that affect all eight migrated tools: stale-closure file appends (F6), in-flight async work outliving unmount (F7), and staged-handoff memory with no eviction (F5).

**Architecture:**
1. Extend `useToolProcessor.setFiles` to accept either a `File[]` or an updater `(prev: File[]) => File[]`, then migrate every append-style caller. This kills the F6 stale closure at its source instead of asking every caller to remember a workaround.
2. Add an unmount cleanup effect to `useToolProcessor` that increments `generationRef`, so any in-flight `processor(...)`/`onProgress` callback resolving after unmount is discarded (no state update, no late `setProgress`/`setStatus` warnings).
3. Add a coarse TTL (10 min) + total-bytes ceiling (500 MB) guard to `toolHandoff`. Staged payloads older than the TTL or oversized are dropped on the next `stageFiles`/`consumeStagedFiles` call. Pure logic, fully unit-testable in node env.

**Tech Stack:** TypeScript (strict), React 19 hooks, vitest (node env, no @testing-library — hook changes verified via `pnpm exec tsc --noEmit` + `pnpm build` + manual smoke).

**Scope boundary:** No visual changes, no design tokens, no new dependencies. Cross-cutting polish PR — does not touch any tool's domain logic.

---

## File Structure

**Modify:**
- `src/hooks/useToolProcessor.ts` — widen `setFiles` type to updater-or-value; add unmount-effect that bumps `generationRef`.
- `src/lib/common/toolHandoff.ts` — add TTL + total-bytes guard; expose internal constants for tests.
- `src/lib/common/toolHandoff.test.ts` — extend with TTL + size-cap cases.
- `src/components/tools/pdf-to-image/PdfToImage.tsx:131` — migrate `setFiles([...files, ...accepted])` → updater.
- `src/components/tools/pdf-arrange/PdfArrange.tsx:233` — same.
- `src/components/tools/image-to-pdf/ImageToPdf.tsx:223` — same.

**No new files.** No new public API surface beyond a wider `setFiles` signature (backwards compatible — `setFiles(arr)` still works) and two `toolHandoff` constants exported only for tests.

---

## Branch

`chore/polish-phase-1-tool-processor-robustness` (cross-cutting; convention 4 exception applies).

---

### Task 1: Widen `setFiles` type and migrate appenders (F6)

**Files:**
- Modify: `src/hooks/useToolProcessor.ts`
- Modify: `src/components/tools/pdf-to-image/PdfToImage.tsx:131`
- Modify: `src/components/tools/pdf-arrange/PdfArrange.tsx:233`
- Modify: `src/components/tools/image-to-pdf/ImageToPdf.tsx:223`

**Why:** `setFiles([...files, ...accepted])` reads `files` from the closure of whichever render produced the callback. Two quick appends in the same render cycle drop the first batch. React's native `setState` already supports updater functions — we just need to forward that.

- [ ] **Step 1: Update return type in `useToolProcessor.ts`**

In `src/hooks/useToolProcessor.ts`, change the `setFiles` field type in `UseToolProcessorReturn<TResult>`:

```ts
setFiles: React.Dispatch<React.SetStateAction<File[]>>;
```

Add `import type { Dispatch, SetStateAction } from "react";` and reference as `Dispatch<SetStateAction<File[]>>` (the project already uses `React` namespace sparingly — match neighbouring import style in the file: bare imports from `"react"`).

The runtime value already supports updater functions because we return `setFiles` directly from `useState` — this is a type-only change.

- [ ] **Step 2: Run tsc to confirm no breakage**

Run: `pnpm exec tsc --noEmit`
Expected: PASS. (Existing callers passing `File[]` are still assignable to `SetStateAction<File[]>`.)

- [ ] **Step 3: Migrate `pdf-to-image` append**

In `src/components/tools/pdf-to-image/PdfToImage.tsx:131`, replace:

```tsx
setFiles([...files, ...accepted]);
```

with:

```tsx
setFiles((prev) => [...prev, ...accepted]);
```

- [ ] **Step 4: Migrate `pdf-arrange` append**

In `src/components/tools/pdf-arrange/PdfArrange.tsx:233`, same substitution.

- [ ] **Step 5: Migrate `image-to-pdf` append**

In `src/components/tools/image-to-pdf/ImageToPdf.tsx:223`, same substitution.

- [ ] **Step 6: Sanity-grep for missed callsites**

Run grep for `setFiles([...files` and `setFiles([...prevFiles` across `src/`. Expected: zero matches. If any remain, migrate them with the same updater pattern.

- [ ] **Step 7: Run tsc + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: both PASS.

- [ ] **Step 8: Commit**

```bash
git add src/hooks/useToolProcessor.ts src/components/tools/pdf-to-image/PdfToImage.tsx src/components/tools/pdf-arrange/PdfArrange.tsx src/components/tools/image-to-pdf/ImageToPdf.tsx
git commit -m "fix(use-tool-processor): widen setFiles to SetStateAction and migrate appenders

Append-style callers were reading files from a stale closure, so two
rapid drops in the same render could lose the first batch. Forwarding
React's SetStateAction lets callers pass an updater function and
removes the footgun at the source."
```

---

### Task 2: Add unmount cleanup to invalidate in-flight runs (F7)

**Files:**
- Modify: `src/hooks/useToolProcessor.ts`

**Why:** When a user navigates away mid-conversion, the running `processor(...)` keeps resolving and `onProgress` keeps firing. The `gen === generationRef.current` check inside `run` already discards the result, but it never *fires* because the unmounted component's effect never increments the ref. Result: wasted CPU, plus React warnings when `setProgress` runs on an unmounted component if the gen check is bypassed by an early call path. A trivial unmount effect closes the gap.

- [ ] **Step 1: Add unmount effect**

In `src/hooks/useToolProcessor.ts`, after the existing `useEffect` that syncs refs, add:

```ts
useEffect(() => {
  return () => {
    generationRef.current++;
  };
}, []);
```

The empty dep array is intentional — this effect runs cleanup only on unmount. The increment ensures every gen check inside `run` (`gen !== generationRef.current`) trips and the late branches return early.

- [ ] **Step 2: Run tsc + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: both PASS.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useToolProcessor.ts
git commit -m "fix(use-tool-processor): bump generation on unmount

An in-flight processor() keeps resolving after navigation. The gen
check inside run() already discards superseded results, but unmount
never tripped it. Adding a cleanup effect that increments the ref
makes late resolutions no-op."
```

---

### Task 3: Add TTL + size guard to `toolHandoff` (F5)

**Files:**
- Modify: `src/lib/common/toolHandoff.ts`
- Modify: `src/lib/common/toolHandoff.test.ts`

**Why:** A user who stages 150 images for `image-to-pdf` and then closes the next-tool tab leaves the `File[]` (plus their underlying Blob bytes) pinned in module memory for the rest of the SPA session. A 10-minute TTL and a 500 MB total-bytes ceiling are coarse but sufficient — handoffs are intended for immediate consumption on the next route mount, not long-lived state.

- [ ] **Step 1: Write the failing tests**

Replace the body of `src/lib/common/toolHandoff.test.ts` with the existing cases plus three new ones. The full file should be:

```ts
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  consumeStagedFiles,
  stageFiles,
  __resetHandoffForTests,
  HANDOFF_TTL_MS,
  HANDOFF_MAX_BYTES,
} from "./toolHandoff";

function makeFile(name: string, sizeBytes = 1): File {
  return new File([new Uint8Array(sizeBytes)], name, { type: "image/png" });
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
  __resetHandoffForTests();
});

describe("toolHandoff", () => {
  it("returns null when nothing has been staged", () => {
    expect(consumeStagedFiles()).toBeNull();
  });

  it("returns the staged payload on first consume", () => {
    const f = makeFile("a.png");
    stageFiles([f], "image-resize");
    expect(consumeStagedFiles()).toEqual({ files: [f], source: "image-resize" });
  });

  it("clears the store after consume — second consume returns null", () => {
    stageFiles([makeFile("a.png")], "image-resize");
    consumeStagedFiles();
    expect(consumeStagedFiles()).toBeNull();
  });

  it("overwrites the previous payload when stage is called twice", () => {
    stageFiles([makeFile("a.png")], "image-resize");
    const b = makeFile("b.png");
    stageFiles([b], "ppt-background");
    expect(consumeStagedFiles()).toEqual({ files: [b], source: "ppt-background" });
  });

  it("drops a payload older than TTL on consume", () => {
    stageFiles([makeFile("a.png")], "image-resize");
    vi.advanceTimersByTime(HANDOFF_TTL_MS + 1);
    expect(consumeStagedFiles()).toBeNull();
  });

  it("drops a stale payload when a new stage call arrives after TTL", () => {
    stageFiles([makeFile("old.png")], "image-resize");
    vi.advanceTimersByTime(HANDOFF_TTL_MS + 1);
    const fresh = makeFile("fresh.png");
    stageFiles([fresh], "ppt-background");
    expect(consumeStagedFiles()).toEqual({ files: [fresh], source: "ppt-background" });
  });

  it("refuses to stage when total bytes exceed HANDOFF_MAX_BYTES", () => {
    const huge = makeFile("huge.png", HANDOFF_MAX_BYTES + 1);
    stageFiles([huge], "image-resize");
    expect(consumeStagedFiles()).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm test toolHandoff`
Expected: the three new cases FAIL (imports for `HANDOFF_TTL_MS` / `HANDOFF_MAX_BYTES` missing, no TTL logic exists). The original four cases still PASS.

- [ ] **Step 3: Implement TTL + size guard**

Replace the body of `src/lib/common/toolHandoff.ts` with:

```ts
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
```

Note: the returned shape is unchanged (`{files, source}`), so no caller needs migration. `stagedAt` is internal.

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm test toolHandoff`
Expected: all 7 cases PASS.

- [ ] **Step 5: Run tsc + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: both PASS.

- [ ] **Step 6: Commit**

```bash
git add src/lib/common/toolHandoff.ts src/lib/common/toolHandoff.test.ts
git commit -m "fix(tool-handoff): drop payloads older than TTL or above size cap

A user who stages files and then closes the destination tab leaves the
File[] (and their Blob bytes) pinned in module memory for the rest of
the SPA session. 10-minute TTL + 500 MB cap evict abandoned payloads
on the next access. Handoffs are intended for immediate consumption,
not long-lived state, so the bound is loose."
```

---

## Self-review checklist (run after all tasks complete)

- [ ] Grep `src/` for `setFiles([...` — zero matches.
- [ ] `pnpm exec tsc --noEmit` passes.
- [ ] `pnpm build` passes.
- [ ] `pnpm test` — all green, including 3 new toolHandoff cases.
- [ ] Manual smoke (user-driven, since `gstack browse.exe` is blocked): start dev server, append files twice rapidly in `pdf-arrange`/`pdf-to-image`/`image-to-pdf`, verify both batches appear; trigger `image-to-pdf → pdf-compress` handoff path, verify the handoff still ingests on the destination.
- [ ] PR diff touches only: `src/hooks/useToolProcessor.ts`, `src/lib/common/toolHandoff.{ts,test.ts}`, three tool components. No tool-domain logic, no design tokens, no new deps.
