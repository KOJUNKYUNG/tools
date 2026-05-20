# image-compress silver migration — design

Date: 2026-05-21
Tool: `image-compress` (Phase 1, third tool migration)
Branch: `feat/ontab-phase-1-image-compress`
Reference pattern: `image-resize` (PR #5/#6) — `inline` prop, dual page/Screen3 render.

## 1. Goal

Migrate `/tools/image-compress` from the old-chrome design to the Ontab silver
design system, mounting it inline inside `Screen3Workspace`. The core
compression logic (`src/lib/image/compressImage.ts`) is already complete
(PNG/JPG/WebP convert + quality + multi-file + single/ZIP output) and is
**not** rewritten. This is primarily a UI migration plus one UX feature
(live estimated output size).

Out of scope (explicitly): PPTX compression, `FILE_SIZE_LIMIT` changes — both
are Phase 2 / backlog items in `docs/IMPROVEMENTS.md`, not image-compress
migration work. There are no image-compress-specific items in IMPROVEMENTS.md
to absorb.

## 2. Layout (from user mockup)

Single-image-primary design. Same tool-area width and header as
`ppt-background` / `image-resize`. Two columns split by a vertical divider.

### Left column — preview
- Top row: `{filename}` + `{+n개 이미지}` suffix (only when 2+ files) on the
  left; `[다시 업로드]` button on the right.
- Preview box: the currently selected image, `object-contain` letterboxed
  inside a fixed-aspect container (trap **a**: aspect container +
  `object-contain`/`object-cover` child; never inline px on a flex child).
- Carousel (only when 2+ files): below the preview, `←  i/n  →`. Arrows
  clamp at ends (disabled at first/last). Navigating re-targets the live
  estimate to the newly shown image.

### Right column
Vertical order, top to bottom:
1. **Primary action region** (fixed-height envelope — see §4 UI stability):
   - idle: `이미지 압축하기 ({n}개)` button + `포맷 선택` segmented
     (JPG / PNG / WebP) + `품질` slider (+ live estimate line).
   - done: result card (replaces the whole region; format + quality controls
     disappear).
2. **File list** (anchored below the region; position must not move between
   idle and done). Vertically capped with **scroll** when many files — the
   tool height never grows. Rows:
   - idle: `{name}` · `{size}` · `[x]` (remove).
   - done: `{name.newExt}` · `{originalSize} → {newSize}`.

## 3. Behavior

- **Re-upload** (`다시 업로드`): opens the OS picker immediately via a hidden
  `<input type="file" multiple>` (`.click()`), mirroring image-resize. It
  **replaces the entire current selection** (multi-select allowed). There is
  no separate "add more" affordance; per-file removal is the row `[x]`.
- **Format required**: `outputFormat` initial value is `null`. The compress
  button is **disabled** until a format is chosen (current default of
  `image/jpeg` is removed).
- **Quality**: min 10, max 100, **default 100**. Slider step 1.
- **Compress**: clicking the (enabled) button runs `compressImages`. On
  success the result card appears, the format + quality controls disappear,
  and the file list stays in place and switches to done-mode rows (new
  extension + `original → new` sizes), matched to results by index.
- **Result card** (mirrors `ImageResizeResult` styling): "압축 완료" title +
  `{format} · 품질 {quality}%` line + download button + `다시 압축` button.
  - Download: single file → direct download; 2+ files → ZIP
    (`compressImages` already returns `type: "single" | "zip"` + filename).
  - `다시 압축`: returns to the pre-compress state (`useToolProcessor.retry()`
    clears result/status; `outputFormat` + `quality` are separate state and
    are retained, so the user lands exactly where they were before pressing
    compress).
- **Multi-file indicators**: `+{n}개 이미지` suffix on the left filename row,
  `←  i/n  →` carousel under the preview, `({n}개)` count on the compress
  button.
- **Done-mode list is read-only**: the `[x]` remove is hidden/disabled once
  results exist (removing a file mid-result is meaningless). Carousel still
  works for browsing originals.
- **Cross-tool handoff (consume side)**: the existing
  `consumeStagedFiles()` effect is preserved (do not re-add). Files staged by
  image-resize auto-populate on mount. **No reverse handoff** button
  (compress → resize) — decided out.

## 4. UI stability contract

- The right-column **primary action region** is a fixed (min-height)
  container. idle content (button + format + quality + estimate line) and the
  done content (result card) swap inside it, so the **file list below never
  shifts vertically**.
- The live-estimate line reserves its height even while empty/computing
  (placeholder `nbsp` or fixed min-height), so toggling format/quality does
  not jolt the layout.
- Format selection indicator uses `box-shadow`/background, never a
  `border-width` change (trap: 1→2px border resizes the card).
- The file list region is a fixed-height, `overflow-y:auto` box; adding
  files grows the inner scroll, never the outer tool height.
- Disabled compress button keeps the same footprint as enabled.

## 5. Live estimated output size

Answers the "what quality → what size" intuition gap.

- For the **currently previewed image only**, whenever `outputFormat`
  (non-null), `quality`, or the carousel index changes, debounce (~300 ms)
  and run the real pipeline: `compressImages({ files: [currentFile], quality,
  outputFormat })`, read `images[0].compressedSize`. This is the *actual*
  compressed size for that image, not a heuristic.
- Display near the slider: `예상 ~{size} · 원본 대비 {pct}` where pct comes
  from `computeSavings`. While computing: `예상 용량 계산 중…`.
- **Race safety**: an incrementing request token (ref). After `await`, if the
  token no longer matches the latest request, discard the result. The debounce
  timer is cleared on every dependency change.
- **PNG note**: canvas `toBlob("image/png", quality)` ignores `quality`
  (PNG is lossless). When PNG is selected, show
  `PNG는 무손실 — 품질 영향 없음` and the estimate reflects the (quality-
  independent) PNG size. The slider stays visible but the note sets
  expectations.
- Only active in idle state (before compress). Hidden once the result card is
  shown (the list already shows actual sizes).

## 6. Component breakdown (`src/components/tools/image-compress/`)

- `labels.ts` — `getImageCompressLabels(dict)` (`get*` naming convention).
  `uploadMaxSize` sourced from `dict.common.fileUpload.maxSize`.
- `ImageCompressTool.tsx` — orchestrator. Owns state (`files`, per-file blob
  `urls`, `currentIndex`, `outputFormat: OutputFormat | null`, `quality`,
  `estimate`, `estimating`), the `useToolProcessor<CompressResult>` instance,
  the debounced estimate effect, and the `inline` dual-render (page card chrome
  + header + reset when `inline=false`; bare body when `inline=true`), exactly
  mirroring `ImageResizeTool`.
- `ImageCompressPreview.tsx` — left column: filename row (+ `+n` suffix +
  re-upload button), preview image, carousel.
- `ImageCompressControls.tsx` — format segmented + quality slider + estimate
  line. Pure presentational; receives `estimate`/`estimating` from the Tool.
- `ImageCompressFileList.tsx` — scrollable list; idle rows vs done rows.
- `ImageCompressResult.tsx` — result card.
- `src/lib/image/computeSavings.ts` — **new pure function** (TDD, node env):
  `computeSavings(originalBytes, compressedBytes) → { saved: number; pct:
  number }`. `pct = round(saved / original * 100)`; `original === 0 → 0`;
  negative when the output grew. Used by both the estimate line and done-mode
  rows. (No other new pure logic — core compression already exists.)

`formatBytes` stays locally duplicated (as in FileUpload / ImageResizeResult)
— consolidating it to a shared util is cross-cutting and goes to the polish
backlog, not this PR.

## 7. page.tsx (server component)

Mirror `image-resize/page.tsx`:
```
const dict = await getDictionary(asLocale(lang));
const labels = getImageCompressLabels(dict);
return <div className="mx-auto px-4 py-8" style={{ width:
  "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))" }}>
  <ImageCompressTool labels={labels} lang={lang} />
</div>;
```
The old client `page.tsx` body is fully replaced. The consume-side handoff
effect moves into `ImageCompressTool`.

## 8. Screen3Workspace integration + ternary refactor

The current `tool.slug === "ppt-background" ? … : "image-resize" ? … : Link`
chained ternary becomes a third inline branch. Per the polish backlog, refactor
the inline-tool selection to a **switch / map** keyed by `tool.slug` with the
`Link` block as the default fallback (registry-friendly — adding the next
inline tool is one case, not another nested ternary). The ppt-background-only
reset button in the card header stays a separate special-case (image-resize and
image-compress provide no Screen3-level reset, matching the existing pattern).

Add: `image-compress` case →
`<ImageCompressTool inline labels={getImageCompressLabels(dict)} lang={locale} />`.

## 9. i18n keys (`tools.image-compress.page.*`, KO + EN)

Existing `tools.image-compress.{title,description}` stay. Add `page`:
- `title`, `subtitle`, `header.{title, description, reset}`
- `reupload`, `uploadPrompt`, `uploadHint` (uploadMaxSize from
  `common.fileUpload.maxSize`)
- `formatTitle` ("포맷 선택"), `qualityTitle` ("품질")
- `compressTemplate` ("이미지 압축하기 ({n}개)"),
  `moreImagesTemplate` ("+{n}개 이미지")
- `estimateTemplate` ("예상 ~{size} · 원본 대비 {pct}"),
  `estimating` ("예상 용량 계산 중…"),
  `pngLossless` ("PNG는 무손실 — 품질 영향 없음")
- `doneTitle` ("압축 완료"),
  `settingsTemplate` ("{format} · 품질 {quality}%"),
  `download`, `recompress` ("다시 압축")
- `sizeChangeTemplate` ("{from} → {to}") for done-mode rows
- `removeAria` ("{name} 제거"), `prevAria`, `nextAria` for carousel

`{n}`/`{size}`/`{pct}` interpolation via the existing `template()` helper
(`src/lib/common/template.ts`).

## 10. Testing & verification

- Unit (vitest, node env): `computeSavings.test.ts` — normal, original=0,
  output grew (negative pct), rounding.
- Static: `pnpm exec tsc --noEmit` + `pnpm build`.
- Visual: user verifies silver appearance, single + multi-file, carousel,
  format-required gate, live estimate, result card, scroll behavior, UI
  stability (file list does not shift idle↔done).
- E2E handoff: from image-resize, click `압축/변환하러 가기` → image-compress
  loads with the staged file auto-populated and controls shown.
- No jsdom/component tests this PR (matches Phase 1 infra decision; components
  verified via `/qa` / browser).

## 11. Conventions applied

- Visual-fidelity contract: reuse existing silver tokens + material classes
  from `globals.css`; do not invent tokens.
- One task at a time, user approval between tasks (Done/Why/Next recap).
- subagent-driven-development; new pure function gets TDD inside its task.
- Cross-cutting urges (token extraction, formatBytes consolidation) → polish
  backlog only.
- No `git add -A`; explicit paths. Push/PR after explicit approval.
