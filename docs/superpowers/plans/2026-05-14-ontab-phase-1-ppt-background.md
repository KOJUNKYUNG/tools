# Ontab Phase 1 — `ppt-background` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `ppt-background` tool to the silver design system with English i18n, absorb its `IMPROVEMENTS.md` items (".pptx" terminology + "specific slides" mode), and wire it inline into `Screen3Workspace` replacing the Phase 0 bridge link.

**Architecture:** Single shared `<PptBackgroundTool/>` component mounted at both the deep-link route (`/{locale}/tools/ppt-background`) and inline inside `Screen3Workspace` for `slug === "ppt-background"`. Two-pane workspace layout (left: file + slide thumbnails + mode; right: background picker + gallery + apply). New shared utilities (`PageRangeSelector`, lenient `parseRange`/`serializeRange`, `ProcessingStatus.onReset`) introduced now, applied only to this tool; remaining tools absorb them in their own Phase 1 PRs.

**Tech Stack:** Next 16 App Router, React 19, TypeScript 5, Tailwind 4 + silver tokens in `globals.css`, `jszip`, `lucide-react`. No new runtime deps. Test framework (vitest) not yet installed in this repo — automated tests are deferred to a separate vitest-introduction PR per agreement; verification gates are `pnpm exec tsc --noEmit` + `pnpm build` + a manual visual checklist on the user's dev server.

**Spec:** `docs/superpowers/specs/2026-05-14-ontab-phase-1-ppt-background-design.md`

**Branch:** `feat/ontab-phase-1-ppt-background` (worktree auto-created by `using-git-worktrees` at execution time).

**Conventions reminders:**
- One task at a time, user approval between tasks (memory `ontab_conventions`).
- Subagent must NOT run `pnpm dev` (no interactive Ctrl+C). Verification is `pnpm exec tsc --noEmit` + `pnpm build`.
- Never `git add -A` — stage explicit paths.
- Push and PR creation are hard stops, user-confirmed only.
- Commit message body in English; conversation in Korean is fine but does not affect commits.

---

## File map

**Create:**
- `src/lib/common/pageRange.ts`
- `src/components/common/PageRangeSelector.tsx`
- `src/components/tools/ppt-background/PptBackgroundTool.tsx`
- `src/components/tools/ppt-background/SlideThumbStrip.tsx`
- `src/components/tools/ppt-background/BackgroundPicker.tsx`
- `src/components/tools/ppt-background/ModeSelector.tsx`
- `src/components/tools/ppt-background/PptConversionGuide.tsx`

**Modify:**
- `src/app/globals.css` — `--tweak-workspace-width` value.
- `src/components/landing/Screen3Workspace.tsx` — `slug` branch.
- `src/components/common/ProcessingStatus.tsx` — silver riskin + `onReset` prop.
- `src/lib/gallery/types.ts` — category union, `tags` optional.
- `src/lib/gallery/mockData.ts` — 4-category × ~5 images each.
- `src/components/ppt/InlineGallery.tsx` — silver riskin, drop tag Badge filter, drop "Recent" persistence-UI for now (re-add only if mockData stays compatible).
- `src/lib/ppt/changeBackground.ts` — `BgMode` union + `targetSlides` parameter.
- `src/app/[lang]/(chrome)/tools/ppt-background/page.tsx` — replace body with `<PptBackgroundTool/>` mount.
- `src/i18n/dictionaries/ko.json` + `src/i18n/dictionaries/en.json` — `tools.ppt-background.page.*` keys + description tweak.
- `src/lib/constants.ts` — `tools.ppt-background` `description` minor tweak ("PPTX" prefix).

---

### Task 1: Workspace width + Screen3 placeholder branch

Bumps the workspace token to a width that fits the two-pane body, then carves out a `slug === "ppt-background"` branch inside `Screen3Workspace` that renders an empty placeholder for now. All other tools keep their existing bridge `Link` — no behavior change for them.

**Files:**
- Modify: `src/app/globals.css` (`:root --tweak-workspace-width`)
- Modify: `src/components/landing/Screen3Workspace.tsx`

- [ ] **Step 1.1: Bump workspace width**

Open `src/app/globals.css`, find line `  --tweak-workspace-width: 620px;` under `:root` (around line 107) and change to:

```css
  --tweak-workspace-width: 980px;
```

(980 is the spec's planned default in the 960–1040 range. Final value confirmed during Task 8 visual verification; if a different value is needed, change here only.)

- [ ] **Step 1.2: Inline branch in Screen3Workspace**

Open `src/components/landing/Screen3Workspace.tsx`. The current card body is a single `<Link href={toolHref} ...>...</Link>` (lines 158–201). Replace **only** that `<Link>` block with a conditional render that keeps the Link for every tool except `ppt-background`, which gets a placeholder div for now.

Locate the `<div className="px-6 py-5">` block (line 157) and replace its child (the entire `<Link>` element and the sibling `<div className="mt-4 ...">` status row) with:

```tsx
              <div className="px-6 py-5">
                {tool.slug === "ppt-background" ? (
                  <div
                    className="rounded-[8px] border-2 border-dashed px-6 py-12 text-center"
                    style={{
                      borderColor: "var(--hairline)",
                      background: "var(--surface-2)",
                      color: "var(--ink-soft)",
                    }}
                  >
                    <div className="font-display text-[13px]">
                      ppt-background tool — wiring up
                    </div>
                  </div>
                ) : (
                  <>
                    <Link
                      href={toolHref}
                      className="rounded-[8px] border-2 border-dashed px-6 py-7 flex flex-col items-center justify-center text-center transition-colors hover:border-[color:var(--accent-electric)]"
                      style={{
                        borderColor: "var(--hairline)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-[4px] flex items-center justify-center mb-2.5"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          color: "var(--ink-strong)",
                        }}
                      >
                        <UploadCloud size={16} />
                      </div>
                      <div
                        className="font-display text-[14px] font-semibold leading-[1.2] font-ko"
                        style={{ color: "var(--headline)" }}
                      >
                        {dict.common.drop}
                      </div>
                      <div
                        className="mt-0.5 font-body text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {dict.common.click}
                      </div>

                      <span
                        className="mt-4 inline-flex items-center gap-2 px-6 h-11 rounded-[5px] font-display text-[13.5px] font-medium tracking-[0.02em] focus-ring glint"
                        style={{
                          background: "var(--accent-electric)",
                          color: "#fff",
                          boxShadow:
                            "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                        }}
                      >
                        <UploadCloud size={14} />
                        <span>{dict.common.openTool}</span>
                      </span>
                    </Link>

                    <div
                      className="mt-4 flex items-center justify-center gap-4 font-body text-[9.5px] tracking-[0.15em] uppercase"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck size={10} /> {dict.status.inBrowser}
                      </span>
                      <span style={{ background: "var(--border)" }} className="w-px h-3" />
                      <span className="flex items-center gap-1.5">
                        <InfinityIcon size={10} /> {dict.status.unlimited}
                      </span>
                      <span style={{ background: "var(--border)" }} className="w-px h-3" />
                      <span className="flex items-center gap-1.5">
                        <Zap size={10} /> {dict.status.noUpload}
                      </span>
                    </div>
                  </>
                )}
              </div>
```

The `Link`, `UploadCloud`, `ShieldCheck`, `InfinityIcon`, `Zap` imports already exist at the top of the file — no import changes needed.

- [ ] **Step 1.3: Type check**

Run:
```
pnpm exec tsc --noEmit
```
Expected: PASS (no errors).

- [ ] **Step 1.4: Commit**

```
git add src/app/globals.css src/components/landing/Screen3Workspace.tsx
git commit -m "feat(ontab): bump workspace width and stub ppt-background inline branch

- --tweak-workspace-width: 620px -> 980px to fit Phase 1 two-pane tool bodies.
- Screen3Workspace: branch on slug === 'ppt-background' for an inline placeholder.
  All other tools keep the existing bridge Link.

Part of feat/ontab-phase-1-ppt-background."
```

---

### Task 2: `parseRange`/`serializeRange` + `PageRangeSelector`

Pure-function range helpers (lenient — silently drop invalid tokens, clamp to bounds, return a Set) plus a presentational selector that owns the text input and the select-all / clear buttons. The thumbnail grid is injected via children. No automated tests in this PR (vitest deferred); the helpers are written to be testable later.

**Files:**
- Create: `src/lib/common/pageRange.ts`
- Create: `src/components/common/PageRangeSelector.tsx`

- [ ] **Step 2.1: Create `pageRange.ts`**

Create `src/lib/common/pageRange.ts` with:

```ts
/**
 * Parse a 1-based range expression like "1, 3, 5-7" into a Set of indices.
 * Lenient: silently drops invalid tokens (logs in dev). Clamps to [1, totalPages].
 * Reversed ranges (e.g. "5-3") are normalised. Empty input → empty Set.
 *
 * This module is intentionally testable as pure functions. Automated tests
 * are deferred until vitest is introduced.
 */
export function parseRange(input: string, totalPages: number): Set<number> {
  const result = new Set<number>();
  if (!input || totalPages <= 0) return result;

  const tokens = input
    .split(/[,\n]/)
    .map((t) => t.trim())
    .filter((t) => t.length > 0);

  for (const token of tokens) {
    if (/^\d+$/.test(token)) {
      const n = parseInt(token, 10);
      if (n >= 1 && n <= totalPages) result.add(n);
      continue;
    }
    const rangeMatch = token.match(/^(\d+)\s*-\s*(\d+)$/);
    if (rangeMatch) {
      let a = parseInt(rangeMatch[1], 10);
      let b = parseInt(rangeMatch[2], 10);
      if (a > b) [a, b] = [b, a];
      const lo = Math.max(1, a);
      const hi = Math.min(totalPages, b);
      for (let i = lo; i <= hi; i++) result.add(i);
      continue;
    }
    if (process.env.NODE_ENV !== "production") {
      // eslint-disable-next-line no-console
      console.warn(`[pageRange] dropping invalid token: "${token}"`);
    }
  }

  return result;
}

/**
 * Serialize a Set of 1-based indices into a canonical "1, 3, 5-7" string.
 * Sorted ascending, contiguous runs collapsed. Empty Set → empty string.
 */
export function serializeRange(indices: Set<number>): string {
  if (indices.size === 0) return "";
  const sorted = [...indices].filter((n) => Number.isFinite(n)).sort((a, b) => a - b);
  if (sorted.length === 0) return "";

  const segments: string[] = [];
  let runStart = sorted[0];
  let prev = sorted[0];

  for (let i = 1; i < sorted.length; i++) {
    const n = sorted[i];
    if (n === prev + 1) {
      prev = n;
      continue;
    }
    segments.push(runStart === prev ? `${runStart}` : `${runStart}-${prev}`);
    runStart = n;
    prev = n;
  }
  segments.push(runStart === prev ? `${runStart}` : `${runStart}-${prev}`);

  return segments.join(", ");
}
```

- [ ] **Step 2.2: Create `PageRangeSelector.tsx`**

Create `src/components/common/PageRangeSelector.tsx`:

```tsx
"use client";

import { useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { parseRange, serializeRange } from "@/lib/common/pageRange";

interface PageRangeSelectorProps {
  totalPages: number;
  selected: Set<number>;
  onChange: (next: Set<number>) => void;
  inputPlaceholder: string;
  selectAllLabel: string;
  clearLabel: string;
  /** Grid slot — typically a tool-specific thumbnail grid that mirrors `selected`. */
  children?: ReactNode;
}

const DEBOUNCE_MS = 300;

export function PageRangeSelector({
  totalPages,
  selected,
  onChange,
  inputPlaceholder,
  selectAllLabel,
  clearLabel,
  children,
}: PageRangeSelectorProps) {
  const [text, setText] = useState(() => serializeRange(selected));
  const composingRef = useRef(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // External -> input (only when user is not actively editing).
  useEffect(() => {
    if (composingRef.current) return;
    const canonical = serializeRange(selected);
    setText((current) => (current === canonical ? current : canonical));
  }, [selected]);

  // Input -> external (debounced).
  function handleInput(next: string) {
    setText(next);
    composingRef.current = true;
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      composingRef.current = false;
      onChange(parseRange(next, totalPages));
    }, DEBOUNCE_MS);
  }

  function selectAll() {
    composingRef.current = false;
    const all = new Set<number>();
    for (let i = 1; i <= totalPages; i++) all.add(i);
    onChange(all);
  }

  function clear() {
    composingRef.current = false;
    onChange(new Set());
  }

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={text}
          onChange={(e) => handleInput(e.target.value)}
          placeholder={inputPlaceholder}
          className="flex-1 rounded-[5px] border px-2.5 py-1.5 font-mono text-[12px] outline-none focus:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        />
        <button
          type="button"
          onClick={selectAll}
          className="rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {selectAllLabel}
        </button>
        <button
          type="button"
          onClick={clear}
          className="rounded-[5px] border px-2.5 py-1.5 font-body text-[11px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {clearLabel}
        </button>
      </div>
      {children}
    </div>
  );
}
```

- [ ] **Step 2.3: Type check**

Run:
```
pnpm exec tsc --noEmit
```
Expected: PASS.

- [ ] **Step 2.4: Commit**

```
git add src/lib/common/pageRange.ts src/components/common/PageRangeSelector.tsx
git commit -m "feat(common): add lenient parseRange/serializeRange + PageRangeSelector

- src/lib/common/pageRange.ts: pure helpers returning Set<number>; lenient
  (silently drops invalid tokens) vs pdf-split's parsePageRanges which throws.
  Pdf-split keeps its current parser; consolidation is deferred to that tool's
  own Phase 1 PR.
- PageRangeSelector: text input + select-all/clear buttons + children slot for
  a tool-specific thumbnail grid. Two-way sync with parent via debounced
  onChange.

Vitest is not yet installed in this repo; automated tests are deferred to a
separate infra PR."
```

---

### Task 3: `ProcessingStatus` silver riskin + `onReset`

Rebuild the component on raw silver tokens (drop shadcn `Alert`/`Progress` primitives — they bleed shadcn theming into the silver surface). Add `onReset` prop; when present in the `done` state, render a secondary "Reset" button next to Download. Other tools that don't pass `onReset` see no behavior change.

**Files:**
- Modify: `src/components/common/ProcessingStatus.tsx`

- [ ] **Step 3.1: Rewrite `ProcessingStatus.tsx`**

Replace the entire contents of `src/components/common/ProcessingStatus.tsx` with:

```tsx
"use client";

import type { ProcessingState } from "@/types";
import {
  DownloadIcon,
  RefreshCwIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  Loader2Icon,
  RotateCcwIcon,
} from "lucide-react";

interface ProcessingStatusProps {
  status: ProcessingState;
  progress?: number;
  errorMessage?: string;
  onRetry?: () => void;
  onDownload?: () => void;
  downloadFileName?: string;
  /** When present in the done state, renders a secondary "Reset" button. */
  onReset?: () => void;
  /** UI labels — passed from the calling tool so this component stays i18n-agnostic. */
  labels?: {
    processing?: string;       // "처리 중…" / "Processing…"
    done?: string;             // "완료" / "Done"
    doneBody?: string;         // "파일이 준비되었습니다." / "Your file is ready."
    download?: string;         // "다운로드" / "Download"
    error?: string;            // "오류 발생" / "Error"
    errorBody?: string;        // fallback error message
    retry?: string;            // "재시도" / "Retry"
    reset?: string;            // "다시 작업하기" / "Reset"
  };
}

const DEFAULTS = {
  processing: "처리 중…",
  done: "완료",
  doneBody: "파일이 준비되었습니다.",
  download: "다운로드",
  error: "오류 발생",
  errorBody: "처리 중 문제가 발생했습니다. 다시 시도해 주세요.",
  retry: "재시도",
  reset: "다시 작업하기",
} as const;

export function ProcessingStatus({
  status,
  progress = 0,
  errorMessage,
  onRetry,
  onDownload,
  downloadFileName,
  onReset,
  labels,
}: ProcessingStatusProps) {
  if (status === "idle") return null;
  const L = { ...DEFAULTS, ...labels };

  return (
    <div className="space-y-3">
      {status === "processing" && (
        <div className="space-y-2">
          <div
            className="flex items-center gap-2 font-display text-[13px] font-medium"
            style={{ color: "var(--ink-strong)" }}
          >
            <Loader2Icon
              className="size-4 animate-spin"
              style={{ color: "var(--accent-electric)" }}
            />
            <span>
              {L.processing} {Math.round(progress)}%
            </span>
          </div>
          <div
            className="h-2 w-full overflow-hidden rounded-full"
            style={{ background: "var(--surface-2)" }}
          >
            <div
              className="h-full rounded-full transition-[width]"
              style={{
                width: `${Math.max(0, Math.min(100, progress))}%`,
                background: "var(--accent-electric)",
              }}
            />
          </div>
        </div>
      )}

      {status === "done" && (
        <div
          className="rounded-[8px] border px-4 py-3"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "inset 2px 0 0 var(--accent-electric)",
          }}
        >
          <div className="flex items-start gap-3">
            <CheckCircle2Icon
              className="size-5 shrink-0"
              style={{ color: "var(--accent-electric)" }}
            />
            <div className="flex-1 min-w-0">
              <div
                className="font-display text-[13px] font-semibold"
                style={{ color: "var(--headline)" }}
              >
                {L.done}
              </div>
              <div
                className="mt-0.5 font-body text-[12px]"
                style={{ color: "var(--ink)" }}
              >
                {L.doneBody}
              </div>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-end gap-2">
            {onReset && (
              <button
                type="button"
                onClick={onReset}
                className="inline-flex items-center gap-1.5 rounded-[5px] border px-3 h-9 font-display text-[12px] transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                <RotateCcwIcon className="size-3.5" />
                {L.reset}
              </button>
            )}
            {onDownload && (
              <button
                type="button"
                onClick={onDownload}
                className="glint inline-flex items-center gap-1.5 rounded-[5px] px-4 h-9 font-display text-[12px] font-medium"
                style={{
                  background: "var(--accent-electric)",
                  color: "#fff",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                }}
              >
                <DownloadIcon className="size-3.5" />
                {downloadFileName ?? L.download}
              </button>
            )}
          </div>
        </div>
      )}

      {status === "error" && (
        <div
          className="rounded-[8px] border px-4 py-3"
          style={{
            background: "var(--surface)",
            borderColor: "var(--border)",
            boxShadow: "inset 2px 0 0 var(--accent-copper)",
          }}
        >
          <div className="flex items-start gap-3">
            <AlertTriangleIcon
              className="size-5 shrink-0"
              style={{ color: "var(--accent-copper)" }}
            />
            <div className="flex-1 min-w-0">
              <div
                className="font-display text-[13px] font-semibold"
                style={{ color: "var(--headline)" }}
              >
                {L.error}
              </div>
              <div
                className="mt-0.5 font-body text-[12px]"
                style={{ color: "var(--ink)" }}
              >
                {errorMessage ?? L.errorBody}
              </div>
            </div>
          </div>
          {onRetry && (
            <div className="mt-3 flex items-center justify-end">
              <button
                type="button"
                onClick={onRetry}
                className="inline-flex items-center gap-1.5 rounded-[5px] border px-3 h-9 font-display text-[12px] transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                <RefreshCwIcon className="size-3.5" />
                {L.retry}
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
```

Note: other tools that currently use this component pass no `labels` prop, so they keep the Korean defaults. They are visually restyled to silver as a side effect — that is acceptable because (a) the prior shadcn `Alert` was already in a silver context post Phase 0 and (b) the change keeps all behavior intact (no API break beyond addition of optional `onReset` and `labels`).

- [ ] **Step 3.2: Type check**

Run:
```
pnpm exec tsc --noEmit
```
Expected: PASS.

- [ ] **Step 3.3: Commit**

```
git add src/components/common/ProcessingStatus.tsx
git commit -m "feat(common): silver-tone ProcessingStatus + optional onReset/labels

- Drop shadcn Alert/Progress primitives; build on silver tokens directly.
- Add onReset prop: when present in 'done' state, renders a secondary
  'Reset' button alongside Download.
- Add labels prop so tools can pass i18n strings; Korean defaults preserved
  for tools that don't yet pass labels (backwards-compatible).

Other tools see only a visual restyling. Behavior unchanged."
```

---

### Task 4: Gallery types + mockData + InlineGallery riskin

Narrow the category union to the four agreed categories, keep `tags` as an optional metadata field (no UI), reseed mock data, and rewrite `InlineGallery` on silver tokens. Drop the tag Badge filter row and the "Recent" UI for now (LocalStorage layer left in place for future re-introduction).

**Files:**
- Modify: `src/lib/gallery/types.ts`
- Modify: `src/lib/gallery/mockData.ts`
- Modify: `src/components/ppt/InlineGallery.tsx`

- [ ] **Step 4.1: Update gallery types**

Replace the entire contents of `src/lib/gallery/types.ts` with:

```ts
export type GalleryCategory = "gradient" | "nature" | "texture" | "pattern";

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  "gradient",
  "nature",
  "texture",
  "pattern",
];

export interface GalleryImage {
  id: string;
  category: GalleryCategory;
  /** Display title. Not i18n'd at the mock stage; revisit when Supabase lands. */
  title: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  /** Future search. Not surfaced in UI in this PR. */
  tags?: string[];
}
```

Removed: the old `CATEGORY_LABEL` constant. The new UI gets labels from the dictionary, not from a code-side map.

- [ ] **Step 4.2: Reseed mock data**

Replace the entire contents of `src/lib/gallery/mockData.ts` with:

```ts
import type { GalleryImage } from "./types";

/**
 * Mock catalog for the inline background gallery.
 *
 * Image sources:
 * - `nature`, `texture`, `pattern` → picsum.photos with stable seeds.
 * - `gradient` → inline SVG data URLs (picsum is photographic only).
 *
 * Tags are populated for future search (no UI in this PR).
 */
function gradientDataUrl(stops: string[], angle = 135): string {
  const stopStr = stops
    .map((c, i) => `<stop offset="${(i / (stops.length - 1)) * 100}%" stop-color="${c}"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" gradientTransform="rotate(${angle})">${stopStr}</linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function picsum(seed: string, w = 1920, h = 1080): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}
function picsumThumb(seed: string): string {
  return `https://picsum.photos/seed/${seed}/480/270`;
}

export const MOCK_IMAGES: GalleryImage[] = [
  // ── gradient ────────────────────────────────────────────────
  {
    id: "gradient-aurora",
    category: "gradient",
    title: "Aurora",
    url: gradientDataUrl(["#5b8def", "#a06bff", "#ff6bd6"], 135),
    thumbnailUrl: gradientDataUrl(["#5b8def", "#a06bff", "#ff6bd6"], 135),
    width: 1920,
    height: 1080,
    tags: ["cool", "vibrant", "blue", "purple"],
  },
  {
    id: "gradient-dusk",
    category: "gradient",
    title: "Dusk",
    url: gradientDataUrl(["#1e2a44", "#5e4b8b", "#d97757"], 160),
    thumbnailUrl: gradientDataUrl(["#1e2a44", "#5e4b8b", "#d97757"], 160),
    width: 1920,
    height: 1080,
    tags: ["warm", "sunset", "orange"],
  },
  {
    id: "gradient-mint",
    category: "gradient",
    title: "Mint",
    url: gradientDataUrl(["#cffce6", "#7adfb6", "#2a9a82"], 135),
    thumbnailUrl: gradientDataUrl(["#cffce6", "#7adfb6", "#2a9a82"], 135),
    width: 1920,
    height: 1080,
    tags: ["fresh", "green", "soft"],
  },
  {
    id: "gradient-rose",
    category: "gradient",
    title: "Rose",
    url: gradientDataUrl(["#ffd0dc", "#ff8fae", "#c44b6f"], 145),
    thumbnailUrl: gradientDataUrl(["#ffd0dc", "#ff8fae", "#c44b6f"], 145),
    width: 1920,
    height: 1080,
    tags: ["warm", "pink", "soft"],
  },
  {
    id: "gradient-deep",
    category: "gradient",
    title: "Deep",
    url: gradientDataUrl(["#0a1228", "#1f2a4d", "#3d5183"], 175),
    thumbnailUrl: gradientDataUrl(["#0a1228", "#1f2a4d", "#3d5183"], 175),
    width: 1920,
    height: 1080,
    tags: ["cool", "dark", "navy"],
  },

  // ── nature ──────────────────────────────────────────────────
  {
    id: "nature-forest",
    category: "nature",
    title: "Forest",
    url: picsum("ontab-forest"),
    thumbnailUrl: picsumThumb("ontab-forest"),
    width: 1920,
    height: 1080,
    tags: ["forest", "green", "outdoor"],
  },
  {
    id: "nature-mountain",
    category: "nature",
    title: "Mountain",
    url: picsum("ontab-mountain"),
    thumbnailUrl: picsumThumb("ontab-mountain"),
    width: 1920,
    height: 1080,
    tags: ["mountain", "landscape", "cool"],
  },
  {
    id: "nature-ocean",
    category: "nature",
    title: "Ocean",
    url: picsum("ontab-ocean"),
    thumbnailUrl: picsumThumb("ontab-ocean"),
    width: 1920,
    height: 1080,
    tags: ["ocean", "water", "blue"],
  },
  {
    id: "nature-meadow",
    category: "nature",
    title: "Meadow",
    url: picsum("ontab-meadow"),
    thumbnailUrl: picsumThumb("ontab-meadow"),
    width: 1920,
    height: 1080,
    tags: ["meadow", "green", "soft"],
  },
  {
    id: "nature-sky",
    category: "nature",
    title: "Sky",
    url: picsum("ontab-sky"),
    thumbnailUrl: picsumThumb("ontab-sky"),
    width: 1920,
    height: 1080,
    tags: ["sky", "cloud", "blue"],
  },

  // ── texture ─────────────────────────────────────────────────
  {
    id: "texture-paper",
    category: "texture",
    title: "Paper",
    url: picsum("ontab-paper"),
    thumbnailUrl: picsumThumb("ontab-paper"),
    width: 1920,
    height: 1080,
    tags: ["paper", "neutral", "warm"],
  },
  {
    id: "texture-concrete",
    category: "texture",
    title: "Concrete",
    url: picsum("ontab-concrete"),
    thumbnailUrl: picsumThumb("ontab-concrete"),
    width: 1920,
    height: 1080,
    tags: ["concrete", "neutral", "grey"],
  },
  {
    id: "texture-fabric",
    category: "texture",
    title: "Fabric",
    url: picsum("ontab-fabric"),
    thumbnailUrl: picsumThumb("ontab-fabric"),
    width: 1920,
    height: 1080,
    tags: ["fabric", "soft", "neutral"],
  },
  {
    id: "texture-metal",
    category: "texture",
    title: "Metal",
    url: picsum("ontab-metal"),
    thumbnailUrl: picsumThumb("ontab-metal"),
    width: 1920,
    height: 1080,
    tags: ["metal", "cool", "silver"],
  },
  {
    id: "texture-wood",
    category: "texture",
    title: "Wood",
    url: picsum("ontab-wood"),
    thumbnailUrl: picsumThumb("ontab-wood"),
    width: 1920,
    height: 1080,
    tags: ["wood", "warm", "brown"],
  },

  // ── pattern ─────────────────────────────────────────────────
  {
    id: "pattern-geometric",
    category: "pattern",
    title: "Geometric",
    url: picsum("ontab-geo"),
    thumbnailUrl: picsumThumb("ontab-geo"),
    width: 1920,
    height: 1080,
    tags: ["geometric", "shapes"],
  },
  {
    id: "pattern-grid",
    category: "pattern",
    title: "Grid",
    url: picsum("ontab-grid"),
    thumbnailUrl: picsumThumb("ontab-grid"),
    width: 1920,
    height: 1080,
    tags: ["grid", "lines"],
  },
  {
    id: "pattern-dots",
    category: "pattern",
    title: "Dots",
    url: picsum("ontab-dots"),
    thumbnailUrl: picsumThumb("ontab-dots"),
    width: 1920,
    height: 1080,
    tags: ["dots", "round"],
  },
  {
    id: "pattern-stripes",
    category: "pattern",
    title: "Stripes",
    url: picsum("ontab-stripes"),
    thumbnailUrl: picsumThumb("ontab-stripes"),
    width: 1920,
    height: 1080,
    tags: ["stripes", "lines"],
  },
  {
    id: "pattern-waves",
    category: "pattern",
    title: "Waves",
    url: picsum("ontab-waves"),
    thumbnailUrl: picsumThumb("ontab-waves"),
    width: 1920,
    height: 1080,
    tags: ["waves", "curve"],
  },
];

/** No longer surfaced in UI but kept for potential future search. */
export function getAllTags(): string[] {
  const set = new Set<string>();
  for (const img of MOCK_IMAGES) {
    for (const tag of img.tags ?? []) set.add(tag);
  }
  return [...set].sort();
}
```

Note: picsum URLs and `data:` URLs need to be allowed by `next/image`. `InlineGallery` currently uses `<Image ... unoptimized />`. We will switch to a plain `<img>` to drop the `next/image` host config dependency for this transient mock data. (Production gallery on Supabase will revisit image optimization.)

- [ ] **Step 4.3: Rewrite `InlineGallery.tsx`**

Replace the entire contents of `src/components/ppt/InlineGallery.tsx` with:

```tsx
"use client";

import { useEffect, useMemo, useState } from "react";
import { CheckIcon, ChevronDownIcon, GalleryHorizontalEndIcon } from "lucide-react";
import { MOCK_IMAGES } from "@/lib/gallery/mockData";
import {
  GALLERY_CATEGORIES,
  type GalleryCategory,
  type GalleryImage,
} from "@/lib/gallery/types";
import { cn } from "@/lib/utils";

type CategoryFilter = "all" | GalleryCategory;

interface InlineGalleryProps {
  onSelect: (image: GalleryImage) => void;
  selectedImageId?: string | null;
  forceCollapsed?: boolean;
  labels: {
    heading: string;            // "배경 갤러리" / "Background gallery"
    countSuffix: (n: number) => string;  // e.g. (n) => `(${n}개 이미지)`
    categoryAll: string;
    categoryByKey: Record<GalleryCategory, string>;
    empty: string;
  };
}

export function InlineGallery({
  onSelect,
  selectedImageId,
  forceCollapsed,
  labels,
}: InlineGalleryProps) {
  const [expanded, setExpanded] = useState(false);
  const [category, setCategory] = useState<CategoryFilter>("all");

  useEffect(() => {
    if (forceCollapsed) setExpanded(false);
  }, [forceCollapsed]);

  const filtered = useMemo(() => {
    if (category === "all") return MOCK_IMAGES;
    return MOCK_IMAGES.filter((img) => img.category === category);
  }, [category]);

  return (
    <div
      className="rounded-[10px] border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
      }}
    >
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="flex w-full items-center justify-between px-4 py-2.5 text-left transition-colors"
        style={{ color: "var(--ink-strong)" }}
      >
        <div className="flex items-center gap-2">
          <GalleryHorizontalEndIcon
            className="size-4"
            style={{ color: "var(--accent-electric)" }}
          />
          <span className="font-display text-[13px] font-medium">{labels.heading}</span>
          <span className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {labels.countSuffix(MOCK_IMAGES.length)}
          </span>
        </div>
        <ChevronDownIcon
          className={cn("size-4 transition-transform", expanded && "rotate-180")}
          style={{ color: "var(--ink-soft)" }}
        />
      </button>

      {expanded && (
        <div className="border-t px-4 pb-3 pt-3" style={{ borderColor: "var(--border)" }}>
          <div className="mb-3 flex flex-wrap items-center gap-1.5">
            <CategoryChip
              active={category === "all"}
              onClick={() => setCategory("all")}
              label={labels.categoryAll}
            />
            {GALLERY_CATEGORIES.map((cat) => (
              <CategoryChip
                key={cat}
                active={category === cat}
                onClick={() => setCategory(cat)}
                label={labels.categoryByKey[cat]}
              />
            ))}
          </div>

          {filtered.length === 0 ? (
            <div
              className="py-8 text-center font-body text-[12px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.empty}
            </div>
          ) : (
            <div
              className="grid grid-cols-2 gap-2 overflow-y-auto sm:grid-cols-3"
              style={{ maxHeight: "260px" }}
            >
              {filtered.map((img) => {
                const isSelected = selectedImageId === img.id;
                return (
                  <button
                    type="button"
                    key={img.id}
                    onClick={() => onSelect(img)}
                    className="group relative overflow-hidden rounded-[6px] border text-left transition-colors"
                    style={{
                      background: "var(--surface-2)",
                      borderColor: isSelected ? "var(--accent-electric)" : "var(--border)",
                      borderWidth: isSelected ? 2 : 1,
                    }}
                  >
                    <div className="relative aspect-video overflow-hidden">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={img.thumbnailUrl}
                        alt={img.title}
                        className="size-full object-cover"
                      />
                      {isSelected && (
                        <div
                          className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full"
                          style={{ background: "var(--accent-electric)", color: "#fff" }}
                        >
                          <CheckIcon className="size-3" />
                        </div>
                      )}
                    </div>
                    <div className="px-2 py-1.5">
                      <p
                        className="truncate font-display text-[11px] font-medium"
                        style={{ color: "var(--ink-strong)" }}
                      >
                        {img.title}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function CategoryChip({
  active,
  onClick,
  label,
}: {
  active: boolean;
  onClick: () => void;
  label: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[5px] border px-2.5 py-1 font-body text-[11px] transition-colors"
      style={{
        background: active ? "var(--surface)" : "var(--surface-2)",
        borderColor: active ? "var(--accent-electric)" : "var(--border)",
        color: active ? "var(--ink-strong)" : "var(--ink)",
        boxShadow: active ? "inset 0 -2px 0 var(--accent-electric)" : undefined,
      }}
    >
      {label}
    </button>
  );
}
```

The component is now self-contained: labels come from props, removing the previous Korean `CATEGORY_LABEL` map dependency.

- [ ] **Step 4.4: Type check**

Run:
```
pnpm exec tsc --noEmit
```
Expected: errors in `src/app/[lang]/(chrome)/tools/ppt-background/page.tsx` (current page passes no `labels` to `InlineGallery` and accesses old `getAllTags`/category-label patterns). That page will be replaced wholesale in Task 7. To unblock typecheck for the intermediate steps, **temporarily stub the old page body**:

Open `src/app/[lang]/(chrome)/tools/ppt-background/page.tsx` and replace the entire file with:

```tsx
export default function PptBackgroundPage() {
  return null;
}
```

Then re-run:
```
pnpm exec tsc --noEmit
```
Expected: PASS.

(This temporary stub stays only until Task 7, which builds the real page on top of `PptBackgroundTool`.)

- [ ] **Step 4.5: Commit**

```
git add src/lib/gallery/types.ts src/lib/gallery/mockData.ts src/components/ppt/InlineGallery.tsx src/app/[lang]/(chrome)/tools/ppt-background/page.tsx
git commit -m "feat(gallery): silver riskin + 4-category mock catalog

- types: narrow GalleryCategory to gradient|nature|texture|pattern,
  keep tags as optional metadata (no UI).
- mockData: 20 entries across 4 categories. gradient uses inline SVG data
  URLs (picsum is photographic only); other categories use picsum seeds.
- InlineGallery: rewritten on silver tokens. Drops tag Badge filter and
  Recent UI. Labels now come from props for i18n.
- Stub ppt-background page to keep typecheck green; full body lands in a
  later task in this branch."
```

---

### Task 5: `changeBackground` — `specific-slides` mode

Add a third mode that whitelists which slides to process. Reuses `processSlideGroup` with an index filter; non-target slides are left byte-identical.

**Files:**
- Modify: `src/lib/ppt/changeBackground.ts`

- [ ] **Step 5.1: Extend `BgMode` and signature**

In `src/lib/ppt/changeBackground.ts`, change the type declaration (around lines 3–10):

```ts
export type BgMode = "all-slides" | "master" | "specific-slides";

export interface ChangeBackgroundOptions {
  pptxFile: File;
  bgImage: File;
  mode: BgMode;
  /** 1-based slide indices. Required when mode === "specific-slides". */
  targetSlides?: number[];
  onProgress?: (pct: number) => void;
}
```

- [ ] **Step 5.2: Add an index filter to `processSlideGroup`**

Still in `src/lib/ppt/changeBackground.ts`, change the `processSlideGroup` signature and body to accept an optional whitelist. Replace the function (currently lines 175–215) with:

```ts
async function processSlideGroup(
  zip: JSZip,
  dir: string,
  mediaTarget: string,
  fillOffsets: FillRectOffsets,
  onEach?: (done: number, total: number) => void,
  /** 1-based whitelist over the sorted-by-filename slide order. Undefined = all. */
  targetIndices1Based?: ReadonlySet<number>,
): Promise<void> {
  const pattern = new RegExp(`^${dir}/[^/]+\\.xml$`);
  const slideFiles: string[] = [];

  zip.forEach((path) => {
    if (pattern.test(path)) slideFiles.push(path);
  });

  slideFiles.sort();

  const filtered = targetIndices1Based
    ? slideFiles
        .map((p, i) => ({ p, ord: i + 1 }))
        .filter((entry) => targetIndices1Based.has(entry.ord))
        .map((entry) => entry.p)
    : slideFiles;

  for (let i = 0; i < filtered.length; i++) {
    const slidePath = filtered[i];
    const slideFileName = slidePath.split("/").pop()!;
    let slideXml = await zip.file(slidePath)!.async("text");

    slideXml = ensureNamespaces(slideXml);

    const { path: relsPath, xml: emptyRels } = ensureRelsFile(
      zip,
      dir,
      slideFileName,
    );
    let relsXml =
      emptyRels || (await zip.file(relsPath)!.async("text"));

    const relId = nextRelId(relsXml);
    relsXml = addRelationship(relsXml, relId, mediaTarget);
    zip.file(relsPath, relsXml);

    slideXml = setBackground(slideXml, relId, fillOffsets);
    zip.file(slidePath, slideXml);

    onEach?.(i + 1, filtered.length);
  }
}
```

- [ ] **Step 5.3: Branch on `specific-slides` in the entry function**

In `src/lib/ppt/changeBackground.ts`, replace the if/else that picks the slide group (currently lines 292–308) with a three-way branch:

```ts
  if (mode === "master") {
    const mediaTarget = `../media/${mediaName}`;
    await processSlideGroup(
      zip,
      "ppt/slideMasters",
      mediaTarget,
      fillOffsets,
      (done, total) => {
        onProgress?.(Math.round((done / total) * 100));
      },
    );
  } else {
    const mediaTarget = `../media/${mediaName}`;
    let whitelist: Set<number> | undefined;
    if (mode === "specific-slides") {
      if (!targetSlides || targetSlides.length === 0) {
        throw new Error("적용할 슬라이드를 선택해 주세요.");
      }
      whitelist = new Set(targetSlides);
    }
    await processSlideGroup(
      zip,
      "ppt/slides",
      mediaTarget,
      fillOffsets,
      (done, total) => {
        onProgress?.(Math.round((done / total) * 100));
      },
      whitelist,
    );
  }
```

Also, **destructure `targetSlides`** in the `changeBackground` argument list at the top of the function (currently line 269):

```ts
export async function changeBackground({
  pptxFile,
  bgImage,
  mode,
  targetSlides,
  onProgress,
}: ChangeBackgroundOptions): Promise<Uint8Array> {
```

- [ ] **Step 5.4: Type check**

Run:
```
pnpm exec tsc --noEmit
```
Expected: PASS.

- [ ] **Step 5.5: Commit**

```
git add src/lib/ppt/changeBackground.ts
git commit -m "feat(ppt): add 'specific-slides' mode to changeBackground

- BgMode now includes 'specific-slides'.
- targetSlides?: number[] selects which slides (1-based, in sorted-filename
  order) receive the new background. Non-target slides untouched.
- processSlideGroup gains an optional whitelist; semantics unchanged when
  absent."
```

---

### Task 6: `PptBackgroundTool` + sub-components

The body component itself, plus the four leaves that compose it. State lives in `PptBackgroundTool`; sub-components are presentational and receive callbacks. Two-pane layout from spec §6.2; empty / .ppt states from §6.1. Labels are i18n strings passed in from the calling page (Task 7).

**Files:**
- Create: `src/components/tools/ppt-background/PptConversionGuide.tsx`
- Create: `src/components/tools/ppt-background/ModeSelector.tsx`
- Create: `src/components/tools/ppt-background/SlideThumbStrip.tsx`
- Create: `src/components/tools/ppt-background/BackgroundPicker.tsx`
- Create: `src/components/tools/ppt-background/PptBackgroundTool.tsx`

- [ ] **Step 6.1: `PptConversionGuide.tsx`**

Create the file with:

```tsx
"use client";

import { useState } from "react";
import { ChevronDownIcon, InfoIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface ConversionMethodLabels {
  title: string;
  steps: string[];
  linkLabel?: string;
  linkHref?: string;
}

interface PptConversionGuideProps {
  heading: string;
  methods: ConversionMethodLabels[];
  note: string;
  defaultOpen?: boolean;
}

export function PptConversionGuide({
  heading,
  methods,
  note,
  defaultOpen = true,
}: PptConversionGuideProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div
      className="rounded-[12px] border"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--accent-copper)",
      }}
    >
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center justify-between px-4 py-3 text-left"
        style={{ color: "var(--ink-strong)" }}
      >
        <div className="flex items-center gap-2">
          <InfoIcon className="size-4" style={{ color: "var(--accent-copper)" }} />
          <span className="font-display text-[13px] font-semibold">{heading}</span>
        </div>
        <ChevronDownIcon
          className={cn("size-4 transition-transform", open && "rotate-180")}
          style={{ color: "var(--ink-soft)" }}
        />
      </button>

      {open && (
        <div className="space-y-3 border-t px-4 py-3" style={{ borderColor: "var(--border)" }}>
          {methods.map((m, idx) => (
            <div
              key={idx}
              className="rounded-[8px] border px-3 py-2"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
              }}
            >
              <div
                className="font-display text-[12px] font-semibold"
                style={{ color: "var(--headline)" }}
              >
                {m.title}
              </div>
              <ol
                className="mt-1 list-inside list-decimal space-y-0.5 font-body text-[11.5px]"
                style={{ color: "var(--ink)" }}
              >
                {m.steps.map((step, i) => (
                  <li key={i}>{step}</li>
                ))}
              </ol>
              {m.linkHref && m.linkLabel && (
                <a
                  href={m.linkHref}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-block font-body text-[11.5px] underline"
                  style={{ color: "var(--accent-electric)" }}
                >
                  {m.linkLabel}
                </a>
              )}
            </div>
          ))}
          <p className="font-body text-[11px]" style={{ color: "var(--ink-soft)" }}>
            {note}
          </p>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.2: `ModeSelector.tsx`**

Create the file with:

```tsx
"use client";

import type { BgMode } from "@/lib/ppt/changeBackground";

interface ModeSelectorProps {
  value: BgMode;
  onChange: (next: BgMode) => void;
  labels: {
    label: string;          // "적용 범위"
    optionAll: string;
    optionMaster: string;
    optionSpecific: string;
  };
}

const ORDER: BgMode[] = ["all-slides", "master", "specific-slides"];

export function ModeSelector({ value, onChange, labels }: ModeSelectorProps) {
  return (
    <div>
      <div
        className="mb-1.5 font-display text-[11px] font-medium uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {labels.label}
      </div>
      <div
        className="flex overflow-hidden rounded-[6px] border"
        style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
      >
        {ORDER.map((mode) => {
          const active = value === mode;
          const label =
            mode === "all-slides"
              ? labels.optionAll
              : mode === "master"
                ? labels.optionMaster
                : labels.optionSpecific;
          return (
            <button
              key={mode}
              type="button"
              onClick={() => onChange(mode)}
              className="flex-1 py-2 font-display text-[12px] font-medium transition-colors"
              style={{
                background: active ? "var(--surface)" : "transparent",
                color: active ? "var(--ink-strong)" : "var(--ink-soft)",
                boxShadow: active ? "inset 0 -2px 0 var(--accent-electric)" : undefined,
              }}
            >
              {label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6.3: `SlideThumbStrip.tsx`**

Create the file with:

```tsx
"use client";

import { CheckIcon } from "lucide-react";
import type { SlideBackground } from "@/lib/ppt/extractCurrentBackgrounds";

interface SlideThumbStripProps {
  backgrounds: SlideBackground[];
  thumbnailUrls: Map<number, string>;
  /** When non-null, the strip is interactive: clicks toggle selection. */
  selectable: { selected: Set<number>; onToggle: (slideIndex1Based: number) => void } | null;
  labels: {
    emptyThumb: string;     // "배경 없음"
    sourceByKey: Record<"slide" | "layout" | "master", string>;
  };
}

export function SlideThumbStrip({
  backgrounds,
  thumbnailUrls,
  selectable,
  labels,
}: SlideThumbStripProps) {
  return (
    <div
      className="grid gap-2 overflow-y-auto"
      style={{
        gridTemplateColumns: "repeat(auto-fill, minmax(120px, 1fr))",
        maxHeight: "260px",
      }}
    >
      {backgrounds.map((bg) => {
        const url = thumbnailUrls.get(bg.slideIndex);
        const ord = bg.slideIndex; // 1-based per extractCurrentBackgrounds
        const isSelected = selectable?.selected.has(ord) ?? false;
        const isInteractive = selectable !== null;

        const baseStyle: React.CSSProperties = {
          background: "var(--surface-2)",
          borderColor: isSelected ? "var(--accent-electric)" : "var(--border)",
          borderWidth: isSelected ? 2 : 1,
          cursor: isInteractive ? "pointer" : "default",
        };

        const inner = (
          <>
            <div className="relative aspect-video overflow-hidden">
              {url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={url} alt={bg.slideName} className="size-full object-cover" />
              ) : (
                <div
                  className="flex size-full items-center justify-center font-body text-[10px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {labels.emptyThumb}
                </div>
              )}
              {isSelected && (
                <div
                  className="absolute right-1.5 top-1.5 flex size-5 items-center justify-center rounded-full"
                  style={{ background: "var(--accent-electric)", color: "#fff" }}
                >
                  <CheckIcon className="size-3" />
                </div>
              )}
            </div>
            <div className="px-1.5 py-1 text-center">
              <p
                className="truncate font-display text-[10px] font-medium"
                style={{ color: "var(--ink-strong)" }}
              >
                {bg.slideName}
              </p>
              {bg.source !== "none" && (
                <p className="font-body text-[9.5px]" style={{ color: "var(--ink-soft)" }}>
                  {labels.sourceByKey[bg.source]}
                </p>
              )}
            </div>
          </>
        );

        return isInteractive ? (
          <button
            key={bg.slideIndex}
            type="button"
            onClick={() => selectable!.onToggle(ord)}
            className="overflow-hidden rounded-[6px] border text-left transition-colors"
            style={baseStyle}
          >
            {inner}
          </button>
        ) : (
          <div
            key={bg.slideIndex}
            className="overflow-hidden rounded-[6px] border"
            style={baseStyle}
          >
            {inner}
          </div>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 6.4: `BackgroundPicker.tsx`**

Create the file with:

```tsx
"use client";

import { ImageIcon, UploadCloudIcon, XIcon } from "lucide-react";
import { FileUpload } from "@/components/common/FileUpload";
import { InlineGallery } from "@/components/ppt/InlineGallery";
import type { GalleryImage } from "@/lib/gallery/types";
import type { GalleryCategory } from "@/lib/gallery/types";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
};

interface BackgroundPickerProps {
  bgFile: File | null;
  bgPreviewUrl: string | null;
  galleryImage: GalleryImage | null;
  onDirectUpload: (files: File[]) => void;
  onGallerySelect: (img: GalleryImage) => void;
  onClear: () => void;
  labels: {
    heading: string;
    previewLabel: string;
    empty: string;
    fromGallery: string;
    fromUpload: string;
    clear: string;
    uploadLabel: string;
    uploadHint: string;
    gallery: {
      heading: string;
      countSuffix: (n: number) => string;
      categoryAll: string;
      categoryByKey: Record<GalleryCategory, string>;
      empty: string;
    };
  };
}

export function BackgroundPicker({
  bgFile,
  bgPreviewUrl,
  galleryImage,
  onDirectUpload,
  onGallerySelect,
  onClear,
  labels,
}: BackgroundPickerProps) {
  return (
    <div className="space-y-3">
      <div
        className="font-display text-[12px] font-semibold uppercase tracking-[0.08em]"
        style={{ color: "var(--ink-soft)" }}
      >
        {labels.heading}
      </div>

      {/* Preview card */}
      <div
        className="overflow-hidden rounded-[8px] border"
        style={{ background: "var(--surface)", borderColor: "var(--border)" }}
      >
        <div
          className="border-b px-3 py-1.5 font-body text-[11px]"
          style={{ borderColor: "var(--border)", background: "var(--surface-2)", color: "var(--ink-soft)" }}
        >
          {labels.previewLabel}
        </div>
        <div
          className="relative flex aspect-video items-center justify-center"
          style={{ background: "var(--surface-2)" }}
        >
          {bgPreviewUrl ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={bgPreviewUrl}
              alt="background preview"
              className="size-full object-contain"
            />
          ) : (
            <span className="font-body text-[11.5px]" style={{ color: "var(--ink-soft)" }}>
              {labels.empty}
            </span>
          )}
        </div>
      </div>

      {/* Selected meta + clear */}
      {bgFile && (
        <div
          className="flex items-center gap-2 rounded-[6px] border px-3 py-2"
          style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
        >
          {galleryImage ? (
            <ImageIcon className="size-4" style={{ color: "var(--accent-electric)" }} />
          ) : (
            <UploadCloudIcon className="size-4" style={{ color: "var(--accent-electric)" }} />
          )}
          <div className="min-w-0 flex-1">
            <p
              className="truncate font-display text-[11.5px] font-medium"
              style={{ color: "var(--ink-strong)" }}
            >
              {galleryImage ? galleryImage.title : bgFile.name}
            </p>
            <p className="truncate font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
              {galleryImage ? labels.fromGallery : labels.fromUpload}
            </p>
          </div>
          <button
            type="button"
            onClick={onClear}
            className="rounded p-1 transition-colors hover:bg-[color:var(--surface)]"
            aria-label={labels.clear}
          >
            <XIcon className="size-4" style={{ color: "var(--ink-soft)" }} />
          </button>
        </div>
      )}

      {/* Direct upload — compact, only when no background is selected */}
      {!bgFile && (
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple={false}
          onFiles={onDirectUpload}
          label={labels.uploadLabel}
          description={labels.uploadHint}
        />
      )}

      {/* Gallery (collapses when a background is selected) */}
      <InlineGallery
        onSelect={onGallerySelect}
        selectedImageId={galleryImage?.id}
        forceCollapsed={!!bgFile}
        labels={labels.gallery}
      />
    </div>
  );
}
```

- [ ] **Step 6.5: `PptBackgroundTool.tsx`**

Create the main component. It owns all state and composes the leaves.

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileIcon, Layers, UploadCloud } from "lucide-react";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { PageRangeSelector } from "@/components/common/PageRangeSelector";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import {
  changeBackground,
  type BgMode,
} from "@/lib/ppt/changeBackground";
import {
  extractCurrentBackgrounds,
  type SlideBackground,
} from "@/lib/ppt/extractCurrentBackgrounds";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import type { GalleryImage, GalleryCategory } from "@/lib/gallery/types";
import { ModeSelector } from "./ModeSelector";
import { SlideThumbStrip } from "./SlideThumbStrip";
import { BackgroundPicker } from "./BackgroundPicker";
import { PptConversionGuide, type ConversionMethodLabels } from "./PptConversionGuide";

const PPTX_ACCEPT = {
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": [".pptx"],
  "application/vnd.ms-powerpoint": [".ppt"],
};

export interface PptBackgroundToolLabels {
  header: { title: string; description: string };
  upload: { dropzoneLabel: string; dropzoneHint: string; pptDetected: string };
  conversion: { heading: string; note: string; methods: ConversionMethodLabels[] };
  fileStatus: { slideCount: (n: number) => string; changeFile: string; analyzing: string };
  mode: {
    label: string;
    optionAll: string;
    optionMaster: string;
    optionSpecific: string;
    masterNote: string;
    specificInput: string;
    specificSelectAll: string;
    specificClear: string;
    specificHint: string;
  };
  thumbnails: {
    heading: string;
    empty: string;
    sourceByKey: Record<"slide" | "layout" | "master", string>;
  };
  background: {
    heading: string;
    preview: string;
    empty: string;
    fromGallery: string;
    fromUpload: string;
    clear: string;
    uploadLabel: string;
    uploadHint: string;
  };
  gallery: {
    heading: string;
    countSuffix: (n: number) => string;
    categoryAll: string;
    categoryByKey: Record<GalleryCategory, string>;
    empty: string;
  };
  action: {
    apply: string;
    applyDisabledHint: string;
    specificEmpty: string;
  };
  processing: {
    processing: string;
    done: string;
    doneBody: string;
    download: string;
    error: string;
    errorBody: string;
    retry: string;
    reset: string;
  };
}

interface PptBackgroundToolProps {
  labels: PptBackgroundToolLabels;
}

export function PptBackgroundTool({ labels }: PptBackgroundToolProps) {
  const [showConversionGuide, setShowConversionGuide] = useState(false);
  const [bgFiles, setBgFiles] = useState<File[]>([]);
  const [mode, setMode] = useState<BgMode>("all-slides");
  const [selectedSlides, setSelectedSlides] = useState<Set<number>>(new Set());
  const [galleryImage, setGalleryImage] = useState<GalleryImage | null>(null);
  const [currentBgs, setCurrentBgs] = useState<SlideBackground[]>([]);
  const [bgLoading, setBgLoading] = useState(false);
  const [bgObjectUrls, setBgObjectUrls] = useState<Map<number, string>>(new Map());
  const [bgPreviewUrl, setBgPreviewUrl] = useState<string | null>(null);

  const bgFile = bgFiles[0] ?? null;
  const objectUrlsRef = useRef(bgObjectUrls);
  objectUrlsRef.current = bgObjectUrls;

  const {
    files: pptxFiles,
    setFiles: setPptxFilesRaw,
    status,
    progress,
    errorMessage,
    run,
    retry,
    download,
  } = useToolProcessor<Uint8Array>({
    processor: (files, onProgress) =>
      changeBackground({
        pptxFile: files[0],
        bgImage: bgFile!,
        mode,
        targetSlides:
          mode === "specific-slides" ? [...selectedSlides].sort((a, b) => a - b) : undefined,
        onProgress,
      }),
    onDownload: (bytes) => {
      const baseName = pptxFiles[0]?.name.replace(/\.pptx?$/i, "") ?? "presentation";
      downloadBlob(
        bytes,
        `${baseName}-bg-changed.pptx`,
        "application/vnd.openxmlformats-officedocument.presentationml.presentation",
      );
    },
  });

  const pptxFile = pptxFiles[0] ?? null;

  // .ppt vs .pptx routing — .ppt never enters useToolProcessor state.
  const setPptxFiles = useCallback(
    (files: File[]) => {
      const first = files[0];
      if (first && first.name.toLowerCase().endsWith(".ppt")) {
        setShowConversionGuide(true);
        setPptxFilesRaw([]);
        return;
      }
      setShowConversionGuide(false);
      setPptxFilesRaw(files);
    },
    [setPptxFilesRaw],
  );

  // Extract current backgrounds when a .pptx is loaded.
  useEffect(() => {
    if (!pptxFile) {
      setCurrentBgs([]);
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      setBgObjectUrls(new Map());
      return;
    }
    setBgLoading(true);
    let cancelled = false;
    extractCurrentBackgrounds(pptxFile)
      .then((bgs) => {
        if (cancelled) return;
        setCurrentBgs(bgs);
        const urls = new Map<number, string>();
        for (const bg of bgs) {
          if (bg.imageBlob) urls.set(bg.slideIndex, URL.createObjectURL(bg.imageBlob));
        }
        objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
        setBgObjectUrls(urls);
      })
      .catch(() => {
        if (!cancelled) setCurrentBgs([]);
      })
      .finally(() => {
        if (!cancelled) setBgLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [pptxFile]);

  // Cleanup all object URLs on unmount.
  useEffect(() => {
    return () => {
      objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
      if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleGallerySelect = useCallback(
    async (image: GalleryImage) => {
      setGalleryImage(image);
      if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
      setBgPreviewUrl(image.thumbnailUrl);
      try {
        const res = await fetch(image.url);
        const blob = await res.blob();
        const ext = image.url.includes("png") || image.url.startsWith("data:image/svg") ? "png" : "jpg";
        const file = new File([blob], `gallery-${image.id}.${ext}`, {
          type: ext === "png" ? "image/png" : "image/jpeg",
        });
        setBgFiles([file]);
      } catch {
        setGalleryImage(null);
        setBgPreviewUrl(null);
      }
    },
    [bgPreviewUrl],
  );

  const handleDirectUpload = useCallback(
    (files: File[]) => {
      setBgFiles(files);
      setGalleryImage(null);
      if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
      setBgPreviewUrl(files[0] ? URL.createObjectURL(files[0]) : null);
    },
    [bgPreviewUrl],
  );

  const clearBgSelection = useCallback(() => {
    setGalleryImage(null);
    setBgFiles([]);
    if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
    setBgPreviewUrl(null);
  }, [bgPreviewUrl]);

  const totalSlides = currentBgs.length;
  const specificValid = mode !== "specific-slides" || selectedSlides.size > 0;
  const canRun = !!pptxFile && !!bgFile && specificValid && status === "idle";

  const applyDisabledLabel = useMemo(() => {
    if (!bgFile) return labels.action.applyDisabledHint;
    if (mode === "specific-slides" && selectedSlides.size === 0) return labels.action.specificEmpty;
    return null;
  }, [bgFile, mode, selectedSlides.size, labels]);

  const onReset = useCallback(() => {
    retry();
    setPptxFilesRaw([]);
    setShowConversionGuide(false);
    setBgFiles([]);
    setGalleryImage(null);
    setMode("all-slides");
    setSelectedSlides(new Set());
    if (bgPreviewUrl && bgPreviewUrl.startsWith("blob:")) URL.revokeObjectURL(bgPreviewUrl);
    setBgPreviewUrl(null);
    objectUrlsRef.current.forEach((url) => URL.revokeObjectURL(url));
    setBgObjectUrls(new Map());
    setCurrentBgs([]);
    setBgLoading(false);
  }, [retry, setPptxFilesRaw, bgPreviewUrl]);

  // ───────── Render ─────────
  return (
    <div
      className="overflow-hidden rounded-[14px] border"
      style={{
        background: "color-mix(in oklch, var(--surface) 92%, transparent)",
        backdropFilter: "blur(10px) saturate(1.1)",
        WebkitBackdropFilter: "blur(10px) saturate(1.1)",
        borderColor: "var(--border)",
        boxShadow:
          "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)",
      }}
    >
      {/* Header strip */}
      <div
        className="flex items-start gap-3 border-b px-6 pt-5 pb-4"
        style={{ borderColor: "var(--border)" }}
      >
        <div
          className="flex size-10 shrink-0 items-center justify-center rounded-[5px]"
          style={{
            background: "var(--surface-2)",
            border: "1px solid var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          <Layers size={18} />
        </div>
        <div className="min-w-0 flex-1">
          <div
            className="font-display text-[16px] font-semibold leading-[1.2] tracking-[0.005em] font-ko"
            style={{ color: "var(--headline)" }}
          >
            {labels.header.title}
          </div>
          <div
            className="mt-1 font-body text-[12px] leading-[1.45]"
            style={{ color: "var(--ink)" }}
          >
            {labels.header.description}
          </div>
        </div>
      </div>

      {/* Body */}
      {!pptxFile ? (
        // Empty state — centered dropzone, optional conversion guide below.
        <div className="space-y-4 px-6 py-6">
          {showConversionGuide && (
            <div
              className="rounded-[6px] border px-3 py-2 font-body text-[11.5px]"
              style={{
                background: "var(--surface-2)",
                borderColor: "var(--border)",
                color: "var(--ink-strong)",
              }}
            >
              {labels.upload.pptDetected}
            </div>
          )}
          <FileUpload
            accept={PPTX_ACCEPT}
            multiple={false}
            onFiles={setPptxFiles}
            label={labels.upload.dropzoneLabel}
            description={labels.upload.dropzoneHint}
          />
          {showConversionGuide && (
            <PptConversionGuide
              heading={labels.conversion.heading}
              methods={labels.conversion.methods}
              note={labels.conversion.note}
            />
          )}
        </div>
      ) : (
        // Two-pane workspace.
        <div
          className="grid"
          style={{
            gridTemplateColumns: "1fr 1px 1fr",
          }}
        >
          {/* LEFT panel */}
          <div className="space-y-4 px-6 py-5">
            {/* File status */}
            <div
              className="flex items-center gap-3 rounded-[8px] border px-3 py-2.5"
              style={{ background: "var(--surface-2)", borderColor: "var(--border)" }}
            >
              <FileIcon className="size-4 shrink-0" style={{ color: "var(--accent-electric)" }} />
              <div className="min-w-0 flex-1">
                <p
                  className="truncate font-display text-[12px] font-medium"
                  style={{ color: "var(--ink-strong)" }}
                >
                  {pptxFile.name}
                </p>
                <p className="font-body text-[10.5px]" style={{ color: "var(--ink-soft)" }}>
                  {totalSlides > 0
                    ? labels.fileStatus.slideCount(totalSlides)
                    : labels.fileStatus.analyzing}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPptxFiles([])}
                className="rounded-[5px] border px-2 py-1 font-body text-[10.5px] transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                {labels.fileStatus.changeFile}
              </button>
            </div>

            {/* Mode + range selector + thumb strip */}
            <div className="space-y-3">
              <ModeSelector
                value={mode}
                onChange={(next) => {
                  setMode(next);
                  if (next !== "specific-slides") setSelectedSlides(new Set());
                }}
                labels={labels.mode}
              />

              {mode === "specific-slides" ? (
                <PageRangeSelector
                  totalPages={totalSlides}
                  selected={selectedSlides}
                  onChange={setSelectedSlides}
                  inputPlaceholder={labels.mode.specificInput}
                  selectAllLabel={labels.mode.specificSelectAll}
                  clearLabel={labels.mode.specificClear}
                >
                  <p
                    className="font-body text-[10.5px]"
                    style={{ color: "var(--ink-soft)" }}
                  >
                    {labels.mode.specificHint}
                  </p>
                  <SlideThumbStrip
                    backgrounds={currentBgs}
                    thumbnailUrls={bgObjectUrls}
                    selectable={{
                      selected: selectedSlides,
                      onToggle: (n) => {
                        setSelectedSlides((prev) => {
                          const next = new Set(prev);
                          if (next.has(n)) next.delete(n);
                          else next.add(n);
                          return next;
                        });
                      },
                    }}
                    labels={{
                      emptyThumb: labels.thumbnails.empty,
                      sourceByKey: labels.thumbnails.sourceByKey,
                    }}
                  />
                </PageRangeSelector>
              ) : (
                <>
                  {mode === "master" && (
                    <p
                      className="font-body text-[10.5px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {labels.mode.masterNote}
                    </p>
                  )}
                  {bgLoading ? (
                    <p
                      className="font-body text-[11px]"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      {labels.fileStatus.analyzing}
                    </p>
                  ) : (
                    <SlideThumbStrip
                      backgrounds={currentBgs}
                      thumbnailUrls={bgObjectUrls}
                      selectable={null}
                      labels={{
                        emptyThumb: labels.thumbnails.empty,
                        sourceByKey: labels.thumbnails.sourceByKey,
                      }}
                    />
                  )}
                </>
              )}
            </div>
          </div>

          {/* Divider */}
          <div style={{ background: "var(--hairline)" }} />

          {/* RIGHT panel */}
          <div className="space-y-4 px-6 py-5">
            <BackgroundPicker
              bgFile={bgFile}
              bgPreviewUrl={bgPreviewUrl}
              galleryImage={galleryImage}
              onDirectUpload={handleDirectUpload}
              onGallerySelect={handleGallerySelect}
              onClear={clearBgSelection}
              labels={{
                heading: labels.background.heading,
                previewLabel: labels.background.preview,
                empty: labels.background.empty,
                fromGallery: labels.background.fromGallery,
                fromUpload: labels.background.fromUpload,
                clear: labels.background.clear,
                uploadLabel: labels.background.uploadLabel,
                uploadHint: labels.background.uploadHint,
                gallery: labels.gallery,
              }}
            />

            {/* Action area */}
            <div className="space-y-2">
              {status === "idle" && (
                <button
                  type="button"
                  onClick={canRun ? run : undefined}
                  disabled={!canRun}
                  className="glint inline-flex h-11 w-full items-center justify-center gap-2 rounded-[5px] font-display text-[13px] font-medium tracking-[0.02em] focus-ring disabled:cursor-not-allowed disabled:opacity-50"
                  style={{
                    background: "var(--accent-electric)",
                    color: "#fff",
                    boxShadow:
                      "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                  }}
                >
                  <UploadCloud size={14} />
                  <span>{labels.action.apply}</span>
                </button>
              )}
              {!canRun && status === "idle" && applyDisabledLabel && (
                <p
                  className="text-center font-body text-[10.5px]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  {applyDisabledLabel}
                </p>
              )}

              <ProcessingStatus
                status={status}
                progress={progress}
                errorMessage={errorMessage}
                onRetry={retry}
                onDownload={download}
                onReset={onReset}
                labels={labels.processing}
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 6.6: Type check**

Run:
```
pnpm exec tsc --noEmit
```
Expected: PASS. (No callers yet — wired up in Task 7.)

- [ ] **Step 6.7: Commit**

```
git add src/components/tools/ppt-background/
git commit -m "feat(ppt-background): add silver-tone tool component + sub-components

- PptBackgroundTool: state host + 2-pane layout per spec §6.
- ModeSelector: 3-way segmented control (all/master/specific).
- SlideThumbStrip: auto-fill grid; clickable when mode === 'specific-slides',
  read-only otherwise.
- BackgroundPicker: preview card + compact direct upload + InlineGallery.
- PptConversionGuide: silver-tone .ppt -> .pptx guidance (replaces amber).
- Labels passed in from the caller (i18n at the page layer)."
```

---

### Task 7: i18n keys + page wrapper + Screen3 wiring

Add all the strings, write a small helper that constructs the label bundle for `PptBackgroundTool`, replace the route page body, and swap the Screen3 placeholder for the real component.

**Files:**
- Modify: `src/i18n/dictionaries/ko.json`
- Modify: `src/i18n/dictionaries/en.json`
- Modify: `src/lib/constants.ts` (description tweak)
- Create: `src/components/tools/ppt-background/labels.ts`
- Modify: `src/app/[lang]/(chrome)/tools/ppt-background/page.tsx`
- Modify: `src/components/landing/Screen3Workspace.tsx`

- [ ] **Step 7.1: Add Korean keys**

Open `src/i18n/dictionaries/ko.json`. Replace the existing `"ppt-background"` entry under `"tools"` with the expanded shape, and leave the other tool entries untouched.

Change:
```json
    "ppt-background": { "title": "PPT 배경 바꾸기", "description": "슬라이드 배경을 한 번에 일괄 교체합니다." },
```
to:
```json
    "ppt-background": {
      "title": "PPT 배경 바꾸기",
      "description": "PPTX 슬라이드 배경을 한 번에 일괄 교체합니다.",
      "page": {
        "header": {
          "title": "PPTX 배경 일괄 변경",
          "description": "PPTX 슬라이드의 배경 이미지를 한 번에 교체합니다."
        },
        "upload": {
          "dropzoneLabel": "PPTX 파일을 드래그하거나 클릭하여 업로드",
          "dropzoneHint": ".pptx 형식을 지원합니다",
          "pptDetected": "이 파일(.ppt)은 변환이 필요합니다. 아래 안내를 따라 .pptx로 변환 후 다시 업로드하세요."
        },
        "conversion": {
          "heading": "이 파일은 .pptx로 변환이 필요합니다",
          "note": "이미지 추출 기능은 .ppt 파일도 지원합니다.",
          "methods": [
            {
              "title": "Microsoft PowerPoint",
              "steps": [
                ".ppt 파일을 PowerPoint에서 열기",
                "파일 → 다른 이름으로 저장",
                "파일 형식에서 PowerPoint 프레젠테이션 (*.pptx) 선택 후 저장"
              ]
            },
            {
              "title": "Google 슬라이드 (무료, 설치 불필요)",
              "steps": [
                "slides.google.com 접속 후 Google 드라이브에 .ppt 파일 업로드",
                "업로드된 파일을 Google 슬라이드로 열기",
                "파일 → 다운로드 → Microsoft PowerPoint (.pptx)"
              ],
              "linkLabel": "slides.google.com",
              "linkHref": "https://slides.google.com"
            },
            {
              "title": "LibreOffice Impress (무료 설치형)",
              "steps": [
                "LibreOffice 설치 후 .ppt 파일 열기",
                "파일 → 다른 이름으로 저장",
                "파일 형식 PowerPoint 2007-365 (.pptx) 선택 후 저장"
              ],
              "linkLabel": "LibreOffice",
              "linkHref": "https://www.libreoffice.org/download"
            }
          ]
        },
        "fileStatus": {
          "slideCountTemplate": "{n}개 슬라이드",
          "changeFile": "다른 파일 선택",
          "analyzing": "슬라이드 배경을 분석하는 중…"
        },
        "mode": {
          "label": "적용 범위",
          "optionAll": "전체",
          "optionMaster": "마스터",
          "optionSpecific": "지정",
          "masterNote": "개별 슬라이드에 자체 배경이 설정된 경우, 마스터 배경이 적용되지 않을 수 있습니다.",
          "specificInput": "예: 1, 3, 5-7",
          "specificSelectAll": "전체 선택",
          "specificClear": "선택 해제",
          "specificHint": "썸네일을 클릭하거나 위에 범위를 입력하세요"
        },
        "thumbnails": {
          "heading": "슬라이드",
          "empty": "배경 없음",
          "sourceSlide": "슬라이드",
          "sourceLayout": "레이아웃",
          "sourceMaster": "마스터"
        },
        "background": {
          "heading": "새 배경",
          "preview": "미리보기",
          "empty": "아직 배경이 선택되지 않았습니다",
          "fromGallery": "갤러리에서 선택한 배경",
          "fromUpload": "직접 업로드한 배경",
          "clear": "선택 해제",
          "uploadLabel": "이미지 업로드",
          "uploadHint": "JPG, PNG 지원"
        },
        "gallery": {
          "heading": "배경 갤러리",
          "countSuffixTemplate": "({n}개 이미지)",
          "categoryAll": "전체",
          "categoryGradient": "그라디언트",
          "categoryNature": "자연",
          "categoryTexture": "텍스쳐",
          "categoryPattern": "패턴",
          "empty": "해당 카테고리에 이미지가 없습니다"
        },
        "action": {
          "apply": "배경 변경 적용",
          "applyDisabledHint": "배경 이미지를 먼저 선택하세요",
          "specificEmpty": "적용할 슬라이드를 선택하세요"
        },
        "processing": {
          "processing": "변환 중…",
          "done": "완료",
          "doneBody": "PPTX가 준비되었습니다.",
          "download": "다운로드",
          "error": "오류 발생",
          "errorBody": "처리 중 문제가 발생했습니다. 다시 시도해 주세요.",
          "retry": "재시도",
          "reset": "다시 작업하기"
        }
      }
    },
```

- [ ] **Step 7.2: Add English keys**

Open `src/i18n/dictionaries/en.json`. Replace the existing `"ppt-background"` entry similarly:

```json
    "ppt-background": {
      "title": "Change PPT background",
      "description": "Replace the background across every slide of a .pptx file at once.",
      "page": {
        "header": {
          "title": "Replace PPTX backgrounds",
          "description": "Swap the background image across every slide of a .pptx file at once."
        },
        "upload": {
          "dropzoneLabel": "Drop a PPTX file here, or click to browse",
          "dropzoneHint": "Supports .pptx files",
          "pptDetected": "This .ppt file needs to be converted. Follow one of the methods below to save it as .pptx, then upload again."
        },
        "conversion": {
          "heading": "This file needs to be converted to .pptx",
          "note": "Image extraction does work with .ppt files.",
          "methods": [
            {
              "title": "Microsoft PowerPoint",
              "steps": [
                "Open the .ppt in PowerPoint",
                "File → Save As",
                "Choose PowerPoint Presentation (*.pptx) and save"
              ]
            },
            {
              "title": "Google Slides (free, no install)",
              "steps": [
                "Visit slides.google.com and upload the .ppt to Google Drive",
                "Open the file in Google Slides",
                "File → Download → Microsoft PowerPoint (.pptx)"
              ],
              "linkLabel": "slides.google.com",
              "linkHref": "https://slides.google.com"
            },
            {
              "title": "LibreOffice Impress (free desktop)",
              "steps": [
                "Install LibreOffice and open the .ppt",
                "File → Save As",
                "Choose PowerPoint 2007-365 (.pptx) and save"
              ],
              "linkLabel": "LibreOffice",
              "linkHref": "https://www.libreoffice.org/download"
            }
          ]
        },
        "fileStatus": {
          "slideCountTemplate": "{n} slides",
          "changeFile": "Choose another file",
          "analyzing": "Analyzing slide backgrounds…"
        },
        "mode": {
          "label": "Apply to",
          "optionAll": "All slides",
          "optionMaster": "Master",
          "optionSpecific": "Specific",
          "masterNote": "Slides with their own backgrounds may override the master background.",
          "specificInput": "e.g. 1, 3, 5-7",
          "specificSelectAll": "Select all",
          "specificClear": "Clear",
          "specificHint": "Click thumbnails or type a range above"
        },
        "thumbnails": {
          "heading": "Slides",
          "empty": "No background",
          "sourceSlide": "Slide",
          "sourceLayout": "Layout",
          "sourceMaster": "Master"
        },
        "background": {
          "heading": "New background",
          "preview": "Preview",
          "empty": "No background selected yet",
          "fromGallery": "From the gallery",
          "fromUpload": "Uploaded image",
          "clear": "Clear selection",
          "uploadLabel": "Upload image",
          "uploadHint": "JPG, PNG"
        },
        "gallery": {
          "heading": "Background gallery",
          "countSuffixTemplate": "({n} images)",
          "categoryAll": "All",
          "categoryGradient": "Gradient",
          "categoryNature": "Nature",
          "categoryTexture": "Texture",
          "categoryPattern": "Pattern",
          "empty": "No images in this category"
        },
        "action": {
          "apply": "Apply background",
          "applyDisabledHint": "Choose a background image first",
          "specificEmpty": "Select at least one slide"
        },
        "processing": {
          "processing": "Converting…",
          "done": "Done",
          "doneBody": "Your .pptx is ready.",
          "download": "Download",
          "error": "Error",
          "errorBody": "Something went wrong. Please try again.",
          "retry": "Retry",
          "reset": "Reset"
        }
      }
    },
```

- [ ] **Step 7.3: Verify Dictionary type still loads**

Look at `src/i18n/config.ts` to see if `Dictionary` is statically typed and may complain about the deepened `ppt-background` shape. Run:
```
pnpm exec tsc --noEmit
```
Expected behavior:
- If `Dictionary` is `typeof ko` (inferred from the JSON import), TypeScript will pick up the new shape automatically and pass.
- If `Dictionary` is a hand-written narrow type, errors will surface. **In that case**, open `src/i18n/config.ts` and widen the `"ppt-background"` entry to include `page: typeof ko["tools"]["ppt-background"]["page"]` (or simply re-derive the whole `Dictionary` from the JSON import). Re-run `pnpm exec tsc --noEmit` until it passes.

(Do not commit yet — the dictionary changes commit together with the page wrapper below.)

- [ ] **Step 7.4: Tweak `src/lib/constants.ts`**

In `src/lib/constants.ts`, change the `ppt-background` description to match the new dictionary value (lines 35–42 of the current file):

Find:
```ts
    description: "슬라이드 배경을 한 번에 일괄 교체합니다.",
```
inside the `ppt-background` entry, change to:
```ts
    description: "PPTX 슬라이드 배경을 한 번에 일괄 교체합니다.",
```

(This `constants.ts` description is the fallback string used when the dictionary isn't available; the live UI reads from the dictionary via `dict.tools["ppt-background"].description`.)

- [ ] **Step 7.5: Create the `labels.ts` builder**

Create `src/components/tools/ppt-background/labels.ts`:

```ts
import type { Dictionary } from "@/i18n/config";
import type { GalleryCategory } from "@/lib/gallery/types";
import type { PptBackgroundToolLabels } from "./PptBackgroundTool";

type PptBgPageDict = Dictionary["tools"]["ppt-background"]["page"];

function template(str: string, vars: Record<string, string | number>): string {
  return str.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ""));
}

export function buildPptBackgroundLabels(
  dict: Dictionary,
): PptBackgroundToolLabels {
  const p: PptBgPageDict = dict.tools["ppt-background"].page;

  const categoryByKey: Record<GalleryCategory, string> = {
    gradient: p.gallery.categoryGradient,
    nature: p.gallery.categoryNature,
    texture: p.gallery.categoryTexture,
    pattern: p.gallery.categoryPattern,
  };

  return {
    header: p.header,
    upload: p.upload,
    conversion: {
      heading: p.conversion.heading,
      note: p.conversion.note,
      methods: p.conversion.methods.map((m) => ({
        title: m.title,
        steps: m.steps,
        linkLabel: "linkLabel" in m ? m.linkLabel : undefined,
        linkHref: "linkHref" in m ? m.linkHref : undefined,
      })),
    },
    fileStatus: {
      slideCount: (n) => template(p.fileStatus.slideCountTemplate, { n }),
      changeFile: p.fileStatus.changeFile,
      analyzing: p.fileStatus.analyzing,
    },
    mode: p.mode,
    thumbnails: {
      heading: p.thumbnails.heading,
      empty: p.thumbnails.empty,
      sourceByKey: {
        slide: p.thumbnails.sourceSlide,
        layout: p.thumbnails.sourceLayout,
        master: p.thumbnails.sourceMaster,
      },
    },
    background: p.background,
    gallery: {
      heading: p.gallery.heading,
      countSuffix: (n) => template(p.gallery.countSuffixTemplate, { n }),
      categoryAll: p.gallery.categoryAll,
      categoryByKey,
      empty: p.gallery.empty,
    },
    action: p.action,
    processing: p.processing,
  };
}
```

- [ ] **Step 7.6: Replace the standalone page**

Replace the entire contents of `src/app/[lang]/(chrome)/tools/ppt-background/page.tsx` with:

```tsx
import { getDictionary } from "@/i18n/dictionaries";
import { PptBackgroundTool } from "@/components/tools/ppt-background/PptBackgroundTool";
import { buildPptBackgroundLabels } from "@/components/tools/ppt-background/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

export default async function PptBackgroundPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(lang);
  const labels = buildPptBackgroundLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PptBackgroundTool labels={labels} />
    </div>
  );
}
```

If `@/i18n/dictionaries` doesn't expose a function with that exact name, open that file and use whichever export it provides (e.g. `getDict(lang)` or `loadDictionary(lang)`). Adjust the import and call accordingly. Re-run `pnpm exec tsc --noEmit` to confirm.

- [ ] **Step 7.7: Wire `Screen3Workspace` to the real component**

In `src/components/landing/Screen3Workspace.tsx`, replace the placeholder `<div>` introduced in Task 1.2 (the entire `tool.slug === "ppt-background" ? (...) : (...)` ternary inside the `<div className="px-6 py-5">` block) with:

```tsx
              <div className="px-6 py-5">
                {tool.slug === "ppt-background" ? (
                  <PptBackgroundTool labels={buildPptBackgroundLabels(dict)} />
                ) : (
                  <>
                    <Link
                      href={toolHref}
                      className="rounded-[8px] border-2 border-dashed px-6 py-7 flex flex-col items-center justify-center text-center transition-colors hover:border-[color:var(--accent-electric)]"
                      style={{
                        borderColor: "var(--hairline)",
                        background: "var(--surface-2)",
                      }}
                    >
                      <div
                        className="w-10 h-10 rounded-[4px] flex items-center justify-center mb-2.5"
                        style={{
                          background: "var(--surface)",
                          border: "1px solid var(--border)",
                          color: "var(--ink-strong)",
                        }}
                      >
                        <UploadCloud size={16} />
                      </div>
                      <div
                        className="font-display text-[14px] font-semibold leading-[1.2] font-ko"
                        style={{ color: "var(--headline)" }}
                      >
                        {dict.common.drop}
                      </div>
                      <div
                        className="mt-0.5 font-body text-[11px]"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {dict.common.click}
                      </div>

                      <span
                        className="mt-4 inline-flex items-center gap-2 px-6 h-11 rounded-[5px] font-display text-[13.5px] font-medium tracking-[0.02em] focus-ring glint"
                        style={{
                          background: "var(--accent-electric)",
                          color: "#fff",
                          boxShadow:
                            "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                        }}
                      >
                        <UploadCloud size={14} />
                        <span>{dict.common.openTool}</span>
                      </span>
                    </Link>

                    <div
                      className="mt-4 flex items-center justify-center gap-4 font-body text-[9.5px] tracking-[0.15em] uppercase"
                      style={{ color: "var(--ink-soft)" }}
                    >
                      <span className="flex items-center gap-1.5">
                        <ShieldCheck size={10} /> {dict.status.inBrowser}
                      </span>
                      <span style={{ background: "var(--border)" }} className="w-px h-3" />
                      <span className="flex items-center gap-1.5">
                        <InfinityIcon size={10} /> {dict.status.unlimited}
                      </span>
                      <span style={{ background: "var(--border)" }} className="w-px h-3" />
                      <span className="flex items-center gap-1.5">
                        <Zap size={10} /> {dict.status.noUpload}
                      </span>
                    </div>
                  </>
                )}
              </div>
```

Add the two new imports at the top of the file (next to the existing brand/component imports):

```tsx
import { PptBackgroundTool } from "@/components/tools/ppt-background/PptBackgroundTool";
import { buildPptBackgroundLabels } from "@/components/tools/ppt-background/labels";
```

Note: `Screen3Workspace` is the `"use client"` component that wraps the inline workspace card. The card's outer wrapper sets `width: "min(var(--tweak-workspace-width, 620px), calc(100vw - 32px))"` (line 105 of the current file). With the workspace width bumped in Task 1.1, the inline card now matches the standalone page width.

- [ ] **Step 7.8: Type check**

Run:
```
pnpm exec tsc --noEmit
```
Expected: PASS.

- [ ] **Step 7.9: Commit**

```
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json src/i18n/config.ts src/lib/constants.ts src/components/tools/ppt-background/labels.ts src/app/[lang]/(chrome)/tools/ppt-background/page.tsx src/components/landing/Screen3Workspace.tsx
git commit -m "feat(ppt-background): i18n + wire standalone page and Screen3 inline mount

- Add tools.ppt-background.page.* keys in ko/en (full body strings).
- Tighten the tools.ppt-background.description string to mention .pptx.
- labels.ts builds the typed label bundle from the dictionary using
  template placeholders for {n}.
- Standalone /(chrome)/tools/ppt-background page mounts <PptBackgroundTool/>
  inside a workspace-width container.
- Screen3Workspace renders <PptBackgroundTool/> inline for slug === 'ppt-background'.

(config.ts only included in this commit if its Dictionary type needed
widening — drop the path from `git add` otherwise.)"
```

If `src/i18n/config.ts` wasn't actually modified in Step 7.3, drop it from the `git add` line.

---

### Task 8: Verification pass

Static checks + manual visual checklist. The user will run the dev server; the agent does not start it.

**Files:** none modified directly. Documents any small follow-up tweaks as their own atomic commits.

- [ ] **Step 8.1: Full type check**

```
pnpm exec tsc --noEmit
```
Expected: PASS.

- [ ] **Step 8.2: Production build**

```
pnpm build
```
Expected: build succeeds. If any picsum URL or data URL triggers a build-time issue, double-check that `InlineGallery`/`SlideThumbStrip` use plain `<img>` (not `next/image`). The plan already uses `<img>` for these surfaces.

- [ ] **Step 8.3: Hand off to user for visual verification**

Recap to the user (in Korean per `ontab_conventions`):

> 정적 검증 통과. 본인이 `pnpm dev` 띄워서 아래 4조합 시각 확인 부탁:
>
> **1280×800 viewport · light/dark × KO/EN**:
>
> - `/` 진입 → Screen3 워크스페이스에 ppt-background 인라인이 트레이 배경 풀블리드 위에서 폭 일관성 유지
> - 직링크 `/{ko|en}/tools/ppt-background` 동일 본문 렌더
> - 빈 상태: 중앙 PPTX dropzone, 본문 전체 스크롤 없음
> - .pptx 업로드 → 2단 작업면 진입, 본문 전체 스크롤 없음
> - 모드 세그먼트 토글 (전체/마스터/지정) 정상 동작
> - "지정" 모드:
>   - 좌측 썸네일 클릭 → 선택 outline·체크 배지 표시
>   - 텍스트 입력 (`1, 3, 5-7`) → debounce 300ms 후 그리드 동기
>   - 전체 선택 / 선택 해제 버튼
> - 우측 BackgroundPicker:
>   - 직접 업로드 → 미리보기 카드 표시
>   - 갤러리 카테고리 4종 토글 → 그리드 필터
>   - 갤러리 이미지 선택 → 미리보기 + 갤러리 자동 접힘
> - "배경 변경 적용" 클릭 → ProcessingStatus 진행률 → 다운로드 + "다시 작업하기" → 빈 상태 복귀
> - .ppt 업로드 → 빈 상태 유지 + dropzone 그대로 + 가이드 펼침. 변환한 .pptx를 같은 dropzone에 다시 올리면 정상 흐름 진입

- [ ] **Step 8.4: Address any visual fixes**

If the user reports a tweak (e.g. workspace width too wide/narrow, color too saturated, gallery thumbnail too tall), make the targeted change and commit it atomically with a clear message. Do not bundle unrelated tweaks.

Examples of likely small adjustments and where to make them:
- Workspace width: `src/app/globals.css` `--tweak-workspace-width`.
- Gallery thumbnail max-height: `InlineGallery.tsx` `style={{ maxHeight: "260px" }}`.
- Slide thumbnail max-height: `SlideThumbStrip.tsx` `style={{ maxHeight: "260px" }}`.
- `toolcard` material class on gallery items: `InlineGallery.tsx`, add `toolcard` to the card class string if desired.

- [ ] **Step 8.5: Final spec sync (if scope drifted)**

If anything material diverged from the spec during implementation (e.g. workspace width landed at 960 instead of 980, or a sub-component was renamed), update `docs/superpowers/specs/2026-05-14-ontab-phase-1-ppt-background-design.md` to reflect what shipped. Commit:

```
git add docs/superpowers/specs/2026-05-14-ontab-phase-1-ppt-background-design.md
git commit -m "docs(spec): sync ppt-background spec with as-shipped values"
```

(`docs/superpowers/` is gitignored, so this commit will be a no-op in the diff — skip if nothing needs syncing.)

- [ ] **Step 8.6: Hand off for PR**

PR creation is a hard stop. Recap to the user:

> 모든 검증 통과. 푸시 + PR 생성 진행할까요? (브랜치: `feat/ontab-phase-1-ppt-background`)

Wait for explicit "go" before any `git push` or `gh pr create`.

---

## Self-Review

- **Spec coverage:**
  - §3.1 컴포넌트 트리 → Tasks 2, 3, 6 (모든 파일 생성·수정).
  - §3.2 라우트 구조 → Task 7 (변경 없이 유지, page.tsx 본문만 교체).
  - §3.3 상태 흐름 → Task 6.5 (PptBackgroundTool 상태 호스트).
  - §3.4 양방향 동기 → Task 2.2 (PageRangeSelector debounce + composingRef).
  - §4.1 BgMode 확장 → Task 5.
  - §4.2 갤러리 데이터 → Task 4.2.
  - §5 표면 silver 톤 매핑 → Tasks 3, 4.3, 6 (semantic alias만 사용, 새 토큰 없음).
  - §6 레이아웃 → Task 6.5 (empty / 2-pane / .ppt 분기), Task 7.6 (workspace-width container).
  - §7 i18n → Task 7.1–7.2 (전체 키 추가).
  - §8 검증 → Task 8.
- **Placeholder scan:** clean. 모든 step에 실제 코드 또는 명시적 명령. 추후 결정 사항은 spec §10에 격리되어 있으며 plan은 해당 사항(예: workspace-width 980px)을 합리적 기본값으로 박고 Task 8.4에서 미세 조정 여지를 둠.
- **Type consistency:**
  - `BgMode = "all-slides" | "master" | "specific-slides"` Tasks 5, 6.5 일치.
  - `GalleryCategory = "gradient" | "nature" | "texture" | "pattern"` Tasks 4.1, 4.2, 4.3, 6.4, 6.5, 7.5 일치.
  - `PageRangeSelectorProps` signature Tasks 2.2, 6.5 일치 (`totalPages`, `selected`, `onChange`, `inputPlaceholder`, `selectAllLabel`, `clearLabel`, `children`).
  - `ProcessingStatusProps.onReset` Tasks 3.1, 6.5 일치.
  - `PptBackgroundToolLabels` Tasks 6.5, 7.5 일치 (labels.ts가 정확히 같은 shape 빌드).
- **Test coverage:** vitest 미도입 결정대로 자동 테스트 0건. spec §8.1 (자동) 항목은 plan에서 명시적으로 deferred 처리, §8.2 (수동) 항목은 Task 8.3 체크리스트로 1:1 매핑.

Plan complete and saved to `docs/superpowers/plans/2026-05-14-ontab-phase-1-ppt-background.md`.
