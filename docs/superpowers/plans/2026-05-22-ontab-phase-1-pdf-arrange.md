# Plan: Unified PDF page editor (pdf-arrange)

Design: `docs/superpowers/specs/2026-05-22-ontab-phase-1-pdf-arrange-design.md`
Editor mockup: Variant A (`~/.gstack/projects/KOJUNKYUNG-tools/designs/pdf-arrange-editor-20260522/`)
Reviewed: /office-hours + /design-shotgun + /plan-eng-review (2026-05-22)

Consolidates `pdf-merge` + `pdf-split` + `pdf-pages` into one page-level editor.
Ships as **two PRs**. Implementation via `superpowers:subagent-driven-development`,
each task with spec + quality two-pass review.

## Locked decisions (do not relitigate)

- Output model = sectioned multi-output via per-page `splitAfter` divider.
- 0 dividers → 1 PDF; N sections → zip. Output filename base = first uploaded
  file name (sans ext): `{base}.pdf` / `{base}-split.zip` + `{base}-1.pdf`…
- Images = bonus input (png/jpg only), embedded as pages. `image-to-pdf` NOT absorbed.
- Slug `pdf-arrange` canonical; `pdf-merge`/`pdf-split`/`pdf-pages` = live alias
  routes, hidden from Screen3 desk grid (`aliasOf`). Icon `LayoutGrid`.
- Title verbatim: "PDF 합치기 / 나누기 / 정렬".
- pdfjs self-hosted via `postinstall` → `public/pdfjs/` (PR1).
- Thumbnails lazy (IntersectionObserver), cached by page identity; rotation = CSS
  transform on thumbnail, pdf-lib rotation only on output.
- Assembler: pdf-lib only (no pdfjs dependency); source `PDFDocument` cached per file.
- Reuse `useToolProcessor` unchanged (processor closure reads current editor state).
- Total input > 100MB → soft, dismissible warning (sum of bytes). Per-file 10MB
  global limit unchanged (backlog).

## Architecture

```
Upload (pdf + png/jpg)
   │
   ▼
PageItem[]  ── state ────────────────────────────────────────────┐
  { id, sourceFileId, sourceFileName, kind: pdf|image,            │
    sourcePageIndex, rotation: 0|90|180|270, splitAfter: bool }   │
   │                                                              │
   ├── lazy thumbnails ── pdfjs (self-host) for pdf pages         │  dnd reorder
   │                      source image for image pages            │  rotate / delete
   │                      cache key = sourceFileId+sourcePageIndex │  toggle splitAfter
   │                                                              │
   ▼  적용                                                         │
splitIntoSections(items) → PageItem[][]   (split at splitAfter)    │
   │                                                              │
   ▼                                                              │
assembleSections(sections, sourceDocs)  ── pdf-lib only ──────────┘
   │   per section: new PDFDocument; for each item in order:
   │     pdf  → copyPages(cachedSourceDoc,[idx]) + setRotation
   │     image→ embedPng/Jpg + addPage(imageSize) + rotation
   ▼
package: 1 section → Uint8Array (pdf) | N → jszip → zip
   ▼
Result screen (left file list + result card; single=pdf, multi=zip)
```

Resilience: if pdfjs/thumbnails fail (offline, asset missing) the editor still
merges/splits — assembly never touches pdfjs.

---

## PR1 — `feat/ontab-pdfjs-self-host`

Goal: kill the unpkg runtime dependency. No UI change. Enables PR2's heavy use.

### Task 1.1 — postinstall copy script
- `scripts/copy-pdfjs.mjs` (Node, Windows-safe `fs.cp`): copy from
  `node_modules/pdfjs-dist/` → `public/pdfjs/`:
  - `build/pdf.worker.min.mjs`
  - `cmaps/` (Korean text rendering — required)
  - `standard_fonts/` (non-embedded fonts — required)
- `package.json`: add `"postinstall": "node scripts/copy-pdfjs.mjs"`.
- `.gitignore`: add `public/pdfjs/`.
- Acceptance: fresh `pnpm install` populates `public/pdfjs/`. Idempotent.

### Task 1.2 — shared getPdfjsLib
- `src/lib/pdf/pdfjs.ts`: single `getPdfjsLib()` setting
  `workerSrc = "/pdfjs/build/pdf.worker.min.mjs"` and returning helper consts for
  `cMapUrl = "/pdfjs/cmaps/"`, `standardFontDataUrl = "/pdfjs/standard_fonts/"`.
- Acceptance: typed, single source of pdfjs config.

### Task 1.3 — migrate existing consumers off unpkg
- `src/lib/pdf/pdfToImage.ts` + `src/lib/pdf/managePages.ts`: replace inline
  `getPdfjsLib` + unpkg URLs with the shared helper.
- Acceptance: `grep unpkg src/` → 0 matches. `pnpm exec tsc --noEmit` + `pnpm build` clean.
- Verify (user, browser): `/pdf-to-image` and `/pdf-pages` render thumbnails with
  **no network request to unpkg.com** (devtools network).

PR1 is shippable on its own.

---

## PR2 — `feat/ontab-phase-1-pdf-arrange`

### Task 2.1 — types + section logic (pure, unit-tested)
- `src/lib/pdf/pageItem.ts`: `PageItem` type; `splitIntoSections(items): PageItem[][]`
  (cut after each `splitAfter`, drop deleted, skip empty sections);
  `countSections(items): number`; `buildOutputNames(base, n): {zipName, fileNames}`.
- `pageItem.test.ts` (vitest, node): 0 dividers → 1 section; divider after every page
  → N; arbitrary; deleted excluded; all-deleted section skipped; names (1 vs N).
- Acceptance: tests pass.

### Task 2.2 — section assembler (pure, unit-tested)
- `src/lib/pdf/assembleSections.ts`: `assembleSections({sections, sourceBytesById}, onProgress)`
  → `Uint8Array[]`. Load each source `PDFDocument` once (cache by id), reuse across
  sections. pdf page → `copyPages` + `setRotation(current+rotation)`; image →
  `embedPng/Jpg` + `addPage([w,h])` + rotation. Progress across total pages.
- `packageOutputs(outputs, base)`: 1 → `{type:"pdf", data, filename}`,
  N → `{type:"zip", data: jszip, filename}` (reuse splitPdf's zip pattern).
- `assembleSections.test.ts`: merge (single source, 0 dividers), multi-source merge,
  split-all, rotation applied, image embed, mixed pdf+image order preserved.
- Acceptance: tests pass; assembler imports no pdfjs.

### Task 2.3 — lazy thumbnail rendering
- `src/components/pdf/PageThumbnail.tsx` (or `useLazyThumbnail` hook):
  IntersectionObserver renders when near viewport; pdf page via shared `getPdfjsLib`
  canvas → `toDataURL`; image page via source object URL (files-keyed `useEffect`
  create+revoke per StrictMode-safe pattern). Cache by `sourceFileId+sourcePageIndex`.
  Source pdfjs doc proxy cached per file. Rotation = CSS `transform` on the thumbnail.
- Acceptance: scrolling renders only visible pages; reorder/divider toggle = no re-render.

### Task 2.4 — editor UI (Variant A)
- `src/components/pdf/PdfArrange.tsx` (+ subcomponents `PageCard`, `Divider`,
  `EditorTopStrip`). Silver tokens from globals.css (`.nameplate`, `.glint`, silver
  scale, `accent-electric`); port Variant A treatments verbatim (centered wrap grid,
  edge-mark divider idle/hover/active, per-page section tint ring, hover controls as
  absolute overlays = zero layout shift, `+` add card with 18px gap, fixed-height
  scroll area).
- dnd-kit/sortable reorder; rotate (cycle +90°) / delete per page; divider toggle =
  `splitAfter`. `모두 분할` / `선택 해제` / `적용 (n개 파일)` live count.
- UI stability contract: hover controls overlay, divider active via color not width
  growth that shifts layout, reserved spaces.
- Memo page cards + `useCallback` handlers (memo-prop trap g).
- Acceptance (user, browser): matches mockup; no layout shift on hover/toggle.

### Task 2.5 — result screen
- Reuse image-compress result-card pattern. Left = output file list (first-page
  thumbnail, name, `formatBytes`, download). Right card = 적용 완료 + count + zip name
  + download(zip) + 다시 선택 (restores exact editor state). Single-file case: hide
  count/zip name, download pdf directly, left list = 1.
- Acceptance: single vs multi paths correct; 다시 선택 round-trips state.

### Task 2.6 — wiring, limits, guards
- `useToolProcessor` with processor closure reading current editor state; download
  via `downloadBlob` (zip or pdf).
- Total-size soft warning (>100MB sum) — dismissible banner, never blocks.
- Upload guards: `PDFDocument.load` try/catch per file (reject corrupt/encrypted with
  error); FileUpload `accept` = pdf + png/jpg only; all-deleted → 적용 disabled.
- Acceptance: corrupt file rejected gracefully; oversize warns not blocks.

### Task 2.7 — registry, routes, desk, i18n
- `src/lib/constants.ts`: add `aliasOf?: string` to `ToolInfo`. Add canonical
  `pdf-arrange` (LayoutGrid, title/desc/i18nKey, keywords merge/split/arrange/합치기/
  나누기/정렬). Mark `pdf-merge`/`pdf-split`/`pdf-pages` with `aliasOf: "pdf-arrange"`.
- Screen3 desk grid: filter out `aliasOf` entries (canonical card only).
- `tools/pdf-arrange/page.tsx` renders `<PdfArrange>`; rewrite
  `tools/pdf-merge|split|pages/page.tsx` to mount the same body (keep per-route
  metadata). Confirm Next 16 App Router patterns in `node_modules/next/dist/docs/`.
- Screen3Workspace `renderToolBody()` switch: case mapping pdf-arrange (+ alias slugs)
  to `<PdfArrange inline>`; remove old bridge cases.
- i18n: KO + EN for all new strings (labels via props, no hardcode leak — trap f).
- Acceptance: 4 URLs all open the tool; desk shows 1 PDF-arrange card; EN locale clean.

### Verification (PR2)
- `pnpm exec tsc --noEmit` + `pnpm build` clean; `pnpm test` green.
- `/qa` flows: merge (0 div), split-all (모두 분할), arbitrary split, rotate, delete,
  image+pdf mix, 다시 선택, single vs zip download, alias URLs, oversize warning.

---

## NOT in scope
- `image-to-pdf` absorption (separate tool stays). Backlog: possible later alias.
- Raising global per-file 10MB limit (cross-cutting, deferred to post-Phase-1 review).
- jsdom/component test infra (UI verified via /qa). Unit tests cover pure logic.
- Section tint palette tuning for many sections (refine during build).
- Full-tool icon/copy re-tidy pass (Phase-1-end polish backlog).

## What already exists (reused, not rebuilt)
`rebuildPdf` (rotation+copyPages logic), `imagesToPdf` (embed logic), `generateThumbnails`
(pdfjs render), `splitPdf` zip pattern, `useToolProcessor`, `FileUpload`,
`ProcessingStatus`/image-compress result card, `formatBytes`, `downloadBlob`,
`@dnd-kit/*`, `jszip`. New: `pageItem.ts`, `assembleSections.ts`, `pdfjs.ts` (PR1),
`PdfArrange` + subcomponents, lazy thumbnail.

## Failure modes
- Corrupt/encrypted PDF → load throws → caught at upload, rejected with message. (test)
- Oversize total → soft warning; real OOM → `useToolProcessor` memoryHint. (handled)
- pdfjs asset/worker missing → thumbnails fail, assembly still works. (resilient)
- Unsupported image → blocked by accept filter. (handled)

## Parallelization
- Lane A (PR1): self-host — independent, ship first.
- Lane B (PR2 logic): Task 2.1 → 2.2 (shared `src/lib/pdf/`, sequential).
- Lane C (PR2 UI): 2.3 → 2.4 → 2.5 → 2.6 (shared component tree, sequential; depends on B).
- Task 2.7 last (depends on UI body existing).
- PR1 and PR2-logic (B) can start in parallel; UI (C) waits on B + PR1 merged.
