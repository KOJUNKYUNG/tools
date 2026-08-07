# pdf-watermark polish — layout redesign + positioning + conformance

- **Date:** 2026-07-15
- **Branch:** `chore/polish-pdf-watermark` (stacked on `refactor/tool-header` / PR #46 — depends on the shared `ToolHeader`)
- **PR:** 2 of 3 in the pdf-watermark polish session. PR-1 = tool-header migration (merged/pending). PR-3 = ppt-background tray-height.
- **Scope:** Redesign the pdf-watermark workspace (two-mode: page-number / watermark), add free-drag number positioning + tile-gap control, split the button roles, fix the encrypted-PDF i18n leak and the empty-selection no-op, and conform inputs to the token contract. Then fold the design record into `docs/design-preview.html`.
- **Working mockup:** `docs/design-preview-pdf-watermark.html` (iterated + user-approved; the assembled view is the target). Folds into `docs/design-preview.html` on completion, then deleted.
- **References:** `DESIGN.md`, `docs/brand.html`, `src/app/globals.css` @theme, `docs/agents/tool-polishing-checklist.md`. Memory: `ontab-polishing-phase`, `common-component-unification`, `result-pop-card-only`, `ontab_conventions`, `ontab_copy_conventions`, `design-brand-sync`, `user_context`.

---

## 1. Motivation

pdf-watermark is the highest-complexity, highest-frequency tool (weekly church score page-numbering). PR-1 gave it the shared header; this PR reworks the body: the mode/format/source toggles read as one flat tier (no hierarchy), the panels lack the divider other tools have, page-number placement is limited to 9 fixed anchors, tiled watermarks can't control spacing, and several token/logic drifts remain (inputs on `--surface` not `--surface-2`, an encrypted-PDF error that leaks Korean to EN users, and an empty page-selection that silently no-ops). The user reviewed a working mockup and locked the direction below.

## 2. Goals

**Layout (A):** panel divider · watermark default + toggle order · settings-box hierarchy · compact inputs · content-width toggle underlines.
**Positioning (B):** keep the 9-anchor grid preset AND allow free-drag placement of the page number on the preview.
**Buttons/inputs (C):** distinguish state-setting from file-open buttons; unify all text/number inputs to `--surface-2`.
**Features (D):** tile-repeat gap control; `1p` page-number suffix in both locales.
**Robustness (E):** map the PDF-open failure to a localized message; disable Apply when nothing is selected.
**Record (F):** fold the mockup into `docs/design-preview.html`.

## 3. Non-goals

- Watermark (logo/text) free-drag placement — only the **page number** gets free-drag this PR; watermark keeps grid + tile. (Free watermark drag is a backlog item.)
- ppt-background `--tray-h` placement — PR-3.
- Icon migration (lucide → brand line-set) — global backlog.
- New watermark sources beyond text/logo.

## 4. Layout redesign (A)

Two-panel workspace under the header (from PR-1). Left = live preview (persists). 1px `--border` vertical divider. Right = mode toggle → settings box → page-range.

### 4.1 Panel divider (①)
The right panel gets `border-l` (`--border`) — the same 1px region separator other 2-panel tools use. Add to `DESIGN.md` "Other components": **Panel divider** — 2-panel workspaces separate the columns with a single 1px `--border` (never a shadow or gap-only split).

### 4.2 Defaults + order (②)
`DEFAULT` mode = `"watermark"`. Mode toggle order = `["watermark", "number"]` (tool name leads with watermark). `PdfWatermarkModeToggle` `ORDER` updated.

### 4.3 Toggle hierarchy (③B) + underline width
- The **mode toggle** (워터마크 / 페이지 번호) stays a tab-underline but the settings below it are wrapped in a bordered **settings box** (`--border`, `rounded-[8px]`, `p-3`), so the mode toggle reads as the parent tier.
- **All in-control toggles hug their content** (`inline-flex`, left-aligned) — the underline spans only the button labels, never full width. Applies to the mode toggle, the format tabs (number mode), and the text/logo source toggle (watermark mode). No stray full-width hairline under a toggle.

### 4.4 Compact inputs (⑤)
Tighten the number-mode value row (start / font / color) and the watermark text row so fields are only as wide as needed. No functional change — layout only.

## 5. Page-number positioning (B / ④)

**Both** input methods coexist, page-number mode only:
- **9-anchor `PositionGrid`** (right panel) — preset placement, unchanged UI.
- **Free-drag on the preview** — dragging the rendered number sets a free position.

### 5.1 Data model
Add to `PageNumberOptions` (and the `PageNumberState` UI type) a nullable free position:
```ts
/** Normalized CENTER of the number in visual page space (0..1, origin top-left),
 *  or null to fall back to the `grid` anchor + margin. */
position: { x: number; y: number } | null;
```
- `position === null` → placement resolves from `grid` + `margin` (today's behavior).
- `position !== null` → placement is the free center; `grid` is ignored for layout.

### 5.2 Resolver (pure, unit-tested)
New `overlayLayout` helper:
```ts
/** Returns the number box's CENTER in visual page space. */
resolveNumberCenter(opts: {
  grid: GridPosition;
  position: { x: number; y: number } | null;
  pageW: number; pageH: number;
  boxW: number; boxH: number;
  margin: number;
}): Point
```
- `position` set → `{ x: position.x * pageW, y: position.y * pageH }`, clamped so the box stays fully on-page (center clamped to `[boxW/2, pageW - boxW/2]` × `[boxH/2, pageH - boxH/2]`).
- `position` null → derive the center from the existing 9-anchor corner math (`computeAnchor` + half-box), so the 9 presets are unchanged.

Both the preview (canvas) and the exporter (`applyPdfOverlay` → `drawOverlayOnPage`) call `resolveNumberCenter` so drag preview === export. The page's `/Rotate` mapping (visual→user space) already exists in `drawOverlayOnPage` and is unaffected (center is computed in visual space, then mapped).

### 5.3 Interaction
- Drag the number on the preview → set `position` to the normalized pointer (clamped). While dragging, `PositionGrid` shows **no active anchor** (custom state).
- Click a `PositionGrid` anchor → set `position = null` and `grid = <anchor>` (returns to preset).
- Re-analysis / file change / reset → `position = null`.
- Cursor affordance: the number shows `grab` / `grabbing`; a faint outline on hover marks it draggable (preview only — no `.result-pop`; this is a preview element, [[result-pop-card-only]]).

### 5.4 Tests (Vitest)
`resolveNumberCenter`: preset parity with the 9 anchors (null position), free position maps + clamps at all four edges, and a position outside `[0,1]` clamps into range.

## 6. Buttons + inputs (C)

### 6.1 Button roles — state vs file-open (⑥b)
`DESIGN.md` currently mandates ONE Toolbar-subtle treatment for every momentary click-action. Split it into two roles (neutral only — no hue, per the Don'ts):
- **State-setting** (전체 / 지우기 / All / Clear — pure UI-state toggles): **Toolbar-subtle** — `--surface-2` fill (unchanged).
- **File-open** (re-upload, choose-logo, gallery upload — actions that open the OS file picker): **`--surface` fill** + `--border` edge, hover `--emphasis` edge. Reads as a raised affordance vs the recessed state chips. No leading glyph (icon migration is out of scope).

Implement as a shared class/util alongside `subtle-action` in `globals.css` (e.g. `.file-action`) so every site composes it. Apply to:
- **Re-upload** in the shared `ToolHeader` (SUBTLE → file-action) — propagates to all tools (the re-upload button is a file-open action everywhere). Cross-tool, fixed at the source ([[common-component-unification]]).
- **Choose-logo** in `WatermarkControls`.
- (ppt-background gallery "이미지 업로드" adopts the same class — verify in the visual pass; its layout is PR-3 but the button class is shared.)

Update `DESIGN.md` Buttons table + Don'ts to describe the two momentary roles.

### 6.2 Inputs → `--surface-2` (⑤ / B drift)
Every text/number/color input in `PageNumberControls` and `WatermarkControls` (start, font size, color swatch, watermark text, sliders' number field) uses `--surface-2` fill per `DESIGN.md` L359. Today they use `--surface` — a contract drift. The page-range text input is already `--surface-2` (`PageRangeSelector`). Page-range stays **text-only** (no cell tray — confirmed: `PageRangeSelector` renders input + All/Clear only).

## 7. Features (D)

### 7.1 Tile-repeat gap (#1)
Today `defaultTileGaps(drawW, drawH)` fixes the spacing between repeats. Add a user control:
- `WatermarkOptions.tileGap: number` — a spacing **multiplier** (e.g. 0.5–3.0, default 1.0) applied to the base gap. `WatermarkState` gains `tileGap`.
- `computeTilePositions` receives the multiplied gaps; `defaultTileGaps` stays the base, callers scale by `tileGap`.
- `WatermarkControls`: a gap slider, visible only when `tile === true` (reserve its row so toggling tile doesn't jump layout — [[ontab_conventions]] UI stability). Applies to both text and logo watermarks.
- Preview mirrors the same multiplied gap.
- Test: `computeTilePositions` count/spacing scales with the multiplier; multiplier 1.0 === today's output.

### 7.2 Page-number suffix `1p` (#3)
The `ko` format currently renders `1쪽`. Make the unit suffix `p` in **both** locales so the "ko"/`1p` format is locale-independent. Change `pageUnitSuffix` ko value `"쪽"` → `"p"` in `ko.json` (en already `"p"`). The format label `formatKo` ("1p") already matches. No code change beyond the dictionary value; `formatPageNumber` uses the suffix as-is.

## 8. Robustness (E)

### 8.1 Encrypted / corrupt open failure (i18n leak)
`applyOverlay` throws a hardcoded Korean string when `PDFDocument.load` fails; `getErrorMessage` falls through to the raw-message branch → Korean shown to EN users.
- `errors.ts`: add `export const INVALID_INPUT_PREFIX = "INVALID_INPUT"` and an `invalidInputHint?: string` option; in `getErrorMessage`, a message starting with the prefix → `{ code: INVALID_FILE, message: invalidInputHint ?? ERROR_MESSAGES[INVALID_FILE] }`. (Reusable by other PDF tools later.)
- `applyPdfOverlay`: throw `new Error("INVALID_INPUT: …")` on load failure.
- `PdfWatermark`: pass `invalidInputHint: labels.errorOpen` in `errorOptions`.
- `labels.ts` + both dictionaries: add `errorOpen` — ko `"PDF를 열 수 없습니다. 암호화되었거나 손상된 파일일 수 있습니다."`, en `"Couldn't open this PDF. It may be encrypted or damaged."`

### 8.2 Empty-selection guard
When `selectedPages.size === 0`, applying is a no-op that returns the original bytes as a "result". Disable Apply instead: pass `executeDisabled={selectedPages.size === 0}` to the header (covers both a user-cleared selection and an analysis that produced no pages). The existing text/logo pre-validation (toast) stays for watermark mode.

## 9. Component changes

- `PdfWatermark.tsx` — DEFAULT mode watermark; `position` state + drag wiring passed to preview; `executeDisabled` on empty selection; `errorOpen` in `errorOptions`; header `extraActions`/labels unchanged from PR-1.
- `PdfWatermarkModeToggle.tsx` — order + hug underline.
- `PageNumberControls.tsx` — compact row; inputs `--surface-2`; format tabs hug; consumes/sets `position` via grid (clears position on anchor click).
- `WatermarkControls.tsx` — settings box; source toggle hug; inputs `--surface-2`; choose-logo → file-action class; tile-gap slider (reserved row); tileGap wiring.
- `PositionGrid.tsx` — unchanged UI; its `onChange` now also clears `position` (handled in the parent).
- `PdfWatermarkPreview.tsx` — draggable number (pointer handlers → normalized position, clamped); uses `resolveNumberCenter`; mirrors tileGap.
- `src/lib/pdf/overlayLayout.ts` — `resolveNumberCenter` (new); `computeTilePositions` gap scaling.
- `src/lib/pdf/applyPdfOverlay.ts` — use `resolveNumberCenter`; `position`/`tileGap` in options; `INVALID_INPUT` throw.
- `src/lib/errors.ts` — `INVALID_INPUT` sentinel + hint.
- `labels.ts` + `ko/en.json` — `errorOpen`; `pageUnitSuffix` ko→`p`; tile-gap label; any new control labels.
- `DESIGN.md` — panel divider; two momentary button roles; (inputs `--surface-2` already documented). `docs/brand.html` unaffected (no logo/icon/motion change).

## 10. Verification

- Pure logic (`resolveNumberCenter` presets/free/clamp; `computeTilePositions` gap scaling; suffix format) — subagent TDD (RED→GREEN→REFACTOR).
- `tsc` + `build` + ESLint + `pnpm design:check`.
- Visual (dev server by user; screenshots; no `/browse`): drag-position matches export on a real multi-page PDF (incl. a rotated page); 9-anchor preset ↔ drag interplay; tile-gap slider on text + logo; watermark-default first paint; divider + settings-box hierarchy; encrypted PDF shows the localized open error; Apply disabled at 0 pages; inputs read as `--surface-2`; file-open vs state buttons distinguishable.
- `/review` (adapted) → PR.

## 11. Design record (F)

On completion, fold the assembled mockup + intent (why watermark-default, why free-drag + preset coexist, the two button roles, tile-gap) into `docs/design-preview.html` as a static pdf-watermark section (ppt-background section is the precedent), then delete `docs/design-preview-pdf-watermark.html`. Sync `DESIGN.md` in the same commit as any canon change ([[design-brand-sync]]).

## 12. Risks

- **Free-drag ↔ rotation/export parity** — the normalized center must map through `/Rotate` identically in preview and export; the existing visual↔user mapping covers it, but rotated-page drag must be visually verified.
- **`position` clamping** — a number dragged to the edge must not clip off-page; clamp by half-box in `resolveNumberCenter` (tested).
- **Cross-tool re-upload restyle** — moving re-upload to the file-action treatment touches every tool via `ToolHeader`; verify no tool regresses (it's a class swap, no layout change).
- **Tile-gap default** — `tileGap: 1.0` must reproduce today's spacing exactly (regression-tested) so existing behavior is unchanged unless the user moves the slider.
