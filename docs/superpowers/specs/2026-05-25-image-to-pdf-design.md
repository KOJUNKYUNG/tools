# Ontab — image-to-pdf (dedicated tool, reusing the pdf-arrange page editor)

Date: 2026-05-25
Status: approved (design confirmed by user)

## Problem / goal

`image-to-pdf` is still the old basic standalone page (centered dropzone + one
button + `imagesToPdf`). Migrate it to the silver design as a **dedicated tool**
(not a `pdf-arrange` alias) that **reuses pdf-arrange's page-editor engine**, and
add a page-sizing capability for normalizing scanned / phone-photographed
documents.

It shares pdf-arrange's editor feel (thumbnail preview, drag-reorder, rotate,
delete, "+" add-more, top-left file info + re-upload) but differs deliberately:

1. **Images only** (JPG/PNG) — no PDF input.
2. **Always one PDF output** — no split, no divider gutter.
3. **Result-left shows the produced PDF's content** (final-order page thumbnails),
   not a list of output files.
4. **Result-right has a handoff to `pdf-compress`** (carry the produced PDF over).
5. **NEW page-size control**: `이미지맞춤` / `A4` / `사용자 지정(px)` — fit images
   into a uniform page size to unify mixed scans/photos for submission.

The user is non-technical ("vibe coding"): plain-Korean recaps, autonomous within
a task, stop at boundaries.

## Architecture / reuse

### Shared page-editor module (extraction)
Promote the genuinely-shared, behavior-stable editor primitives out of
`components/tools/pdf-arrange/` into a new shared module `components/pdf-editor/`:

- `PageItemCard.tsx` — page thumbnail card (hover: page number, filename strip,
  rotate, delete). Used as-is by both tools.
- `useLazyThumbnail.ts`, `thumbnailCache.ts` — pdfjs/image thumbnail rendering +
  cache.
- `buildPageItems.ts` — File[] → PageItem[] (already handles the image branch).

`pdf-arrange` is updated to import these from the new path (mechanical move +
import rewrite, **no behavior change**). This module then also backs
`pdf-to-image` / `pdf-compress` in later cycles.

Left in `components/tools/pdf-arrange/` (arrange-specific): `Divider.tsx`,
`EditorTopStrip.tsx` (carries split actions), `PdfArrange.tsx`,
`PdfArrangeResult.tsx`.

### Reused as-is (no change)
`lib/pdf/pageItem.ts` (model + `splitIntoSections`/`buildOutputNames` — used
trivially: one section), `hooks/useToolProcessor.ts`, `components/common/FileUpload.tsx`,
`components/common/ProcessingStatus.tsx`, `lib/pdf/downloadBlob.ts`,
`lib/common/{formatBytes,template}.ts`, `lib/common/toolHandoff.ts`,
`@dnd-kit/*`, and the canonical button classes (`.btn-primary`, `.btn-download`,
`.nameplate`, `.nameplate[data-active="true"]`).

### New files (`components/tools/image-to-pdf/`)
- `ImageToPdf.tsx` — the tool (state, ingest, dnd, run, result switch). Mirrors
  `PdfArrange.tsx` structure minus split/divider, plus the page-size state.
- `ImageToPdfTopStrip.tsx` — thin top strip: file info + 다시 업로드 + 변환 button
  (a dedicated, simpler strip; no split buttons — cleaner than parameterizing
  `EditorTopStrip`).
- `PageSizeSelector.tsx` — the 3-option page-size control + custom px inputs.
- `ImageToPdfResult.tsx` — content preview (left) + result card with download +
  pdf-compress handoff (right).
- `labels.ts` — `getImageToPdfLabels(dict)` (flat labels, matching the migrated
  tools' pattern).

### Wiring
- Registry: `image-to-pdf` already exists in `TOOLS` (canonical, category `pdf`,
  icon `ImagePlus`) — no registry change.
- `Screen3Workspace.tsx`: add a `renderToolBody()` case → `<ImageToPdf inline />`.
- Dedicated page `/[lang]/(chrome)/tools/image-to-pdf/page.tsx`: replace the old
  page body with `<ImageToPdf />` (mirroring the other migrated tools' dedicated
  mount).
- i18n: add `tools["image-to-pdf"].page` block to `ko.json` + `en.json`
  (identical shape; `Dictionary` type is inferred from `ko.json`).
- Delete the now-unused old `imagesToPdf` path only if nothing else references it
  (verify; defer removal to avoid scope creep if referenced).

## Editor flow (what the user sees)

1. Upload (JPG/PNG only) → editor.
2. **Top strip**: `다시 업로드` (re-pick + replace) + file summary, and the
   **변환** primary button (`.btn-primary`, dark).
3. **Page grid** (shared `PageItemCard`): thumbnail preview, **drag to reorder**,
   rotate, delete, hover affordances (page number / filename / rotate / delete),
   trailing **"+" add card** (append more images). No divider between pages.
4. **Page-size selector** (`PageSizeSelector`, blue active-toggle taxonomy):
   - `이미지맞춤` (default) — page = image's native pixel size (one image, one
     page, no letterbox).
   - `A4` — every page A4 **portrait** (595×842 pt). Fixed portrait (no auto
     orientation in v1).
   - `사용자 지정` — reveals width × height inputs in **px**; every page = that
     size (1 px → 1 pt).

## Conversion engine

Always **one PDF** (no sections/zip). The processor builds one `PageItem[]`
(all `kind: "image"`), runs the assembler, downloads a single PDF.

Extend `assembleSections` (the shared assembler) with an optional image layout so
pdf-arrange is unaffected (it passes nothing → current behavior):

```ts
// lib/pdf/assembleSections.ts
export type ImageLayout =
  | { mode: "native" }                                  // page = image size (current)
  | { mode: "fixed"; widthPt: number; heightPt: number }; // fit into a fixed page
```

`AssembleInput` gains `imageLayout?: ImageLayout` (default `{ mode: "native" }`).
Only the **image** branch reads it; the pdf branch is untouched.

**Fixed-mode behavior** (A4 / custom):
- `out.addPage([widthPt, heightPt])`.
- Draw a **white** rectangle covering the page (the letterbox background).
- Fit the image **preserving aspect ratio, upscaling allowed** (scale =
  `min(pageW/effW, pageH/effH)`, no `≤1` clamp), centered.
- Rotation (`PageItem.rotation`, 0/90/180/270): the image's effective dimensions
  swap for 90/270 when computing the fit; the image is drawn rotated within the
  page.

A4 portrait = `{ mode: "fixed", widthPt: 595, heightPt: 842 }`. Custom px =
`{ mode: "fixed", widthPt: w, heightPt: h }` (1 px → 1 pt).

**Pure, testable fit math** is extracted to a helper so the geometry is unit-
tested independently of pdf-lib:

```ts
// lib/pdf/imageFit.ts
export function computeImageFit(
  imgW: number, imgH: number,
  pageW: number, pageH: number,
  rotation: 0 | 90 | 180 | 270,
): { drawW: number; drawH: number; x: number; y: number };
```

(The plan specifies the exact formula + cases. `native` mode bypasses this.)

## Result screen (`ImageToPdfResult`)

- **Left — content preview**: a read-only grid of the **produced PDF's actual
  pages**, in order. Build `PageItem[]` from the output PDF bytes (wrap bytes in a
  `File`, run `buildPageItems`) and render them through the same pdfjs thumbnail
  path (`useLazyThumbnail`, `kind: "pdf"`), no rotate/delete controls. Rendering
  the real output (not the source images) means the A4 / custom framing + white
  letterbox is visible — "this is exactly what's in your PDF."
- **Right — result card** (`inset 2px 0 0 var(--accent-electric)` accent like the
  other tools):
  - title + page count + output size (`formatBytes`).
  - **다운로드** (`.btn-download` + glint) → `downloadBlob(pdf, name, "application/pdf")`.
  - **PDF 압축하기** handoff (`.handoff-action`) → mirror the
    `image-resize → image-compress` pattern exactly:
    ```ts
    const pdf = new File([bytes], name, { type: "application/pdf" });
    stageFiles([pdf], "image-to-pdf");
    router.push(`/${lang}/tools/pdf-compress`);
    ```
  - **다시** (start again, `.nameplate`) → reset to dropzone.

### pdf-compress consumer (minimal touch)
`pdf-compress` is not migrated yet. Add a one-shot `consumeStagedFiles()` on mount
to its existing page so the handed-off PDF loads instead of forcing a re-upload —
identical to `ImageCompressTool.tsx`'s consumer:

```ts
useEffect(() => {
  const staged = consumeStagedFiles();
  if (staged && staged.files.length > 0) setFiles(staged.files);
  // eslint-disable-next-line react-hooks/exhaustive-deps
}, []);
```

This is the only change to `pdf-compress` in this PR (its full silver migration is
a later cycle).

## Output naming
`{firstImageBaseName}.pdf` via `deriveBaseName(items[0]?.sourceFileName)`; falls
back to `output.pdf`. No rename UI in v1.

## Accept / validation
- `ACCEPT = { "image/jpeg": [".jpg",".jpeg"], "image/png": [".png"] }`.
- `ingest` filters to image files and enforces `FILE_SIZE_LIMIT.guest` per file
  (mirrors pdf-arrange's add-path guard). A dropped non-image is rejected with a
  toast.

## Testing
- **Pure logic (TDD, vitest node-env):**
  - `computeImageFit` — scale (incl. upscaling), centering, and 90/270 dimension
    swap. Multiple cases (portrait image into A4, landscape into A4, square into
    custom, rotated).
  - Assembler fixed-mode: assemble a known image into A4, parse the output with
    pdf-lib, assert page size = 595×842.
- **UI:** browser verification (the gstack `browse.exe` is blocked by Windows
  Application Control in this environment, so the light/dark visual pass is done
  by the user on `localhost:3000`, as in the button-unification work).
- `pnpm exec tsc --noEmit`, `pnpm test` (existing 78 + new), `pnpm build` — green.

## Out of scope (v1, deferred)
- WebP (or other) image input — JPG/PNG only.
- Multiple images per page (grid/N-up).
- Background color options — white only.
- Filename rename UI.
- Custom size in units other than px; A4 landscape / auto orientation.
- Full `pdf-compress` silver migration (only the consume line is added here).

## Why this is future-proof
The new `components/pdf-editor/` shared module backs `pdf-arrange` + `image-to-pdf`
now and `pdf-to-image` / `pdf-compress` next — page-editor behavior is defined
once. The assembler's `imageLayout` param generalizes image placement without
forking the engine.
