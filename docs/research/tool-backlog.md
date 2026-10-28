# Tool backlog: ranked improvements across tools

- **Updated:** 2026-10-28 (ppt-background (3) recipe edit grilled); 2026-10-26 (ppt-background direction after B-1, S6 added; 2026-10-23 spec A shipped; 2026-10-21 re-rank of [`tool-methods-review.md`](tool-methods-review.md) §4, plus ideas from the CONTEXT "Target users" table).
- **Role:** step 1 ("diagnose across tools") of the re-check order in [`docs/agents/workflow.md`](../agents/workflow.md). It sets which shared causes to fix and the order tools take their turn. Once an item becomes a spec, its GitHub issue tracks progress; this file only keeps the ranking.
- **Ideas are not plans.** Items marked _idea_ come from the target-users review and still need their tool's feature-scope check before they become work.

## Lenses

1. **Fix weight where it enters.** A tool that puts content into a file (ppt-background, image-to-pptx, image-to-pdf) should write it at the right size and format. Compressors are the second line, not the fix.
2. **Reach.** Which [target users](../../CONTEXT.md#target-users) hit it, and how often.
3. **Gain, risk, effort** (S / M / L), as in the review.
4. **Step.** A shared cause is fixed once (step 2); everything else waits for its tool's turn (step 3).

Review numbers (R1–R15) refer to the review's §4 table.

## Done

| Review | Item | Where |
|---|---|---|
| R2, R7 | Downscale pictures to their display size (crop-aware, groups, projected pixels) | spec #91, PR #96. Deleting cropped-away areas stayed out of scope. |
| R1 | Self-host the browser-image-compression worker (was S1) | `src/lib/image/imageCompressionWorker.ts` + `scripts/copy-image-compression.mjs`: the worker imports the bundle from `public/`, not cdn.jsdelivr.net. |
| R3 | ppt-background spec A: Background crop, fit inside 4K, JPEG when opaque, gallery picks as is, HEIC input | spec #98, PR #104. Builds the shared prep module `src/lib/image/slideImage.ts` (S4). |
| R10 (part) | High-quality resampler that halves in steps | `src/lib/image/downscale.ts` (#91). ppt-compress uses it; image-resize and image-to-pptx still resize in one step (S4). |

## Step 2: shared causes

| # | Item | Tools | Reach | Gain | Risk | Effort | Notes |
|---|---|---|---|---|---|---|---|
| S2 | Pass `wasmUrl` / `iccUrl` to pdf.js and copy its `wasm/` + `iccs/` (R5) | pdf-to-image, PDF checks, thumbnails | Pastors (scanned sheet music), teachers, office workers (scans) | JPEG 2000 images render instead of blank; correct ICC colour | Low | S | |
| S3 | Each compress preset states its result in user terms | ppt-compress, pdf-compress, image-compress | All targets | Users can predict the result before choosing | Low | S | ppt-compress [임시] 약하게 원본 해상도·4K / 보통 QHD 2560 / 강하게 FHD 1920; pdf-compress 강하게 = screen reading. Final copy is the user's. |
| S4 | Adopt the shared image prep module (crop → fit inside a screen box → JPEG/PNG choice) and the stepped resampler | image-to-pptx, image-resize, later ppt-compress PNG→JPEG | All targets | One size and format policy instead of three | Medium (outputs change; checks must follow) | M | Unblocked: spec A (#98) built `src/lib/image/slideImage.ts`. image-to-pptx today: 1920 px long edge, PNG always PNG, JPEG 0.9, one-step resize. |
| S5 | _idea_: "Under N MB" target-size option | ppt-compress, pdf-compress, image-compress | Teachers, students, office workers, small-business owners: the widest shared need | Users hit an upload limit in one try | Medium | M–L | Needs its own grill: search over presets vs quality, honest failure when unreachable. |
| S6 | Stop the extra loss when a cropped JPEG is saved again: the browser re-encodes it at quality 0.85 with its colour detail halved (4:2:0, fixed in Chrome) | ppt-background, later image-to-pptx and ppt-compress (S4) | Pastors and teachers (phone photos as backgrounds) | Cropped photos keep their quality and colour | Medium | M | Measured 2026-10-26 on gallery gradients (ΔE vs source): +0.02–0.03 for soft gradients, +1.3 for coarse colour grain; high-quality phone photos not measured yet. Options: lossless JPEG crop on 16 px block edges when no downscale is needed, or an encoder that keeps full colour detail (4:4:4). |

## Step 3: tool queue

In order. Each turn opens with the feature-scope check.

| Order | Tool | Work | Reach | Notes |
|---|---|---|---|---|
| 1 | **ppt-background** | ~~Spec A~~ done (#98, PR #104). **Spec B-1** (next, grilled 2026-10-23): replace the [visible background](../../CONTEXT.md#visible-background), deleting [covering backgrounds](../../CONTEXT.md#covering-background) (pictures or opaque text-free fills) unless the user keeps one; master mode also clears slides' own backgrounds, which absorbs R15 (real decks have no layout backgrounds but a solid slide background on nearly every slide). B-1 shipped (PR #112). Then, in order (direction settled 2026-10-26): (1) ~~gallery from local assets~~ done (PR #113: user-picked Paper Shaders recipes and CC0 photos, 4K originals so a half-width crop still fills Full HD); (2) ~~solid colour and "no background"~~ done (feat/ppt-background-solid: a "단색" tab of presets and a free pick, written as a solidFill; no background = the theme's `bg1`; preset list and copy still [임시] until the user settles them; reuse: image-to-pptx's colour background could adopt the same swatch grid; deferred until a real deck needs it: the "no background" tile and preview show the first slide's theme colour, so a deck with several masters whose `bg1` differ, as slides pasted with their source formatting bring, previews one colour while each slide gets its own; none of the 21 fixtures has more than one master); (3) [recipe edit](../../CONTEXT.md#recipe-edit) (grilled 2026-10-28, next: `/to-spec`): the 31 Paper items only (patterns are Paper too, so no SVG port; legacy gradients and photos stay as they are). Colour: one hue slider shifting every colour (OKLCH), each colour of the recipe as a chip to change alone, "+" where the shader takes a `colors` list (up to min(Paper max, 6); only added colours can be removed, and adding again brings back the one removed last). Size = `scale` (0.5–2× the recipe) on all; grain on 9 (mesh family: grain edges `grainMixer` and grain dots `grainOverlay` as two sliders, split at the spec-end QA; the grain gradient's `noise`; spiral and swirl `noise` is a line wobble that needs a noise frequency, not grain, so they have none); softness on 20 (`softness`, else `mixing`); a slider is hidden where the shader lacks it. A collapsible, closed-by-default "edit" area on the crop screen; the filter set (4) joins it later. Unedited = the gallery file; edit = live preview at small size, one 3840 × 2160 drawing at apply (same 1280 × 720 composition, the user's crop kept), then the usual crop → fit → format. No WebGL2: no edit area; a failed drawing is an error. "원래대로" returns to the file; another pick or back to the gallery drops edits; 다시 하기 keeps them. Shape (added at the spec-end QA, #121): one slider for the value that most decides each shader's shape (the animation frame for mesh gradients and warps, positions for static meshes, density for god rays and spirals, and so on; none for static radial gradients and simplex noise). Out: saving edits, other shader values, edited thumbnails. `@paper-design/shaders` moves to runtime dependencies, loaded only with the edit area (hard stop before the change). Copy [임시] until the spec-end visual QA. Measured 2026-10-28 on a laptop iGPU (Radeon 860M): 4K drawing + PNG read 0.07–0.24 s per recipe; phones not measured. (4) _idea_: a small filter set (such as blur, grain, a light or dark veil) for any picked background, gallery or uploaded, on the crop screen; the set is chosen by the user. The same crop-screen change also shows the picture's own pixel size. Gallery base images therefore carry no effect that stands apart from their style (no blur, grain or veil baked in; grain only where it is the style itself, as in a grain-gradient shape), so the filter is the one place effects are laid over a finished picture; a recipe edit (3) changes Paper's own grain and softness, which shape how the picture is drawn. Before settling the set, compare the filter's blur and grain with Paper's own softness and grain on the gallery recipes: they may not look the same, and on Paper items the two grains may duplicate (decide when grilling (4)). | Pastors weekly | Spec A fixed the entry point of the largest measured waste (47–57% of affected decks). B-1 targets the user’s pain that slide-sized pictures hide the new background (16/50 and 2/11 slides in real decks). |
| 2 | **image-to-pptx** | Adopt S4; a screen-size option (FHD default, 4K on request) | Pastors, teachers | Entry point; many photos per deck, so a 4K default would multiply deck size. |
| 3 | **image-to-pdf** | _idea_: a size option for phone photos (embedded unchanged today, so a page of 12 MP photos stays 12 MP); PNG with predictor (R14) | Teachers (submissions), office workers (receipts), students | Entry point for PDFs. |
| 4 | **image-resize** | _idea_: purpose-named presets (YouTube thumbnail, Instagram carousel), print sizes for posters (A4 / A3), marketplace product sizes; adopt S4 resampler | Small-business owners, pastors and teachers (promotion material) | Pixel presets exist (4K, FHD, 1280×720, 1080², 1080×1350, mobile) but are named by resolution. Take sizes from each platform's current spec. |
| 5 | **image-compress** | Resize option "long edge ≤ N px" (R8); palette PNG (R6); S5 | Students, small-business owners | |
| 6 | **ppt-compress** | Palette PNG with a quality floor (R6); PNG→JPEG stays parked (below) | Pastors | Second line once ppt-background and image-to-pptx write right-sized images. |
| 7 | **pdf-compress** | qpdf lossless pass as Light or a safety net (R9) | Office workers, teachers | |
| 8 | **pdf-watermark** | _idea_: "for submission to …" mark for document copies | Office workers, small-business owners | |
| 9 | **pdf-to-image / image-to-pptx handoff** | _idea_: sheet-music PDF → slides in one step (two tools today) | Pastors | |
| 10 | **pdf-arrange** | Keep bookmarks and forms on merge via qpdf `--pages` (R13) | Office workers | |
| 11 | **ppt-extract** | Legacy .ppt metafiles: inflate EMF/WMF, add BMP headers (R12) | Pastors (old decks) | |
| 12 | **Image inputs (all)** | HEIC colour: P3 → sRGB or tag ICC (R11) | All targets (iPhone photos) | Could become a step-2 item once more tools resize. |

## Parked (waiting for a trigger)

| Item | Trigger to reopen |
|---|---|
| ppt-compress opaque PNG → JPEG at 강하게 (R4) | Real decks with many opaque photo PNGs not made by ppt-background, or soft-alpha work. After spec A only 1 such image was found in decks people made (6–9% of the compressed deck). |
| Deleting cropped-away picture areas in ppt-compress | A real deck where it matters. |

## Out of reach

- **HWP** (common in Korean schools): no tool reads it. In-browser HWP support is not researched; do not promise it.
- **Word / Excel conversions**: need a server (CONTEXT non-goal).
