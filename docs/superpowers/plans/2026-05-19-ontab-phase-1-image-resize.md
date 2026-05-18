# Ontab Phase 1 — `image-resize` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use `superpowers:subagent-driven-development` to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate the `image-resize` tool to the silver design system, collapse its 3-mode UI into a single screen driven by a "왜곡 없이 자르기" checkbox, absorb the two `IMPROVEMENTS.md` items (resolution presets + aspect-ratio presets), extend `CropSelector` with resize handles, introduce a module-scoped tool-handoff store that forwards the resized image to `image-compress`, and mount it inline in `Screen3Workspace`.

**Architecture:** Single shared `<ImageResizeTool/>` component mounted at both the deep-link route (`/{locale}/tools/image-resize`) and inline inside `Screen3Workspace` for `slug === "image-resize"`. Two-pane layout (left: preview + crop UI; right: file info, W/H input + lock + checkbox, size/ratio presets, apply, result card). Pure-function modules — `maxFitCrop`, `aspectLockedResize`, `toolHandoff` — are introduced with vitest TDD coverage. `CropSelector` is extended in-place with 8 resize handles whose math delegates to `aspectLockedResize`. `image-compress` gains a `useEffect` that consumes any staged files; its silver migration remains a future PR.

**Tech Stack:** Next 16 App Router, React 19, TypeScript 5, Tailwind 4 + silver tokens in `globals.css`, `lucide-react`, vitest 3 (node env). No new runtime or dev deps.

**Spec:** `docs/superpowers/specs/2026-05-19-image-resize-migration-design.md`

**Branch:** `feat/ontab-phase-1-image-resize` (already checked out at plan-writing time; PR #4 vitest setup already merged into master).

**Conventions reminders:**
- One task at a time, user approval between tasks (memory `ontab_conventions`).
- Subagent must NOT run `pnpm dev` (no interactive Ctrl+C). Verification per task = `pnpm test` (when tests exist) + `pnpm exec tsc --noEmit`; full `pnpm build` once at the end.
- Never `git add -A` — stage explicit paths.
- Push and PR creation are hard stops, user-confirmed only.
- Commit message body in English; conversation in Korean is fine but does not affect commits.
- Pure-function logic (Task 1, 2, 3) follows superpowers TDD: red → green → refactor.
- UI components (Task 5+) verified via `tsc` + `pnpm build` + later manual `/qa` after plan completes. Component-level tests are deferred (jsdom not installed).

---

## File map

**Create:**
- `src/lib/image/maxFitCrop.ts` (+ `.test.ts`)
- `src/lib/image/aspectLockedResize.ts` (+ `.test.ts`)
- `src/lib/common/toolHandoff.ts` (+ `.test.ts`)
- `src/components/tools/image-resize/ImageResizeTool.tsx`
- `src/components/tools/image-resize/ImageResizePreview.tsx`
- `src/components/tools/image-resize/ImageResizeControls.tsx`
- `src/components/tools/image-resize/ImageResizePresets.tsx`
- `src/components/tools/image-resize/ImageResizeResult.tsx`
- `src/components/tools/image-resize/labels.ts`

**Modify:**
- `src/components/image/CropSelector.tsx` — add 8 resize handles, delegate math to `aspectLockedResize`, refactor `initCrop` to call `maxFitCrop`.
- `src/lib/image/resizeImage.ts` — widen `RESIZE_PRESETS` (FHD/HD/모바일/정방형) and export new `ASPECT_PRESETS` constant.
- `src/app/[lang]/(chrome)/tools/image-resize/page.tsx` — replace body with silver header + `<ImageResizeTool/>` mount.
- `src/app/[lang]/(chrome)/tools/image-compress/page.tsx` — consume staged files on mount.
- `src/components/landing/Screen3Workspace.tsx` — add `slug === "image-resize"` inline branch (mirrors the `ppt-background` pattern).
- `src/i18n/dictionaries/ko.json` + `src/i18n/dictionaries/en.json` — `tools.image-resize.page.*` keys.
- `src/lib/constants.ts` — minor `tools.image-resize` description tweak if needed (English copy).

---

## Task 1: `maxFitCrop` pure function (TDD)

Extracts the "largest crop rectangle of a given target ratio that fits inside an image" logic from `CropSelector.initCrop` into a reusable pure function. This is the algorithm used by aspect-ratio preset clicks, by the "왜곡 없이 자르기" checkbox toggle, and by `CropSelector` itself.

**Files:**
- Create: `src/lib/image/maxFitCrop.ts`
- Create: `src/lib/image/maxFitCrop.test.ts`

- [ ] **Step 1.1: Write the failing test**

Create `src/lib/image/maxFitCrop.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import { maxFitCrop } from "./maxFitCrop";

describe("maxFitCrop", () => {
  it("returns a centred crop when target ratio matches the image ratio", () => {
    expect(maxFitCrop({ w: 1000, h: 500 }, 2, 1)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 500,
    });
  });

  it("fills width and centres vertically when target is wider than image", () => {
    // 300×400 image (portrait), 4:3 target (landscape) → width-limited
    expect(maxFitCrop({ w: 300, h: 400 }, 4, 3)).toEqual({
      x: 0,
      y: Math.round((400 - 225) / 2),
      width: 300,
      height: 225,
    });
  });

  it("fills height and centres horizontally when target is taller than image", () => {
    // 1000×500 image (landscape), 9:16 target (portrait) → height-limited
    expect(maxFitCrop({ w: 1000, h: 500 }, 9, 16)).toEqual({
      x: Math.round((1000 - Math.round(500 * 9 / 16)) / 2),
      y: 0,
      width: Math.round(500 * 9 / 16),
      height: 500,
    });
  });

  it("handles square target on landscape image", () => {
    expect(maxFitCrop({ w: 1000, h: 500 }, 1, 1)).toEqual({
      x: Math.round((1000 - 500) / 2),
      y: 0,
      width: 500,
      height: 500,
    });
  });

  it("handles square target on portrait image", () => {
    expect(maxFitCrop({ w: 500, h: 1000 }, 1, 1)).toEqual({
      x: 0,
      y: Math.round((1000 - 500) / 2),
      width: 500,
      height: 500,
    });
  });

  it("rounds to integer pixels", () => {
    // 1000×500, 16:9 → width-limited: cropH = 1000 * 9/16 = 562.5 → 563.
    // But 563 > 500, so height-limited instead: cropW = 500 * 16/9 ≈ 888.89 → 889
    const result = maxFitCrop({ w: 1000, h: 500 }, 16, 9);
    expect(Number.isInteger(result.x)).toBe(true);
    expect(Number.isInteger(result.y)).toBe(true);
    expect(Number.isInteger(result.width)).toBe(true);
    expect(Number.isInteger(result.height)).toBe(true);
    expect(result.width).toBe(889);
    expect(result.height).toBe(500);
  });

  it("returns a zero-size rect for non-positive image dims", () => {
    expect(maxFitCrop({ w: 0, h: 500 }, 1, 1)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
    expect(maxFitCrop({ w: 100, h: 0 }, 1, 1)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });

  it("returns a zero-size rect for non-positive target dims", () => {
    expect(maxFitCrop({ w: 100, h: 100 }, 0, 1)).toEqual({
      x: 0,
      y: 0,
      width: 0,
      height: 0,
    });
  });
});
```

- [ ] **Step 1.2: Run test to confirm it fails**

Run: `pnpm test src/lib/image/maxFitCrop.test.ts`
Expected: FAIL — `Failed to resolve import "./maxFitCrop"`.

- [ ] **Step 1.3: Implement `maxFitCrop`**

Create `src/lib/image/maxFitCrop.ts`:

```ts
export interface ImageDims {
  w: number;
  h: number;
}

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Compute the largest axis-aligned rectangle of target ratio (targetW : targetH)
 * that fits inside an image of dimensions `img`, centred on the image.
 *
 * Used for:
 * - aspect-ratio preset clicks (16:9 etc.) → recompute W/H + recentre crop
 * - "왜곡 없이 자르기" checkbox enable → initialise crop rect
 * - CropSelector's initial / target-changed crop placement
 *
 * Returns a zero-size rect if any input dimension is non-positive.
 */
export function maxFitCrop(
  img: ImageDims,
  targetW: number,
  targetH: number,
): CropRect {
  if (img.w <= 0 || img.h <= 0 || targetW <= 0 || targetH <= 0) {
    return { x: 0, y: 0, width: 0, height: 0 };
  }

  const ratioTarget = targetW / targetH;
  const ratioImage = img.w / img.h;

  let cropW: number;
  let cropH: number;
  if (ratioTarget >= ratioImage) {
    // target wider than image → width-limited
    cropW = img.w;
    cropH = Math.round((img.w * targetH) / targetW);
  } else {
    cropH = img.h;
    cropW = Math.round((img.h * targetW) / targetH);
  }

  // Clamp in case rounding pushed us one px past the bound
  cropW = Math.min(cropW, img.w);
  cropH = Math.min(cropH, img.h);

  return {
    x: Math.round((img.w - cropW) / 2),
    y: Math.round((img.h - cropH) / 2),
    width: cropW,
    height: cropH,
  };
}
```

- [ ] **Step 1.4: Run test to confirm it passes**

Run: `pnpm test src/lib/image/maxFitCrop.test.ts`
Expected: PASS — 8/8 tests green.

- [ ] **Step 1.5: Commit**

```bash
git add src/lib/image/maxFitCrop.ts src/lib/image/maxFitCrop.test.ts
git commit -m "feat(image): add maxFitCrop pure function with tests"
```

---

## Task 2: `aspectLockedResize` pure function (TDD)

The math for the new 8-handle, aspect-ratio-locked crop resize. Given a handle name, the previous rect, the current pointer position, the target ratio, and image bounds, returns the new rect — clamped to bounds, preserving ratio.

**Files:**
- Create: `src/lib/image/aspectLockedResize.ts`
- Create: `src/lib/image/aspectLockedResize.test.ts`

- [ ] **Step 2.1: Write the failing test**

Create `src/lib/image/aspectLockedResize.test.ts`:

```ts
import { describe, expect, it } from "vitest";
import {
  aspectLockedResize,
  type ResizeHandle,
} from "./aspectLockedResize";

const bounds = { w: 1000, h: 1000 };
const baseRect = { x: 200, y: 200, width: 400, height: 200 }; // ratio 2:1

describe("aspectLockedResize", () => {
  describe("corner handle 'se' (south-east)", () => {
    const handle: ResizeHandle = "se";

    it("grows the rect when the pointer moves down-right, preserving 2:1 ratio", () => {
      const next = aspectLockedResize(handle, baseRect, { x: 800, y: 500 }, 2, bounds);
      // anchor = nw = (200, 200). Pointer at (800, 500) → desired w=600, h=300.
      // ratio 2:1 honored: cap min(600/2, 300/1) = 300 → w=600, h=300
      expect(next).toEqual({ x: 200, y: 200, width: 600, height: 300 });
    });

    it("clamps when pointer would push the rect past image bounds", () => {
      const next = aspectLockedResize(handle, baseRect, { x: 9999, y: 9999 }, 2, bounds);
      // anchor (200, 200). Max width along x = 800, max height along y = 800.
      // ratio 2:1: pick the limiting dimension. 800 width → 400 height ✓.
      // 800 height → 1600 width ✗ exceeds 800 width.
      // → 800×400.
      expect(next).toEqual({ x: 200, y: 200, width: 800, height: 400 });
    });

    it("never shrinks below 1px", () => {
      const next = aspectLockedResize(handle, baseRect, { x: 200, y: 200 }, 2, bounds);
      expect(next.width).toBeGreaterThanOrEqual(1);
      expect(next.height).toBeGreaterThanOrEqual(1);
    });
  });

  describe("corner handle 'nw' (north-west)", () => {
    it("anchors south-east corner when dragging top-left", () => {
      const next = aspectLockedResize("nw", baseRect, { x: 100, y: 250 }, 2, bounds);
      // anchor = se = (600, 400). Pointer at (100, 250) → desired w=500, h=150.
      // ratio 2:1: cap min(500/2, 150/1) = 150 → w=300, h=150.
      // new rect ends at (600,400), so x = 600-300=300, y = 400-150=250.
      expect(next).toEqual({ x: 300, y: 250, width: 300, height: 150 });
    });
  });

  describe("edge handle 'e' (east)", () => {
    it("changes width and adjusts height to preserve ratio, centred vertically", () => {
      const next = aspectLockedResize("e", baseRect, { x: 800, y: 0 }, 2, bounds);
      // anchor = west edge midpoint (200, 300). Desired width = 600.
      // height = 600/2 = 300. y centred → 300 - 150 = 150.
      expect(next).toEqual({ x: 200, y: 150, width: 600, height: 300 });
    });

    it("clamps height when centring would push past top/bottom", () => {
      // baseRect centre y = 300. If asking for very tall rect, top would go negative.
      const next = aspectLockedResize("e", baseRect, { x: 9999, y: 0 }, 2, bounds);
      // pointer x=9999 → desired width = 9999-200 = clamp at right edge first.
      // Max width along x = 800. height = 400. centre y = 300 → y = 100.
      expect(next).toEqual({ x: 200, y: 100, width: 800, height: 400 });
    });
  });

  describe("edge handle 'n' (north)", () => {
    it("changes height and adjusts width to preserve ratio, centred horizontally", () => {
      const next = aspectLockedResize("n", baseRect, { x: 0, y: 100 }, 2, bounds);
      // anchor = south edge midpoint (400, 400). Desired height = 300.
      // width = 300*2 = 600. x centred on 400 → x = 100.
      expect(next).toEqual({ x: 100, y: 100, width: 600, height: 300 });
    });
  });

  it("returns previous rect when the handle is unrecognised", () => {
    // @ts-expect-error testing runtime guard
    expect(aspectLockedResize("bogus", baseRect, { x: 0, y: 0 }, 2, bounds)).toEqual(
      baseRect,
    );
  });
});
```

- [ ] **Step 2.2: Run test to confirm it fails**

Run: `pnpm test src/lib/image/aspectLockedResize.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 2.3: Implement `aspectLockedResize`**

Create `src/lib/image/aspectLockedResize.ts`:

```ts
import type { CropRect, ImageDims } from "./maxFitCrop";

export type ResizeHandle = "n" | "s" | "e" | "w" | "ne" | "nw" | "se" | "sw";

const HANDLES: ReadonlySet<ResizeHandle> = new Set([
  "n",
  "s",
  "e",
  "w",
  "ne",
  "nw",
  "se",
  "sw",
]);

interface Point {
  x: number;
  y: number;
}

/**
 * Compute the rect produced by dragging `handle` to `mouse` while preserving
 * the given aspect ratio (`ratio` = w / h), clamped inside `bounds`.
 *
 * Corner handles anchor the opposite corner.
 * Edge handles anchor the opposite edge's midpoint and centre the rect along
 * the perpendicular axis.
 *
 * Returns `prev` unchanged when given an unknown handle string.
 */
export function aspectLockedResize(
  handle: ResizeHandle,
  prev: CropRect,
  mouse: Point,
  ratio: number,
  bounds: ImageDims,
): CropRect {
  if (!HANDLES.has(handle)) return prev;
  if (ratio <= 0 || bounds.w <= 0 || bounds.h <= 0) return prev;

  const px = clamp(mouse.x, 0, bounds.w);
  const py = clamp(mouse.y, 0, bounds.h);

  // Corner handles: anchor = opposite corner.
  if (handle === "se" || handle === "ne" || handle === "sw" || handle === "nw") {
    const anchorX = handle.endsWith("e") ? prev.x : prev.x + prev.width;
    const anchorY = handle.startsWith("s") ? prev.y : prev.y + prev.height;

    const dx = Math.abs(px - anchorX);
    const dy = Math.abs(py - anchorY);
    // Max width given current direction = distance to bound along x.
    const maxW = handle.endsWith("e") ? bounds.w - anchorX : anchorX;
    const maxH = handle.startsWith("s") ? bounds.h - anchorY : anchorY;

    // Honour ratio: pick the limiting dimension among (dx, dy, maxW, maxH/ratio inversions).
    const wFromMouse = Math.min(dx, maxW);
    const hFromMouse = Math.min(dy, maxH);
    let w = Math.min(wFromMouse, hFromMouse * ratio);
    let h = Math.min(hFromMouse, wFromMouse / ratio);
    // The shorter of the two ratio-derived candidates wins:
    if (w / ratio < h) h = w / ratio;
    else w = h * ratio;

    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));

    const x = handle.endsWith("e") ? anchorX : anchorX - w;
    const y = handle.startsWith("s") ? anchorY : anchorY - h;
    return { x, y, width: w, height: h };
  }

  // Edge handles: anchor = opposite edge midpoint; perpendicular axis recentres.
  if (handle === "e" || handle === "w") {
    const anchorX = handle === "e" ? prev.x : prev.x + prev.width;
    const centreY = prev.y + prev.height / 2;
    const maxW = handle === "e" ? bounds.w - anchorX : anchorX;
    let w = Math.min(Math.abs(px - anchorX), maxW);
    let h = w / ratio;

    // If centring h would push past top or bottom, clamp h and recompute w.
    if (centreY - h / 2 < 0) h = centreY * 2;
    if (centreY + h / 2 > bounds.h) h = (bounds.h - centreY) * 2;
    w = Math.min(w, h * ratio);

    w = Math.max(1, Math.round(w));
    h = Math.max(1, Math.round(h));

    const x = handle === "e" ? anchorX : anchorX - w;
    const y = Math.round(centreY - h / 2);
    return { x, y, width: w, height: h };
  }

  // handle === "n" || handle === "s"
  const anchorY = handle === "s" ? prev.y : prev.y + prev.height;
  const centreX = prev.x + prev.width / 2;
  const maxH = handle === "s" ? bounds.h - anchorY : anchorY;
  let h = Math.min(Math.abs(py - anchorY), maxH);
  let w = h * ratio;

  if (centreX - w / 2 < 0) w = centreX * 2;
  if (centreX + w / 2 > bounds.w) w = (bounds.w - centreX) * 2;
  h = Math.min(h, w / ratio);

  w = Math.max(1, Math.round(w));
  h = Math.max(1, Math.round(h));

  const y = handle === "s" ? anchorY : anchorY - h;
  const x = Math.round(centreX - w / 2);
  return { x, y, width: w, height: h };
}

function clamp(v: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, v));
}
```

- [ ] **Step 2.4: Run test to confirm it passes**

Run: `pnpm test src/lib/image/aspectLockedResize.test.ts`
Expected: PASS — 7/7 tests green.

If any test fails on rounding-off-by-one, adjust the implementation (NOT the test) to produce the documented expected values. The expected values are derived from the algorithm spec.

- [ ] **Step 2.5: Commit**

```bash
git add src/lib/image/aspectLockedResize.ts src/lib/image/aspectLockedResize.test.ts
git commit -m "feat(image): add aspectLockedResize for 8-handle crop math"
```

---

## Task 3: `toolHandoff` module-scoped store (TDD)

Tiny in-memory store for passing `File[]` between tools via SPA navigation. New dep: zero. Lifetime: lives in the module while the SPA stays mounted; cleared on consume; lost on full page reload.

**Files:**
- Create: `src/lib/common/toolHandoff.ts`
- Create: `src/lib/common/toolHandoff.test.ts`

- [ ] **Step 3.1: Write the failing test**

Create `src/lib/common/toolHandoff.test.ts`:

```ts
import { afterEach, describe, expect, it } from "vitest";
import {
  consumeStagedFiles,
  stageFiles,
  __resetHandoffForTests,
} from "./toolHandoff";

function makeFile(name: string): File {
  return new File(["x"], name, { type: "image/png" });
}

afterEach(() => {
  __resetHandoffForTests();
});

describe("toolHandoff", () => {
  it("returns null when nothing has been staged", () => {
    expect(consumeStagedFiles()).toBeNull();
  });

  it("returns the staged payload on first consume", () => {
    const f = makeFile("a.png");
    stageFiles([f], "image-resize");
    expect(consumeStagedFiles()).toEqual({ files: [f], source: "image-resize" });
  });

  it("clears the store after consume — second consume returns null", () => {
    stageFiles([makeFile("a.png")], "image-resize");
    consumeStagedFiles();
    expect(consumeStagedFiles()).toBeNull();
  });

  it("overwrites the previous payload when stage is called twice", () => {
    stageFiles([makeFile("a.png")], "image-resize");
    const b = makeFile("b.png");
    stageFiles([b], "ppt-background");
    expect(consumeStagedFiles()).toEqual({ files: [b], source: "ppt-background" });
  });
});
```

- [ ] **Step 3.2: Run test to confirm it fails**

Run: `pnpm test src/lib/common/toolHandoff.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3.3: Implement `toolHandoff`**

Create `src/lib/common/toolHandoff.ts`:

```ts
/**
 * Module-scoped in-memory store for handing `File[]` between tools via SPA
 * navigation. Producer (the tool that finished work) calls `stageFiles`;
 * consumer (the next tool's page) calls `consumeStagedFiles` on mount.
 *
 * Lifetime: lives in module memory across client-side route transitions;
 * cleared on consume; lost on full page reload (acceptable — user reloading
 * the destination tool is interpreted as "start fresh").
 *
 * No persistence layer (sessionStorage / IndexedDB) by design — that would
 * require Blob serialisation or a dedicated wrapper for marginal benefit.
 */

interface HandoffPayload {
  files: File[];
  source: string;
}

let staged: HandoffPayload | null = null;

export function stageFiles(files: File[], source: string): void {
  staged = { files, source };
}

export function consumeStagedFiles(): HandoffPayload | null {
  const s = staged;
  staged = null;
  return s;
}

/** Test-only escape hatch. Do not call from app code. */
export function __resetHandoffForTests(): void {
  staged = null;
}
```

- [ ] **Step 3.4: Run test to confirm it passes**

Run: `pnpm test src/lib/common/toolHandoff.test.ts`
Expected: PASS — 4/4 tests green.

- [ ] **Step 3.5: Commit**

```bash
git add src/lib/common/toolHandoff.ts src/lib/common/toolHandoff.test.ts
git commit -m "feat(common): add module-scoped toolHandoff store"
```

---

## Task 4: Extend `CropSelector` with 8 resize handles

Add 8 resize handles (4 corners + 4 edges) to the existing crop UI. Handle math delegates to `aspectLockedResize`. `initCrop` is refactored to call `maxFitCrop`. The existing single-block-drag stays as the "move" interaction; new handles are layered on top.

**Files:**
- Modify: `src/components/image/CropSelector.tsx`

- [ ] **Step 4.1: Replace `initCrop` with `maxFitCrop`**

Open `src/components/image/CropSelector.tsx`. At the top of the file (after the existing imports on lines 3–9) add:

```ts
import { maxFitCrop } from "@/lib/image/maxFitCrop";
import {
  aspectLockedResize,
  type ResizeHandle,
} from "@/lib/image/aspectLockedResize";
```

Replace the `initCrop` callback (lines 40–61) with:

```tsx
  const initCrop = useCallback(
    (natW: number, natH: number) => {
      const rect = maxFitCrop({ w: natW, h: natH }, targetWidth, targetHeight);
      setCrop(rect);
      onCropChange(rect);
    },
    [targetWidth, targetHeight, onCropChange],
  );
```

Remove the now-unused `targetAspect` constant on line 38 (it's still used elsewhere — actually it isn't after this refactor; check; if `aspectLockedResize` consumes the ratio, replace any remaining `targetAspect` reference with `targetWidth / targetHeight` inline at the call site in step 4.3).

- [ ] **Step 4.2: Run tsc to confirm no regressions**

Run: `pnpm exec tsc --noEmit`
Expected: clean (no errors). If TypeScript complains about an unused `targetAspect`, delete that line too.

- [ ] **Step 4.3: Add resize state and handlers**

Below the existing `dragging` / `dragStart` refs (around line 36) add:

```tsx
  const [resizing, setResizing] = useState<ResizeHandle | null>(null);
  const resizeStart = useRef<{ rect: CropRect }>({
    rect: { x: 0, y: 0, width: 0, height: 0 },
  });
```

Below `handlePointerUp` (around line 133) add the resize handlers:

```tsx
  const handleResizePointerDown = (
    e: ReactPointerEvent<HTMLDivElement>,
    handle: ResizeHandle,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    setResizing(handle);
    resizeStart.current = { rect: crop };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handleResizePointerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!resizing) return;
    const rectEl = containerRef.current?.querySelector("img");
    if (!rectEl) return;
    const rect = rectEl.getBoundingClientRect();
    const mouseX = (e.clientX - rect.left) / scaleX;
    const mouseY = (e.clientY - rect.top) / scaleY;

    const next = aspectLockedResize(
      resizing,
      resizeStart.current.rect,
      { x: mouseX, y: mouseY },
      targetWidth / targetHeight,
      { w: imgNatural.w, h: imgNatural.h },
    );
    setCrop(next);
    onCropChange(next);
  };

  const handleResizePointerUp = () => {
    setResizing(null);
  };
```

- [ ] **Step 4.4: Render the 8 handles inside the crop box**

Inside the JSX, locate the "Crop handle" div (around line 186) — the `<div className="absolute cursor-move ...">`. After its child grid (the 3×3 thirds overlay, ending around line 202), add (still inside the crop handle div):

```tsx
              {/* 8 resize handles */}
              {(["nw", "n", "ne", "e", "se", "s", "sw", "w"] as const).map((h) => {
                const pos = HANDLE_POSITIONS[h];
                return (
                  <div
                    key={h}
                    role="button"
                    aria-label={`Resize ${h}`}
                    className="absolute size-3 rounded-sm border-2 border-white bg-white/90 shadow"
                    style={{
                      ...pos,
                      cursor: HANDLE_CURSORS[h],
                      touchAction: "none",
                    }}
                    onPointerDown={(e) => handleResizePointerDown(e, h)}
                    onPointerMove={handleResizePointerMove}
                    onPointerUp={handleResizePointerUp}
                  />
                );
              })}
```

Above the component (between the imports and `export function CropSelector`) add the constants:

```ts
const HANDLE_POSITIONS: Record<ResizeHandle, React.CSSProperties> = {
  nw: { top: -6, left: -6 },
  n: { top: -6, left: "calc(50% - 6px)" },
  ne: { top: -6, right: -6 },
  e: { top: "calc(50% - 6px)", right: -6 },
  se: { bottom: -6, right: -6 },
  s: { bottom: -6, left: "calc(50% - 6px)" },
  sw: { bottom: -6, left: -6 },
  w: { top: "calc(50% - 6px)", left: -6 },
};

const HANDLE_CURSORS: Record<ResizeHandle, string> = {
  nw: "nwse-resize",
  n: "ns-resize",
  ne: "nesw-resize",
  e: "ew-resize",
  se: "nwse-resize",
  s: "ns-resize",
  sw: "nesw-resize",
  w: "ew-resize",
};
```

Also import `type React` at the top if not already implicit. (It's already imported via `useCallback` etc. — the `React.CSSProperties` type comes from `@types/react` and is available globally with `react-jsx`. If tsc complains, change to `import type * as React from "react";` above the file.)

- [ ] **Step 4.5: Update the helper text to reflect new capability**

In the JSX bottom paragraph (line 207–209), replace:

```tsx
      <p className="text-sm font-medium">
        영역 선택 <span className="text-xs font-normal text-muted-foreground">(드래그하여 이동)</span>
      </p>
```

with:

```tsx
      <p className="text-sm font-medium">
        영역 선택{" "}
        <span className="text-xs font-normal text-muted-foreground">
          (드래그하여 이동, 모서리로 크기 조절)
        </span>
      </p>
```

- [ ] **Step 4.6: Run verification**

Run: `pnpm test` → all previous tests still pass.
Run: `pnpm exec tsc --noEmit` → clean.

- [ ] **Step 4.7: Commit**

```bash
git add src/components/image/CropSelector.tsx
git commit -m "feat(crop): add 8 resize handles with aspect-locked math"
```

---

## Task 5: Image-resize labels module + i18n keys

Centralised Korean / English strings for the new tool, mirroring the `ppt-background/labels.ts` pattern.

**Files:**
- Create: `src/components/tools/image-resize/labels.ts`
- Modify: `src/i18n/dictionaries/ko.json`
- Modify: `src/i18n/dictionaries/en.json`

- [ ] **Step 5.1: Add Korean dictionary keys**

Open `src/i18n/dictionaries/ko.json`. Locate the `tools.image-resize.page` block (or `tools.image-resize`, depending on existing structure — confirm by reading the file first; if the block does not exist, add it under the appropriate parent). Insert under that block:

```json
"page": {
  "title": "이미지 크기 변경",
  "subtitle": "이미지의 해상도를 원하는 크기 또는 비율로 변경합니다.",
  "originalSize": "원본 크기",
  "widthLabel": "너비 (px)",
  "heightLabel": "높이 (px)",
  "lockAspect": "비율 잠금",
  "unlockAspect": "비율 잠금 해제",
  "cropToggle": "왜곡 없이 자르기",
  "cropToggleHint": "켜면 원본 이미지에서 일부를 잘라내 비율을 맞춥니다. 끄면 이미지가 늘어나거나 찌부러질 수 있습니다.",
  "sizePresetsTitle": "크기 프리셋",
  "ratioPresetsTitle": "비율 프리셋",
  "apply": "크기 변경하기",
  "doneTitle": "변경 완료",
  "download": "다운로드",
  "downloadAgainLabel": "다시 작업하기",
  "compressLink": "압축/변환하러 가기",
  "resultSummary": "{w}×{h} ({size}, {format})",
  "uploadPrompt": "이미지를 드래그하거나 클릭하여 업로드",
  "uploadHint": "JPG, PNG, WebP 파일을 지원합니다."
}
```

(If the existing structure differs — for example, if `description` already lives at `tools.image-resize.description` — keep the existing keys and only add the `page` subtree.)

- [ ] **Step 5.2: Add English dictionary keys**

Open `src/i18n/dictionaries/en.json` and add the parallel `page` block under `tools.image-resize`:

```json
"page": {
  "title": "Resize image",
  "subtitle": "Change image dimensions by exact pixels or aspect ratio.",
  "originalSize": "Original size",
  "widthLabel": "Width (px)",
  "heightLabel": "Height (px)",
  "lockAspect": "Lock aspect ratio",
  "unlockAspect": "Unlock aspect ratio",
  "cropToggle": "Crop without distortion",
  "cropToggleHint": "When on, the image is cropped to match the target ratio. When off, the image is stretched.",
  "sizePresetsTitle": "Size presets",
  "ratioPresetsTitle": "Ratio presets",
  "apply": "Resize",
  "doneTitle": "Resized",
  "download": "Download",
  "downloadAgainLabel": "Start over",
  "compressLink": "Compress / convert",
  "resultSummary": "{w}×{h} ({size}, {format})",
  "uploadPrompt": "Drag an image here, or click to upload",
  "uploadHint": "JPG, PNG, WebP supported."
}
```

- [ ] **Step 5.3: Create `labels.ts`**

Create `src/components/tools/image-resize/labels.ts`:

```ts
import type { Dictionary } from "@/i18n/dictionaries";

export interface ImageResizeLabels {
  title: string;
  subtitle: string;
  originalSize: string;
  widthLabel: string;
  heightLabel: string;
  lockAspect: string;
  unlockAspect: string;
  cropToggle: string;
  cropToggleHint: string;
  sizePresetsTitle: string;
  ratioPresetsTitle: string;
  apply: string;
  doneTitle: string;
  download: string;
  downloadAgainLabel: string;
  compressLink: string;
  resultSummary: string;
  uploadPrompt: string;
  uploadHint: string;
}

export function getImageResizeLabels(dict: Dictionary): ImageResizeLabels {
  const page = dict.tools["image-resize"].page;
  return {
    title: page.title,
    subtitle: page.subtitle,
    originalSize: page.originalSize,
    widthLabel: page.widthLabel,
    heightLabel: page.heightLabel,
    lockAspect: page.lockAspect,
    unlockAspect: page.unlockAspect,
    cropToggle: page.cropToggle,
    cropToggleHint: page.cropToggleHint,
    sizePresetsTitle: page.sizePresetsTitle,
    ratioPresetsTitle: page.ratioPresetsTitle,
    apply: page.apply,
    doneTitle: page.doneTitle,
    download: page.download,
    downloadAgainLabel: page.downloadAgainLabel,
    compressLink: page.compressLink,
    resultSummary: page.resultSummary,
    uploadPrompt: page.uploadPrompt,
    uploadHint: page.uploadHint,
  };
}
```

If `Dictionary` type does not exist at `@/i18n/dictionaries`, inspect the existing `labels.ts` in `ppt-background/` to mirror the exact import path and type pattern (it uses the same approach).

- [ ] **Step 5.4: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean. If the `Dictionary` type complains about the new `page` keys, run `pnpm build` once and inspect the auto-generated type for the dictionary; adjust JSON formatting if it's invalid.

- [ ] **Step 5.5: Commit**

```bash
git add src/i18n/dictionaries/ko.json src/i18n/dictionaries/en.json src/components/tools/image-resize/labels.ts
git commit -m "feat(image-resize): add ko/en i18n keys + labels module"
```

---

## Task 6: Update `RESIZE_PRESETS` and add `ASPECT_PRESETS`

Refine the size preset list (FHD/HD/모바일/정방형) and add a new aspect-ratio preset list. Keep `RESIZE_PRESETS` named export for backwards compat with any other consumer; the new `ASPECT_PRESETS` is additive.

**Files:**
- Modify: `src/lib/image/resizeImage.ts`

- [ ] **Step 6.1: Replace `RESIZE_PRESETS` content and add `ASPECT_PRESETS`**

Open `src/lib/image/resizeImage.ts`. Replace lines 7–13 (the existing `RESIZE_PRESETS` array) with:

```ts
export const RESIZE_PRESETS: ResizePreset[] = [
  { label: "FHD (1920×1080)", width: 1920, height: 1080 },
  { label: "HD (1280×720)", width: 1280, height: 720 },
  { label: "정방형 (1080×1080)", width: 1080, height: 1080 },
  { label: "모바일 (390×844)", width: 390, height: 844 },
];

export interface AspectPreset {
  label: string;
  w: number;
  h: number;
}

export const ASPECT_PRESETS: AspectPreset[] = [
  { label: "1:1", w: 1, h: 1 },
  { label: "16:9", w: 16, h: 9 },
  { label: "9:16", w: 9, h: 16 },
  { label: "4:3", w: 4, h: 3 },
  { label: "3:4", w: 3, h: 4 },
];
```

- [ ] **Step 6.2: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean (no consumer of `RESIZE_PRESETS` should break — the shape is unchanged, only entries differ).

- [ ] **Step 6.3: Commit**

```bash
git add src/lib/image/resizeImage.ts
git commit -m "feat(image-resize): refine size presets, add aspect presets"
```

---

## Task 7: `ImageResizePresets` component

The right-bottom "Size / Ratio presets" two-column panel.

**Files:**
- Create: `src/components/tools/image-resize/ImageResizePresets.tsx`

- [ ] **Step 7.1: Create the component**

Create `src/components/tools/image-resize/ImageResizePresets.tsx`:

```tsx
"use client";

import {
  ASPECT_PRESETS,
  RESIZE_PRESETS,
  type AspectPreset,
  type ResizePreset,
} from "@/lib/image/resizeImage";

interface ImageResizePresetsProps {
  sizePresetsTitle: string;
  ratioPresetsTitle: string;
  onSizePreset: (preset: ResizePreset) => void;
  onRatioPreset: (preset: AspectPreset) => void;
}

export function ImageResizePresets({
  sizePresetsTitle,
  ratioPresetsTitle,
  onSizePreset,
  onRatioPreset,
}: ImageResizePresetsProps) {
  return (
    <div className="grid grid-cols-2 gap-4">
      <PresetColumn title={sizePresetsTitle}>
        {RESIZE_PRESETS.map((p) => (
          <PresetChip key={p.label} onClick={() => onSizePreset(p)}>
            {p.label}
          </PresetChip>
        ))}
      </PresetColumn>
      <PresetColumn title={ratioPresetsTitle}>
        {ASPECT_PRESETS.map((p) => (
          <PresetChip key={p.label} onClick={() => onRatioPreset(p)}>
            {p.label}
          </PresetChip>
        ))}
      </PresetColumn>
    </div>
  );
}

function PresetColumn({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-2">
      <p
        className="font-display text-[11.5px] font-medium"
        style={{ color: "var(--ink-soft)" }}
      >
        {title}
      </p>
      <div className="flex flex-wrap gap-1.5">{children}</div>
    </div>
  );
}

function PresetChip({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="rounded-[5px] border px-2.5 py-1 font-display text-[11.5px] transition-colors hover:border-[color:var(--accent-electric)]"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        color: "var(--ink-strong)",
      }}
    >
      {children}
    </button>
  );
}
```

- [ ] **Step 7.2: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 7.3: Commit**

```bash
git add src/components/tools/image-resize/ImageResizePresets.tsx
git commit -m "feat(image-resize): add presets panel component"
```

---

## Task 8: `ImageResizeControls` component

W/H inputs + lock toggle + "왜곡 없이 자르기" checkbox.

**Files:**
- Create: `src/components/tools/image-resize/ImageResizeControls.tsx`

- [ ] **Step 8.1: Create the component**

Create `src/components/tools/image-resize/ImageResizeControls.tsx`:

```tsx
"use client";

import { LockIcon, UnlockIcon } from "lucide-react";

interface ImageResizeControlsProps {
  widthLabel: string;
  heightLabel: string;
  lockAspectLabel: string;
  unlockAspectLabel: string;
  cropToggleLabel: string;
  cropToggleHint: string;
  widthValue: string;
  heightValue: string;
  onWidthChange: (next: string) => void;
  onHeightChange: (next: string) => void;
  lockAspect: boolean;
  onToggleLock: () => void;
  cropEnabled: boolean;
  onToggleCropEnabled: () => void;
}

export function ImageResizeControls({
  widthLabel,
  heightLabel,
  lockAspectLabel,
  unlockAspectLabel,
  cropToggleLabel,
  cropToggleHint,
  widthValue,
  heightValue,
  onWidthChange,
  onHeightChange,
  lockAspect,
  onToggleLock,
  cropEnabled,
  onToggleCropEnabled,
}: ImageResizeControlsProps) {
  return (
    <div className="space-y-3">
      <div className="flex items-end gap-3">
        <div className="flex-1">
          <label
            className="mb-1 block font-display text-[11px] font-medium"
            style={{ color: "var(--ink-soft)" }}
            htmlFor="ir-w"
          >
            {widthLabel}
          </label>
          <input
            id="ir-w"
            type="number"
            min={1}
            value={widthValue}
            onChange={(e) => onWidthChange(e.target.value)}
            className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }}
          />
        </div>
        <button
          type="button"
          onClick={onToggleLock}
          aria-pressed={lockAspect}
          aria-label={lockAspect ? unlockAspectLabel : lockAspectLabel}
          title={lockAspect ? unlockAspectLabel : lockAspectLabel}
          className="mb-0.5 rounded-[5px] border p-1.5 transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
          }}
        >
          {lockAspect ? (
            <LockIcon
              className="size-3.5"
              style={{ color: "var(--accent-electric)" }}
            />
          ) : (
            <UnlockIcon
              className="size-3.5"
              style={{ color: "var(--ink-soft)" }}
            />
          )}
        </button>
        <div className="flex-1">
          <label
            className="mb-1 block font-display text-[11px] font-medium"
            style={{ color: "var(--ink-soft)" }}
            htmlFor="ir-h"
          >
            {heightLabel}
          </label>
          <input
            id="ir-h"
            type="number"
            min={1}
            value={heightValue}
            onChange={(e) => onHeightChange(e.target.value)}
            className="w-full rounded-[5px] border px-2.5 py-1.5 font-display text-[12px] outline-none focus:border-[color:var(--accent-electric)] focus:ring-1 focus:ring-[color:var(--accent-electric)]"
            style={{
              background: "var(--surface)",
              borderColor: "var(--border)",
              color: "var(--ink-strong)",
            }}
          />
        </div>
      </div>

      <label className="flex items-start gap-2 cursor-pointer">
        <input
          type="checkbox"
          checked={cropEnabled}
          onChange={onToggleCropEnabled}
          className="mt-0.5 size-4 accent-[color:var(--accent-electric)]"
        />
        <span className="font-body text-[11.5px]" style={{ color: "var(--ink)" }}>
          <span
            className="font-display font-medium"
            style={{ color: "var(--ink-strong)" }}
          >
            {cropToggleLabel}
          </span>
          <span className="ml-1" style={{ color: "var(--ink-soft)" }}>
            — {cropToggleHint}
          </span>
        </span>
      </label>
    </div>
  );
}
```

- [ ] **Step 8.2: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 8.3: Commit**

```bash
git add src/components/tools/image-resize/ImageResizeControls.tsx
git commit -m "feat(image-resize): add controls component"
```

---

## Task 9: `ImageResizePreview` component

Left-pane preview. When `cropEnabled` is on, renders `CropSelector`; when off, renders a plain image.

**Files:**
- Create: `src/components/tools/image-resize/ImageResizePreview.tsx`

- [ ] **Step 9.1: Create the component**

Create `src/components/tools/image-resize/ImageResizePreview.tsx`:

```tsx
"use client";

import { CropSelector, type CropRect } from "@/components/image/CropSelector";

interface ImageResizePreviewProps {
  imageUrl: string | null;
  cropEnabled: boolean;
  targetW: number;
  targetH: number;
  onCropChange: (rect: CropRect) => void;
}

export function ImageResizePreview({
  imageUrl,
  cropEnabled,
  targetW,
  targetH,
  onCropChange,
}: ImageResizePreviewProps) {
  if (!imageUrl) return null;

  if (cropEnabled && targetW > 0 && targetH > 0) {
    return (
      <CropSelector
        imageUrl={imageUrl}
        targetWidth={targetW}
        targetHeight={targetH}
        onCropChange={onCropChange}
      />
    );
  }

  return (
    <div
      className="relative inline-block w-full overflow-hidden rounded-[8px] border"
      style={{ borderColor: "var(--border)", background: "var(--surface-2)" }}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={imageUrl}
        alt="원본 미리보기"
        className="block h-auto max-h-80 w-full object-contain"
        draggable={false}
      />
    </div>
  );
}
```

- [ ] **Step 9.2: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 9.3: Commit**

```bash
git add src/components/tools/image-resize/ImageResizePreview.tsx
git commit -m "feat(image-resize): add preview component"
```

---

## Task 10: `ImageResizeResult` component

Done-state card: file size + format + download + "압축/변환하러 가기" button.

**Files:**
- Create: `src/components/tools/image-resize/ImageResizeResult.tsx`

- [ ] **Step 10.1: Create the component**

Create `src/components/tools/image-resize/ImageResizeResult.tsx`:

```tsx
"use client";

import { DownloadIcon, ArrowRightIcon } from "lucide-react";
import { template } from "@/lib/common/template";

interface ImageResizeResultProps {
  doneTitle: string;
  downloadLabel: string;
  resultSummaryTemplate: string;
  compressLinkLabel: string;
  width: number;
  height: number;
  byteSize: number;
  mimeType: string;
  onDownload: () => void;
  onCompressOrConvert: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(1))} ${sizes[i]}`;
}

function formatLabel(mime: string): string {
  if (mime === "image/jpeg") return "JPG";
  if (mime === "image/png") return "PNG";
  if (mime === "image/webp") return "WebP";
  return mime.replace(/^image\//, "").toUpperCase();
}

export function ImageResizeResult({
  doneTitle,
  downloadLabel,
  resultSummaryTemplate,
  compressLinkLabel,
  width,
  height,
  byteSize,
  mimeType,
  onDownload,
  onCompressOrConvert,
}: ImageResizeResultProps) {
  const summary = template(resultSummaryTemplate, {
    w: String(width),
    h: String(height),
    size: formatBytes(byteSize),
    format: formatLabel(mimeType),
  });

  return (
    <div
      className="rounded-[8px] border p-3 space-y-2"
      style={{
        background: "var(--surface)",
        borderColor: "var(--border)",
        boxShadow: "inset 2px 0 0 var(--accent-electric)",
      }}
    >
      <div
        className="font-display text-[12px] font-semibold"
        style={{ color: "var(--headline)" }}
      >
        {doneTitle}
      </div>
      <div className="font-body text-[12px]" style={{ color: "var(--ink)" }}>
        {summary}
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={onDownload}
          className="glint inline-flex items-center justify-start gap-1.5 rounded-[5px] px-3 h-8 font-display text-[11.5px] font-medium"
          style={{
            background: "var(--accent-electric)",
            color: "#fff",
          }}
        >
          <DownloadIcon className="size-3" />
          {downloadLabel}
        </button>
        <button
          type="button"
          onClick={onCompressOrConvert}
          className="inline-flex items-center justify-start gap-1.5 rounded-[5px] border px-3 h-8 font-display text-[11.5px] transition-colors hover:border-[color:var(--accent-electric)]"
          style={{
            background: "var(--surface-2)",
            borderColor: "var(--border)",
            color: "var(--ink-strong)",
          }}
        >
          {compressLinkLabel}
          <ArrowRightIcon className="size-3" />
        </button>
      </div>
    </div>
  );
}
```

- [ ] **Step 10.2: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 10.3: Commit**

```bash
git add src/components/tools/image-resize/ImageResizeResult.tsx
git commit -m "feat(image-resize): add result card component"
```

---

## Task 11: `ImageResizeTool` top-level integration

The state hub. Wires `useToolProcessor`, listens to subcomponent callbacks, applies the algorithms from Tasks 1–3, dispatches to `resizeImage`.

**Files:**
- Create: `src/components/tools/image-resize/ImageResizeTool.tsx`

- [ ] **Step 11.1: Create the component**

Create `src/components/tools/image-resize/ImageResizeTool.tsx`:

```tsx
"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileUpload } from "@/components/common/FileUpload";
import { ProcessingStatus } from "@/components/common/ProcessingStatus";
import { useToolProcessor } from "@/hooks/useToolProcessor";
import {
  resizeImage,
  type ResizeResult,
  type CropArea,
  type ResizePreset,
  type AspectPreset,
} from "@/lib/image/resizeImage";
import { maxFitCrop } from "@/lib/image/maxFitCrop";
import { downloadBlob } from "@/lib/pdf/downloadBlob";
import { stageFiles } from "@/lib/common/toolHandoff";
import type { CropRect } from "@/components/image/CropSelector";
import type { ImageResizeLabels } from "./labels";
import { ImageResizeControls } from "./ImageResizeControls";
import { ImageResizePresets } from "./ImageResizePresets";
import { ImageResizePreview } from "./ImageResizePreview";
import { ImageResizeResult } from "./ImageResizeResult";

const IMAGE_ACCEPT = {
  "image/jpeg": [".jpg", ".jpeg"],
  "image/png": [".png"],
  "image/webp": [".webp"],
};

interface ImageResizeToolProps {
  labels: ImageResizeLabels;
  /** When mounted inline in Screen3Workspace, suppress the page-level header. */
  inline?: boolean;
  /** Locale path segment for cross-tool navigation, e.g. "ko" or "en". */
  lang: string;
}

export function ImageResizeTool({ labels, inline, lang }: ImageResizeToolProps) {
  const router = useRouter();

  const [origDims, setOrigDims] = useState<{ w: number; h: number } | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const imageUrlRef = useRef<string | null>(null);

  const [targetW, setTargetW] = useState("");
  const [targetH, setTargetH] = useState("");
  const [lockAspect, setLockAspect] = useState(true);
  const [cropEnabled, setCropEnabled] = useState(false);
  const [cropRect, setCropRect] = useState<CropRect | null>(null);

  const {
    files,
    setFiles,
    status,
    progress,
    errorMessage,
    result,
    run,
    retry,
    download,
  } = useToolProcessor<ResizeResult>({
    processor: async (files) => {
      const file = files[0];
      const w = Math.max(1, parseInt(targetW || "0", 10) || 0);
      const h = Math.max(1, parseInt(targetH || "0", 10) || 0);

      if (cropEnabled && cropRect) {
        const crop: CropArea = {
          x: cropRect.x,
          y: cropRect.y,
          width: cropRect.width,
          height: cropRect.height,
        };
        return resizeImage({
          file,
          mode: "preset",
          width: w,
          height: h,
          crop,
        });
      }
      return resizeImage({
        file,
        mode: "pixel",
        width: w,
        height: h,
        lockAspectRatio: false,
      });
    },
    onDownload: async (res) => {
      const file = files[0];
      const ext = file?.name.split(".").pop() ?? "png";
      const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "resized";
      const buf = await res.blob.arrayBuffer();
      downloadBlob(
        new Uint8Array(buf),
        `${baseName}-resized.${ext}`,
        res.blob.type,
      );
    },
  });

  const handleFilesChange = useCallback(
    (newFiles: File[]) => {
      setFiles(newFiles);
      setOrigDims(null);
      setCropRect(null);

      if (imageUrlRef.current) {
        URL.revokeObjectURL(imageUrlRef.current);
        imageUrlRef.current = null;
      }

      if (newFiles.length === 0) {
        setImageUrl(null);
        setTargetW("");
        setTargetH("");
        return;
      }

      const url = URL.createObjectURL(newFiles[0]);
      imageUrlRef.current = url;
      setImageUrl(url);

      const img = new Image();
      img.onload = () => {
        const dims = { w: img.naturalWidth, h: img.naturalHeight };
        setOrigDims(dims);
        setTargetW(String(dims.w));
        setTargetH(String(dims.h));
      };
      img.src = url;
    },
    [setFiles],
  );

  useEffect(
    () => () => {
      if (imageUrlRef.current) URL.revokeObjectURL(imageUrlRef.current);
    },
    [],
  );

  const wNum = parseInt(targetW || "0", 10) || 0;
  const hNum = parseInt(targetH || "0", 10) || 0;

  const handleWidthChange = (next: string) => {
    setTargetW(next);
    if (lockAspect && origDims) {
      const nw = parseInt(next || "0", 10) || 0;
      if (nw > 0) {
        const ratio = (parseInt(targetW || "0", 10) || origDims.w) /
          (parseInt(targetH || "0", 10) || origDims.h);
        const nh = Math.max(1, Math.round(nw / ratio));
        setTargetH(String(nh));
      }
    }
  };

  const handleHeightChange = (next: string) => {
    setTargetH(next);
    if (lockAspect && origDims) {
      const nh = parseInt(next || "0", 10) || 0;
      if (nh > 0) {
        const ratio = (parseInt(targetW || "0", 10) || origDims.w) /
          (parseInt(targetH || "0", 10) || origDims.h);
        const nw = Math.max(1, Math.round(nh * ratio));
        setTargetW(String(nw));
      }
    }
  };

  const handleSizePreset = (preset: ResizePreset) => {
    setTargetW(String(preset.width));
    setTargetH(String(preset.height));
  };

  const handleRatioPreset = (preset: AspectPreset) => {
    setLockAspect(true);
    if (!origDims) {
      setTargetW(String(preset.w));
      setTargetH(String(preset.h));
      return;
    }
    const rect = maxFitCrop(origDims, preset.w, preset.h);
    setTargetW(String(rect.width));
    setTargetH(String(rect.height));
    if (cropEnabled) {
      setCropRect(rect);
    }
  };

  const handleToggleCropEnabled = () => {
    setCropEnabled((prev) => {
      const next = !prev;
      if (next && origDims && wNum > 0 && hNum > 0) {
        setCropRect(maxFitCrop(origDims, wNum, hNum));
      }
      return next;
    });
  };

  const handleCompressOrConvert = useCallback(async () => {
    if (!result) return;
    const file = files[0];
    const baseName = file?.name.replace(/\.[^.]+$/, "") ?? "resized";
    const ext = file?.name.split(".").pop() ?? "png";
    const resized = new File(
      [result.blob],
      `${baseName}-resized.${ext}`,
      { type: result.blob.type },
    );
    stageFiles([resized], "image-resize");
    router.push(`/${lang}/tools/image-compress`);
  }, [result, files, lang, router]);

  const file = files[0];
  const downloadFileName = file
    ? `${file.name.replace(/\.[^.]+$/, "")}-resized.${file.name.split(".").pop()}`
    : "resized.png";

  // The chrome (title + subtitle silver header) is rendered by the page or by
  // Screen3 in inline mode. This component renders the body only.
  return (
    <div className="space-y-5">
      {!file && (
        <FileUpload
          accept={IMAGE_ACCEPT}
          multiple={false}
          onFiles={handleFilesChange}
          label={labels.uploadPrompt}
          description={labels.uploadHint}
        />
      )}

      {file && origDims && (
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          {/* Left: preview */}
          <div className="space-y-3">
            <div className="flex items-center justify-between gap-2">
              <div
                className="truncate font-display text-[12px]"
                style={{ color: "var(--ink)" }}
              >
                {file.name}
              </div>
              <button
                type="button"
                onClick={() => handleFilesChange([])}
                className="rounded-[5px] border px-2.5 py-1 font-display text-[11px] transition-colors hover:border-[color:var(--accent-electric)]"
                style={{
                  background: "var(--surface-2)",
                  borderColor: "var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                다시 업로드
              </button>
            </div>
            <ImageResizePreview
              imageUrl={imageUrl}
              cropEnabled={cropEnabled}
              targetW={wNum}
              targetH={hNum}
              onCropChange={setCropRect}
            />
            <p
              className="font-body text-[11.5px]"
              style={{ color: "var(--ink-soft)" }}
            >
              {labels.originalSize}: {origDims.w} × {origDims.h}px
            </p>
          </div>

          {/* Right: controls */}
          <div className="space-y-4">
            {status === "done" && result ? (
              <ImageResizeResult
                doneTitle={labels.doneTitle}
                downloadLabel={labels.download}
                resultSummaryTemplate={labels.resultSummary}
                compressLinkLabel={labels.compressLink}
                width={result.width}
                height={result.height}
                byteSize={result.blob.size}
                mimeType={result.blob.type}
                onDownload={download}
                onCompressOrConvert={handleCompressOrConvert}
              />
            ) : status === "idle" ? (
              <button
                type="button"
                onClick={run}
                className="glint inline-flex w-full items-center justify-center gap-1.5 rounded-[5px] px-3 h-9 font-display text-[12px] font-medium"
                style={{ background: "var(--accent-electric)", color: "#fff" }}
              >
                {labels.apply}
              </button>
            ) : (
              <ProcessingStatus
                status={status}
                progress={progress}
                errorMessage={errorMessage}
                onRetry={retry}
                onDownload={download}
                downloadFileName={downloadFileName}
                onTryAnother={retry}
              />
            )}

            <ImageResizeControls
              widthLabel={labels.widthLabel}
              heightLabel={labels.heightLabel}
              lockAspectLabel={labels.lockAspect}
              unlockAspectLabel={labels.unlockAspect}
              cropToggleLabel={labels.cropToggle}
              cropToggleHint={labels.cropToggleHint}
              widthValue={targetW}
              heightValue={targetH}
              onWidthChange={handleWidthChange}
              onHeightChange={handleHeightChange}
              lockAspect={lockAspect}
              onToggleLock={() => setLockAspect((v) => !v)}
              cropEnabled={cropEnabled}
              onToggleCropEnabled={handleToggleCropEnabled}
            />

            <ImageResizePresets
              sizePresetsTitle={labels.sizePresetsTitle}
              ratioPresetsTitle={labels.ratioPresetsTitle}
              onSizePreset={handleSizePreset}
              onRatioPreset={handleRatioPreset}
            />
          </div>
        </div>
      )}
    </div>
  );
}
```

If `next/navigation`'s `useRouter` does not exist in this codebase's pinned Next 16 version, fall back to `window.location.assign(...)` inside `handleCompressOrConvert`. (The repo's existing tool pages don't currently navigate cross-tool; verify by grepping for `next/navigation` before committing.)

- [ ] **Step 11.2: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean. If `useMemo` import is unused (we did not reference it), remove that import token.

- [ ] **Step 11.3: Commit**

```bash
git add src/components/tools/image-resize/ImageResizeTool.tsx
git commit -m "feat(image-resize): add top-level tool component"
```

---

## Task 12: Rewrite the page route to mount the new tool

Replace the 335-line inline implementation with a thin silver header + `<ImageResizeTool/>`.

**Files:**
- Modify: `src/app/[lang]/(chrome)/tools/image-resize/page.tsx`

- [ ] **Step 12.1: Inspect how `ppt-background/page.tsx` composes header + tool**

Open `src/app/[lang]/(chrome)/tools/ppt-background/page.tsx` and read it. It is the reference for the silver header. Mirror its structure exactly (header markup, badge, locale handling, dictionary loading) and replace its tool-specific bits with the image-resize equivalents.

- [ ] **Step 12.2: Replace the body of `image-resize/page.tsx`**

Overwrite `src/app/[lang]/(chrome)/tools/image-resize/page.tsx` so that the entire file matches the `ppt-background/page.tsx` skeleton, but with these substitutions:

1. Import `ImageResizeTool` from `@/components/tools/image-resize/ImageResizeTool` instead of `PptBackgroundTool`.
2. Import `getImageResizeLabels` from `@/components/tools/image-resize/labels` instead of the ppt-background labels helper.
3. Use the new dictionary keys: `dict.tools["image-resize"].page.title` for the badge/title and `.subtitle` for the subtitle. Drop the `MaximizeIcon` import if `ppt-background/page.tsx` doesn't use an icon; otherwise use `MaximizeIcon` from `lucide-react` for the badge.
4. Render `<ImageResizeTool labels={labels} lang={lang} />` in place of the body.

If the existing ppt-background page reads from a `params` Promise (Next 16 pattern), preserve that exact pattern — do not regress to sync params.

- [ ] **Step 12.3: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 12.4: Commit**

```bash
git add src/app/[lang]/\(chrome\)/tools/image-resize/page.tsx
git commit -m "feat(image-resize): mount new tool at page route, silver header"
```

(Note the escaped parens — `(chrome)` is a Next route group; the shell needs them escaped in `git add`.)

---

## Task 13: Add `image-resize` branch in `Screen3Workspace`

Mirror the `ppt-background` inline branch so the landing page screen 3 mounts the resize tool inline when its card is active.

**Files:**
- Modify: `src/components/landing/Screen3Workspace.tsx`

- [ ] **Step 13.1: Locate the existing `ppt-background` branch**

Open `src/components/landing/Screen3Workspace.tsx`. Find the conditional that renders `<PptBackgroundTool ... />` when `tool.slug === "ppt-background"`.

- [ ] **Step 13.2: Add the parallel branch for image-resize**

Immediately after the `ppt-background` branch, add a sibling branch for `image-resize` using the same pattern. The branch should:
- import `ImageResizeTool` and `getImageResizeLabels` at the top of the file (alongside the ppt-background imports);
- render `<ImageResizeTool labels={labels} inline lang={lang} />` where `lang` is the locale value the existing branch already has in scope.

If `Screen3Workspace` does not currently pass `lang` to the ppt-background tool, look up where the locale comes from in the existing branch and pipe it through identically — do not invent a new prop chain.

- [ ] **Step 13.3: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 13.4: Commit**

```bash
git add src/components/landing/Screen3Workspace.tsx
git commit -m "feat(landing): inline-mount image-resize in Screen3Workspace"
```

---

## Task 14: Consume staged files in `image-compress`

The image-compress page should pick up any staged files on mount and auto-populate its file list. The visual silver migration of this tool is out of scope and stays in chrome-old style.

**Files:**
- Modify: `src/app/[lang]/(chrome)/tools/image-compress/page.tsx`

- [ ] **Step 14.1: Read the current image-compress page**

Run: `cat "src/app/[lang]/(chrome)/tools/image-compress/page.tsx"` (or open in editor).

Identify the state setter that controls its file list (likely `setFiles` returned from `useToolProcessor`).

- [ ] **Step 14.2: Add the consume effect**

At the top of the component body (before any other `useEffect`), add:

```tsx
  useEffect(() => {
    const staged = consumeStagedFiles();
    if (staged && staged.files.length > 0) {
      setFiles(staged.files);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
```

Add the import at the top:

```ts
import { consumeStagedFiles } from "@/lib/common/toolHandoff";
```

If `useEffect` is not already imported from `react`, add it.

- [ ] **Step 14.3: Run verification**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 14.4: Commit**

```bash
git add src/app/[lang]/\(chrome\)/tools/image-compress/page.tsx
git commit -m "feat(image-compress): consume staged files from handoff store"
```

---

## Task 15: Final verification + hand back to user

- [ ] **Step 15.1: Run the full test suite**

Run: `pnpm test`
Expected: all tests pass (20 pre-existing + the new ones from Tasks 1–3).

- [ ] **Step 15.2: Run the build**

Run: `pnpm build`
Expected: success, all 11 tool routes intact.

- [ ] **Step 15.3: Run typecheck once more**

Run: `pnpm exec tsc --noEmit`
Expected: clean.

- [ ] **Step 15.4: List touched files**

Run: `git log --stat master..HEAD`
Confirm the diff is contained to the files in the file map.

- [ ] **Step 15.5: Hand back to user for manual `/qa`**

Post a recap in chat:

```
Done: image-resize Phase 1 migration implemented across 15 tasks.
Why: Per spec docs/superpowers/specs/2026-05-19-image-resize-migration-design.md
Next: Manual visual QA before push/PR — please run pnpm dev and verify:
  1. /image-resize loads, upload works, W/H auto-fill from original
  2. Size preset (FHD) sets 1920×1080
  3. Ratio preset (16:9) sets W/H to max-fit values + lockAspect ON
  4. Checkbox toggles crop UI; drag/resize handles work; ratio preserved
  5. Apply produces correct output (verify a 1:1 crop + a stretched output)
  6. "압축/변환하러 가기" navigates to image-compress with file pre-loaded
  7. Screen3 inline mount renders the tool, no header duplication
  8. English locale (/en/tools/image-resize) shows English copy
Wait for user "go" before pushing to remote and opening a PR.
```

Do not push, do not open a PR — both are user-confirmed hard stops.
