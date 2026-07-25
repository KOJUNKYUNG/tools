# pdf-watermark Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Redesign the pdf-watermark workspace (divider, watermark default, settings-box hierarchy, compact surface-2 inputs), add free-drag page-number placement alongside the 9-anchor preset, a tile-gap control, the `1p` suffix, the encrypted-PDF i18n fix, an empty-selection guard, and the two momentary button roles.

**Architecture:** New pure geometry helper `resolveNumberCenter` (shared by preview + export so drag === output) plus a `tileGap` multiplier thread through `overlayLayout` → `applyPdfOverlay` → preview. UI reworks are token/layout only. A shared `.file-action` button class splits file-open buttons from state chips.

**Tech Stack:** Next.js client components, React hooks, Tailwind + CSS-var tokens, pdf-lib + pdfjs, Vitest for pure logic.

**Spec:** `docs/superpowers/specs/2026-07-15-pdf-watermark-polish-design.md`. **Mockup:** `docs/design-preview-pdf-watermark.html`.

---

## File Structure

- `src/lib/pdf/overlayLayout.ts` — add `resolveNumberCenter` + `scaledTileGaps`; keep `computeAnchor`/`computeTilePositions`/`defaultTileGaps`.
- `src/lib/pdf/overlayLayout.test.ts` — new tests for both helpers.
- `src/lib/errors.ts` (+ `errors.test.ts` if present, else add) — `INVALID_INPUT` sentinel + `invalidInputHint`.
- `src/lib/pdf/applyPdfOverlay.ts` — `position`/`tileGap` in options; route non-tile center through `resolveNumberCenter`; scale tile gaps; `INVALID_INPUT` throw.
- `src/components/tools/pdf-watermark/*` — `PdfWatermark`, `PdfWatermarkModeToggle`, `PageNumberControls`, `WatermarkControls`, `PositionGrid`, `PdfWatermarkPreview`, `labels.ts`.
- `src/components/common/ToolHeader.tsx` — re-upload → `.file-action`.
- `src/app/globals.css` — `.file-action` class.
- `src/i18n/dictionaries/{ko,en}.json` — `errorOpen`, `pageUnitSuffix` ko, tile-gap label.
- `DESIGN.md` — panel divider + two momentary button roles.
- `docs/design-preview.html` — fold in the pdf-watermark section; delete `docs/design-preview-pdf-watermark.html`.

Coordinate convention (critical): the geometry works in **visual page space, bottom-left origin, y-up** (see `overlayLayout.ts` header + `drawOverlayOnPage`). The UI `position` is normalized **top-left** (0..1, y-down — canvas-natural). `resolveNumberCenter` converts.

---

## Task 1: `resolveNumberCenter` geometry helper (TDD)

**Files:** `src/lib/pdf/overlayLayout.ts`, `src/lib/pdf/overlayLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
// append to src/lib/pdf/overlayLayout.test.ts (create if missing with the imports)
import { describe, it, expect } from "vitest";
import { resolveNumberCenter, computeAnchor } from "./overlayLayout";

describe("resolveNumberCenter", () => {
  const base = { pageW: 200, pageH: 100, boxW: 20, boxH: 10, margin: 8 };

  it("null position === the grid anchor's center (preset parity)", () => {
    const c = resolveNumberCenter({ grid: "bottom-center", position: null, ...base });
    const corner = computeAnchor("bottom-center", base.pageW, base.pageH, base.boxW, base.boxH, base.margin);
    expect(c.x).toBeCloseTo(corner.x + base.boxW / 2);
    expect(c.y).toBeCloseTo(corner.y + base.boxH / 2);
  });

  it("free position maps normalized top-left to visual bottom-left center", () => {
    // top-left normalized (0.5, 0.25) → visual center x=100, y=100*(1-0.25)=75
    const c = resolveNumberCenter({ grid: "center", position: { x: 0.5, y: 0.25 }, ...base });
    expect(c.x).toBeCloseTo(100);
    expect(c.y).toBeCloseTo(75);
  });

  it("clamps a top-left corner drag so the box stays fully on-page", () => {
    // position (0,0) → visual center would be (0,100); clamp to (boxW/2, pageH-boxH/2)=(10,95)
    const c = resolveNumberCenter({ grid: "center", position: { x: 0, y: 0 }, ...base });
    expect(c.x).toBeCloseTo(10);
    expect(c.y).toBeCloseTo(95);
  });

  it("clamps an out-of-range position into the page", () => {
    const c = resolveNumberCenter({ grid: "center", position: { x: 1.5, y: 1.5 }, ...base });
    expect(c.x).toBeCloseTo(base.pageW - base.boxW / 2); // 190
    expect(c.y).toBeCloseTo(base.boxH / 2); // 5
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/pdf/overlayLayout.test.ts`
Expected: FAIL — `resolveNumberCenter` not exported.

- [ ] **Step 3: Implement**

```ts
// add to src/lib/pdf/overlayLayout.ts
/**
 * Center (visual space, bottom-left origin, y-up) at which to place a page
 * number. `position` is normalized top-left (0..1, y-down — canvas-natural);
 * null falls back to the `grid` anchor + margin. The center is clamped so the
 * box (boxW × boxH) stays fully on the page.
 */
export function resolveNumberCenter(opts: {
  grid: GridPosition;
  position: { x: number; y: number } | null;
  pageW: number;
  pageH: number;
  boxW: number;
  boxH: number;
  margin: number;
}): Point {
  const { grid, position, pageW, pageH, boxW, boxH, margin } = opts;
  const clamp = (v: number, lo: number, hi: number) =>
    Math.min(Math.max(v, lo), Math.min(hi, Math.max(lo, hi)));

  if (position) {
    const cx = position.x * pageW;
    const cyTopLeft = position.y * pageH;
    const cy = pageH - cyTopLeft; // flip to bottom-left origin
    return {
      x: clamp(cx, boxW / 2, pageW - boxW / 2),
      y: clamp(cy, boxH / 2, pageH - boxH / 2),
    };
  }

  const corner = computeAnchor(grid, pageW, pageH, boxW, boxH, margin);
  return { x: corner.x + boxW / 2, y: corner.y + boxH / 2 };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/pdf/overlayLayout.test.ts`
Expected: PASS (4 new tests).

- [ ] **Step 5: Commit** — `git add` both files; `feat(pdf): resolveNumberCenter for free + preset number placement`.

---

## Task 2: `scaledTileGaps` for the tile-gap multiplier (TDD)

**Files:** `src/lib/pdf/overlayLayout.ts`, `src/lib/pdf/overlayLayout.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { scaledTileGaps, defaultTileGaps } from "./overlayLayout";

describe("scaledTileGaps", () => {
  it("multiplier 1 === defaultTileGaps (no behavior change)", () => {
    expect(scaledTileGaps(100, 40, 1)).toEqual(defaultTileGaps(100, 40));
  });
  it("scales both gaps by the multiplier", () => {
    const base = defaultTileGaps(100, 40);
    const s = scaledTileGaps(100, 40, 2);
    expect(s.gapX).toBeCloseTo(base.gapX * 2);
    expect(s.gapY).toBeCloseTo(base.gapY * 2);
  });
  it("clamps a non-finite or non-positive multiplier to 1", () => {
    expect(scaledTileGaps(100, 40, 0)).toEqual(defaultTileGaps(100, 40));
    expect(scaledTileGaps(100, 40, Number.NaN)).toEqual(defaultTileGaps(100, 40));
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/pdf/overlayLayout.test.ts` → FAIL (`scaledTileGaps` undefined).

- [ ] **Step 3: Implement**

```ts
// add to src/lib/pdf/overlayLayout.ts
/** defaultTileGaps scaled by a user multiplier (>0); non-positive/NaN → 1. */
export function scaledTileGaps(
  tileW: number,
  tileH: number,
  multiplier: number,
): { gapX: number; gapY: number } {
  const m = Number.isFinite(multiplier) && multiplier > 0 ? multiplier : 1;
  const base = defaultTileGaps(tileW, tileH);
  return { gapX: base.gapX * m, gapY: base.gapY * m };
}
```

- [ ] **Step 4: Run** → PASS.
- [ ] **Step 5: Commit** — `feat(pdf): scaledTileGaps tile-gap multiplier`.

---

## Task 3: `INVALID_INPUT` error mapping (TDD)

**Files:** `src/lib/errors.ts`, `src/lib/errors.test.ts` (create if absent)

- [ ] **Step 1: Write the failing test**

```ts
// src/lib/errors.test.ts (create) — mirror existing test style if a file exists
import { describe, it, expect } from "vitest";
import { getErrorMessage, INVALID_INPUT_PREFIX } from "./errors";

describe("getErrorMessage INVALID_INPUT", () => {
  it("maps an INVALID_INPUT-prefixed error to the provided hint", () => {
    const err = new Error(`${INVALID_INPUT_PREFIX}: broken`);
    const r = getErrorMessage(err, { invalidInputHint: "Couldn't open this PDF." });
    expect(r.message).toBe("Couldn't open this PDF.");
  });
  it("falls back to the default INVALID_FILE message when no hint is given", () => {
    const err = new Error(`${INVALID_INPUT_PREFIX}: broken`);
    const r = getErrorMessage(err);
    expect(r.message).toBe("지원하지 않거나 손상된 파일입니다.");
  });
});
```

- [ ] **Step 2: Run** `pnpm vitest run src/lib/errors.test.ts` → FAIL.

- [ ] **Step 3: Implement** in `src/lib/errors.ts`:
  - Add `export const INVALID_INPUT_PREFIX = "INVALID_INPUT";`
  - Add `invalidInputHint?: string;` to `GetErrorMessageOptions`.
  - In `getErrorMessage`, BEFORE the `CORRUPT_OUTPUT` block, add:
```ts
if (rawMessage.startsWith(INVALID_INPUT_PREFIX)) {
  return {
    code: ToolErrorCode.INVALID_FILE,
    message: options.invalidInputHint ?? ERROR_MESSAGES[ToolErrorCode.INVALID_FILE],
  };
}
```

- [ ] **Step 4: Run** → PASS. Also `pnpm tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(errors): INVALID_INPUT sentinel + hint (reusable)`.

---

## Task 4: Extend option + state types

**Files:** `src/lib/pdf/applyPdfOverlay.ts`, `src/components/tools/pdf-watermark/PageNumberControls.tsx`, `WatermarkControls.tsx`

- [ ] **Step 1:** In `applyPdfOverlay.ts`:
  - `PageNumberOptions`: add `position: { x: number; y: number } | null;`
  - `WatermarkOptions`: add `tileGap: number;`
- [ ] **Step 2:** `PageNumberState = Omit<PageNumberOptions, "mode" | "suffix" | "pages">` and `WatermarkState = Omit<WatermarkOptions, "mode" | "pages">` pick up the new fields automatically. In `PdfWatermark.tsx` update `DEFAULT_PAGE` to include `position: null` and `DEFAULT_WM` to include `tileGap: 1`.
- [ ] **Step 3:** `pnpm tsc --noEmit` → PASS (defaults set; wiring follows).
- [ ] **Step 4: Commit** — `feat(pdf-watermark): position + tileGap option fields`.

---

## Task 5: Wire `applyPdfOverlay` to the new geometry + error

**Files:** `src/lib/pdf/applyPdfOverlay.ts`

- [ ] **Step 1:** Load-failure throw: change the `catch` in `PDFDocument.load` to `throw new Error("INVALID_INPUT: PDF를 열 수 없습니다. 암호화되었거나 손상된 파일일 수 있습니다.");`.
- [ ] **Step 2:** `drawOverlayOnPage` — add `position?: { x: number; y: number } | null` to `DrawOpts`; in the non-tile branch replace the `computeAnchor`-center IIFE with:
```ts
const center = resolveNumberCenter({
  grid: opts.grid,
  position: opts.position ?? null,
  pageW: vw, pageH: vh,
  boxW: dw, boxH: dh,
  margin: opts.margin,
});
const centersV: Point[] = opts.tile ? tileCenters(vw, vh, dw, dh) : [center];
```
(Import `resolveNumberCenter`; `tileCenters` now takes a multiplier — see step 3.)
- [ ] **Step 3:** Tile gaps: `tileCenters` gains a `mult` param and calls `scaledTileGaps(w, h, mult)` instead of `defaultTileGaps`. In the watermark branch pass `options.tileGap`; in the number branch tile is always false so it's unused. Pass `position: options.mode === "number" ? options.position : null` and `tileGap` into the `drawOverlayOnPage` opts.
- [ ] **Step 4:** `pnpm tsc --noEmit` → PASS; `pnpm vitest run src/lib/pdf` → PASS (existing overlay tests still green; `tileGap:1` reproduces old spacing per Task 2).
- [ ] **Step 5: Commit** — `feat(pdf): free number position + tile-gap in applyOverlay; localize open failure`.

---

## Task 6: i18n — errorOpen, 1p suffix, tile-gap label

**Files:** `src/i18n/dictionaries/{ko,en}.json`, `src/components/tools/pdf-watermark/labels.ts`

- [ ] **Step 1:** In both dictionaries under `tools["pdf-watermark"].page`:
  - Add `"errorOpen"`: ko `"PDF를 열 수 없습니다. 암호화되었거나 손상된 파일일 수 있습니다."`, en `"Couldn't open this PDF. It may be encrypted or damaged."`
  - Change ko `"pageUnitSuffix"` `"쪽"` → `"p"` (en already `"p"`).
  - Add `"tileGapLabel"`: ko `"반복 간격"`, en `"Tile spacing"`.
- [ ] **Step 2:** `labels.ts`: add `errorOpen: string;` and `tileGapLabel: string;` to `PdfWatermarkLabels` + map `errorOpen: p.errorOpen`, `tileGapLabel: p.tileGapLabel`.
- [ ] **Step 3:** `pnpm tsc --noEmit` → PASS. `node -e "require('./src/i18n/dictionaries/ko.json');require('./src/i18n/dictionaries/en.json')"` → no throw.
- [ ] **Step 4: Commit** — `chore(i18n): pdf-watermark errorOpen, 1p suffix, tile-gap label`.

---

## Task 7: `.file-action` button role + DESIGN.md canon

**Files:** `src/app/globals.css`, `DESIGN.md`

- [ ] **Step 1:** In `globals.css`, next to `.subtle-action`, add:
```css
/* File-open action — the momentary click-action that opens the OS file picker
 * (re-upload, choose-logo, gallery upload). Distinct from .subtle-action state
 * chips by a raised --surface fill (vs recessed --surface-2); neutral, no hue. */
.file-action {
  background: var(--surface);
  border: 1px solid var(--border);
  color: var(--ink-strong);
}
.file-action:hover { border-color: var(--emphasis); }
```
- [ ] **Step 2:** In `DESIGN.md` Buttons section, split the "Toolbar subtle" row into two momentary roles: **State-setting** (`.subtle-action`, `--surface-2` — All / Clear / …) and **File-open** (`.file-action`, `--surface` fill — re-upload / choose-logo / gallery upload). Update the matching Don't (L~478) to reference both. Add an "Other components" **Panel divider** line: 2-panel workspaces separate columns with a single 1px `--border`.
- [ ] **Step 3:** `pnpm design:check` → PASS.
- [ ] **Step 4: Commit** — `feat(design): file-action button role + panel divider canon`.

---

## Task 8: ToolHeader re-upload → file-action (shared)

**Files:** `src/components/common/ToolHeader.tsx`

- [ ] **Step 1:** In the `SUBTLE` const, swap the `subtle-action` class for `file-action` (re-upload is a file-open action). Keep the layout utilities (`shrink-0 rounded-[5px] px-2.5 py-1.5 font-body text-[11px] min-w-[68px] text-center`).
- [ ] **Step 2:** `pnpm tsc --noEmit` + `pnpm build` → PASS. (Class swap; no layout change — every tool's re-upload adopts it via the shared component.)
- [ ] **Step 3: Commit** — `refactor(common): re-upload uses the file-action treatment`.

---

## Task 9: Mode toggle — order + hug underline

**Files:** `src/components/tools/pdf-watermark/PdfWatermarkModeToggle.tsx`

- [ ] **Step 1:** `ORDER` = `["watermark", "number"]`. Change the row from full-width (`flex` + `flex-1` tabs) to content-width: container `inline-flex border-b` and tabs drop `flex-1` (use `px-4 py-2`). The `--emphasis` underline now spans only the labels.
- [ ] **Step 2:** `pnpm tsc --noEmit` → PASS.
- [ ] **Step 3: Commit** — `feat(pdf-watermark): watermark-first mode toggle, hug underline`.

---

## Task 10: PageNumberControls — compact, surface-2, hug, position clear

**Files:** `src/components/tools/pdf-watermark/PageNumberControls.tsx`

- [ ] **Step 1:** `INPUT_STYLE` `background` → `var(--surface-2)`; the color `<input>` wrapper `background` → `var(--surface-2)`. Tighten the start/font/color grid (spec §4.4 — e.g. narrower fixed widths). Format tabs: container `inline-flex border-b`, tabs drop `flex-1` (hug underline).
- [ ] **Step 2:** The `PositionGrid` `onChange` here must also clear the free position: the parent passes an `onGrid(grid)` that does `onChange({ grid, position: null })`. Update the `PositionGrid` usage to call it.
- [ ] **Step 3:** `pnpm tsc --noEmit` → PASS.
- [ ] **Step 4: Commit** — `feat(pdf-watermark): compact surface-2 number controls; grid clears free position`.

---

## Task 11: WatermarkControls — settings box, hug, surface-2, tile-gap, logo file-action

**Files:** `src/components/tools/pdf-watermark/WatermarkControls.tsx`

- [ ] **Step 1:** Wrap the controls in the settings box (`border`, `--border`, `rounded-[8px]`, `p-3`) with the source (text/logo) toggle as a hug `inline-flex border-b` at its top (spec §4.3).
- [ ] **Step 2:** Inputs (text, font, color) `background` → `var(--surface-2)`; the `Slider` number field `background` → `var(--surface-2)`.
- [ ] **Step 3:** Choose-logo button: `nameplate` → `file-action` class.
- [ ] **Step 4:** Add a tile-gap `Slider` (`label={labels.tileGapLabel}`, min 50 max 300 mapping to `tileGap` 0.5–3.0, e.g. value `Math.round(value.tileGap*100)`, `onChange v => onChange({ tileGap: v/100 })`, suffix `%`). Render it ONLY when `value.tile === true`, but reserve its row height when hidden (wrap in a fixed-min-height container) so toggling tile doesn't shift layout ([[ontab_conventions]] UI stability).
- [ ] **Step 5:** `pnpm tsc --noEmit` → PASS.
- [ ] **Step 6: Commit** — `feat(pdf-watermark): settings box, surface-2, tile-gap slider, logo file-action`.

---

## Task 12: Preview — draggable number + shared geometry

**Files:** `src/components/tools/pdf-watermark/PdfWatermarkPreview.tsx`

- [ ] **Step 1:** Number mode draw: replace the `computeAnchor` + `topY` math with `resolveNumberCenter({ grid: pageOpts.grid, position: pageOpts.position, pageW, pageH, boxW: box.width, boxH: box.height, margin: pageOpts.margin * s })`, then draw the text centered on that center (convert the visual bottom-left center to canvas top-left: `canvasY = pageH - center.y`). Keep the existing font/measure logic.
- [ ] **Step 2:** Tile watermark: replace `defaultTileGaps` with `scaledTileGaps(drawW, drawH, wmOpts.tileGap)`.
- [ ] **Step 3:** Drag: when `mode === "number"`, make the number hit-region draggable. On pointer down within the number's box, capture; on move, compute normalized top-left position from the pointer over the canvas rect (clamp 0..1) and call `onPositionChange({ x, y })` (new prop). Add `grab`/`grabbing` cursor + a faint hover outline. Provide `onPositionChange` from the parent. (No `.result-pop` — preview element.)
- [ ] **Step 4:** `pnpm tsc --noEmit` → PASS.
- [ ] **Step 5: Commit** — `feat(pdf-watermark): drag the page number on the preview`.

---

## Task 13: PdfWatermark — default, position state, guard, errorOpen, divider

**Files:** `src/components/tools/pdf-watermark/PdfWatermark.tsx`

- [ ] **Step 1:** `useState<WatermarkMode>("watermark")` (default). `DEFAULT_PAGE.position = null`, `DEFAULT_WM.tileGap = 1` (from Task 4).
- [ ] **Step 2:** `patchPage` already merges partials — the preview's `onPositionChange` calls `patchPage({ position })`; the grid's `onGrid` calls `patchPage({ grid, position: null })`. Reset (`handleFilesChange([])` path) and file-change effect set `position: null` (via `setPageOpts(DEFAULT_PAGE)` / patch).
- [ ] **Step 3:** Empty-selection guard: pass `executeDisabled={selectedPages.size === 0}` to the `ToolHeader`.
- [ ] **Step 4:** `errorOptions` gains `invalidInputHint: labels.errorOpen`.
- [ ] **Step 5:** Panel divider: the right column wrapper gets `border-l` `--border` (spec §4.1) with matching left padding; the left preview column keeps its padding.
- [ ] **Step 6:** `pnpm tsc --noEmit` + `pnpm build` → PASS.
- [ ] **Step 7: Commit** — `feat(pdf-watermark): watermark default, divider, empty-selection guard, open-error hint`.

---

## Task 14: Design record — fold + delete working file

**Files:** `docs/design-preview.html`, delete `docs/design-preview-pdf-watermark.html`

- [ ] **Step 1:** Add a static `pdf-watermark` section to `docs/design-preview.html` (mirror the ppt-background section's format): the assembled workspace + the design intent (watermark-default, settings-box hierarchy, 9-anchor + free-drag coexistence, two button roles, tile-gap, surface-2 inputs).
- [ ] **Step 2:** `git rm docs/design-preview-pdf-watermark.html`.
- [ ] **Step 3: Commit** — `docs(design): fold pdf-watermark polish into design-preview`.

---

## Task 15: Full verification

- [ ] `pnpm tsc --noEmit` → PASS.
- [ ] `pnpm build` → PASS.
- [ ] `pnpm lint` → 0 errors.
- [ ] `pnpm design:check` → PASS.
- [ ] `pnpm vitest run` → all green (new: resolveNumberCenter ×4, scaledTileGaps ×3, INVALID_INPUT ×2).
- [ ] Hand off to the user (dev server; screenshots; no `/browse`) per spec §10: drag-vs-export parity on a multi-page + rotated PDF; anchor↔drag interplay; tile-gap on text + logo; watermark-first paint; divider + settings box; encrypted PDF → localized error; Apply disabled at 0 pages; inputs `--surface-2`; file-open vs state buttons distinguishable.

---

## Self-Review notes

- **Spec coverage:** ① divider (T13) ✓; ② default/order (T9,T13) ✓; ③B box + hug (T9–T11) ✓; ⑤ compact surface-2 (T10,T11) ✓; ④ position model + drag + preset (T1,T4,T5,T10,T12,T13) ✓; ⑥b file-action (T7,T8,T11) ✓; #1 tile-gap (T2,T5,T11,T12) ✓; #3 1p (T6) ✓; i18n leak (T3,T5,T6,T13) ✓; empty guard (T13) ✓; record (T14) ✓.
- **Type consistency:** `position: {x,y}|null` and `tileGap: number` identical across T4/T5/T10/T12/T13; `resolveNumberCenter`/`scaledTileGaps`/`INVALID_INPUT_PREFIX` signatures identical to their defining tasks.
- **Regression guard:** `tileGap:1` and `position:null` reproduce today's output (T2, T1 parity tests) so nothing changes unless the user drags or moves the slider.
- **Coordinate convention** stated up front and encoded in the T1 tests (normalized top-left → visual bottom-left center).
