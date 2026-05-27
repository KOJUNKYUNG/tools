# ppt-extract — silver migration (Phase 1 final tool)

**Date:** 2026-05-27
**Branch (planned):** `feat/ontab-phase-1-ppt-extract`
**Status:** Design approved (scope: M — silver re-skin + per-image preview/download grid)

## Context

`ppt-extract` is the last Phase 1 tool still on the legacy basic shadcn layout. Phase 1 silver migration patterns are locked in by `pdf-compress` (PR #14) and `pdf-to-image` (PR #13). This migration brings `ppt-extract` to parity and completes Phase 1.

The underlying extraction engine (`src/lib/ppt/extractImages.ts` + `extractImagesFromPpt.ts`) already handles both `.pptx` (JSZip / `ppt/media/`) and `.ppt` (CFB / BLIP records, all common formats). No extraction logic rewrite — only output shape, surrounding UI, and integration patterns change.

## Goals

1. Silver visual language (tokens, materials, 4-role button system) at parity with pdf-compress / pdf-to-image / image-to-pdf.
2. Per-image preview grid with individual + ZIP download (pdf-to-image result pattern).
3. Inline mount inside `Screen3Workspace` (bridge replaced).
4. EN/KO i18n parity, labels-injection contract.
5. Reuse existing common modules; no new shared assets.

## Non-goals (out of scope, deferred to backlog)

- Slide → image mapping (L-scope; needs slide rels parsing, .ppt has no analog).
- Handoff to image-compress (image-compress accepts JPG/PNG/WebP only; user chose to skip the button).
- Multi-PPTX upload (current single-file flow preserved; multi is a Phase 2 candidate).
- Cross-cutting: `--silver-100` dark-mode frame background, ResultCell shared component, copy/icon audit. All deferred to the Phase 1 polish PR.
- pdf-compress corrupt-output bug — separate PR (`fix/pdf-compress-corrupt-output`).

## Architecture

### File layout

```
src/components/tools/ppt-extract/
  PptExtract.tsx              # main; inline? + labels props
  PptExtractResult.tsx        # 3-col grid + right action card
  ExtractedImageCard.tsx      # per-image cell (renderable vs placeholder)
  labels.ts                   # getPptExtractLabels(dict)

src/lib/ppt/
  extractImages.ts            # signature change: returns ExtractedImage[]
  extractImagesFromPpt.ts     # same; returns ExtractedImage[]
  buildExtractZip.ts          # NEW pure helper: ExtractedImage[] → Uint8Array (ZIP)
  pptImageFormats.ts          # NEW pure helper: ext → mime, isRenderable

src/app/[lang]/(chrome)/tools/ppt-extract/page.tsx   # server: dict load + render
src/components/landing/Screen3Workspace.tsx          # add case "ppt-extract"
src/i18n/dictionaries/{ko,en}.json                   # add tools["ppt-extract"].page.*
```

### Data model

```ts
// src/lib/ppt/extractImages.ts
export interface ExtractedImage {
  name: string;        // e.g. "image_3.png"
  data: Uint8Array;    // raw bytes
  mime: string;        // from pptImageFormats; "application/octet-stream" for non-renderable
  size: number;        // bytes
}

export interface ExtractImagesOptions {
  file: File;
  onProgress?: (pct: number) => void;
}

export function extractPptImages(opts: ExtractImagesOptions): Promise<ExtractedImage[]>;
```

ZIP composition moves to download time via `buildExtractZip(images): Promise<Uint8Array>`. The current `Uint8Array` return is dropped (only consumer is this page).

### Idle preview (added 2026-05-28, user feedback)

The post-upload pre-extract screen previously showed only file info + extract button — visually thin compared to pdf-compress. To match the silver "left preview, right info+action" pattern:

- New pure helper `src/lib/ppt/analyzePresentation.ts` exposing `analyzePresentation(file): Promise<PresentationAnalysis>` where `PresentationAnalysis = { imageCount, formatCounts: Record<string, number>, thumbnailBlob: Blob | null, thumbnailMime: string | null }`.
  - PPTX path: JSZip scan of `ppt/media/*` for counts/formats (no per-entry decompression for size — size is summed in extracted-result screen). Thumbnail picked from `docProps/thumbnail.{jpeg,jpg,png}` (case-insensitive), returned as `Blob` of the raw entry bytes.
  - .ppt (CFB) path: re-run `parseBlipRecords` for counts/formats; `thumbnailBlob = null`.
  - Failure is non-fatal: analysis errors yield `null` state in UI, extract still works.
- New component `src/components/tools/ppt-extract/PptExtractPreview.tsx` — 2-col `52vh`:
  - Left: thumbnail frame (`--silver-100` letterbox, `object-contain`). When `thumbnailBlob === null` → `FileImage` placeholder with `previewUnavailable` label (matches `ExtractedImageCard` non-renderable style).
  - Right: count summary (`{n} 장 / {n} images`), format breakdown chip (reuses `PptExtractResult` breakdown composer — extract to a tiny shared helper `formatBreakdown(images-or-names) → string` to avoid drift).
- `PptExtract.tsx` idle layout (file present, `status === "idle"`) becomes the 2-col grid; extract button moves to the right column above the count summary, reupload row moves to top of left column (matches pdf-compress).
- Object URL for thumbnail follows the StrictMode-safe `useEffect` pattern (single URL, revoke on cleanup, re-key on `file`).

i18n keys added: `analyzingHint`, `previewUnavailable`, `imagesLabel` (right-column header). `formatBreakdown` reuses existing data — no new key.

### Format table (`pptImageFormats.ts`)

| ext            | mime                       | renderable |
|----------------|----------------------------|------------|
| png            | image/png                  | yes        |
| jpg / jpeg     | image/jpeg                 | yes        |
| gif            | image/gif                  | yes        |
| bmp            | image/bmp                  | yes (most browsers) |
| tiff / tif     | image/tiff                 | no         |
| svg            | image/svg+xml              | no (XSS risk, render as placeholder) |
| emf            | application/octet-stream   | no         |
| wmf            | application/octet-stream   | no         |

Single source of truth. UI uses `isRenderable(ext)` to branch card variant.

### UI composition

**PptExtract.tsx** (idle → processing → done states via `useToolProcessor<ExtractedImage[]>`):

- Header chrome (page-mode only; suppressed when `inline`).
- `FileUpload` — accept `.ppt`/`.pptx`, single file, `labels` injected.
- File-info row (name + formatted size).
- `.btn-primary` "이미지 추출 / Extract images" → `run()`.
- `ProcessingStatus` (shared, silver) for processing/error states.
- On `done`: render `<PptExtractResult images={images} ... />`.

**PptExtractResult.tsx**:

- Two-column layout matching pdf-to-image (left: grid in fixed-height scroll container; right: action card). On mobile (`md` below) stacks; right card becomes `min-height` not fixed (cross-cutting backlog item already notes this for pdf-compress, do not solve here).
- Left: CSS grid `repeat(3, minmax(0, 1fr))` of `<ExtractedImageCard>`.
- Right action card:
  - Heading `extractedCountTemplate` (e.g. "추출 결과 17장 / 17 images extracted").
  - Total bytes (formatBytes).
  - Format breakdown chip row (e.g. "PNG 12 · JPG 3 · EMF 2"); derived from `images`.
  - `.btn-download` "ZIP 다운로드 / Download ZIP" → `buildExtractZip(images)` + `downloadBlobObject`.
  - `.nameplate` "다시 작업 / Start over" → `reset()` (delegated up to parent so `useToolProcessor` clears).

**ExtractedImageCard.tsx**:

- Fixed-aspect frame (`aspect-[4/3]`), `--silver-100` background, `rounded-[9px]`, border `--border`. Matches pdf-to-image ResultCell tokens.
- Renderable: `<img src={objectURL} className="size-full object-contain">`. Object URL created in parent `useEffect` (see below).
- Non-renderable: centered `<FileImage>` icon (lucide) + extension uppercase badge below.
- Overlay (always-visible bottom strip; hover does not change layout — UI stability contract):
  - Bottom: number badge (1-based) + filename (truncate) + bytes.
  - Right-hover: `.btn-download` mini button → `downloadBlobObject(blob, name, mime)`.
- Number badge / overlay text uses fixed `--silver-*` colors (trap j — on-paper overlays).

### Object URL lifecycle (StrictMode-safe)

In `PptExtractResult`:

```ts
const [urls, setUrls] = useState<(string | null)[]>([]);
useEffect(() => {
  const next = images.map(img =>
    isRenderable(getExt(img.name)) ? URL.createObjectURL(new Blob([img.data], { type: img.mime })) : null
  );
  setUrls(next);
  return () => { next.forEach(u => { if (u) URL.revokeObjectURL(u); }); };
}, [images]);
```

Per-image individual download builds a fresh Blob on click (no leaked URL). Established image-compress pattern.

### Screen3Workspace integration

Add to existing `switch (tool.slug)` in `renderToolBody()`:

```tsx
case "ppt-extract":
  return <PptExtract inline labels={getPptExtractLabels(dict)} />;
```

Bridge `Link` for ppt-extract is now superseded.

### i18n keys (new under `tools["ppt-extract"].page`)

```
reset, uploadPrompt, uploadHint, uploadMaxSize, reupload,
fileInfoTemplate, extract, processing,
resultTitle, extractedCountTemplate, totalSizeLabel, formatBreakdownTemplate,
downloadZip, again,
errorNoImages, errorPptParse
```

KO defaults from current page text; EN authored fresh. `extractedCountTemplate` uses `{count}` via `template.ts`. Format breakdown is comma-separable, composed in component (no per-format keys needed).

## Testing

### Unit tests (vitest, node env)

- `pptImageFormats.test.ts` — `getMime(ext)`, `isRenderable(ext)`, case insensitive, unknown ext → octet-stream + not renderable. ~8 cases.
- `buildExtractZip.test.ts` — empty array throws; n images → valid ZIP, member names preserved, member bytes round-trip via JSZip. ~3 cases.

Extraction backends are not new TDD targets (logic unchanged; only return shape adjusted). Existing manual coverage via QA.

### Static verification

- `pnpm exec tsc --noEmit`
- `pnpm build`
- `pnpm test` (existing + new)

### Visual verification

User-driven (`pnpm dev`). Confirm:

- Idle, processing, done, error states.
- `.pptx` with mixed PNG/JPG.
- `.ppt` (legacy CFB) extraction.
- A PPTX containing EMF/WMF (placeholder cards render, ZIP includes them).
- Individual download from card.
- ZIP download with correct base name.
- Reset returns to idle without leaked URLs (DevTools).
- Inline mount via Screen3.
- KO + EN locale.

## Risks / open items

- **BMP rendering inconsistency**: Safari supports BMP via `<img>`; older edge cases exist. Acceptable — placeholder fallback is one-line change if reported.
- **SVG placeholder vs render**: SVG inside `<img>` is sandboxed against script execution by all modern browsers, but extracted SVG provenance is untrusted. Keeping non-renderable to avoid edge-case rendering surprises and to keep card heights uniform.
- **ZIP build on large decks (50+ MB images)**: JSZip `generateAsync({type:"uint8array"})` is synchronous-feeling; current behavior identical to today (eager ZIP). Acceptable for Phase 1.

## Reference patterns

- pdf-to-image (`src/components/tools/pdf-to-image/PdfToImageResult.tsx`) — 3-col grid + right action card; tokens, hover overlay, individual download.
- pdf-compress (`src/components/tools/pdf-compress/`) — labels.ts contract, `inline` prop, server-page composition.
- image-compress — StrictMode-safe `URL.createObjectURL` lifecycle.
- ppt-background — `inline` mount precedent.

## Conventions cross-check

- Convention 4: branch `feat/ontab-phase-1-ppt-extract` ✓
- Convention 5: dev server user-only; static via tsc/build ✓
- Convention 7: push/PR confirm gate ✓
- Convention 8: no cross-cutting changes ✓
- Tools-extensibility: registry untouched (entry already exists) ✓
- Trap h: 1-based numbering ✓
- Trap j: fixed `--silver-*` on overlays ✓
