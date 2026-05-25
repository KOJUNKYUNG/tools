# Ontab — pdf-to-image (silver migration, reusing the pdf-editor module)

Date: 2026-05-26
Status: approved (design confirmed by user)

## Problem / goal

`pdf-to-image` is still the old basic standalone page (centered dropzone +
shadcn tokens + format/DPI button rows + `ProcessingStatus`-only result).
Migrate it to the silver design as a **dedicated tool** that **reuses the
`components/pdf-editor/` module** (extracted in the image-to-pdf cycle).

In plain terms: take the **pdf-arrange input screen, remove divider + reorder,
add an image-format choice**; convert to the **image-to-pdf result layout**
(right action card + left 3-column image grid). It is effectively the mirror of
image-to-pdf (PDF→images instead of images→PDF).

The user is non-technical ("vibe coding"): plain-Korean recaps, autonomous
within a task, stop at boundaries. Visual verification is done by the user via
`pnpm dev` (the gstack `browse.exe` is blocked by Windows Application Control).

## Scope (confirmed with user)

Standard migration **plus an editable input grid**:

1. **Multiple PDF upload** — several PDFs become one combined page set.
2. **Input page grid** = `PageItemCard` grid with **rotate + delete + filename
   (hover)**. **No divider, no drag-reorder.**
3. **Format choice** JPG/PNG + **DPI** 72/150/300 (existing options, silver
   toggles).
4. **Result screen** = image-to-pdf layout: right result card, left 3-column
   image grid. Hover on an image shows: image number, filename, per-image
   download button.
5. **Result card** has three buttons: download (**ZIP**), handoff to
   `image-compress`, and 다시 (back to the pre-convert editor).
6. Rotation + deletion from the input grid are **applied to the conversion
   output**.
7. inline (Screen3 mount) + standalone, full i18n (ko/en).

Out of scope: page-range selector, live re-encode preview (PDF full-page render
is too heavy for image-compress-style live estimation), `.handoff` *into*
pdf-to-image.

## Architecture / reuse

### Reused as-is (no change)
- `components/pdf-editor/`: `PageItemCard.tsx`, `useLazyThumbnail.ts`,
  `thumbnailCache.ts`, `buildPageItems.ts` (already multi-file + `deriveBaseName`).
- `lib/pdf/pageItem.ts` (`PageItem`, `Rotation`), `pdfjs.ts`
  (`getPdfjsLib` + `pdfjsDocParams`), `downloadBlob.ts`.
- `hooks/useToolProcessor.ts` (generation-guarded), `components/common/FileUpload.tsx`,
  `components/common/ProcessingStatus.tsx`, `lib/common/{formatBytes,template,toolHandoff}.ts`.
- Canonical button classes: `.btn-primary`, `.btn-download`, `.handoff-action`,
  `.nameplate`, `.nameplate[data-active="true"]`. **No new tokens / material classes.**

### Shared-component change (minimal, backwards-compatible)
`PageItemCard.tsx` gets a new optional prop **`draggable?: boolean` (default
`true`)**. When `false`, the `cursor-grab active:cursor-grabbing` classes are
dropped (pdf-to-image has no reorder, so the grab cursor would mislead). Default
preserves existing pdf-arrange / image-to-pdf behavior exactly.

### New / rewritten files

`src/lib/pdf/pdfToImage.ts` (rewrite):
- Signature changes to accept the edited page model:
  `pdfToImages({ jobs, sourceBytesById, format, dpi, baseName, onProgress })`
  where `jobs: ConversionJob[]` come from `buildConversionJobs`.
- Opens one pdfjs document **per distinct `sourceFileId`, cached** for the run
  (a multi-page PDF is opened once). Uses `getDocument({ data: bytes.slice() })`
  — **trap (i)**: thumbnails share the same `sourceBytesById` buffers; passing
  the original would detach them and break the live thumbnail cache.
- Applies rotation via `page.getViewport({ scale, rotation })`
  (`scale = dpi / 72`).
- Returns `ConvertedImage[] = { name, blob }` with names from `deriveImageName`.
- Per-page canvas released (`canvas.width = canvas.height = 0`) — keep existing
  OOM guard + `memoryHint`.

`src/lib/pdf/pdfToImageNaming.ts` (new, pure — **TDD**):
- `deriveImageName(base, index, total, ext)` → `{base}-{NN}.{ext}`, the index
  zero-padded to the width of `total` (e.g. 12 pages → `report-01.jpg`).
- `deriveZipName(base)` → `{base}-images.zip`.

`src/lib/pdf/buildConversionJobs.ts` (new, pure — **TDD**; or co-located in
`pageItem.ts`):
- `buildConversionJobs(items: PageItem[]) => ConversionJob[]` where
  `ConversionJob = { sourceFileId, sourcePageIndex, rotation }`.
- Drops `deleted` pages, preserves order. pdfjs/DOM-free → node-env unit tested.

`src/components/tools/pdf-to-image/`:
- `PdfToImage.tsx` — the tool: multi-PDF ingest via `buildPageItems`,
  `PageItemCard` grid (rotate/delete, **no DndContext**), format/DPI state, run,
  result switch, inline/standalone split. Mirrors `ImageToPdf.tsx` minus dnd and
  page-size, plus format/DPI.
- `PdfToImageTopStrip.tsx` — file summary + 다시 업로드 + format/DPI toggles +
  변환 button.
- `PdfToImageResult.tsx` — left 3-column result grid + right action card.
- `labels.ts` — `dict.tools["pdf-to-image"]` → labels mapper (image-to-pdf shape).

`src/app/[lang]/(chrome)/tools/pdf-to-image/page.tsx` (rewrite): load dict →
render `<PdfToImage labels lang />`. Server→client passes plain strings only
(**trap (e)** — no function props).

`Screen3Workspace`: add `case "pdf-to-image"` to `renderToolBody()` switch and
replace the bridge `Link` with the inline mount.

## Screen flow & layout

Single fixed-height envelope across **all** states — same as image-to-pdf:
`style={{ height: "52vh" }}`. The tool's vertical size does not change when
moving idle → processing → result.

1. **Upload (empty)**: `FileUpload` (PDF, `multiple`, `hideFileList`).
2. **Editor (idle, files present)**:
   - `PdfToImageTopStrip`: file summary (`filesOne`/`filesMany` templates) +
     다시 업로드 + format(JPG/PNG) + DPI(72/150/300) + 이미지로 변환.
   - Scrollable `PageItemCard` grid (`draggable={false}`, rotate + delete +
     hover filename). A 300-DPI hint line appears when DPI = 300.
3. **Processing**: `ProcessingStatus` (per-page `onProgress`).
4. **Result**: `PdfToImageResult` (below).

### Result screen
2-column grid (`md:grid-cols-2`, `height: 52vh`):
- **Left** (`ob-scroll`, overflow-y-auto): converted images in a **3-column
  grid**. Each cell is a `group` with `group-hover:opacity-100` overlays, using
  the same visual language as `PageItemCard`:
  - image = result **Blob object URL directly** (already-rendered raster — no
    pdfjs re-render), `loading="lazy"` + `decoding="async"` for large PDFs.
  - top-left: image number badge — fixed color `rgba(20,30,60,0.85)` white text
    (**trap (j)**: on-paper overlays must be theme-independent).
  - bottom: filename strip (truncate, white chip) + file size.
  - top-right: per-image download button (white chip) — download in place of
    rotate/delete.
- **Right** action card (`self-start`, `inset 2px 0 0 var(--accent-electric)`):
  - summary: image count · total size.
  - **다운로드 (ZIP)** — `.btn-download`. Single page → single image instead.
  - **image-compress 핸드오프** — `.handoff-action`; `stageFiles(imageFiles,
    "pdf-to-image")` then `router.push(/${lang}/tools/image-compress)`.
  - **다시** — `.nameplate`; `retry()` back to the editor (state preserved).

## Filenames

- Image: `{firstPdfBase}-{NN}.{ext}` — `firstPdfBase = deriveBaseName(first
  uploaded file)`, `NN` = output ordinal (1-based) zero-padded to total width.
- ZIP: `{firstPdfBase}-images.zip`.
- Per-image handoff to image-compress reuses the same names.

## Conversion data flow

1. Editor holds `items: PageItem[]` + `sourceBytesById: Map<id, Uint8Array>`
   from `buildPageItems(pdfFiles)`.
2. On 변환: `jobs = buildConversionJobs(items)` (deleted dropped, order kept).
   Guard: empty jobs → throw "변환할 페이지가 없습니다."
3. `pdfToImages({ jobs, sourceBytesById, format, dpi, baseName, onProgress })`:
   - group jobs by `sourceFileId`; open each pdfjs doc once
     (`getDocument({ data: bytes.slice(), ...pdfjsDocParams })`).
   - for each job in order: render `sourcePageIndex+1` at `scale`, `rotation`;
     canvas → Blob (`image/jpeg` q=0.92 | `image/png`); name via `deriveImageName`.
   - report progress by completed/total.
4. Result holds `ConvertedImage[]`; object URLs created in a `useEffect` keyed on
   the result and revoked on cleanup (**StrictMode-safe**, matches image-compress).

## Error handling

- Corrupt/encrypted PDFs are skipped at upload (`buildPageItems` collects them in
  `failed`); surface a toast like image-to-pdf's ingest. One bad file never
  aborts the upload.
- Conversion errors flow through `useToolProcessor` → `ProcessingStatus` with the
  existing `memoryHint` for OOM on large/high-DPI PDFs.
- `useToolProcessor` generation guard already covers reset/re-upload races — no
  local "disable during processing" workarounds needed.

## Testing

- **Unit (vitest, node-env)**: `pdfToImageNaming.ts` (padding widths, single vs
  multi, extension; zip name) and `buildConversionJobs.ts` (deleted dropped,
  order preserved, rotation carried, empty input).
- **Browser (user)**: silver visuals, multi-PDF upload, rotate/delete reflected
  in output, format/DPI correctness, 3-column hover overlays, ZIP + per-image +
  single-page download, image-compress handoff, height stability across states,
  dark mode on-paper overlays, StrictMode object-URL survival.
- Static gates (agent): `pnpm exec tsc --noEmit` + `pnpm build`.

## Conventions / guardrails

- Visual fidelity is a contract: reuse existing silver tokens + material classes;
  do not invent new ones.
- UI stability contract: fixed-size envelope, hover overlays are absolute (no
  layout shift), badge via opacity not layout.
- Cross-cutting polish (icon/label/description audit, magic-number tokenization,
  accent-electric retune, "10 tools" hardcode, FileUpload toast i18n leak) stays
  in the Phase-1 polish backlog — not this PR. The only shared-component touch
  here is the backwards-compatible `PageItemCard` `draggable` prop.
- Branch `feat/ontab-phase-1-pdf-to-image`; one tool = one branch = one PR.
- Ship gate: `/review` → `/ship` (substantive UI/logic change).
