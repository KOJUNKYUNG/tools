# Ontab Phase 1 — pdf-compress silver migration

**Date:** 2026-05-26
**Branch:** `feat/ontab-phase-1-pdf-compress`
**Scope:** Standard (silver re-skin + before/after page-1 quality compare; single PDF; no live estimate; no multi-file batch).
**Status:** Design approved.

## Why

`pdf-compress` is one of the last two tools still on the pre-Phase-1 basic shadcn shell (`bg-primary/10`, `Button`, etc.). It already receives a one-line cross-tool handoff from `image-to-pdf` but its UI does not match the silver/metallic design system the rest of Phase 1 ships with. This PR brings it in line — same materials, same button language, same idle/done layout discipline as `image-compress` and `pdf-to-image`.

The compression engine itself (`src/lib/pdf/compressPdf.ts`, backed by `@kihyun1998/justpdf-compress-wasm`) is **not changed**. All three preset paths (`low` / `medium` / `high`) reuse the existing WASM call.

## Key constraint that shaped the scope

`compressPdf` is a single whole-document WASM call. There is no cheap per-page re-encode primitive. The `image-compress` "live estimate on every control change" pattern therefore does NOT fit — re-running full-document compression on a large PDF on every preset toggle is too heavy. We deliberately exclude live estimate and instead add a **post-compression page-1 quality compare** (toggle between original and compressed page-1 rendered via pdfjs), which is the comparison signal that genuinely matters for a compression tool: "did this preset visibly hurt quality?"

## User-facing flow

1. **Empty** → `FileUpload` (single PDF, silver chrome via existing `common/FileUpload`). Or, on mount, `consumeStagedFiles()` ingests a PDF handed off from `image-to-pdf` (existing one-line behavior preserved).
2. **Idle (2-col, fixed height ≈ 52vh):**
   - Left: page-1 preview of the uploaded PDF, rendered once via pdfjs.
   - Right: preset toggles (Light / Medium / Heavy) as `nameplate[data-active]` (blue when selected), file name + size, then the primary compress button (`btn-primary glint`, full width of the column).
3. **Processing:** `ProcessingStatus` inside the same 2-col envelope (so layout doesn't shift).
4. **Done (2-col, same fixed height):**
   - Left: same preview frame, now with a `원본 / 압축` checkbox toggle that swaps the `<img src>` between the original page-1 URL and the compressed page-1 URL. No layout change on toggle.
   - Right: stats card (`inset 2px 0 0 var(--accent-electric)` left accent, matching `PdfToImageResult`): 원본 크기 / 압축 후 / 절감률, then download (`btn-download`) + 다시 (`nameplate`).
5. **Reset** (top-right `RotateCcwIcon`, page chrome variant) clears file + result.

This tool is a **terminal tool** — no outward handoff. Output is a downloaded compressed PDF.

## Component structure

New: `src/components/tools/pdf-compress/`

- `PdfCompress.tsx` — main client component. Accepts `labels: PdfCompressLabels`, `inline?: boolean`. No `lang` prop — this is a terminal tool with no outward `router.push` handoff. Two render variants (matches `ImageCompressTool` / `PdfToImage`):
  - `inline === true` → return `body` only (for Screen3Workspace mounting).
  - else → wrap `body` with the silver page card chrome (header icon + title + description + reset button).
- `PdfCompressControls.tsx` — preset toggle group. Renders three `nameplate` buttons with `data-active` for the selected one + a short description line per option.
- `ComparePreview.tsx` — `<img>` framed in the page-1 aspect ratio, with the `원본 / 압축` checkbox. Idle state hides the checkbox (only original is rendered). Done state shows the checkbox and swaps `src` between `originalPreviewUrl` and `compressedPreviewUrl`.
- `PdfCompressResult.tsx` — stats card (right column in done state) + download / again buttons.
- `labels.ts` — `getPdfCompressLabels(dict): PdfCompressLabels` mirroring the existing pattern (see `pdf-to-image/labels.ts`).

Pages / wiring touched:

- `src/app/[lang]/(chrome)/tools/pdf-compress/page.tsx` — rewritten to load dict + labels and render `<PdfCompress labels={labels} />` inside the standard `var(--tweak-workspace-width)` shell (like `pdf-to-image/page.tsx`, minus the `lang` prop).
- `src/components/landing/Screen3Workspace.tsx` — add import + `case "pdf-compress": return <PdfCompress inline labels={getPdfCompressLabels(dict)} />;`, replacing the bridge link for this slug.

## Reused assets (no new copies)

- `getPdfjsLib()` + `pdfjsDocParams` (`src/lib/pdf/pdfjs.ts`) — single source for pdfjs init.
- `useToolProcessor<CompressPdfResult>` — generation guard already handles reset / re-upload races.
- `FileUpload`, `ProcessingStatus` (`src/components/common/`).
- `formatBytes` (`src/lib/common/formatBytes.ts`).
- `computeSavings` (`src/lib/image/computeSavings.ts`) for the savings tuple. Import path is image-namespaced but the function is generic; moving it to `lib/common/` is a cross-cutting rename and goes to the polish backlog (convention 8).
- `downloadBlob` (`src/lib/pdf/downloadBlob.ts`).
- `consumeStagedFiles` (`src/lib/common/toolHandoff.ts`) — already present in the current page, behavior preserved.
- 4-role button classes from `globals.css` (`nameplate`, `nameplate[data-active]`, `btn-primary`, `btn-download`). No new tokens or material classes.

## New pure logic (TDD, node-env)

- `src/lib/pdf/pdfCompressNaming.ts` — `deriveCompressedName(originalName: string): string`.
  - `"report.pdf"` → `"report-compressed.pdf"`
  - `"report.PDF"` → `"report-compressed.pdf"` (lowercase extension on output)
  - `"no-ext"` → `"no-ext-compressed.pdf"`
  - `""` → `"compressed.pdf"` (fallback; current hardcoded value)
  - `"a.b.pdf"` → `"a.b-compressed.pdf"` (strip only the trailing `.pdf`)
- Test file: `src/lib/pdf/pdfCompressNaming.test.ts` with the five cases above.

No other new pure logic. The page-1 pdfjs render is DOM/canvas-dependent and is verified by the user in the browser per convention 5 (`pnpm dev`).

## Page-1 rendering helper

A small client-only helper (co-located in `PdfCompress.tsx` or `ComparePreview.tsx`; not a separate lib module since it is not pure):

```ts
async function renderPdfFirstPage(bytes: Uint8Array, targetWidth = 600): Promise<Blob>
```

- Calls `getPdfjsLib().getDocument({ data: bytes.slice(), ...pdfjsDocParams })` — **slice() is mandatory** (pitfall i, pdf-arrange PR #10): pdfjs transfers the buffer to its worker and detaches the original. The original `file` bytes and the WASM `result.data` are both reused downstream (compression input and download output respectively), so neither may be detached.
- Renders page 1 at the scale that hits `targetWidth`, into an offscreen canvas, and resolves to a JPEG blob (`canvas.toBlob`, quality ~0.85). JPEG is sufficient for a preview frame and stays small in memory.
- Caller wraps in `URL.createObjectURL` inside a `useEffect` keyed on the input identity, with cleanup `URL.revokeObjectURL` (StrictMode-safe, the same pattern used in `ImageCompressTool` and `PdfToImageResult`).

## Object URL lifecycle (StrictMode-safe)

Two URLs to manage:

- `originalPreviewUrl` — generated in a `useEffect` keyed on `files[0]`. Cleanup revokes. Survives StrictMode re-mount because the effect re-runs and re-creates.
- `compressedPreviewUrl` — generated in a `useEffect` keyed on the `result` object (from `useToolProcessor`). Cleanup revokes. Null while idle/processing.

The compare checkbox does NOT manage URLs; it only flips a boolean (`showCompressed`) that selects which URL to pass to `<img src>`. Identical pattern to `ImageCompressTool`.

## i18n

Extend `tools.pdf-compress` in both `src/i18n/dictionaries/ko.json` and `src/i18n/dictionaries/en.json` with a `page` block. Keys (final list lives in `labels.ts`):

```
uploadPrompt, uploadHint, uploadMaxSize,
reupload, reset,
fileInfoTemplate,           // "{name} · {size}"
presetGroupLabel,
presetLightLabel, presetLightDesc,
presetMediumLabel, presetMediumDesc,
presetHeavyLabel, presetHeavyDesc,
compress,                   // primary button
processing,
compareOriginal, compareCompressed, compareToggleAria,
resultTitle,
originalSizeLabel, compressedSizeLabel, savingsLabel,
download, again,
errorGeneric
```

Existing `title` + `description` keys are reused as-is (header text). KO copy is the source of truth; EN is a translation pass.

The shared `FileUpload` Korean toast leak (`tooLarge`, `invalidType`) stays unresolved — that's the Phase 1 end i18n sweep per the polish backlog (already deferred there).

## State machine & layout stability

Single 2-col grid, fixed height `52vh` (matches `PdfToImage`). The same grid renders in three states:

| State | Left column | Right column |
| --- | --- | --- |
| idle | `ComparePreview` (no checkbox) | `PdfCompressControls` + file info + `btn-primary` compress |
| processing | `ComparePreview` (no checkbox) | `ProcessingStatus` (centered in the column) |
| done | `ComparePreview` (with checkbox) | `PdfCompressResult` (stats + download/again) |

The right column reserves space via the parent grid; we do NOT add a `minHeight` inside the right column because the grid handles the height. The preview frame width and height are constant across states.

Per the UI stability contract: no border-width changes on selection (use `nameplate[data-active]`'s box-shadow), no layout shifts on the compare toggle (swap `src` only), no resizing of the preview frame between idle and done.

## Error handling

- `compressPdf` failure → `useToolProcessor` already routes to `errorMessage` + `ProcessingStatus` retry path. Add a `errorOptions.memoryHint` ("브라우저 메모리가 부족합니다. 더 작은 PDF를 사용해 주세요.") for OOM cases, mirroring `pdf-to-image`.
- Page-1 render failure (corrupt PDF, pdfjs throw) does NOT block compression — the preview frame falls back to a neutral silver placeholder. Compression and download still work. ("Render failure ≠ output failure", per the pdf-arrange convention.)
- Pitfall i (ArrayBuffer detach): every `getDocument({ data })` call uses `bytes.slice()`. Documented inline at each call site.

## Cross-cutting items explicitly NOT in this PR (→ polish backlog)

- `useToolProcessor` F5 / F6 / F7 (staged handoff TTL, stale setFiles closure, unmount generation bump). Already on the backlog from the `pdf-to-image` /review.
- Moving `computeSavings` from `lib/image/` to `lib/common/`.
- `FileUpload` toast EN leak (Phase 1 end i18n sweep, already deferred).
- accent-electric tone re-tuning (already on the backlog).

## Verification

- Static: `pnpm exec tsc --noEmit` and `pnpm build` (agent).
- Unit: `pnpm test` covering the new `pdfCompressNaming.test.ts` (agent).
- Visual / behavior: user runs `pnpm dev` and confirms (browse.exe is blocked on this machine, agent cannot drive a browser):
  - Standalone page: `/ko/tools/pdf-compress` and `/en/tools/pdf-compress`.
  - Inline mount: open the tool from Screen3 (workspace tray).
  - Cross-tool handoff: image-to-pdf → "Compress" → lands on pdf-compress with the PDF pre-loaded.
  - Each preset (Light / Medium / Heavy) compresses successfully and the page-1 toggle visibly differs.
  - Reset and re-upload mid-flow do not strand state.
  - Layout does not shift between idle / processing / done or on the compare toggle.

## Out of scope (deferred)

- Live estimate on preset change (WASM whole-doc cost — see top of doc).
- Multi-PDF batch compression + ZIP download (would require a new input grid; deferred unless explicit demand).
- Outward handoff (e.g. pdf-compress → pdf-arrange). pdf-compress is a terminal tool.
- Custom quality slider beyond the three presets (would need WASM API changes).
- Page-by-page selective compression.

## Shipping

`/review` (gstack) → user approval → `/ship`. No VERSION / CHANGELOG bump (project has no such convention; same as the prior 13 PRs). Squash-merge.
