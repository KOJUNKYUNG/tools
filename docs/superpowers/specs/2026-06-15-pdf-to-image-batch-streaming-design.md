# pdf-to-image batch streaming download + per-tool upload-cap recalibration

Date: 2026-06-15
Status: approved (design)

## Problem

`pdf-to-image` renders **every** page and accumulates all output blobs in one
array (`pdfToImage.ts` `images[]`), which the result screen then holds in React
state (grid preview + per-image download + image-compress hand-off), and the
download path zips them all into a single archive. The per-page canvas backing
store is already released immediately, so the remaining accumulation source is
the output blobs.

For a many-page job (a church bulletin or sheet-music PDF at 300 DPI, 100+
pages) this peaks at hundreds of MB of compressed output held simultaneously,
plus a full zip copy — a real out-of-memory risk on mobile Safari and on large
jobs generally. This output-accumulation ceiling is also what currently caps how
high `pdf-to-image`'s input upload limit can safely go.

Two linked changes:

- **③** Stream the output in batches so peak memory is bounded by one batch
  instead of the whole job.
- **④** With the output ceiling removed, recalibrate the per-tool upload caps
  (`UPLOAD_LIMIT` in `constants.ts`), classified by processing-path memory
  profile.

## ③ Architecture — "measure while flushing"

Do **not** pre-estimate output size (pages × DPI is fragile across page sizes,
formats, and content). Instead render page by page, accumulate the **actual**
output bytes, and flush a batch when a byte target is reached. This is robust to
DPI, format, and page dimensions automatically.

### Render library (`src/lib/pdf/pdfToImage.ts`)

Add to `PdfToImageOptions`:

- `batchByteTarget: number` — default sourced from
  `PDF_TO_IMAGE_BATCH_BYTES` (new constant, `50 * MB`).
- `onBatch?: (images: ConvertedImage[], batchIndex: number, isLast: boolean) => Promise<void> | void`

Loop behaviour:

1. Render a page → push `{ name, blob }` into `current[]`, add `blob.size` to
   `currentBytes`.
2. If `currentBytes >= batchByteTarget` **and there are still pages left to
   process** → set `streaming = true`, `await onBatch(current, ++batchIndex,
   false)`, then clear `current`/`currentBytes`.
3. After the loop: if `streaming`, flush any remainder as the last batch
   (`isLast = true`) and return `{ mode: "streamed", imageCount, batchCount }`.
   Otherwise return `{ mode: "preview", images: current }`.

Discriminated return type:

```ts
export type PdfToImageOutcome =
  | { mode: "preview"; images: ConvertedImage[] }
  | { mode: "streamed"; imageCount: number; batchCount: number };
```

Key property: a job that fits within a single batch (target never reached
before the last page) returns `preview` = **exactly today's behaviour** (grid,
per-image download, compress hand-off, single zip). Only a job that overflows
mid-render switches to `streamed`. The "exactly at target on the final page"
edge resolves to `preview` (no mid-flush triggers), so there is no regression
for jobs that are merely "just barely big" — they remain a single zip.

### Batch-decision logic is unit-tested in isolation

The render loop depends on canvas/pdfjs and is not purely testable. Extract the
**batch-boundary decision** into a small pure helper and unit-test it:

- accumulating bytes below target with pages remaining → keep accumulating
- bytes reach target with pages remaining → flush, continue (streaming)
- bytes reach target exactly on the last page → no flush → `preview`
- never reaching target → `preview`

`deriveBatchZipName(base, idx)` gets its own pure test too.

### Component (`src/components/tools/pdf-to-image/PdfToImage.tsx`)

- Change the processor result type to `PdfToImageOutcome`.
- Provide an `onBatch` closure: zip the batch with JSZip (`STORE`, matching the
  existing single-zip path), download it as `deriveBatchZipName(base, idx)`,
  wait ~300 ms between batches (avoids the browser "multiple file downloads"
  block; renders are naturally spaced anyway), and `toast` a per-batch "part N
  saved" notice so a non-expert user sees files arriving.
- Result rendering branches on `result.mode`:
  - `preview` → existing `PdfToImageResult` unchanged.
  - `streamed` → a summary-only panel ("Saved N images as M zip files" + "다시
    하기"). No grid / per-image / compress hand-off (blobs are gone — the
    accepted trade-off of streaming).
- `download()` (the grid's "전체 다운로드") and `handleCompress` only apply in
  `preview` mode; guard with a `mode` check.

### Naming

`assignImageNames` keeps global per-source numbering, so image filenames inside
the batch zips remain consistent (`bulletin-001 … bulletin-150` spread across
the part archives). New helper `deriveBatchZipName(base, idx)` →
`{base}-images-{idx}.zip` in `pdfToImageNaming.ts`.

### Failure handling

If the browser blocks a batch download, that batch's images are lost (already
released). Mitigation: the ~300 ms spacing plus the natural render cadence make
this unlikely. v1 accepts the risk; the streamed summary states how many zips
were saved so a user who notices a missing part can re-run. (No silent partial
success beyond that.)

## ④ Upload-cap recalibration (separate commit, after ③ merges)

With ③, `pdf-to-image`'s output-accumulation ceiling is gone; its remaining
ceiling is the raw source bytes held in `sourceBytesById` (input-bound). Tools
are classified by processing-path memory profile:

- **Group B — single-artifact reassembly (conservative cap):** hold the whole
  input *and* the whole output in memory. `pdf-compress`, `pdf-lock`,
  `pdf-watermark`, `ppt-compress`, `ppt-extract`, `ppt-background`,
  `image-to-pdf`, `image-to-pptx`, `pdf-arrange`.
- **Group A — streaming / sequential (generous cap):** `pdf-to-image` (output
  now streamed), `image-compress`, `image-resize`.

A rigorous empirical smoke test needs a running app plus profiling and is not
automatable here. Instead: present a **cap table derived from path reasoning**
and get user approval to lock the numbers. This is delivered as its own step
after ③ merges, not bundled into the ③ implementation.

## Out of scope

- File System Access single-zip streaming (Chromium-only) — rejected in favour
  of universal multi-zip.
- `StreamSaver.js` / service-worker streaming — new dependency, rejected.
- Device-memory detection (`navigator.deviceMemory`) — unreliable (Safari
  returns undefined), rejected earlier.
- Changing the threshold UX to a user toggle — rejected; threshold-based
  auto-switch chosen.
