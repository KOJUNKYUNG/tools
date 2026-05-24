# Button & Depth Design Unification Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Codify the canonical button/depth taxonomy from `pdf-arrange` into shared `globals.css` classes and retrofit the 4 migrated tools so every tool reads identically.

**Architecture:** Add two treatment-only CSS classes (`.btn-primary` dark monochrome execute, `.btn-download` the single sanctioned blue). Reuse the existing `.nameplate` / `.nameplate[data-active="true"]` for secondary buttons and active toggles. Tool components drop inline `style={{ background: ... }}` button styling and apply the classes instead. Layout (height, padding, font, radius) stays as Tailwind utilities on each element — classes carry only color + depth, matching how `.nameplate` already works.

**Tech Stack:** Next.js 16 App Router, TypeScript strict, Tailwind v4 (`globals.css` `@theme`), lucide-react icons. No new dependencies, no new design tokens.

**Verification model:** This is UI/CSS work. The repo has **no jsdom component tests** (handoff), so TDD does not apply here. Each task is verified by `pnpm exec tsc --noEmit` + `pnpm build` staying green, then a final visual `/design-review` pass (user runs the dev server; agent drives `/browse`) across all 4 tools in light + dark mode.

**Scope discipline (from the spec):** Only **buttons** change. Explicitly OUT of scope (leave as-is, folded into the separate `--accent-electric` retune): progress bars, status/check/file icons, range-slider `accentColor`, live `%` value text, the `inset 2px 0 0 var(--accent-electric)` "done"-box left accent, focus rings, and the lock-icon active color. Segmented controls (ppt-background `ModeSelector`, source toggle) keep their tab layout — only their active **underline color** changes from blue to `--ink-strong` (a non-fill accent swap, kept minimal).

---

## File Structure

- `src/app/globals.css` — add `.btn-primary`, `.btn-download` (treatment only).
- `src/components/common/ProcessingStatus.tsx` — shared done/error buttons → `.btn-download` + `.nameplate` (highest leverage: used by ppt-background and future tools).
- `src/components/tools/image-compress/ImageCompressControls.tsx` — format toggles → `.nameplate` + `data-active`.
- `src/components/tools/image-compress/ImageCompressResult.tsx` — download → `.btn-download`, recompress → `.nameplate`.
- `src/components/tools/image-resize/ImageResizeResult.tsx` — download → `.btn-download`, try-again → `.nameplate` (keep `.handoff-action`).
- `src/components/tools/image-resize/ImageResizeControls.tsx` — lock + revert icon buttons → `.nameplate`.
- `src/components/tools/image-resize/ImageResizePresets.tsx` — `PresetChip` active → `.nameplate` + `data-active`.
- `src/components/tools/ppt-background/PptBackgroundTool.tsx` — "적용" → `.btn-primary`.
- `src/components/tools/ppt-background/ModeSelector.tsx` — active underline blue → `--ink-strong`.
- `src/components/tools/ppt-background/BackgroundPicker.tsx` — source toggle active underline blue → `--ink-strong`.
- `src/components/tools/pdf-arrange/EditorTopStrip.tsx` — "적용" inline dark fill → `.btn-primary`.
- `src/components/tools/pdf-arrange/PdfArrangeResult.tsx` — download → `.btn-download`.

Canonical button radius: `rounded-[9px]`. Apply it to each button as it is touched (currently 5px/8px are mixed). Small result rows / thumbnail cards keep their existing 5–6px.

---

## Task 1: Add shared button treatment classes

**Files:**
- Modify: `src/app/globals.css` (append after the `.handoff-action` block at end of file)

- [ ] **Step 1: Add the two classes**

Append to the end of `src/app/globals.css`:

```css
/* ── Canonical button treatments ──────────────────────────────────────────
 * Treatment only (color + depth). Compose with layout utilities on the
 * element (inline-flex, height, px, gap, rounded-[9px], font size). Secondary
 * buttons and active toggles use .nameplate / .nameplate[data-active="true"].
 */

/* Primary execute action (압축/변환/적용/실행): dark monochrome, theme-inverting
 * label. Mirrors .nameplate[data-active="true"] so primaries and active toggles
 * look identical. */
.btn-primary {
  background: var(--ink-strong);
  color: var(--bg);
  border: 1px solid var(--ink-strong);
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.btn-primary:hover  { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn-primary:active { transform: translateY(0);   box-shadow: var(--shadow-sm); }
.btn-primary:disabled { cursor: not-allowed; opacity: 0.5; transform: none; box-shadow: var(--shadow-sm); }
.dark .btn-primary {
  background: var(--silver-100);
  color: var(--silver-900);
  border-color: var(--silver-100);
}

/* Primary download (결과 다운로드): the single sanctioned blue moment. */
.btn-download {
  background: var(--accent-electric);
  color: #fff;
  border: 1px solid var(--accent-electric);
  box-shadow: 0 1px 2px rgba(20, 30, 60, 0.15);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.btn-download:hover  { transform: translateY(-1px); }
.btn-download:active { transform: translateY(0); }
.btn-download:disabled { cursor: not-allowed; opacity: 0.5; transform: none; }
```

- [ ] **Step 2: Verify build is green**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: both succeed (CSS-only change; Tailwind picks up the new classes).

- [ ] **Step 3: Commit**

```bash
git add src/app/globals.css
git commit -m "feat(design): add .btn-primary and .btn-download shared button treatments"
```

---

## Task 2: ProcessingStatus shared buttons (highest leverage)

**Files:**
- Modify: `src/components/common/ProcessingStatus.tsx:106-119` (download button) and `:122-134` (try-another / retry button) and `:169-181` (error retry button)

- [ ] **Step 1: Replace the done-state download button**

Replace the `onDownload` button block (currently uses inline `background: var(--accent-electric)` + custom glow shadow):

```tsx
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="btn-download glint inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-display text-[11.5px] whitespace-nowrap font-medium"
              >
                <DownloadIcon className="size-3" />
                {L.download}
              </button>
            )}
```

- [ ] **Step 2: Replace the done-state try-another button**

```tsx
            {onTryAnother && (
              <button
                type="button"
                onClick={onTryAnother}
                className="nameplate inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-display text-[11.5px] whitespace-nowrap"
                style={{ color: "var(--ink-strong)" }}
              >
                <RefreshCwIcon className="size-3" />
                {L.retry}
              </button>
            )}
```

- [ ] **Step 3: Replace the error-state retry button**

```tsx
          {onRetry && (
            <button
              type="button"
              onClick={onRetry}
              className="nameplate shrink-0 inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-display text-[11.5px] whitespace-nowrap"
              style={{ color: "var(--ink-strong)" }}
            >
              <RefreshCwIcon className="size-3" />
              {L.retry}
            </button>
          )}
```

Leave the progress bar, check/alert icons, and `inset 2px 0 0` accent borders untouched (out of scope).

- [ ] **Step 4: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/common/ProcessingStatus.tsx
git commit -m "refactor(design): ProcessingStatus buttons use canonical btn-download + nameplate"
```

---

## Task 3: image-compress tool

**Files:**
- Modify: `src/components/tools/image-compress/ImageCompressControls.tsx:60-83` (format toggle buttons)
- Modify: `src/components/tools/image-compress/ImageCompressResult.tsx:41-62` (download + recompress buttons)

- [ ] **Step 1: Convert format toggles to nameplate + data-active**

In `ImageCompressControls.tsx`, replace the `<button>` inside the `FORMAT_OPTIONS.map(...)` (the one with the `active ? {blue fill} : {surface-2}` inline style) with:

```tsx
              <button
                key={opt.value}
                type="button"
                onClick={() => onSelectFormat(opt.value)}
                data-active={active}
                className="nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium"
                style={active ? undefined : { color: "var(--ink-strong)" }}
              >
                {opt.label}
              </button>
```

(The `.nameplate[data-active="true"]` rule supplies the dark fill + inverting label; the inline `color` only applies in the inactive state.)

- [ ] **Step 2: Convert the result download + recompress buttons**

In `ImageCompressResult.tsx`, replace the download button:

```tsx
        <button
          type="button"
          onClick={onDownload}
          className="btn-download glint inline-flex h-8 items-center justify-start gap-1.5 rounded-[9px] px-3 font-display text-[11.5px] font-medium"
        >
          <DownloadIcon className="size-3" />
          {downloadLabel}
        </button>
```

and the recompress button:

```tsx
        <button
          type="button"
          onClick={onRecompress}
          className="nameplate inline-flex h-8 items-center justify-start gap-1.5 rounded-[9px] px-3 font-display text-[11.5px]"
          style={{ color: "var(--ink-strong)" }}
        >
          <RotateCcwIcon className="size-3" />
          {recompressLabel}
        </button>
```

Leave the quality slider, `%` value text, and the `inset 2px 0 0` result-box accent untouched (out of scope).

- [ ] **Step 3: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/image-compress/ImageCompressControls.tsx src/components/tools/image-compress/ImageCompressResult.tsx
git commit -m "refactor(design): image-compress buttons adopt canonical taxonomy"
```

---

## Task 4: image-resize tool

**Files:**
- Modify: `src/components/tools/image-resize/ImageResizeResult.tsx:70-94` (download + try-again; keep handoff button)
- Modify: `src/components/tools/image-resize/ImageResizeControls.tsx:98-121` (lock toggle) and `:174-189` (revert)
- Modify: `src/components/tools/image-resize/ImageResizePresets.tsx:160-191` (`PresetChip`)

- [ ] **Step 1: Convert result download + try-again buttons**

In `ImageResizeResult.tsx`, replace the download button:

```tsx
        <button
          type="button"
          onClick={onDownload}
          className="btn-download glint inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-display text-[11.5px] font-medium"
        >
          <DownloadIcon className="size-3" />
          {downloadLabel}
        </button>
```

and the try-again button:

```tsx
        <button
          type="button"
          onClick={onTryAgain}
          className="nameplate inline-flex items-center justify-start gap-1.5 rounded-[9px] px-3 h-8 font-display text-[11.5px]"
          style={{ color: "var(--ink-strong)" }}
        >
          <RotateCcwIcon className="size-3" />
          {tryAgainLabel}
        </button>
```

Leave the third button (`compressLinkLabel`, class `handoff-action`) unchanged except bump its radius to `rounded-[9px]` for consistency.

- [ ] **Step 2: Convert lock + revert icon buttons to nameplate**

In `ImageResizeControls.tsx`, replace the lock toggle button's wrapper (keep the icon children unchanged):

```tsx
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={lockAspect}
          aria-label={lockAspect ? unlockAspectLabel : lockAspectLabel}
          title={lockAspect ? unlockAspectLabel : lockAspectLabel}
          className="nameplate mb-0.5 rounded-[9px] p-1.5"
        >
```

and the revert button wrapper:

```tsx
          <button
            type="button"
            onClick={onRevertToOriginal}
            aria-label={revertToOriginalLabel}
            title={revertToOriginalLabel}
            className="nameplate rounded-[9px] p-1"
          >
```

Leave the lock icon's `var(--accent-electric)` active color (icon accent, out of scope).

- [ ] **Step 3: Convert PresetChip to nameplate + data-active**

In `ImageResizePresets.tsx`, replace the entire `PresetChip` function body's `<button>`:

```tsx
    <button
      type="button"
      onClick={onClick}
      data-active={active}
      className="nameplate rounded-[9px] px-2.5 py-1 font-display text-[11.5px]"
      style={active ? undefined : { color: "var(--ink-strong)" }}
    >
      {children}
    </button>
```

- [ ] **Step 4: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/tools/image-resize/ImageResizeResult.tsx src/components/tools/image-resize/ImageResizeControls.tsx src/components/tools/image-resize/ImageResizePresets.tsx
git commit -m "refactor(design): image-resize buttons adopt canonical taxonomy"
```

---

## Task 5: ppt-background tool

**Files:**
- Modify: `src/components/tools/ppt-background/PptBackgroundTool.tsx:574-588` (Apply button)
- Modify: `src/components/tools/ppt-background/ModeSelector.tsx:36-42` (active underline)
- Modify: `src/components/tools/ppt-background/BackgroundPicker.tsx:152-164` (source toggle active underline)

- [ ] **Step 1: Convert the Apply button to btn-primary**

In `PptBackgroundTool.tsx`, replace the Apply `<button>` (currently blue fill + custom glow):

```tsx
                    <button
                      type="button"
                      onClick={canRun ? run : undefined}
                      disabled={!canRun}
                      className="btn-primary glint inline-flex w-full flex-1 items-center justify-center gap-2 rounded-[9px] font-display text-[13px] font-medium tracking-[0.02em] focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      <UploadCloud size={14} />
                      <span>{labels.action.apply}</span>
                    </button>
```

- [ ] **Step 2: Swap ModeSelector active underline blue → ink-strong**

In `ModeSelector.tsx`, change the active `boxShadow` line:

```tsx
              boxShadow: active ? "inset 0 -2px 0 var(--ink-strong)" : undefined,
```

- [ ] **Step 3: Swap source-toggle active underline blue → ink-strong**

In `BackgroundPicker.tsx`, in the `(["upload", "gallery"] as const).map(...)` button, change the active `boxShadow` line:

```tsx
                    boxShadow: active ? "inset 0 -2px 0 var(--ink-strong)" : undefined,
```

Leave the file-status `changeFile` button as a small secondary; bump only its radius to `rounded-[9px]` and keep its surface style (it is a tiny inline control, not a primary/secondary action button — converting to nameplate is optional and skipped to avoid over-restyling a 10.5px chip). Leave the file icon, progress, and gallery accents untouched.

- [ ] **Step 4: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: green.

- [ ] **Step 5: Commit**

```bash
git add src/components/tools/ppt-background/PptBackgroundTool.tsx src/components/tools/ppt-background/ModeSelector.tsx src/components/tools/ppt-background/BackgroundPicker.tsx
git commit -m "refactor(design): ppt-background buttons adopt canonical taxonomy"
```

---

## Task 6: pdf-arrange tool (the reference — prove the classes match)

**Files:**
- Modify: `src/components/tools/pdf-arrange/EditorTopStrip.tsx:59-69` (Apply button)
- Modify: `src/components/tools/pdf-arrange/PdfArrangeResult.tsx:158-166` (download button)

- [ ] **Step 1: Replace EditorTopStrip Apply inline dark fill with btn-primary**

In `EditorTopStrip.tsx`, replace the Apply `<button>` (currently inline `style={{ background: "var(--ink-strong)", color: "var(--bg)" }}`):

```tsx
        <button
          type="button"
          onClick={onApply}
          disabled={applyDisabled || busy}
          className="btn-primary glint inline-flex h-9 min-w-[140px] items-center justify-center gap-1.5 rounded-[9px] px-4 text-[13px] font-semibold tabular-nums disabled:cursor-not-allowed disabled:opacity-50"
        >
          {applyLabel}
        </button>
```

The `.nameplate` toolbar buttons (`NP` constant) already match the canonical secondary treatment — no change needed.

- [ ] **Step 2: Replace PdfArrangeResult download button with btn-download**

In `PdfArrangeResult.tsx`, replace the `onDownloadAll` button:

```tsx
          <button
            type="button"
            onClick={onDownloadAll}
            className="btn-download glint inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-4 font-display text-[12px] font-medium"
          >
            <DownloadIcon className="size-3.5" />
            {primaryLabel}
          </button>
```

Bump the adjacent "again" secondary button radius to `rounded-[9px]` and convert it to `.nameplate` for consistency:

```tsx
          <button
            type="button"
            onClick={onAgain}
            className="nameplate inline-flex h-9 items-center justify-center gap-1.5 rounded-[9px] px-3 font-display text-[12px]"
            style={{ color: "var(--ink-strong)" }}
          >
            <RotateCcwIcon className="size-3.5" />
            {labels.again}
          </button>
```

Leave the on-paper overlay chips in `PageItemCard.tsx` (fixed colors over white thumbnails) untouched — that pattern is intentional and out of scope.

- [ ] **Step 3: Verify build**

Run: `pnpm exec tsc --noEmit` then `pnpm build`
Expected: green.

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/pdf-arrange/EditorTopStrip.tsx src/components/tools/pdf-arrange/PdfArrangeResult.tsx
git commit -m "refactor(design): pdf-arrange buttons use shared btn-primary/btn-download classes"
```

---

## Task 7: Full verification + visual review

**Files:** none (verification only)

- [ ] **Step 1: Green gate**

Run: `pnpm exec tsc --noEmit` then `pnpm test` then `pnpm build`
Expected: all green (78 tests still pass; no logic changed).

- [ ] **Step 2: Visual review (user runs dev server)**

Ask the user to start the dev server, then use `/design-review` + `/browse` to inspect, in **both light and dark mode**, each tool's workspace (Screen 3): `image-compress`, `image-resize`, `ppt-background`, `pdf-arrange`. Confirm:
- Primary execute buttons read as dark monochrome (inverting label per theme).
- Toggles' active state is the dark fill (not blue).
- The only blue button anywhere is "다운로드".
- Secondary buttons have the raised nameplate depth.
- No unintended layout shift vs. before (heights/padding unchanged; only color/radius differ).
- Buttons are visually consistent **across** the four tools side by side.

- [ ] **Step 3: Address any visual issues found**

If `rounded-[9px]` looks too round on the small `h-8` result buttons, or any contrast issue appears in dark mode, fix inline and re-verify. Commit any fixes separately.

---

## Self-Review notes (author)

- **Spec coverage:** taxonomy roles 1–4 → Tasks 1 (classes) + 2–6 (retrofit); radius → folded into each task; retrofit scope (4 tools) → Tasks 2–6; out-of-scope items → respected and called out per task. Verification → Task 7.
- **No new tokens / material classes** (brand memory honored): `.btn-primary`/`.btn-download` reuse `--ink-strong`, `--bg`, `--silver-100/900`, `--accent-electric`, `--shadow-*` only.
- **Consistency:** every retrofitted secondary button uses `nameplate` + `style={{ color: "var(--ink-strong)" }}` for the inactive label; every toggle uses `data-active={active}` so `.nameplate[data-active="true"]` drives the fill; every primary uses `.btn-primary`; every download uses `.btn-download glint`.
- **PR boundary:** this whole plan is ONE cross-cutting PR. The 4 not-yet-migrated tools (`ppt-extract`, `pdf-compress`, `image-to-pdf`, `pdf-to-image`) are separate spec→plan→PR cycles that will consume these classes from the start.
