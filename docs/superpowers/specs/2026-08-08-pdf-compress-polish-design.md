# pdf-compress polish — design

**Branch:** `chore/polish-pdf-compress` · one session = one branch = one PR.
**Date:** 2026-08-08
**Track:** per-tool polishing (after ppt-background #45, pdf-watermark #47). Reuse
criteria = `docs/agents/tool-polishing-checklist.md` (A–E).

## Context

pdf-compress was built in PR #14, before the shared-component derivation. It has
since absorbed the common sweeps (#41 upload/result/tray, #43 boundaries, #46
ToolHeader), so drift is small: it already uses `ToolHeader` (execute → processing
→ again lifecycle), the `--tray-h` envelope, `ResultCard`/`ResultActions`,
`FileUpload`, `OversizeNotice`, `ProcessingStatus`. No `NumberField` is needed — the
only input is a 3-way preset segmented control.

### P0 (silent-corruption) status: retired

The known corruption bug (3.2MB → 24.6KB unusable output) is **not reproducible**.
`scripts/repro-pdf-corruption.mjs` over the full `tests/fixtures` set (2MB–163MB,
including the 163MB image-heavy deck — the closest analog to the reported case)
produced zero corruption: valid `%PDF`, preserved page counts, sane ratios;
encrypted PDFs throw cleanly. The 4-layer integrity guard + `CORRUPT_OUTPUT`
sentinel remain as a safety net (9/9 unit tests green). justpdf stays at 0.1.2
(0.1.3 exists but is unnecessary since 0.1.2 does not reproduce the bug). This
session is pure polishing.

## Root cause found — item 2 (misleading live preview)

The live compressed preview runs **pdf-lib `extractPageOne` (copyPages) → WASM
compress**, whereas the real output runs **WASM compress on the whole original**.
The two paths diverge:

| Fixture | whole-doc | pdf-lib page-1 extract |
| --- | --- | --- |
| 26동계 찬양기도회 | 14 img / 13 pg | **0 img** / 1 pg — page-1 image lost on extraction |
| 20260419 | page-1 has 2 img | extracted, but frozen at 79KB across all presets (not re-encoded) |

So `copyPages` can drop a page's image entirely (what the user saw), and even when
it keeps the image it re-serializes it into a form the WASM re-encoder skips — the
preview never reflects the real quality/size change. The `extractPageOne` approach
is unsound for a faithful preview.

## Scope

### 1. Faithful live preview (resolves item 2 + dimension A estimate accuracy)

- Drop `extractPageOne` from the preview path. In `idle`, debounce (400ms, keep the
  existing token guard) a **whole-document** `compress` at the current preset, then
  render page 1 of that authoritative output.
- **Precompute cache:** keep `{ preset → CompressPdfResult }`. Pressing the execute
  button reuses the cached result → instant `done` (the final compress is now free
  when a preview already ran). Invalidate on file change; key by preset.
- **Size gate:** when `file.size > uploadLimitFor("pdf-compress")`, skip the live
  whole-doc compress — show the original preview only + the model estimate. Prevents
  churning the main thread on 100MB+ inputs.
- **Estimate = actual:** when a live compressed result exists, show the **real**
  compressed size + savings instead of the model range. The model estimate remains
  only for gated (oversize) files.
- Integrity guard stays, but the preview path catches a `CORRUPT_OUTPUT` throw and
  falls back to the original preview (no size shown) rather than surfacing an error.
- **Trade-off (accepted):** `compress_advanced` is synchronous and blocks the main
  thread (~0.7–0.9s for a 6MB file at medium, once, after debounce). Acceptable for
  church files (2–6MB). Moving compression to a Web Worker would unblock both preview
  and final compress but is a larger change — **deferred**; mitigated here by the
  size gate + debounce.

### 2. Preview zoom via shared lightbox (item 4)

- Promote `PreviewLightbox` from `tools/ppt-background/` to `components/common/`;
  ppt-background switches to the common import (unification, no behavior change).
- The preview frame becomes clickable → re-render page 1 of the currently shown bytes
  (original or compressed) at high resolution (~1800px target) → open the lightbox
  with that URL. Spinner while rendering; revoke the hi-res URL on close. New i18n:
  close label + zoom aria label.

### 3. Two-column panel divider (item 3)

- Match pdf-watermark: the right column gets `md:border-l md:pl-5` (token `--border`).
- **Not** extracted into a shared component (YAGNI — it is a border utility). Instead
  documented as canon in the polishing checklist (dimension E) + `docs/design-preview.html`
  so future tools apply the same divider.

### 4. Oversize warning in the header (item 1)

- Remove the dismissible `OversizeNotice` panel from pdf-compress. Pass a `meta` node
  to `ToolHeader` (the existing slot beside the file size) rendering a **non-dismissible**
  inline warning — short text, full detail on hover `title`. New short i18n label.

### 5. Copy / i18n cleanup (dimension D)

- Reframe preset descriptions from misleading percentage promises to behavior
  descriptions (the real number is now shown by the faithful preview). Draft:
  - Light — "이미지 그대로 · 최소 압축"
  - Medium — "이미지 재인코딩 · 균형"
  - Heavy — "이미지 축소 + 재인코딩 · 최대"
  (final wording tuned during implementation; ko/en in parallel).
- Remove the dead `uploadMaxSize` label (declared + mapped but unused).
- Add page count to `fileInfo`: `{name} · {size} · {pages}p` (analyze already runs).

## Testing & verification

- Pure logic extracted to `src/lib` with Vitest TDD (RED→GREEN→REFACTOR): preview
  cache keying, size-gate threshold, real-vs-model estimate selection.
- Existing integrity-guard unit tests retained.
- `tsc` + `build` + `lint` + `vitest` + `design:check` all green.
- User visual QA via screenshots (dev server run by the user, no /browse): confirm
  preview == real output on a real church PDF, zoom, divider, header warning.
- Then `/review` → `/ship` (push / PR / merge are hard stops, after approval).

## Out of scope (deferred)

- Web Worker for compression (perf) — future.
- justpdf 0.1.3 bump — unnecessary.
- High-DPI estimate-model refinement — moot now (real size shown); the model only
  survives for gated oversize files, where the imprecision is minor.
