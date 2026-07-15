# Tool Header Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Move the in-body `ToolTopStrip` (file-info + re-upload + primary action) into a shared `ToolHeader` that every tool renders in both standalone and landing-inline mounts, relocate the result-card "again" into the header primary-button lifecycle, and retire the per-tool header reset button.

**Architecture:** A new `ToolHeader` owns the header row (title/description when empty; file-info + re-upload + a stateful primary button when a file is loaded). Each tool renders `ToolHeader` itself so it can feed live file state; `Screen3Workspace` and the standalone cards stop rendering their own header. `ResultActions.again` becomes optional and every result component drops it — the done-state header primary is now the "again" affordance.

**Tech Stack:** Next.js (App Router) client components, React function components + hooks, Tailwind utility classes + CSS variable tokens (`--surface`, `--ink`, …), Vitest for the pure state-derivation helper.

**Spec:** `docs/superpowers/specs/2026-07-15-tool-header-migration-design.md`

---

## File Structure

- **Create** `src/components/common/toolHeaderState.ts` — pure `derivePrimaryState()` helper (unit-tested).
- **Create** `src/components/common/toolHeaderState.test.ts` — Vitest for the helper.
- **Create** `src/components/common/ToolHeader.tsx` — the shared header component (absorbs `ToolTopStrip`).
- **Modify** `src/components/common/ResultActions.tsx` — make `again` optional.
- **Delete** `src/components/common/ToolTopStrip.tsx` — absorbed by `ToolHeader` (after all tools migrated).
- **Modify** all 13 tool components under `src/components/tools/*/` — render `ToolHeader`, drop `!inline` header markup + reset button + in-body `ToolTopStrip`.
- **Modify** each tool's `*Result*.tsx` — drop the `again`/`onAgain` prop (again now in header).
- **Modify** `src/components/landing/Screen3Workspace.tsx` — remove its own header block.
- **Modify** `DESIGN.md` — canon updates (§ Task 20).
- **Modify** `src/i18n/dictionaries/{ko,en}.json` + each `labels.ts` — remove the now-dead `reset` key.

The 13 tool component files:
```
src/components/tools/ppt-background/PptBackgroundTool.tsx
src/components/tools/ppt-compress/PptCompress.tsx
src/components/tools/ppt-extract/PptExtract.tsx
src/components/tools/pdf-compress/PdfCompress.tsx
src/components/tools/pdf-watermark/PdfWatermark.tsx
src/components/tools/pdf-lock/PdfLock.tsx
src/components/tools/pdf-arrange/PdfArrange.tsx      (serves pdf-arrange/merge/split/pages)
src/components/tools/pdf-to-image/PdfToImage.tsx
src/components/tools/image-to-pdf/ImageToPdf.tsx
src/components/tools/image-to-pptx/ImageToPptx.tsx
src/components/tools/image-compress/ImageCompressTool.tsx
src/components/tools/image-resize/ImageResizeTool.tsx
```
(`pdf-arrange` covers 4 slugs via one component, so 12 files = 13 tools.)

---

## Task 1: `derivePrimaryState` pure helper

**Files:**
- Create: `src/components/common/toolHeaderState.ts`
- Test: `src/components/common/toolHeaderState.test.ts`

The header primary button has three visual states. Deriving them is the one piece of logic worth a unit test; everything else is markup.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/common/toolHeaderState.test.ts
import { describe, it, expect } from "vitest";
import { derivePrimaryState } from "./toolHeaderState";

describe("derivePrimaryState", () => {
  it("returns null when no file is loaded (header shows description only)", () => {
    expect(derivePrimaryState({ hasFile: false, status: "idle" })).toBeNull();
  });
  it("returns 'execute' when a file is loaded and idle", () => {
    expect(derivePrimaryState({ hasFile: true, status: "idle" })).toBe("execute");
  });
  it("returns 'processing' while running", () => {
    expect(derivePrimaryState({ hasFile: true, status: "processing" })).toBe("processing");
  });
  it("returns 'again' when done", () => {
    expect(derivePrimaryState({ hasFile: true, status: "done" })).toBe("again");
  });
  it("returns 'execute' on error so the user can re-run", () => {
    expect(derivePrimaryState({ hasFile: true, status: "error" })).toBe("execute");
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/components/common/toolHeaderState.test.ts`
Expected: FAIL — `derivePrimaryState` is not defined / module not found.

- [ ] **Step 3: Write minimal implementation**

```ts
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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/components/common/toolHeaderState.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/components/common/toolHeaderState.ts src/components/common/toolHeaderState.test.ts
git commit -m "feat(common): derivePrimaryState helper for ToolHeader"
```

---

## Task 2: `ToolHeader` component

**Files:**
- Create: `src/components/common/ToolHeader.tsx`

Absorbs `ToolTopStrip`'s markup. No unit test (pure markup driven by the tested helper); verified in the manual pass.

- [ ] **Step 1: Write the component**

```tsx
// src/components/common/ToolHeader.tsx
"use client";

import type { ReactNode } from "react";
import { derivePrimaryState } from "./toolHeaderState";
import type { ProcessingState } from "@/types";

const SUBTLE =
  "subtle-action shrink-0 rounded-[5px] px-2.5 py-1.5 font-body text-[11px] min-w-[68px] text-center";
const PRIMARY =
  "btn-primary inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 font-body text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50";

interface ToolHeaderProps {
  title: string;
  description: string;
  /** File summary "name · size". Omit when no file is loaded. */
  fileSummary?: string;
  /** Extra meta after the name, e.g. "· 12페이지". */
  meta?: ReactNode;
  /** Run status; drives the primary button. */
  status?: ProcessingState;
  /** True once a file is loaded (enables the right-side action group). */
  hasFile?: boolean;
  onReupload?: () => void;
  reuploadLabel?: string;
  /** True while a re-upload is prepared or a run is in flight. */
  busy?: boolean;
  busyReuploadLabel?: string;
  executeLabel?: string;
  processingLabel?: string;
  againLabel?: string;
  onExecute?: () => void;
  onAgain?: () => void;
  /** Disables execute (e.g. nothing selected). */
  executeDisabled?: boolean;
}

export function ToolHeader({
  title,
  description,
  fileSummary,
  meta,
  status = "idle",
  hasFile = false,
  onReupload,
  reuploadLabel,
  busy = false,
  busyReuploadLabel,
  executeLabel,
  processingLabel,
  againLabel,
  onExecute,
  onAgain,
  executeDisabled = false,
}: ToolHeaderProps) {
  const primary = derivePrimaryState({ hasFile, status });

  return (
    <div className="flex items-start gap-3">
      <div className="min-w-0 flex-1">
        <h1
          className="font-ko text-[16px] font-medium leading-[1.2] tracking-[0.005em]"
          style={{ color: "var(--headline)" }}
        >
          {title}
        </h1>
        <div
          className="mt-1 flex min-w-0 items-center gap-1 font-body text-[12px] leading-[1.45]"
          style={{ color: "var(--ink)" }}
        >
          {hasFile && fileSummary ? (
            <>
              <span className="min-w-0 truncate" title={fileSummary}>
                {fileSummary}
              </span>
              {meta}
            </>
          ) : (
            description
          )}
        </div>
      </div>

      {hasFile && (
        <div className="flex shrink-0 items-center gap-2">
          {onReupload && (
            <button
              type="button"
              className={SUBTLE}
              onClick={onReupload}
              disabled={busy}
            >
              {busy && busyReuploadLabel ? busyReuploadLabel : reuploadLabel}
            </button>
          )}
          {primary === "execute" && (
            <button
              type="button"
              onClick={onExecute}
              disabled={executeDisabled || busy}
              className={PRIMARY}
            >
              {executeLabel}
            </button>
          )}
          {primary === "processing" && (
            <button type="button" disabled className={PRIMARY}>
              {processingLabel}
            </button>
          )}
          {primary === "again" && (
            <button type="button" onClick={onAgain} className={PRIMARY}>
              {againLabel}
            </button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS (no references to `ToolHeader` yet; new file compiles).

- [ ] **Step 3: Commit**

```bash
git add src/components/common/ToolHeader.tsx
git commit -m "feat(common): ToolHeader component (absorbs ToolTopStrip)"
```

---

## Task 3: `ResultActions.again` → optional

**Files:**
- Modify: `src/components/common/ResultActions.tsx`

Make `again` optional so tools can drop it incrementally while the build stays green.

- [ ] **Step 1: Edit the interface + render**

In `ResultActionsProps`, change `again: ActionSpec;` to `again?: ActionSpec;` (keep the doc comment, note it is legacy/being retired). In the component body, guard the again button so it only renders when provided:

```tsx
export function ResultActions({ download, again, extra }: ResultActionsProps) {
  return (
    <div className="flex flex-wrap gap-1.5">
      {download && (
        /* …unchanged download button… */
      )}
      {extra}
      {again && (
        <button
          type="button"
          onClick={again.onClick}
          className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-body text-[12px]"
          style={{ color: "var(--ink-strong)" }}
        >
          <RotateCcwIcon className="size-3.5" />
          {again.label}
        </button>
      )}
    </div>
  );
}
```

- [ ] **Step 2: Type-check**

Run: `pnpm tsc --noEmit`
Expected: PASS (all existing callers still pass `again`).

- [ ] **Step 3: Commit**

```bash
git add src/components/common/ResultActions.tsx
git commit -m "refactor(common): make ResultActions.again optional (retiring)"
```

---

## Task 4: Migration recipe (reference — apply in Tasks 5–17)

This recipe is the exact transform each tool receives. It is uniform because every tool shares the same `!inline` header + reset + in-body `ToolTopStrip` shape (verified across all 13). **Read the target tool file, locate the three anchors, apply the transform, then run `pnpm tsc --noEmit` before committing.**

**Anchor A — the in-body `ToolTopStrip`** (inside the tool body, present once a file is loaded). Example (pdf-watermark):
```tsx
<ToolTopStrip
  filesSummary={fileInfo}
  meta={analysis ? (<span …>· {pageCount}</span>) : undefined}
  onReupload={handleReupload}
  reuploadLabel={labels.reupload}
  busy={busy}
  onExecute={status === "idle" ? handleApplyClick : undefined}
  executeLabel={labels.apply}
/>
```
→ **Delete** this element from the body. Its data moves to `ToolHeader` (Anchor C).

**Anchor B — the standalone `!inline` card header + reset button.** Example:
```tsx
return (
  <div className="relative flex flex-col overflow-hidden rounded-[14px] border" style={{…}}>
    <button /* RotateCcw reset */ onClick={onReset} aria-label={labels.reset} …>
      <RotateCcwIcon className="size-4" />
    </button>
    <div className="flex items-start gap-3 border-b px-6 pb-3 pt-3" style={{…}}>
      <div className="min-w-0 flex-1">
        <h1 …>{labels.title}</h1>
        <div …>{labels.description}</div>
      </div>
    </div>
    {body}
  </div>
);
```
→ **Replace** the reset button + the title/description `<div …border-b…>` block with a `border-b` wrapper hosting `<ToolHeader/>`:
```tsx
return (
  <div className="relative flex flex-col overflow-hidden rounded-[14px] border" style={{…same…}}>
    <div className="border-b px-6 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
      {header}
    </div>
    {body}
  </div>
);
```
Remove the now-unused `RotateCcwIcon` import, `onReset`, and `labels.reset`.

**Anchor C — build the shared `header` element** near where `body` is built, and render it at the TOP of the inline body too. Define once:
```tsx
const header = (
  <ToolHeader
    title={labels.title}
    description={labels.description}
    hasFile={hasFile}
    fileSummary={fileInfo}              // existing "name · size" template
    meta={/* existing count node, or undefined */}
    status={status}
    onReupload={handleReupload}
    reuploadLabel={labels.reupload}
    busy={busy}
    busyReuploadLabel={/* existing busy label if the tool has one, else undefined */}
    executeLabel={labels.apply /* the tool's execute verb key */}
    processingLabel={labels.processing}
    againLabel={labels.again}
    onExecute={/* the tool's run handler, e.g. handleApplyClick */}
    onAgain={/* the tool's retry handler, e.g. handleAgain / retry */}
    executeDisabled={/* existing execute-disabled condition, or omit */}
  />
);
```
In the **inline** return, render `{header}` as the first child above the existing body content. Concretely, change the inline branch from `if (inline) return body;` to:
```tsx
if (inline) return (<>{header}{body}</>);
```
and ensure `body`'s outer wrapper still provides its spacing (the `space-y-*` div is unchanged).

**Anchor D — the tool's Result component.** Remove the `again`/`onAgain` prop it passes to `<ResultActions>` and the `onAgain` it receives (the done-state header primary now provides again). Example (`PdfWatermarkResult.tsx`): delete `again={{ label: labels.again, onClick: onAgain }}` and the `onAgain` prop from the component's props + call site. Keep `download` and any `extra`/handoff.

**Multi-file tools** (`PdfArrange`, `ImageToPdf`, `ImageToPptx`, `PptExtract`, `PdfToImage`): before removing the header reset, confirm the body still has a way to clear all files (an add/clear control). If the header reset was the only "clear all", keep an equivalent body control — do NOT drop the function. Note it in the task.

**After each tool:** `pnpm tsc --noEmit` must pass, then commit `refactor(<tool>): adopt ToolHeader`.

---

## Task 5: Migrate `pdf-watermark`

**Files:**
- Modify: `src/components/tools/pdf-watermark/PdfWatermark.tsx`
- Modify: `src/components/tools/pdf-watermark/PdfWatermarkResult.tsx`

- [ ] **Step 1:** Apply the Task 4 recipe. Specifics: `fileSummary` = existing `fileInfo`; `meta` = the existing `analysis ? <span>· {pageCount}</span> : undefined`; `onExecute` = `handleApplyClick`; `onAgain` = `handleAgain`; `executeLabel` = `labels.apply`; single-file (no multi-file clear concern). Remove `onReset`, `labels.reset` usage, `RotateCcwIcon` import. In `PdfWatermarkResult.tsx` drop `again`/`onAgain`.
- [ ] **Step 2:** Run `pnpm tsc --noEmit` → PASS.
- [ ] **Step 3:** Commit `refactor(pdf-watermark): adopt ToolHeader`.

## Task 6: Migrate `pdf-compress`

**Files:** `src/components/tools/pdf-compress/PdfCompress.tsx`, `.../PdfCompressResult.tsx`

- [ ] Apply recipe (single-file). `onAgain` = `handleAgain`. Drop reset + result again. `pnpm tsc --noEmit` PASS. Commit `refactor(pdf-compress): adopt ToolHeader`.

## Task 7: Migrate `pdf-lock`

**Files:** `src/components/tools/pdf-lock/PdfLock.tsx`, `.../PdfLockResult.tsx`

- [ ] Apply recipe (single-file). Drop reset + result again. `pnpm tsc --noEmit` PASS. Commit `refactor(pdf-lock): adopt ToolHeader`.

## Task 8: Migrate `ppt-compress`

**Files:** `src/components/tools/ppt-compress/PptCompress.tsx`, `.../PptCompressResult.tsx`

- [ ] Apply recipe (single-file; `meta` = slide count). Drop reset + result again. `pnpm tsc --noEmit` PASS. Commit `refactor(ppt-compress): adopt ToolHeader`.

## Task 9: Migrate `image-compress`

**Files:** `src/components/tools/image-compress/ImageCompressTool.tsx`, `.../ImageCompressResult*.tsx`

- [ ] Apply recipe. NOTE: image-compress may be **multi-file** (batch) — if so, `fileSummary`/`meta` reflect the file count and confirm a body clear-all remains before removing the header reset. `pnpm tsc --noEmit` PASS. Commit `refactor(image-compress): adopt ToolHeader`.

## Task 10: Migrate `image-resize`

**Files:** `src/components/tools/image-resize/ImageResizeTool.tsx`, `.../ImageResizeResult.tsx`

- [ ] Apply recipe (note `ImageResizeResult` uses `tryAgainLabel`/`onTryAgain` prop names — drop those). Multi-file check as Task 9. `pnpm tsc --noEmit` PASS. Commit `refactor(image-resize): adopt ToolHeader`.

## Task 11: Migrate `image-to-pptx`

**Files:** `src/components/tools/image-to-pptx/ImageToPptx.tsx`, `.../ImageToPptxResult*.tsx`

- [ ] Apply recipe. Multi-file (has `PlusIcon` add-more) → confirm body clear-all remains before dropping header reset. `pnpm tsc --noEmit` PASS. Commit `refactor(image-to-pptx): adopt ToolHeader`.

## Task 12: Migrate `image-to-pdf`

**Files:** `src/components/tools/image-to-pdf/ImageToPdf.tsx`, `.../ImageToPdfResult.tsx`

- [ ] Apply recipe. Multi-file → confirm body clear-all remains. Keep the result's `extra` handoff; drop only `again`. `pnpm tsc --noEmit` PASS. Commit `refactor(image-to-pdf): adopt ToolHeader`.

## Task 13: Migrate `pdf-to-image`

**Files:** `src/components/tools/pdf-to-image/PdfToImage.tsx`, `.../PdfToImageResult.tsx`, `.../PdfToImageStreamedResult.tsx`

- [ ] Apply recipe. NOTE: `PdfToImageStreamedResult` passes `<ResultActions again=… />` with no download — after dropping `again` it may render an empty action set; if so, the streamed-result "again" must be provided by the header (it is, in done state) — verify the streamed done state sets `status==="done"` so the header shows again. `pnpm tsc --noEmit` PASS. Commit `refactor(pdf-to-image): adopt ToolHeader`.

## Task 14: Migrate `ppt-extract`

**Files:** `src/components/tools/ppt-extract/PptExtract.tsx`, `.../PptExtractResult.tsx`

- [ ] Apply recipe. `onAgain` maps to the existing `onReset` passed at `PptExtract.tsx:197`. Multi-output tool — keep `extra` handoff, drop `again`. `pnpm tsc --noEmit` PASS. Commit `refactor(ppt-extract): adopt ToolHeader`.

## Task 15: Migrate `pdf-arrange` (arrange/merge/split/pages)

**Files:** `src/components/tools/pdf-arrange/PdfArrange.tsx`, `.../PdfArrangeResult.tsx`

- [ ] Apply recipe. Multi-file, most complex — `onAgain` = `retry` (`PdfArrange.tsx:510`). Confirm the body retains add (`PlusIcon`) + a clear/remove path before dropping the header reset. This one component backs 4 slugs, so test all 4 render. `pnpm tsc --noEmit` PASS. Commit `refactor(pdf-arrange): adopt ToolHeader`.

## Task 16: Migrate `ppt-background`

**Files:** `src/components/tools/ppt-background/PptBackgroundTool.tsx` (+ its result component)

- [ ] Apply recipe. NOTE: ppt-background was polished in PR #45 and already uses `ResultActions` with `againLabel`/`onAgain` (`PptBackgroundTool.tsx:643-645`) and has **no** header reset (already removed). So: adopt `ToolHeader` for its header/strip, wire `onAgain` = `handleTryAnother`, `againLabel` = `labels.processing.tryAnother`, drop the result again. Do NOT touch its `--tray-h` placement here (that is PR-3). `pnpm tsc --noEmit` PASS. Commit `refactor(ppt-background): adopt ToolHeader`.

## Task 17: Delete `ToolTopStrip`

**Files:**
- Delete: `src/components/common/ToolTopStrip.tsx`

- [ ] **Step 1:** Confirm no references remain: `grep -rn "ToolTopStrip" src/` → only the deleted file (none in `src/` after). 
- [ ] **Step 2:** Delete the file.
- [ ] **Step 3:** Run `pnpm tsc --noEmit` → PASS.
- [ ] **Step 4:** Commit `refactor(common): remove ToolTopStrip (absorbed by ToolHeader)`.

---

## Task 18: Remove the header block from `Screen3Workspace`

**Files:**
- Modify: `src/components/landing/Screen3Workspace.tsx`

The inline card must no longer render its own title/description header — the tool now renders `ToolHeader` inside the card.

- [ ] **Step 1:** In the card wrapper (around lines 203–238), delete the header `<div className="px-6 pt-3 pb-3 flex items-start gap-3 border-b">…title…description…slug span…</div>`, keeping only the body wrapper `<div className="px-6 py-3">{renderToolBody()}</div>`. The `ToolHeader` the tool renders now sits inside this body wrapper's top. Remove the now-unused `toolDict.title`/`toolDict.description` reads if nothing else uses them.
- [ ] **Step 2:** Run `pnpm tsc --noEmit` → PASS.
- [ ] **Step 3:** Run `pnpm build` → PASS.
- [ ] **Step 4:** Commit `refactor(landing): tool owns its header in inline mount`.

---

## Task 19: Remove the dead `reset` i18n key

**Files:**
- Modify: `src/i18n/dictionaries/ko.json`, `src/i18n/dictionaries/en.json`
- Modify: each tool `labels.ts` that declared `reset`

- [ ] **Step 1:** `grep -rn "\.reset\b\|reset:" src/components/tools/*/labels.ts` to find every `labels.ts` mapping a `reset` key; remove the `reset` field from each interface + `get*Labels` mapping.
- [ ] **Step 2:** Remove the `"reset"` string from every tool's `page` block in both `ko.json` and `en.json`.
- [ ] **Step 3:** Run `pnpm tsc --noEmit` → PASS (no code references `labels.reset` after Tasks 5–16).
- [ ] **Step 4:** Commit `chore(i18n): drop dead reset key (header reset retired)`.

---

## Task 20: `DESIGN.md` canon updates

**Files:**
- Modify: `DESIGN.md`

- [ ] **Step 1:** Update these passages (keep the mono aesthetic voice):
  - **File-info row** (~L393): the name·meta row is now the header's left column when a file is loaded (title over `name · meta`); it is no longer a separate body row.
  - **Buttons / Primary execute** (~L316): document the header primary **lifecycle** — one button that reads execute → processing (disabled, "처리 중…") → again, with re-upload (Toolbar-subtle) beside it.
  - **Result view** (~L383): `ResultActions` = download → handoff; the **again lives in the header** (done state), not the card.
  - **Reset**: the absolute header reset (RotateCcw) is retired app-wide; re-upload is the single-file reset path.
- [ ] **Step 2:** Run `pnpm design:check` → PASS.
- [ ] **Step 3:** Commit `docs(design): header owns file-info + primary lifecycle; again leaves result card`.

---

## Task 21: Full verification

- [ ] **Step 1:** `pnpm tsc --noEmit` → PASS.
- [ ] **Step 2:** `pnpm build` → PASS.
- [ ] **Step 3:** `pnpm lint` (ESLint core-web-vitals) → 0 errors.
- [ ] **Step 4:** `pnpm design:check` → PASS.
- [ ] **Step 5:** `pnpm vitest run` → all green.
- [ ] **Step 6:** Hand off to the user for the manual/screenshot pass (dev server by user; no `/browse`). Verify per §8 of the spec across standalone + inline for: pdf-compress, pdf-lock, pdf-watermark (single-file), pdf-arrange, image-to-pdf (multi-file), ppt-compress, ppt-background (ppt): header empty→loaded swap; execute→processing→again lifecycle; result card has no again; no reset button; footprint stable across states.

---

## Self-Review notes

- **Spec coverage:** ToolHeader (Task 2) ✓; inline/standalone unify (Tasks 5–16, 18) ✓; again→header + ResultActions (Tasks 3, 5–16) ✓; reset retire (Tasks 5–16, 19) ✓; ToolTopStrip removal (Task 17) ✓; DESIGN.md (Task 20) ✓; i18n (Task 19) ✓; verification (Task 21) ✓.
- **Multi-file reset risk** is called out per multi-file task (9–12, 15) — do not drop clear-all function.
- **Type consistency:** `derivePrimaryState`/`PrimaryState` used identically in Tasks 1–2; `ToolHeader` prop names identical across Tasks 2, 4–16.
- **Non-goal guard:** pdf-watermark body redesign and ppt-background `--tray-h` are explicitly deferred (Tasks 5, 16 notes).
