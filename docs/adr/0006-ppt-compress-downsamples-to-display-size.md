# ADR 0006 — ppt-compress downsamples each picture to its display size

- **Status:** Accepted
- **Date:** 2026-10-20
- **Relates to:** spec #51 (output correctness), `media-dimensions` in
  `src/lib/ppt/pptCompressCheck.ts`, the tool-methods review on branch
  `research/tool-methods` (`docs/research/tool-methods-review.md`)

## Context

ppt-compress re-encodes each JPEG and PNG in its own format and at its own
pixel size. PowerPoint, Acrobat and Ghostscript all reduce pixels to what is
shown first; that is the one lever the review found missing.

The review proposed a fixed cap in ppi of slide inches (PowerPoint's 220/150).
A re-check on the maintainer's real decks (2026-10-20, aggregate numbers only;
the repo is public) ruled that out:

- Most decks use a 20 × 11.25 in slide. A 220 or 150 ppi cap is then 4400 or
  3000 px wide, above every picture in them: the cap changes nothing. Slide
  inches say nothing about what a projector shows; projected pixels do.
- A fixed cap of any kind ignores `a:srcRect` crops. Photos cropped and
  enlarged on a 4:3 photo deck need more pixels than the slide box; a
  slide-sized cap would leave them below a 1080p projector's need.
- Sized per picture, crop zoom included, at a 1920 px-wide slide, the decks
  keep 0.74–0.98 of their image pixels. Every picture had its own `a:xfrm`;
  groups (`a:grpSp`) were common.
- Pictures straight from a phone (4032 × 3024) are uncommon in these decks
  but do occur, and gain the most.

## Decision

- **Downsample to display size.** A picture's display size is the largest
  extent it is drawn at across every use (slides, layouts, masters,
  backgrounds), with crop zoom and group scaling applied, at the preset's
  slide width in projected pixels. A picture is reduced only when it holds more
  pixels than that, keeping its aspect ratio. The preset targets are set in
  the spec.
- **Unknown means untouched.** A picture whose display size cannot be worked
  out, or that is drawn as a tile (`a:tile`), keeps its pixels.
- **Resize ourselves.** browser-image-compression's `maxWidthOrHeight` scales
  in one `drawImage` at default smoothing; the engine downsamples with
  high-quality smoothing before the encoder, as image-to-pptx does.
- **Output check: `media-dimensions` changes** from "same displayed pixel size"
  to "same aspect ratio (within 1 px of rounding) and not larger", still on the
  displayed size (EXIF orientation applied). That catches distortion and
  growth, which are certainly wrong. Shrinking below the display size is
  caught by the regression set, which knows each picture's target; the run-time
  check would have to re-derive display sizes from the slide XML, duplicating
  the engine.
- **Formats stay as they are in this change.** Opaque photographic PNG → JPEG
  (strongest preset, the review's five guards) is a separate, later spec: it
  renames parts, so it changes `entry-set` and `media-header` too, and the
  real decks hold one qualifying picture.
- **Deleting cropped areas** (rewriting `a:srcRect`) is out of scope.

## Consequences

- The size estimate needs each picture's pixel size and target scale, read
  from the slide XML during idle analysis; its per-picture ratios
  (`pptCompressPlan.ts`) gain a downsampled path, measured again.
- The measurement page (`scripts/measure-ppt-ratios`) must downsample real
  decks to their targets with the engine's resampler, and needs a lossless
  high-resolution image set: the Kodak photos (768 × 512) are below every
  target. The same set serves the image tools' verification.
- A JPEG's EXIF orientation is baked into the pixels when it is re-encoded, as
  it already is today. Whether PowerPoint honours EXIF orientation is still
  unchecked on a real device.
