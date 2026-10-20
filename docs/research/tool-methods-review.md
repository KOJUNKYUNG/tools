# Tool methods review: Ontab engines vs professional practice

> **Status (2026-10-21):** a point-in-time diagnosis; it is not updated. The current ranking and the status of each candidate in §4 live in [`tool-backlog.md`](tool-backlog.md). Known corrections from the 2026-10-20 re-measurement: a ppi cap over slide inches touches no image in the real decks (3 of 4 use 20 × 11.25 in slides), so caps are in projected pixels (CONTEXT "Display size"); every picture in those decks had its own `a:xfrm`, so "placeholders without xfrm" does not apply to them; and the PNG→JPEG wins come mostly from backgrounds ppt-background embedded as-is, so that fix moved to ppt-background.

- **Date:** 2026-10-18
- **Branch:** `research/tool-methods` (cut from `a1919fc`). PR #79 (image-compress output check) merged to master as `254cafd` after the branch was cut. image-compress citations below refer to `254cafd:src/lib/image/compressImage.ts`.
- **Scope:** the 12 canonical tools in `src/lib/constants.ts`. Aliases are covered by their canonical tool: `heic-convert` → image-compress, `pdf-merge`/`pdf-split`/`pdf-pages` → pdf-arrange.
- **Trigger:** should ppt-compress convert opaque PNGs inside a deck to JPEG?

## Method

1. **Code reading.** I read each engine under `src/lib/{pdf,ppt,pptx,image,common,output-check}`, plus `CONTEXT.md`, `package.json`, and the source of the pinned libraries in the main checkout's `node_modules`: browser-image-compression 2.0.2 and its bundled UPNG.js, pdf-lib 1.17.1, pdfjs-dist 5.6.205, heic-to 1.5.2, @kihyun1998/justpdf-compress-wasm 0.1.2 and @neslinesli93/qpdf-wasm 0.3.0. Line numbers below refer to this branch unless marked otherwise.
2. **Measurement on real decks.** I ran a read-only script (kept in a scratchpad, not committed) over three distinct real church decks in the local, gitignored `tests/fixtures`. Three further fixtures were left out: one shares its pictures with a deck already measured, and the other two are earlier outputs of ppt-background.
   - The script read every PNG and JPEG under `ppt/media/`: pixel size, alpha channel present vs actually used, unique colour count, bits per pixel, and the largest on-slide extent where the slide XML states one.
   - Only aggregate numbers appear here. The repo is public, so no file names or contents are given.
3. **External sources.** Primary sources first: Microsoft Support/Learn, Ghostscript and qpdf docs, MDN, MDN browser-compat-data, caniuse, and the GitHub repositories of pngquant, oxipng, MozJPEG, Squoosh, jSquash and pica. Where only secondary sources existed, the text says so.
   - **[unverified]** marks claims I could not confirm.
   - Smallpdf, iLovePDF and Cloudinary do not publish their internals. I do not describe them beyond what they state publicly.

## TL;DR

On safety, Ontab matches or beats common practice. Every tool now checks its own output (spec #51). The compressors keep each image's original bytes unless the re-encode is smaller and has the same size and format, and they never pass the original off as compressed. Ontab trails professional tools in one area: **image resolution**.

- PowerPoint's "Compress Pictures", Acrobat's PDF Optimizer, Ghostscript's presets and Squoosh all reduce pixels to the size actually shown (for example 220/150/96 ppi). They do this before, or instead of, lowering quality. ppt-compress and ppt-background never do.
- In the three real church decks measured, the largest PNGs are photo-like images with soft, graded transparency (0% fully opaque pixels). PNG→JPEG cannot touch them.
- One opaque 1920×1080 PNG background (4.5 MB, used on 5 slides) is the textbook PNG→JPEG case.
- Several JPEGs are shown at 250–640 ppi on a 4:3 slide.

**Recommendation:**
1. Add **downscaling to display size** first (the larger and more general win).
2. Then add **opaque PNG → JPEG in the strongest preset (강하게)**, behind guards: alpha actually unused, photographic content, a trial-encode size win, and no tiled fill. The part must be renamed properly, with rels and `[Content_Types].xml` updated.
3. **Fold it into the preset; don't add a checkbox.** That fits the users and matches how professional presets work.
4. Do **not** emit WebP/AVIF inside decks. Older Office, Google Slides and phones are the risk.

Three small, high-value fixes surfaced along the way:
- browser-image-compression loads its Web Worker script from **cdn.jsdelivr.net** at run time. That contradicts the self-hosting policy that qpdf and pdf.js follow.
- pdf.js is not given `wasmUrl`, so **JPEG 2000 images in PDFs cannot be decoded** and ICC colour support is off.
- ppt-background embeds the user's photo at full camera resolution.

---

## 1. Per-tool comparison

| Tool | Our method (short) | Professional / common practice | Verdict | Feasibility note |
|---|---|---|---|---|
| **ppt-background** | JSZip edits XML with regexes. The image is embedded as-is (no resize or re-encode). "Cover" is done with negative `a:fillRect` offsets. Modes: all slides / master / chosen slides. PNG/JPEG input only. | PowerPoint "Format Background → Picture fill" uses the same `blipFill`/`fillRect` model. PowerPoint compresses inserted pictures to 220 ppi by default ([MS Support](https://support.microsoft.com/en-gb/office/reduce-the-file-size-of-a-picture-in-microsoft-office-8db7211c-d958-457c-babd-194109eb9535)). | **On par** on the XML. **Behind** on image size. Master mode ignores layouts that set their own background. | Downscaling the background to about the slide's pixel size is cheap; image-to-pptx already does it. HEIC input could reuse `normalizeImageFile`. |
| **ppt-extract** | .pptx: copies `ppt/media/*` bytes unchanged (byte-identical). .ppt: CFB plus a magic-byte scan of the `Pictures` stream. | Unzip the package (byte-exact) or use PowerPoint "Save as Picture" (re-encodes). Legacy .ppt per [MS-ODRAW]. | **On par / ahead** for .pptx (lossless, original quality). **Partial** for .ppt (EMF/WMF/DIB). | The .ppt metafile fix needs zlib inflate (JSZip's own inflate or `DecompressionStream`). |
| **ppt-compress** | Same-format re-encode of jpg/jpeg/png: JPEG quality 0.82/0.70/0.55; PNG quantized to 4096×q colours via UPNG. No resizing, no crop removal, no format change. Each image is kept only if smaller and the same shape. | PowerPoint Compress Pictures: target ppi (330/220/150/96) plus "Delete cropped areas" ([Indezine](https://www.indezine.com/products/powerpoint/learn/picturesandvisuals/2016/compress-pictures.html), [MS Support](https://support.microsoft.com/en-gb/office/reduce-the-file-size-of-a-picture-in-microsoft-office-8db7211c-d958-457c-babd-194109eb9535)). pptx-downsizer also converts PNG→JPEG ([GitHub](https://github.com/scholer/pptx-downsizer/)). | **Behind** on method (no downsampling, no crop removal, weak PNG encoder). **Ahead** on safety. | Downsampling to a fixed cap: M. To the on-slide extent: L. PNG→JPEG with guards: M. See §2. |
| **pdf-arrange** | pdf-lib 1.17.1 `copyPages` (one call per source, so shared resources copy once), rotation via `/Rotate`. | Acrobat Organize Pages and qpdf `--pages`. qpdf copies the primary file's form fields and outlines; bookmarks to removed pages stop working ([qpdf docs](https://qpdf.readthedocs.io/en/stable/cli.html)). | **On par** for page operations. **Behind** on bookmarks and forms (dropped). | Bookmark carry-over: L. Rarely needed for church PDFs (hymn sheets). |
| **pdf-compress** | justpdf-compress-wasm 0.1.2. Light = lossless cleanup. Medium = JPEG q75. Strong = JPEG q65 + downsample to 150 dpi + strip metadata. Font subsetting off. A damaged output is retried without image re-encoding. | Ghostscript `/ebook` 150 dpi, `/screen` 72 dpi ([Ghostscript](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html)). Acrobat PDF Optimizer: per-type downsampling, JPEG/JPEG2000/ZIP, discard objects ([Adobe](https://helpx.adobe.com/acrobat/desktop/create-documents/optimize-pdfs/pdf-optimizer-settings.html)). qpdf: object streams, `--recompress-flate`, `--optimize-images`. | **On par** with typical web compressors on method (Strong ≈ Ghostscript `/ebook`). **Behind** on fonts. **Risk:** single-maintainer engine (2 GitHub stars). | qpdf, already shipped, could provide a lossless object-stream pass. Ghostscript-wasm is AGPL, a licence obstacle **[unverified for current builds]**. |
| **pdf-watermark** | pdf-lib draws a PNG on each page. Text is rendered to a canvas at 4× with Pretendard, so no fonts are embedded. Honours `/Rotate`. Tiling, opacity, angle. | Acrobat "Add Watermark" marks the watermark as an *artifact* (subtype Watermark) per PDF 14.8.2.2, as text or an image ([Aspose summary](https://docs.aspose.com/pdf/net/artifacts/)). | **On par** visually. **Behind** semantically: the raster text isn't searchable and isn't marked as an artifact. | Fine for the audience. Korean font embedding is a known trap (see the `compressPdf.ts:93-95` note). Keep the raster approach. |
| **pdf-lock** | qpdf-wasm (appears to embed qpdf 12.2.0, **[unverified]**). AES-256, random 40-character owner password, print/copy toggles, modify=none. Output re-opened with pdf.js. | Acrobat/qpdf: AES-256 (PDF 2.0 / ext. level 8). qpdf refuses RC4 unless `--allow-weak-crypto` ([qpdf docs](https://qpdf.readthedocs.io/en/stable/cli.html)). | **On par / ahead**: strongest cipher, separate owner password, verified output. | Note for copy: encryption breaks PDF/A conformance ([pdftools](https://pdf-tools.com/docs/pdf-tools-sdk/encrypt)). Permissions only work in viewers that honour them. |
| **image-to-pdf** | pdf-lib: JPEG embedded unchanged (DCT passthrough), EXIF orientation applied through a matrix. PNG decoded and re-deflated (no predictor) plus an SMask. Page = pixel size at 1 px = 1 pt, or a fixed paper size. HEIC→JPEG first. | img2pdf-style lossless embedding (JPEG passthrough, PNG data kept). Page size from the image's DPI metadata **[unverified; img2pdf docs not fetched]**. | **On par** for JPEG (best practice). **Behind** for PNG (larger than the source PNG). | Embedding the PNG IDAT with `Predictor 15` needs a custom embedder (M). Low priority. |
| **pdf-to-image** | pdf.js 5.6.205 render at 72/150/300 dpi. Canvas capped at 8192 px / 24 MP; failures retried at half size. JPEG q0.92 or PNG. Batches streamed by size. | Acrobat Export, Ghostscript `png16m`/`jpeg`, pdftoppm. pdf.js is the standard browser renderer. | **On par** for typical PDFs. **Gap:** JPEG 2000 (JPX) images fail and ICC colour is off, because `wasmUrl` isn't passed (verified in source, not tested on a file). | S: copy `pdfjs-dist/wasm` (and `iccs`) to `public/pdfjs/` and pass `wasmUrl`/`iccUrl`. |
| **image-compress** (+heic-convert) | Same-format JPEG/WebP: browser-image-compression (canvas encoder; quality from the slider, default 100). Format change or PNG output: plain canvas `toBlob`. HEIC via heic-to (libheif 1.22.2 wasm) → JPEG 0.92. No resize. Not-smaller → original kept (#79). | Squoosh: MozJPEG, OxiPNG, libimagequant "reduce palette", Lanczos3 resize, all wasm in the browser ([Squoosh codecs](https://github.com/GoogleChromeLabs/squoosh/tree/dev/codecs)). TinyPNG/pngquant: palette with alpha, "up to 70%" smaller ([pngquant.org](https://pngquant.org/)). | **Behind** on encoders (no MozJPEG; PNG→PNG is lossless canvas output that rarely shrinks; no resize). **Ahead** on honesty (not-smaller, format check). | jSquash (Apache-2.0) packages the Squoosh codecs for the web ([jSquash](https://github.com/jamsinclair/jSquash)). New dependency means a hard stop; wasm size on phones matters. |
| **image-resize** | `<img>` decode → one-step canvas `drawImage` with `imageSmoothingQuality = "high"`. Output in the source format at q0.92. 8192 px cap. Crop supported. | Lanczos3 / Magic Kernel (Squoosh, pica). `createImageBitmap` `resizeQuality: "high"`. | **On par** in Chrome/Safari for moderate ratios. **Behind** in Firefox: `imageSmoothingQuality` is not supported ([MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/CanvasRenderingContext2D.json)). | pica (MIT, JS+wasm, [GitHub](https://github.com/nodeca/pica)) or step-halving. M, low priority. |
| **image-to-pptx** | Each image downscaled to a 1920 px long edge (≈144 ppi on a 16:9 slide) with high smoothing. PNG stays PNG, anything else → JPEG 0.9. One background shared on the slide master. "Contain" placement. | PowerPoint Insert → Pictures compresses to 220 ppi by default (Microsoft 365). Photo albums use the same "fit" placement. | **On par / ahead**: already downsampled and deduplicated. | Possible extra: opaque PNG photos → JPEG here too (same guards as §2). |

---

## 2. Per-tool notes

### ppt-compress (the trigger)

**What the code does (verified):**
- `classifyMedia` keeps the container format. jpg/jpeg → `{kind:"jpeg"}`, png → `{kind:"png"}`, everything else passes through (`src/lib/ppt/pptCompressPlan.ts:21`, `:33-42`).
- Preset quality is 0.82 / 0.70 / 0.55 (`pptCompressPlan.ts:14-18`).
- Images are re-encoded through `browser-image-compression` with `maxSizeMB: Infinity` and **no `maxWidthOrHeight`** (`src/lib/ppt/compressPptx.ts:149-164`). The library resizes only when `maxWidthOrHeight` is finite, or when the output exceeds `maxSizeMB` (`lib/image-compression.js` in the package: `handleMaxWidthOrHeight`, `shouldReduceResolution = !alwaysKeepResolution && origExceedMaxSize`). **So no downscaling ever happens.** Confirmed.
- A candidate is kept only if it has the same format and displayed size (`src/lib/ppt/pptCompressCheck.ts:28-52`) and is strictly smaller (`pickSmaller`, `pptCompressPlan.ts:53`).

**How the PNG path really works (UPNG inside browser-image-compression 2.0.2):**
- `canvasToFile` calls `UPNG.encode(rgba, w, h, 4096 * quality)`. That is a K-d-tree colour reduction to about 3,358 / 2,867 / 2,252 colours, **without dithering** (`dith = false`).
- More than 256 colours cannot be stored as a palette, so the output stays **truecolour RGB/RGBA**. The saving comes only from fewer distinct colours helping DEFLATE.
- UPNG tries the five PNG filters only when `h * bpl ≤ 500,000` bytes. Otherwise it uses filter 0 ("None"). Every slide-sized image is above that size, so **slide-sized images are deflated unfiltered**. Filtering is the main lever that oxipng/zopfli-class encoders tune ([oxipng](https://github.com/oxipng/oxipng)).
- If the first encode came out larger, the library loops up to 10 times, multiplying quality by 0.85 each time (`while (… currentSize > sourceSize)`).
- Alpha detection is "actually used": `alphaAnd &= a` over every pixel, so an RGBA PNG whose alpha is all 255 is written as RGB.

**Measured result:** the code comment records 0.64 / 0.62 / 0.59 of PNG bytes left on 31 real PNGs (`pptCompressPlan.ts:86-97`). That is a 36–41% cut that barely changes between presets, which follows from the mechanics above.

**What professionals do:**
- PowerPoint's Compress Pictures downsamples to a target resolution: HD 330, Print 220, Web 150 or Email 96 ppi ([Indezine](https://www.indezine.com/products/powerpoint/learn/picturesandvisuals/2016/compress-pictures.html), [CustomGuide](https://www.customguide.com/office-365/compress-pictures-in-powerpoint)). It can "Delete cropped areas of pictures". The Microsoft 365 default is 220 ppi ([MS Support](https://support.microsoft.com/en-gb/office/reduce-the-file-size-of-a-picture-in-microsoft-office-8db7211c-d958-457c-babd-194109eb9535)). "High fidelity" compresses only pictures larger than the canvas ([MS Support](https://support.microsoft.com/en-us/office/f4aca5b4-6332-48c6-9488-bf5e0094a7d2)).
- Microsoft does not document whether Compress Pictures changes a picture's format. The pptx-downsizer README says it does not (third-party, **[unverified]**).
- pptx-downsizer, an open-source CLI ([GitHub](https://github.com/scholer/pptx-downsizer/)):
  - re-encodes images over 512 KB;
  - caps them at 2048 px;
  - converts TIFF→PNG→JPEG at quality 90;
  - fills transparency with a chosen colour when asked.
  - It calls itself beta, warns that output may not open in PowerPoint, and does not document how it updates rels and content types.

**Real-deck measurement** (three distinct church decks, 9.5–17 MB):

| Finding | Evidence |
|---|---|
| JPEGs are often far above display need | On a 4:3 slide, 4 of the 8 JPEGs with a known extent are shown at 250–640 ppi; 2 more sit at ~218 ppi. Every one is also cropped (`a:srcRect`), so "delete cropped areas" would help too. |
| One textbook PNG→JPEG candidate | A 1920×1080 RGBA PNG with **alpha present but unused**, ~163k colours, 18 bits/pixel, **4.5 MB**, used as background on 5 slides. That is about a third of its deck. |
| The biggest PNGs genuinely use alpha | Four photo-like PNGs of 3.1–4.6 MB each (≥200k colours, 19–29 bits/pixel) have **no fully opaque pixels**: 234–255 distinct alpha levels, soft or feathered edges. PNG→JPEG cannot apply. Downscaling or palette quantization with alpha can. |
| Many PNGs are already small graphics | 4,000-colour, 1.0–1.4 bits/pixel images with 85–90% transparency. Little to gain. |
| On-slide extent is often not stated | Most pictures in two decks are placeholder shapes (`p:sp` with `blipFill`, no `a:xfrm`), whose size comes from the layout. Display-size downscaling must resolve placeholder inheritance. |

**Verdict:** behind PowerPoint on method, ahead on guarantees. See §3 for the PNG recommendation and §4 for priorities.

### ppt-background

- The image is stored as uploaded, with STORE compression (`src/lib/ppt/changeBackground.ts:471-476`).
  - A 12 MP phone photo (4032×3024, several MB) is embedded at full size even though a 13.33″ slide at 220 ppi needs about 2933 px.
  - PowerPoint's own insert path would compress it to 220 ppi by default.
  - image-to-pptx already caps at 1920 px (`src/lib/pptx/downscaleForSlide.ts:27`). The two tools are inconsistent here.
- "Cover" scaling uses negative `a:fillRect` offsets (`changeBackground.ts:184-214`). That is the same mechanism PowerPoint writes for "Offset left/right" in Format Background. `a:fillRect` values are in thousandths of a percent ([MS Learn FillRectangle](https://technet.microsoft.com/en-au/library/cc882715(v=office.14))).
- `master` mode rewrites only `ppt/slideMasters/*` (`changeBackground.ts:494-502`). Under OOXML inheritance, a layout or slide with its own `<p:bg>` overrides the master, so those slides keep their old background. **[unverified on a real deck]**: the UI may already explain this.
- Input is PNG/JPEG only (`BackgroundPicker.tsx:70`). `getExtension` maps any other name to `png` (`changeBackground.ts:35-40`). That is unreachable through the picker, but fragile.

### ppt-extract

- .pptx: every `ppt/media/*` image part is copied byte-for-byte (`src/lib/ppt/extractImages.ts:23-72`), and the check confirms the count (`extractImagesCheck.ts`). That is what "rename to .zip and unzip" gives an expert. Original quality, no re-encode. **Ahead** of "Save as Picture" style tools.
- .ppt (binary): `parseBlipRecords` finds image bytes by magic-number search within 100 bytes after the record header (`src/lib/ppt/extractImagesFromPpt.ts:42-58`). Per [MS-ODRAW 2.2.31](https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-odraw/ffdcc2b8-98fd-46b2-921e-6bb6693d05e5), EMF/WMF/PICT blips carry a 34-byte metafile header, and the data is usually **zlib-compressed** (`compression = 0x00`; `0xFE` = none).
  - A compressed EMF does not start with the EMF signature, so it is either skipped or mis-sliced. A mis-sliced file then fails the `image-header` check and blocks the whole result.
  - WMF has no entry in `MAGIC_BYTES`, so WMFs are always dropped.
  - DIB blips (0xF01F) are stored without a `BM` file header, so the `BM` search usually misses them. Apache POI adds the header when extracting **[unverified]**.
  - Impact: JPEG/PNG in old decks extract fine; vector clip-art and BMPs may be lost. **[unverified on real .ppt files]**

### pdf-arrange

- pdf-lib `copyPages` copies page objects (`src/lib/pdf/assembleSections.ts:121-134`). pdf-lib's own docs say a document copy "won't copy … acroforms, outlines" (`pdf-lib/src/api/PDFDocument.ts:747-748`), and `copyPages` copies only page nodes.
  - Merged or split output therefore **loses bookmarks**.
  - Form widgets survive as annotations but are no longer attached to an AcroForm. Whether they stay editable depends on the viewer **[unverified]**.
- qpdf `--pages` keeps the primary file's outlines and forms ([qpdf docs](https://qpdf.readthedocs.io/en/stable/cli.html)). qpdf is already shipped (pdf-lock), so this is the natural upgrade path if bookmarks ever matter.
- pdf-lib 1.17.1 is the last release (2021-11-06). The repo was last pushed 2024-07 (GitHub API). It is stable but effectively unmaintained.

### pdf-compress

- Presets (`src/lib/pdf/compressPdf.ts:54-59`): Light `{jpeg 0, dpi 0}` (cleanup only), Medium `{75, 0}`, Strong `{65, 150 dpi, strip metadata}`.
  - Font subsetting is off because it corrupted Korean fonts (`:93-100`).
  - Recovery re-runs with Light's image settings when the output is damaged (`:126-134`).
- Compared with Ghostscript, Strong ≈ `/ebook` (150 dpi). Ghostscript's `/screen` goes to 72 dpi with a 1.5× threshold ([Ghostscript docs](https://ghostscript.readthedocs.io/en/latest/VectorDevices.html)). The justpdf README claims "CTM-based effective DPI calculation" (`node_modules/@kihyun1998/justpdf-compress-wasm/README.md`); I did not test it.
- Acrobat's guidance is JPEG for photos and smooth gradients, ZIP (Flate) for text, line art and flat colour ([Adobe PDF Optimizer](https://helpx.adobe.com/acrobat/desktop/create-documents/optimize-pdfs/pdf-optimizer-settings.html)). This is the same photo-vs-graphic distinction §3 relies on. Distiller's "Automatic (JPEG)" reportedly chooses ZIP vs JPEG per image ([CreativePro / GATF](https://creativepro.com/acrobat-how-to-compression-session/), secondary).
- **Engine maturity:** justpdf is a single-maintainer project (2 stars; pushed 2026-10-16) with 3 presets plus an "extreme". This is a pinned-engine risk.
  - qpdf could add a safe lossless pass (`--object-streams=generate --recompress-flate --compression-level=9`) with no new dependency ([qpdf docs](https://qpdf.readthedocs.io/en/stable/cli.html)).
  - Smallpdf and iLovePDF don't disclose their internals, so no comparison is possible.

### pdf-watermark

- pdf-lib draws a PNG (`src/lib/pdf/applyPdfOverlay.ts:200-352`). Text is rasterised at 4× with a 4096 px cap (`renderTextToPng.ts:12-17`). Opacity uses pdf-lib's ExtGState, and page `/Rotate` is honoured (`:142-182`).
- Acrobat marks watermarks as Pagination/Watermark artifacts, so screen readers skip them and they can be removed as a unit ([Aspose artifacts doc](https://docs.aspose.com/pdf/net/artifacts/); ISO 32000 §14.8.2.2 not read directly, **[unverified]**).
- Ours are plain image XObjects: not searchable, not tagged. Acceptable for "mark this hymn sheet" use.
- Note: `PDFDocument.load` rejects encrypted input (`:213-219`). That is correct, and the message names the cause.

### pdf-lock

- `--bits=256` with named password options, print full/none, extract y/n, modify none (`src/lib/pdf/qpdfArgs.ts:25`, `:42-63`).
- A random owner password stops the user password from unlocking owner rights (`ownerPassword.ts`).
- Output is re-opened and verified (`qpdfCrypto.ts:108-150`). A fresh qpdf instance per call keeps no bytes or passwords in memory (`qpdf.ts`).
- This matches best practice. qpdf itself calls RC4 (40-bit and 128-bit without AES) insecure and requires `--allow-weak-crypto` for it ([qpdf docs](https://qpdf.readthedocs.io/en/stable/cli.html)).
- Caveats for copy:
  - Permission bits are honoured only by compliant viewers.
  - Encrypting removes PDF/A conformance ([pdftools](https://pdf-tools.com/docs/pdf-tools-sdk/encrypt)).
  - AES-256 needs PDF 1.7 ext. 8 / 2.0 readers; very old readers can't open the file.

### image-to-pdf

- JPEG is embedded unchanged (`embedJpg`), and EXIF orientation is applied by a transform (`assembleSections.ts:147-179`). That is the img2pdf-style best practice: no generational loss.
- PNG goes through pdf-lib's `PngEmbedder`. It decodes to raw RGB plus a separate alpha SMask, then `flateStream`s the pixels **without a PNG predictor**. ColorSpace is always DeviceRGB, so any ICC profile is dropped (`pdf-lib/src/core/embedders/PngEmbedder.ts`). Screenshots and graphics can come out larger than the source PNG.
- "Native" layout makes the page the pixel size at 1 px = 1 pt (72 dpi). A 4000 px photo becomes a 55″ page, which is odd in print dialogs. The fixed paper size mode avoids this.

### pdf-to-image

- Render scale = dpi/72. Caps at 8192 px / 24 MP, with a half-size retry (`src/lib/pdf/pdfToImage.ts:46-113`). JPEG q0.92 (`:150`).
- pdf.js defaults are correct for this use. `annotationMode` defaults to `ENABLE`, so form appearances are drawn (`pdfjs-dist/types/src/display/api.d.ts:1266-1277`).
- **Gap (verified in source):**
  - `pdfjsDocParams` sets only `cMapUrl` and `standardFontDataUrl` (`src/lib/pdf/pdfjs.ts:11-15`), and `scripts/copy-pdfjs.mjs` doesn't copy `pdfjs-dist/wasm/`.
  - In pdf.js 5.6 the worker loads `openjpeg.wasm` and its JS fallback `openjpeg_nowasm_fallback.js` from `wasmUrl`. With `wasmUrl` null, both fail and `JpxImage.decode` throws "OpenJPEG failed to initialize" (`pdf.worker.mjs:9033-9090`). **JPEG 2000 images, common in scanned or archival PDFs, render blank.**
  - JBIG2 and CCITT have JS fallbacks, so they still work (`pdf.worker.mjs:12141-12143`, `12508-12511`).
  - ICC colour spaces log "No ICC color space support due to missing `wasmUrl`" and fall back to the alternate space (`pdf.worker.mjs:2811-2823`).
  - The same applies to the pdf.js-based output checks and thumbnails.

### image-compress (+ heic-convert)

- Same-format JPEG/WebP goes through browser-image-compression; everything else, including PNG→PNG, through a plain canvas `toBlob` (`254cafd:src/lib/image/compressImage.ts:79-124`, `:144`).
  - Canvas PNG output is lossless and the browser's choice, so the slider does nothing for PNG. PNG→PNG rarely shrinks; #79 now reports this honestly.
  - The quality slider defaults to 100 (`254cafd:…/ImageCompressTool.tsx:54`).
  - There is no resize option. Professional compressors (Squoosh, TinyPNG's resize API) treat resizing as the first lever.
- HEIC: libheif 1.22.2 via heic-to (`src/lib/image/heic.ts:19-20`). heic-to decodes to `ImageData`, `putImageData`s it onto a default canvas and encodes JPEG 0.92 (`node_modules/heic-to/src/index.js:66-99`).
  - **No colour-space conversion or ICC tag**: iPhone photos are typically Display P3, so their values get read as sRGB. Expect a slight saturation shift **[inferred from code, not measured]**.
  - Safari 17+ decodes HEIC natively ([caniuse](https://caniuse.com/heif)), which would allow a colour-managed path there.
  - The heic-to bundle (`dist/next/heic-to.js`) is ~3 MB but loaded only on demand.
- Encoders: browser canvas JPEG is typically libjpeg-turbo class **[unverified per browser]**. MozJPEG adds trellis quantization and progressive-scan optimisation for "smaller file sizes at the same visual quality" ([MozJPEG](https://github.com/mozilla/mozjpeg)).
- **CDN dependency (finding):**
  - With `useWebWorker: true`, the library builds a worker that runs `importScripts("https://cdn.jsdelivr.net/npm/browser-image-compression@2.0.2/dist/browser-image-compression.js")` unless `libURL` is set (`lib/index.js`, `lib/web-worker.js` in the package).
  - Neither call site sets `libURL` (`compressPptx.ts:156`, `254cafd:compressImage.ts:116`).
  - Every ppt-compress and image-compress run therefore fetches third-party code at run time, with no SRI. Offline or blocked, it silently falls back to the main thread (UI jank on phones).
  - This contradicts the self-hosting rationale in `src/lib/pdf/qpdf.ts:1-4` and `src/lib/pdf/pdfjs.ts:1-3`. File bytes never leave the tab; only the script is fetched.

### image-resize

- One-step `drawImage` with `imageSmoothingQuality = "high"` (`src/lib/image/resizeImage.ts:144-150`), output q0.92 in the source format (`:152-153`).
- Chrome and Safari implement "high". **Firefox does not support `imageSmoothingQuality` at all** (`version_added: false` in [MDN BCD](https://github.com/mdn/browser-compat-data/blob/main/api/CanvasRenderingContext2D.json)). `createImageBitmap` `resizeQuality` is supported in Firefox 149+ and Safari 15+.
- Large one-step reductions (e.g. 4000→400 px) can alias; Lanczos3 or step-halving avoid that. Squoosh offers triangle/catrom/mitchell/lanczos3/hqx in a worker, with `linearRGB` and `premultiply` options ([Squoosh resize meta](https://github.com/GoogleChromeLabs/squoosh/blob/dev/src/features/processors/resize/shared/meta.ts)). pica defaults to `mks2013` (MIT) ([pica](https://github.com/nodeca/pica)).
- EXIF: `<img>` decoding honours orientation by default (CSS `image-orientation: from-image`), and #79 added `hasUnreadOrientation` for WebP/PNG EXIF.

### image-to-pptx

- `createImageBitmap` (default `imageOrientation: "from-image"`, [MDN](https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap)) → high-quality canvas → PNG stays PNG, others → JPEG 0.9, long edge ≤ 1920 (`src/lib/pptx/downscaleForSlide.ts:6-27`).
- The background is defined once on a slide master (`assemblePptx.ts:22-32`). That beats per-slide embedding.
- 1920 px ≈ 144 ppi on a 13.33″ slide: enough for 1080p projection, below PowerPoint's 220 ppi default. That is a reasonable choice for screen use.

---

## 3. PNG section

### 3.1 How professionals shrink PNGs (in order of typical payoff)

1. **Downsample to display resolution.** PowerPoint (220/150/96 ppi), Ghostscript (`/ebook` 150, `/screen` 72), Acrobat Optimizer (bicubic above a threshold) and pptx-downsizer (2048 px cap). This reduces the pixel count, so it beats any encoder trick, and it works for transparent images too.
2. **Lossy palette quantization with alpha.** pngquant/libimagequant reduces to ≤256 colours **with full alpha** and adaptive dithering, "as much as 70%" smaller. Its `--quality min-max` *refuses* to save output below the minimum ([pngquant.org](https://pngquant.org/)). Squoosh exposes this as "Reduce palette" (codec `imagequant`).
   - Licence: libimagequant is **GPL-3 or commercial** ([pngquant.org](https://pngquant.org/)). That matters for a public web app shipping it as wasm.
   - UPNG (MIT, already inside browser-image-compression) can also quantize to ≤256 colours and write a real palette (ctype 3). We currently never ask for ≤256.
3. **Opaque photographic PNG → JPEG.**
   - Cloudinary's `f_auto` + `q_auto` serves a PNG source as JPEG when another format is smaller at the same visual quality ([Cloudinary blog](https://console.cloudinary.com/blog/adaptive_browser_based_image_format_delivery), [Cloudinary forum](https://support.cloudinary.com/hc/en-us/community/posts/115000572872-f-auto-is-not-giving-optimum-picture-format-PNG-as-standard)). The exact heuristic is undocumented.
   - Acrobat/Distiller choose JPEG for continuous-tone images and ZIP for sharp-edged ones ([Adobe](https://helpx.adobe.com/acrobat/desktop/create-documents/optimize-pdfs/pdf-optimizer-settings.html); [CreativePro/GATF](https://creativepro.com/acrobat-how-to-compression-session/), secondary).
   - pptx-downsizer offers PNG→JPEG with an optional transparency fill.
4. **Lossless recompression.** oxipng (filter search, better DEFLATE, optional Zopfli, metadata strip; default `-o 2`; lossless except `--alpha`) ([oxipng](https://github.com/oxipng/oxipng)). It typically gives single- to low-double-digit percent **[unverified for our images]**. It is available as wasm via jSquash.

### 3.2 Detecting transparency and content type

- **Alpha *present* vs alpha *used*.** The PNG colour type (4/6) or a `tRNS` chunk says an alpha channel exists. Only decoding every pixel shows whether any alpha < 255. Tools that decide formats check *used*. UPNG's `alphaAnd` loop already does this. In our decks, 1 of 32 PNGs had alpha present but unused. Fully transparent pixels in an otherwise opaque photo (e.g. a 1 px border) also block JPEG unless flattened onto the slide background colour, which is not safe in general.
- **Photo vs graphic.** No vendor documents its rule. Signals used in practice, and checkable cheaply in JS:
  - (a) **unique colour count.** Graphics and screenshots typically have a few hundred to a few thousand colours; photos have 10^5 or more. Our decks: ~4k for graphics, ≥160k for photos.
  - (b) **bits per pixel** of the current PNG. Photos sit at 14–29 bpp, flat graphics at 0.15–7 bpp.
  - (c) **trial encode**: encode both candidates and require a large JPEG win (Cloudinary-style "smaller at same quality").
  - (d) an optional **error metric** between the decoded JPEG and the original, e.g. PSNR or SSIM on a downscaled copy. This is the `q_auto` idea. Squoosh ships a `visdif` (butteraugli) codec ([Squoosh codecs](https://github.com/GoogleChromeLabs/squoosh/tree/dev/codecs)).
- **Text and line art are the JPEG danger zone.**
  - JPEG's 8×8 blocks and quantization ring around sharp edges, and chroma subsampling smears coloured text. web.dev notes block seams and lost chroma detail ([web.dev](https://web.dev/learn/images/jpeg)). Adobe recommends ZIP for "text, line art, and images with large areas of solid colors".
  - Screenshots of lyrics or scores are exactly this case. Their low colour count and low bits per pixel exclude them under rules (a)/(b).
  - Canvas `toBlob` gives no control over chroma subsampling **[unverified per browser]**. That is another reason to keep text-like images as PNG.

### 3.3 WebP / AVIF inside PPTX: not recommended

- Microsoft documents WebP/AVIF/HEIF *insertion* on Windows Office 2016–2024 and Microsoft 365, but only with Store codecs installed ([MS Support](https://support.microsoft.com/en-us/article/23a6f06c-ce25-49ce-8801-d1d09ccbcf4e)). Microsoft 365 for Windows gained WebP in late 2021 on Windows 10 1809+ ([Office Watch](https://office-watch.com/2024/webp-support-has-now-been-added-to-microsoft-office/)). PowerPoint for the web reportedly can't insert WebP ([MS Q&A](https://learn.microsoft.com/en-us/answers/questions/5283931/when-can-we-expect-webp-support-in-microsoft-365-d)).
- Not documented: whether Office stores WebP as WebP inside the file, and whether older Office or PowerPoint mobile/Mac, Keynote and LibreOffice render a WebP media part. **[unverified]**
- The Google Slides API accepts only PNG, JPEG and GIF ([Google](https://developers.google.com/workspace/slides/api/guides/add-image)). The editor's rules may differ **[unverified]**.
- Church decks move between an old church PC, a projector laptop, phones and Google Slides. A file that shows blank pictures on one of them is far worse than a slightly larger file. **Keep emitted media to JPEG and PNG.**

### 3.4 Recommendation: "convert opaque PNGs to JPEG" in ppt-compress

**Do it, after or together with downscaling, and only behind guards.**

**Evidence for:**
- It is standard practice (Cloudinary, Acrobat/Distiller logic, pptx-downsizer).
- The one qualifying PNG in our decks is the single largest image: 4.5 MB, about 32% of its deck.
- A 1920×1080 photo as JPEG at ~0.8 quality is typically 0.3–0.8 MB **[estimate, not measured]**. That is a ~80–90% cut on that image, far beyond the current 36–41% PNG path.

**Evidence against doing it alone:** in two of three decks the heavy PNGs genuinely use soft alpha, so PNG→JPEG saves nothing there. Downscaling (§3.5) and ≤256-colour palette quantization with alpha would.

**Guards, all required:**
1. **Alpha unused.** Decode and require every alpha byte to be 255. Grayscale and palette PNGs need `tRNS` handling.
2. **Photographic.** For example, ≥ ~20k unique colours, or current PNG ≥ ~8 bits per pixel. Tune thresholds on the real-file set. This excludes lyrics screenshots, scores and logos.
3. **Not used as a tiled fill** (`<a:tile>`): tiles render at the image's pixel/DPI size **[inferred]**. Skip pictures in charts, SmartArt or `a14` extension parts unless their rels are rewritten too.
4. **Trial encode wins clearly.** Keep the JPEG only if it is ≤ ~50% of the best PNG candidate (Cloudinary-style). Otherwise keep the PNG path. This also protects already-small images.
5. **JPEG quality floor.** Use ~0.8–0.85, not the strongest preset's 0.55, because the image is being converted from lossless. Optionally add a PSNR/SSIM floor.

**Packaging done correctly (OPC / ECMA-376 Part 2):**
- Rename the part `imageN.png` → `imageN.jpeg` without colliding with an existing name.
- Rewrite **every** `.rels` `Target` that resolves to it: slides, layouts, masters, notes, and possibly charts and diagrams.
- Make sure `[Content_Types].xml` has `<Default Extension="jpeg" ContentType="image/jpeg"/>`.
- Drop any `Override` for the old part name.
- Content type comes from Override or Default-extension mapping, and part names compare case-insensitively ([ECMA-376](https://ecma-international.org/publications-and-standards/standards/ecma-376/); summary in [ISO/IEC 29500-2 preview](https://www.vde-verlag.de/iec-normen/preview-pdf/info_isoiec29500-2{ed1.0}en.pdf)).
- Shortcut not recommended: keeping the `.png` name with JPEG bytes. PowerPoint may sniff and tolerate it **[unverified]**, but other readers and our own `media-header` check would not.
- The existing machinery already does this kind of rels/Content_Types surgery (`changeBackground.ts:87-151`, `:359-430`). Reuse it rather than writing new code.

**Output check changes:**
- `checkPptCompress` asserts `entry-set` (no part renamed) and `media-header` (format = extension) (`pptCompressCheck.ts:59-126`). Both need a *rename map* from the engine.
- Every renamed part must be JPEG, keep its displayed size, and have no dangling rels. The structural check (`pptxPackage.ts`) already covers dangling rels and Content_Types coverage.

### 3.5 Downscaling to display size: the stronger complement

- **Why stronger:**
  - It applies to JPEGs, opaque PNGs *and* soft-alpha PNGs.
  - It matches PowerPoint's own lever.
  - Pixel count drops with the square of the scale: 640 → 220 ppi is ≈ 8.5× fewer pixels.
- **Display is frame-defined.** `p:pic` and picture fills are stretched to their frame (`a:stretch`/`a:fillRect`), and `a:srcRect` crops are percentages ([MS Learn SourceRectangle](https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2010/cc861209(v=office.14))). Lowering pixel dimensions while keeping the aspect ratio does not move or crop anything.
- **Two implementation levels:**
  - **Fixed cap** (M effort): e.g. long edge ≤ slide width × 220 ppi (≈ 2933 px on 16:9). This is PowerPoint's 220 default; 150 ppi suits Strong. It ignores per-picture size, needs no XML parsing, and already removes camera-resolution waste.
  - **Per-picture extent** (L effort): largest on-slide extent across every use × target ppi. This needs:
    - `a:xfrm/a:ext` per use;
    - placeholder inheritance from layout and master (most pictures in two of our decks have no `a:xfrm`);
    - group scaling (`a:chOff`/`a:chExt`);
    - backgrounds (slide size);
    - shared media (max over uses).
    - "Delete cropped areas" also requires rewriting `srcRect`.
- **Check change:** `media-dimensions` (same pixel size) becomes "same aspect ratio within rounding, not larger". Tiled fills stay excluded.
- **Quality:** downscale with high-quality smoothing, or step-halving for large ratios, because of Firefox (§2 image-resize).

### 3.6 Preset vs checkbox: evaluating the maintainer's lean

**The lean is sound. Fold it into 강하게 (Strong).**

- **Field convention.** Professional presets bundle format decisions: Ghostscript `/screen`/`/ebook`, Acrobat's Standard/Mobile and "Automatic (JPEG)", PowerPoint's ppi choices, Cloudinary `f_auto`. None asks a layperson "convert PNG to JPEG?".
- **Product rules.** CONTEXT.md requires output checks to "ask nothing of the user — no jargon". "투명하지 않은 PNG" is jargon to a pastor. The current Strong copy already promises "강한 압축, 최대한 줄임".
- **Safety.** With guards 1–5, the visible downside is limited to photographic images losing a little detail, which is exactly what Strong already does to JPEGs at q0.55.

**Conditions:**
- (a) Keep 약하게/보통 format-preserving at first, so a user who sees a problem has a "safe" step down.
- (b) Update `PRESET_PNG_RATIO.high` and the estimate (#78), or the estimate will under-promise.
- (c) The "could not shrink → try stronger" logic (`STRONGER_PRESET`, #73) stays valid.
- (d) After it ships, consider also enabling it at 보통 for clear-cut cases: ≥100k colours, alpha unused.

**When a checkbox would be right:** only if guards cannot be made reliable, e.g. no trustworthy photo/graphic signal. The real-deck numbers suggest they can: colour counts of ~4k vs ≥160k, with nothing in between in our sample. A larger sample is needed.

---

## 4. Prioritized improvement candidates

| # | Candidate | Tools | Expected gain | Risk | Effort | Church-PPT fit |
|---|---|---|---|---|---|---|
| 1 | **Self-host the browser-image-compression worker** (`libURL` to a same-origin copy, or a bundled worker) | ppt-compress, image-compress | Removes a run-time third-party fetch; works offline and behind filters; consistent with qpdf/pdf.js policy | Low | S | High (church networks, phones) |
| 2 | **Downscale oversized images: fixed cap tied to slide size** (220 ppi Medium, 150 ppi Strong; Light unchanged) | ppt-compress | Large: camera-resolution photos 4–10× fewer bytes; works on soft-alpha PNGs | Medium (check change; tiled fills) | M | Very high (the #1 cause of big decks) |
| 3 | **Downscale the inserted background** to the slide's pixel size (same helper as image-to-pptx) | ppt-background | Large per run (a phone photo is several MB → a few hundred KB); keeps decks from bloating | Low | S | Very high (weekly background swaps) |
| 4 | **Opaque photographic PNG → JPEG in 강하게**, with §3.4 guards and proper renaming | ppt-compress | Large on qualifying images (~80–90% each); 0 on soft-alpha PNGs | Medium (rename surgery, text false positives) | M | High |
| 5 | **Pass `wasmUrl` (and `iccUrl`) to pdf.js**; copy `wasm/` + `iccs/` in `copy-pdfjs.mjs` | pdf-to-image, PDF checks, thumbnails | JPEG 2000 images render instead of blank; ICC colours correct | Low (+ ~1–2 MB static assets, lazy) | S | Medium (scanned sheet music) |
| 6 | **Real ≤256-colour palette with alpha** for graphic and soft-alpha PNGs (UPNG `ps=256`, or libimagequant; mind the GPL), gated by a quality floor | ppt-compress, image-compress (PNG) | Medium–large on graphics (pngquant: up to ~70%); fixes "PNG→PNG never shrinks" | Medium (banding on soft gradients without dithering) | M | Medium–high |
| 7 | **Per-picture display-size downscale + delete cropped areas** (placeholder and group resolution) | ppt-compress | Extra over #2 for small frames and heavily cropped photos (our JPEGs were all cropped) | Medium–high | L | High, but after #2 |
| 8 | **Resize option in image-compress** ("long edge ≤ N px") | image-compress | Large for phone photos | Low | S–M | Medium |
| 9 | **qpdf lossless pass** (object streams, recompress-flate) as Light or a safety net; reduces dependence on the 2-star justpdf engine | pdf-compress | Small–medium on text PDFs; resilience | Low–medium | M | Medium |
| 10 | **Better resampler** (step-halving or pica Lanczos) for large reductions; covers Firefox | image-resize, downscalers above | Sharper downscales, no aliasing | Low | M (pica = new dependency) | Low–medium |
| 11 | **HEIC colour** (convert P3→sRGB or tag ICC; native decode on Safari 17+) | image-compress/heic-convert, image-to-pdf/pptx | Correct colours for iPhone photos | Low | M | Medium (iPhone photos are common) |
| 12 | **Legacy .ppt metafiles** (inflate EMF/WMF blips; DIB → add BMP header) | ppt-extract | Recovers clip-art from old decks; avoids a whole-result block | Low | M | Low–medium |
| 13 | **Bookmarks/forms on merge** via qpdf `--pages` | pdf-arrange | Keeps outlines | Medium | L | Low |
| 14 | **PNG embedding with predictor** (keep IDAT, `Predictor 15`) | image-to-pdf | Smaller PDFs from screenshots | Low | M | Low |
| 15 | **Master mode also handles layouts with their own `<p:bg>`** (or explains it) | ppt-background | Fewer "background didn't change" surprises | Low | S–M | Medium |

**Where we are already at or above the field (keep):**
- Run-time output checks with silent recovery (no comparable promise from web tools).
- The not-smaller outcome instead of a fake "compressed" file.
- Per-image keep-if-smaller in ppt-compress.
- Byte-exact extraction.
- AES-256 with a random owner password.
- JPEG passthrough with EXIF transform in image-to-pdf.
- Master-level shared backgrounds in image-to-pptx.
- No server upload at all.

**Feasibility constraints to respect:**
- **Bundle and memory on phones.** Wasm codecs (MozJPEG, OxiPNG, imagequant) must lazy-load per tool. A 4000×3000 RGBA decode is 48 MB, so process images sequentially, as ppt-compress already does.
- **Licences.** libimagequant is GPL-3/commercial; Ghostscript is AGPL **[unverified for current builds]**; jSquash, Squoosh and pica are Apache-2.0/MIT.
- **Dependency adds are a hard stop for the maintainer** (Windows + 32 GB fit, maturity check).
- **Non-expert first.** No new options except where a plain-language control is natural (a resize cap in image-compress).

---

## 5. Glossary (plain English)

**Images and resolution**
- **ppi / dpi:** pixels (dots) per inch. How many image pixels fall on one inch of slide or page. Screens and projectors need roughly 96–150; print needs ~300.
- **Downsampling / resampling:** making an image smaller in pixels. *Bicubic*, *Lanczos* and *Mitchell* are recipes for blending neighbouring pixels so the result stays sharp without jagged edges.
- **Aliasing:** jagged or shimmering artefacts when an image is shrunk too crudely.

**Compression**
- **Lossless / lossy:** lossless (PNG, Flate/ZIP) keeps every pixel exactly. Lossy (JPEG, WebP lossy) throws away detail the eye is unlikely to notice, for much smaller files.
- **DEFLATE / Flate / zlib:** the general-purpose lossless compressor inside PNG, ZIP, PPTX and PDF.
- **PNG filter:** a per-row trick (None/Sub/Up/Average/Paeth) that makes pixels more predictable before DEFLATE. Choosing filters well is a big part of PNG size.
- **Palette / quantization:** storing an image with a limited set of colours (≤256 for a PNG palette) instead of 16 million. Done well (pngquant) it is nearly invisible.
- **Dithering:** sprinkling pixels of nearby colours to hide the steps that quantization causes.
- **Banding:** visible stripes in smooth gradients, a typical sign of too few colours without dithering.
- **Chroma subsampling:** JPEG storing colour at lower resolution than brightness. Fine for photos, but it smears coloured text.
- **Ringing / mosquito noise:** halos and speckles that JPEG creates around sharp edges such as text and lines.
- **MozJPEG / trellis quantization:** a better JPEG encoder that picks its compressed data more cleverly, giving smaller files at the same look.
- **WebP / AVIF / JPEG XL:** newer image formats, smaller than JPEG/PNG but not supported everywhere (Office, Google Slides).

**Transparency and colour**
- **Alpha channel:** the per-pixel transparency layer. "Present" means the file has one; "used" means at least one pixel isn't fully opaque.
- **Premultiplied alpha:** storing colour already multiplied by transparency. Canvas does this, which loses a little precision in very transparent pixels.
- **EXIF orientation:** a tag in phone photos saying "rotate me 90°". Software must apply it, or pictures come out sideways.
- **ICC profile / colour management:** a description of what the colour numbers mean. **sRGB** is the web standard; **Display P3** is the wider gamut iPhones use. Ignoring it shifts colours.

**File formats and libraries**
- **HEIC / HEIF:** Apple's default photo format. **libheif** is the open-source decoder we run as **WASM** (WebAssembly: compiled code that runs fast inside the browser).
- **CDN:** a third-party server network that hosts files. Loading code from one means the page depends on that server at run time.

**PowerPoint file structure (OOXML)**
- **OOXML / OPC:** the Office Open XML standard (ECMA-376). A .pptx is a ZIP of *parts* (XML files, images).
- **Relationship (.rels):** the file that says "image rId5 on this slide = `../media/image3.png`". Renaming a part means updating every relationship that points to it.
- **Content type (`[Content_Types].xml`):** the table that says what kind of file each part is, by extension (*Default*) or by exact name (*Override*).
- **EMU:** English Metric Unit, PowerPoint's length unit; 914,400 EMU = 1 inch.
- **blip / blipFill:** OOXML's name for an embedded picture and the instruction to paint it into a shape or background.
- **srcRect / fillRect:** crop and stretch rectangles, given in percent (100000 = 100%).
- **Placeholder inheritance:** a slide shape that takes its size and position from the layout or master.
- **EMF / WMF:** Windows vector picture formats, common for clip-art in old decks.

**PDF**
- **Object streams:** a PDF 1.5+ feature that packs many small objects together and compresses them.
- **JPEG 2000 (JPX) / JBIG2 / CCITT:** image compressions found in scanned PDFs. JPX is for colour and grey scans; JBIG2 and CCITT are for black-and-white.
- **Soft mask (SMask):** a PDF image's separate transparency layer.
- **AcroForm:** the PDF structure that makes form fields fillable.
- **Outline:** PDF bookmarks.
- **AES-256 (R6) vs RC4:** modern strong PDF encryption vs the old, broken one.
- **User / owner password:** the user password opens the file; the owner password lifts print/copy restrictions.
- **PDF/A:** the archival PDF standard. It forbids encryption.
- **Artifact (PDF):** content marked as decoration (watermark, header) so screen readers and editors treat it separately.
- **Rasterize:** turn text or vector drawing into pixels.

---

## 6. Sources

**Microsoft / Office**
- Reduce the file size of a picture in Microsoft Office: https://support.microsoft.com/en-gb/office/reduce-the-file-size-of-a-picture-in-microsoft-office-8db7211c-d958-457c-babd-194109eb9535
- Change the default resolution for inserting pictures in Office (High fidelity): https://support.microsoft.com/en-us/office/f4aca5b4-6332-48c6-9488-bf5e0094a7d2
- Office support for HEIF, AVIF, and WebP files: https://support.microsoft.com/en-us/article/23a6f06c-ce25-49ce-8801-d1d09ccbcf4e
- MS Q&A, WebP support in Microsoft 365: https://learn.microsoft.com/en-us/answers/questions/5283931/when-can-we-expect-webp-support-in-microsoft-365-d
- Office Watch, WebP support added to Office: https://office-watch.com/2024/webp-support-has-now-been-added-to-microsoft-office/
- Indezine, Compress Pictures in PowerPoint 2016 (ppi values): https://www.indezine.com/products/powerpoint/learn/picturesandvisuals/2016/compress-pictures.html
- CustomGuide, Compress Pictures in PowerPoint: https://www.customguide.com/office-365/compress-pictures-in-powerpoint
- MS-ODRAW 2.2.31 OfficeArtMetafileHeader: https://learn.microsoft.com/en-us/openspecs/office_file_formats/ms-odraw/ffdcc2b8-98fd-46b2-921e-6bb6693d05e5
- SourceRectangle (a:srcRect): https://learn.microsoft.com/en-us/previous-versions/office/developer/office-2010/cc861209(v=office.14)
- FillRectangle (a:fillRect): https://technet.microsoft.com/en-au/library/cc882715(v=office.14)

**Standards**
- ECMA-376 Office Open XML: https://ecma-international.org/publications-and-standards/standards/ecma-376/
- ISO/IEC 29500-2 preview: https://www.vde-verlag.de/iec-normen/preview-pdf/info_isoiec29500-2{ed1.0}en.pdf
- PDF/A and encryption (pdftools): https://pdf-tools.com/docs/pdf-tools-sdk/encrypt
- PDF artifacts, watermark subtype (Aspose summary of ISO 32000 §14.8.2.2): https://docs.aspose.com/pdf/net/artifacts/

**PDF tools**
- Ghostscript, High Level Devices (pdfwrite, PDFSETTINGS): https://ghostscript.readthedocs.io/en/latest/VectorDevices.html
- qpdf command-line docs: https://qpdf.readthedocs.io/en/stable/cli.html
- Adobe, PDF Optimizer settings: https://helpx.adobe.com/acrobat/desktop/create-documents/optimize-pdfs/pdf-optimizer-settings.html
- CreativePro, Acrobat compression session (Distiller Automatic JPEG/ZIP, secondary): https://creativepro.com/acrobat-how-to-compression-session/

**Image codecs and tools**
- pngquant: https://pngquant.org/
- oxipng: https://github.com/oxipng/oxipng
- MozJPEG: https://github.com/mozilla/mozjpeg
- Squoosh (repo, codecs, resize methods): https://github.com/GoogleChromeLabs/squoosh, https://github.com/GoogleChromeLabs/squoosh/tree/dev/codecs, https://github.com/GoogleChromeLabs/squoosh/blob/dev/src/features/processors/resize/shared/meta.ts
- jSquash: https://github.com/jamsinclair/jSquash
- pica: https://github.com/nodeca/pica
- pptx-downsizer: https://github.com/scholer/pptx-downsizer/
- Cloudinary, adaptive format delivery: https://console.cloudinary.com/blog/adaptive_browser_based_image_format_delivery
- Cloudinary forum, f_auto and PNG: https://support.cloudinary.com/hc/en-us/community/posts/115000572872-f-auto-is-not-giving-optimum-picture-format-PNG-as-standard
- web.dev, JPEG: https://web.dev/learn/images/jpeg

**Browsers and platforms**
- MDN, imageSmoothingQuality: https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D/imageSmoothingQuality
- MDN browser-compat-data, CanvasRenderingContext2D: https://github.com/mdn/browser-compat-data/blob/main/api/CanvasRenderingContext2D.json
- MDN browser-compat-data, createImageBitmap: https://github.com/mdn/browser-compat-data/blob/main/api/_globals/createImageBitmap.json
- MDN, createImageBitmap: https://developer.mozilla.org/en-US/docs/Web/API/Window/createImageBitmap
- caniuse, HEIF/HEIC: https://caniuse.com/heif (data: https://github.com/Fyrd/caniuse/blob/main/features-json/heif.json)
- Google Slides API, add image (PNG/JPEG/GIF): https://developers.google.com/workspace/slides/api/guides/add-image

**Library source read locally (main checkout `node_modules`, read-only)**
- `browser-image-compression@2.0.2`: `dist/*.mjs.map` sources `lib/index.js`, `lib/image-compression.js`, `lib/utils.js`, `lib/web-worker.js`, `lib/UPNG.js`
- `pdfjs-dist@5.6.205`: `build/pdf.worker.mjs`, `types/src/display/api.d.ts`
- `pdf-lib@1.17.1`: `src/api/PDFDocument.ts`, `src/core/embedders/PngEmbedder.ts`
- `heic-to@1.5.2`: `README.md`, `src/index.js`
- `@kihyun1998/justpdf-compress-wasm@0.1.2`: `README.md`
- `@neslinesli93/qpdf-wasm@0.3.0`: `dist/qpdf.wasm` (version strings)
- GitHub API (repo activity): pdf-lib, PptxGenJS, browser-image-compression, UPNG.js, heic-to, qpdf-wasm, justpdf, qpdf
