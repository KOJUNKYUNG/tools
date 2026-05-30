# image-to-pptx Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the `image-to-pptx` tool — place N images at one user-defined box (drag/resize + X/Y/W/H numeric, two-way bound) on a chosen background (image or solid color), one image per slide, output `.pptx`.

**Architecture:** Sister tool to `image-to-pdf`. Reuse the `pdf-editor/` shared module (output-agnostic), `useToolProcessor`, `toolHandoff`, FileUpload, ProcessingStatus. New code is a `lib/pptx/` output layer (pure placement geometry + pptxgenjs assembler) and a placement editor adapted from `CropSelector` math. PPTX generated with pptxgenjs (locked D1). Images downscaled to on-slide size before embed (D6).

**Tech Stack:** Next 16 App Router, TypeScript strict, pptxgenjs 4.0.1, canvas resample, jszip (tests), vitest (node-env, pure units), /qa (UI).

**Locked decisions:** see `docs/superpowers/specs/2026-05-30-ontab-image-to-pptx-design.md` (D1–D6).

**Units convention (read first):** The placement editor stores the box as **fractions of the slide** (0..1) so it is resolution-independent. Numeric inputs are shown as **percent** (frac × 100). `computeSlidePlacement` works in **inches** (pptxgenjs unit); the editor converts fraction↔inch via the slide-size constant. Slide sizes (pptxgenjs inches): 16:9 = `13.333 × 7.5`, 4:3 = `10 × 7.5`.

---

## Task 1: Slide-size constants

**Files:**
- Create: `src/lib/pptx/slideSize.ts`
- Test: `src/lib/pptx/slideSize.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { SLIDE_SIZES, type SlideKind } from "./slideSize";

describe("SLIDE_SIZES", () => {
  it("16:9 is 13.333 x 7.5 inches", () => {
    expect(SLIDE_SIZES["16:9"]).toEqual({ w: 13.333, h: 7.5 });
  });
  it("4:3 is 10 x 7.5 inches", () => {
    expect(SLIDE_SIZES["4:3"]).toEqual({ w: 10, h: 7.5 });
  });
  it("aspect ratios are correct", () => {
    const a = SLIDE_SIZES["16:9"];
    expect(a.w / a.h).toBeCloseTo(16 / 9, 2);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/pptx/slideSize.test.ts`
Expected: FAIL ("Cannot find module './slideSize'").

- [ ] **Step 3: Write minimal implementation**

```ts
export type SlideKind = "16:9" | "4:3";

/** Slide dimensions in inches (pptxgenjs unit). */
export const SLIDE_SIZES: Record<SlideKind, { w: number; h: number }> = {
  "16:9": { w: 13.333, h: 7.5 },
  "4:3": { w: 10, h: 7.5 },
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/pptx/slideSize.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/slideSize.ts src/lib/pptx/slideSize.test.ts
git commit -m "feat(image-to-pptx): slide-size constants (16:9, 4:3)"
```

---

## Task 2: `computeSlidePlacement` — pure fit-to-box geometry

Fit-to-box, aspect-preserving (contain), top-left anchored (D4). Distinct from
`computeImageFit` (which fills + centers). No rotation in v1.

**Files:**
- Create: `src/lib/pptx/slidePlacement.ts`
- Test: `src/lib/pptx/slidePlacement.test.ts`

- [ ] **Step 1: Write the failing test**

```ts
import { describe, it, expect } from "vitest";
import { computeSlidePlacement } from "./slidePlacement";

// box is in inches on the slide; img is native px. Returns inches.
describe("computeSlidePlacement", () => {
  it("image wider than box → width-limited, letterbox below, top-left anchored", () => {
    // box 4x3 (aspect 1.333), img 200x100 (aspect 2.0) → width-limited
    const r = computeSlidePlacement({ x: 0, y: 0, w: 4, h: 3 }, 200, 100);
    expect(r).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });

  it("image taller than box → height-limited, anchored at box top-left", () => {
    // box 4x4 at (1,1), img 100x200 (aspect 0.5) → height-limited
    const r = computeSlidePlacement({ x: 1, y: 1, w: 4, h: 4 }, 100, 200);
    expect(r).toEqual({ x: 1, y: 1, w: 2, h: 4 });
  });

  it("equal aspect → fills the box exactly", () => {
    const r = computeSlidePlacement({ x: 0, y: 0, w: 4, h: 2 }, 200, 100);
    expect(r).toEqual({ x: 0, y: 0, w: 4, h: 2 });
  });

  it("degenerate image dimensions → zero-size rect at box top-left", () => {
    const r = computeSlidePlacement({ x: 2, y: 1, w: 4, h: 3 }, 0, 100);
    expect(r).toEqual({ x: 2, y: 1, w: 0, h: 0 });
  });

  it("degenerate box → zero-size rect at box top-left", () => {
    const r = computeSlidePlacement({ x: 1, y: 1, w: 0, h: 3 }, 200, 100);
    expect(r).toEqual({ x: 1, y: 1, w: 0, h: 0 });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/pptx/slidePlacement.test.ts`
Expected: FAIL ("Cannot find module './slidePlacement'").

- [ ] **Step 3: Write minimal implementation**

```ts
export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Fit an `imgW`×`imgH` image (native px) into `box` (inches), preserving aspect
 * (contain — never overflow), anchored to the box's TOP-LEFT corner. Returns the
 * placed rect in inches. Degenerate inputs → zero-size rect at the box origin.
 */
export function computeSlidePlacement(box: Box, imgW: number, imgH: number): Box {
  if (!(imgW > 0) || !(imgH > 0) || !(box.w > 0) || !(box.h > 0)) {
    return { x: box.x, y: box.y, w: 0, h: 0 };
  }
  const imgAspect = imgW / imgH;
  const boxAspect = box.w / box.h;
  let w: number;
  let h: number;
  if (imgAspect > boxAspect) {
    // wider than box → width-limited, letterbox vertically
    w = box.w;
    h = box.w / imgAspect;
  } else {
    // taller than box → height-limited, letterbox horizontally
    h = box.h;
    w = box.h * imgAspect;
  }
  return { x: box.x, y: box.y, w, h };
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/pptx/slidePlacement.test.ts`
Expected: PASS (5 tests).

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/slidePlacement.ts src/lib/pptx/slidePlacement.test.ts
git commit -m "feat(image-to-pptx): computeSlidePlacement fit-to-box geometry"
```

---

## Task 3: Image downscale helper (D6)

Resample an image to its on-slide display size before embed. Reuse the canvas
pattern from `compressImage.ts` (`convertFormat`).

**Files:**
- Create: `src/lib/pptx/downscaleForSlide.ts`

(Pure-ish but DOM-dependent: `createImageBitmap` + canvas → not node-unit-tested;
verified via the assembler integration + /qa. No test file.)

- [ ] **Step 1: Implement**

```ts
/**
 * Downscale `file` so its long edge is at most `maxLongEdgePx`, then encode.
 * Returns a data URL (for pptxgenjs `addImage({ data })`). Keeps aspect ratio.
 * Images already smaller are re-encoded at native size (no upscale).
 */
export async function downscaleForSlide(
  file: File,
  maxLongEdgePx: number,
): Promise<{ dataUrl: string; w: number; h: number }> {
  const bitmap = await createImageBitmap(file);
  const longEdge = Math.max(bitmap.width, bitmap.height);
  const scale = longEdge > maxLongEdgePx ? maxLongEdgePx / longEdge : 1;
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(bitmap, 0, 0, w, h);
  bitmap.close();
  // JPEG for photos/scans (small); keep PNG only if source is PNG (transparency).
  const mime = file.type === "image/png" ? "image/png" : "image/jpeg";
  const dataUrl = canvas.toDataURL(mime, 0.9);
  canvas.width = 0;
  canvas.height = 0;
  return { dataUrl, w: bitmap.width, h: bitmap.height };
}

/** Long-edge cap for embedded images (≈ 16:9 slide width at ~144 DPI). */
export const SLIDE_IMAGE_MAX_LONG_EDGE = 1920;
```

- [ ] **Step 2: Commit**

```bash
git add src/lib/pptx/downscaleForSlide.ts
git commit -m "feat(image-to-pptx): downscale-on-embed helper (D6)"
```

---

## Task 4: `assemblePptx` — pptxgenjs assembler

**Files:**
- Create: `src/lib/pptx/assemblePptx.ts`
- Test: `src/lib/pptx/assemblePptx.test.ts`

- [ ] **Step 1: Write the failing integration test**

Note: `createImageBitmap`/canvas are unavailable in node-env, so the test passes
pre-built `data`/`w`/`h` directly (bypassing `downscaleForSlide`). It asserts the
zip contains one slide per image.

```ts
import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { assemblePptxFromPlaced, type PlacedImage } from "./assemblePptx";

const PX = // 1x1 png data url
  "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M8AAAMBAQDJ/pLvAAAAAElFTkSuQmCC";

function placed(n: number): PlacedImage[] {
  return Array.from({ length: n }, () => ({
    dataUrl: PX,
    placement: { x: 1, y: 1, w: 4, h: 3 },
  }));
}

describe("assemblePptxFromPlaced", () => {
  it("produces one slide per image", async () => {
    const bytes = await assemblePptxFromPlaced(placed(3), {
      slideKind: "16:9",
      background: { kind: "color", color: "FFFFFF" },
    });
    const zip = await JSZip.loadAsync(bytes);
    const slides = Object.keys(zip.files).filter((p) =>
      /^ppt\/slides\/slide\d+\.xml$/.test(p),
    );
    expect(slides.length).toBe(3);
  });

  it("accepts an image background without throwing", async () => {
    const bytes = await assemblePptxFromPlaced(placed(1), {
      slideKind: "4:3",
      background: { kind: "image", dataUrl: PX },
    });
    expect(bytes.byteLength).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run src/lib/pptx/assemblePptx.test.ts`
Expected: FAIL ("Cannot find module './assemblePptx'").

- [ ] **Step 3: Write the implementation**

```ts
import PptxGenJS from "pptxgenjs";
import { SLIDE_SIZES, type SlideKind } from "./slideSize";
import { computeSlidePlacement, type Box } from "./slidePlacement";
import {
  downscaleForSlide,
  SLIDE_IMAGE_MAX_LONG_EDGE,
} from "./downscaleForSlide";

export type Background =
  | { kind: "color"; color: string } // hex without '#', e.g. "FFFFFF"
  | { kind: "image"; dataUrl: string };

export interface PlacedImage {
  dataUrl: string;
  placement: Box; // inches
}

export interface AssembleOptions {
  slideKind: SlideKind;
  background: Background;
}

/** Low-level: caller supplies already-downscaled data URLs + placements. */
export async function assemblePptxFromPlaced(
  images: PlacedImage[],
  opts: AssembleOptions,
): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  const size = SLIDE_SIZES[opts.slideKind];
  pptx.defineLayout({ name: "ONTAB", width: size.w, height: size.h });
  pptx.layout = "ONTAB";

  for (const img of images) {
    const slide = pptx.addSlide();
    if (opts.background.kind === "color") {
      slide.background = { color: opts.background.color };
    } else {
      // Same dataUrl across slides → pptxgenjs dedupes identical media.
      slide.background = { data: opts.background.dataUrl };
    }
    const p = img.placement;
    slide.addImage({ data: img.dataUrl, x: p.x, y: p.y, w: p.w, h: p.h });
  }

  return (await pptx.write({ outputType: "uint8array" })) as Uint8Array;
}

export interface BuildPptxInput {
  files: File[];
  /** Box as fractions of the slide (0..1). */
  boxFrac: Box;
  slideKind: SlideKind;
  background:
    | { kind: "color"; color: string }
    | { kind: "image"; file: File };
}

/** High-level: downscale each file, compute placement, assemble. */
export async function buildPptx(
  input: BuildPptxInput,
  onProgress?: (pct: number) => void,
): Promise<Uint8Array> {
  const size = SLIDE_SIZES[input.slideKind];
  const boxInches: Box = {
    x: input.boxFrac.x * size.w,
    y: input.boxFrac.y * size.h,
    w: input.boxFrac.w * size.w,
    h: input.boxFrac.h * size.h,
  };

  let background: Background;
  if (input.background.kind === "color") {
    background = { kind: "color", color: input.background.color };
  } else {
    const bg = await downscaleForSlide(
      input.background.file,
      SLIDE_IMAGE_MAX_LONG_EDGE,
    );
    background = { kind: "image", dataUrl: bg.dataUrl };
  }

  const placed: PlacedImage[] = [];
  const total = input.files.length;
  for (let i = 0; i < total; i++) {
    const d = await downscaleForSlide(input.files[i], SLIDE_IMAGE_MAX_LONG_EDGE);
    const placement = computeSlidePlacement(boxInches, d.w, d.h);
    placed.push({ dataUrl: d.dataUrl, placement });
    onProgress?.(Math.round(((i + 1) / total) * 90));
  }

  const bytes = await assemblePptxFromPlaced(placed, {
    slideKind: input.slideKind,
    background,
  });
  onProgress?.(100);
  return bytes;
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run src/lib/pptx/assemblePptx.test.ts`
Expected: PASS (2 tests). If pptxgenjs needs a DOM global in node, add a guarded
import note and run via the browser path instead — see Task 12 /qa.

- [ ] **Step 5: Commit**

```bash
git add src/lib/pptx/assemblePptx.ts src/lib/pptx/assemblePptx.test.ts
git commit -m "feat(image-to-pptx): pptxgenjs assembler + buildPptx pipeline"
```

---

## Task 5: i18n keys (ko + en)

**Files:**
- Modify: `src/i18n/locales/ko.json` (add `tools.image-to-pptx`)
- Modify: `src/i18n/locales/en.json` (add `tools.image-to-pptx`)

- [ ] **Step 1: Add the ko.json block**

Locate the `tools` object; add a sibling to `"image-to-pdf"`. Copy the
`image-to-pdf` block shape, then add pptx-specific keys. Full ko block:

```json
"image-to-pptx": {
  "title": "이미지 → PPT",
  "description": "이미지를 배경 위 원하는 위치·크기로 배치해 PPTX로 만듭니다.",
  "page": {
    "uploadPrompt": "이미지를 끌어다 놓거나 선택하세요",
    "uploadHint": "JPG·PNG, 여러 장 가능",
    "uploadMaxSize": "최대 {maxSize}",
    "reupload": "다시 선택",
    "convert": "PPTX 만들기 ({n}장)",
    "filesOne": "{name}",
    "filesMany": "{name} 외 {rest}장",
    "addAria": "이미지 추가",
    "deleteAria": "삭제",
    "processing": "처리 중…",
    "slideAspectLabel": "슬라이드 비율",
    "aspect169": "16:9",
    "aspect43": "4:3",
    "bgLabel": "배경",
    "bgImage": "이미지",
    "bgColor": "단색",
    "bgPick": "배경 이미지 선택",
    "placeLabel": "위치·크기 (%)",
    "posX": "X",
    "posY": "Y",
    "sizeW": "너비",
    "sizeH": "높이",
    "resultTitle": "PPTX 완성",
    "slideCount": "슬라이드 {n}장",
    "download": "다운로드",
    "again": "다시 하기"
  }
}
```

- [ ] **Step 2: Add the en.json block (same keys, English values)**

```json
"image-to-pptx": {
  "title": "Images → PPT",
  "description": "Place images on a background at a set position and size, export PPTX.",
  "page": {
    "uploadPrompt": "Drag images here or browse",
    "uploadHint": "JPG/PNG, multiple allowed",
    "uploadMaxSize": "Max {maxSize}",
    "reupload": "Choose again",
    "convert": "Make PPTX ({n})",
    "filesOne": "{name}",
    "filesMany": "{name} +{rest} more",
    "addAria": "Add image",
    "deleteAria": "Delete",
    "processing": "Processing…",
    "slideAspectLabel": "Slide ratio",
    "aspect169": "16:9",
    "aspect43": "4:3",
    "bgLabel": "Background",
    "bgImage": "Image",
    "bgColor": "Solid",
    "bgPick": "Choose background image",
    "placeLabel": "Position & size (%)",
    "posX": "X",
    "posY": "Y",
    "sizeW": "Width",
    "sizeH": "Height",
    "resultTitle": "PPTX ready",
    "slideCount": "{n} slides",
    "download": "Download",
    "again": "Start over"
  }
}
```

- [ ] **Step 3: Verify types compile** (Dictionary derives from JSON)

Run: `pnpm tsc --noEmit`
Expected: no new errors (keys flow into `Dictionary` automatically).

- [ ] **Step 4: Commit**

```bash
git add src/i18n/locales/ko.json src/i18n/locales/en.json
git commit -m "feat(image-to-pptx): i18n keys (ko, en)"
```

---

## Task 6: Registry entry

**Files:**
- Modify: `src/lib/constants.ts`

- [ ] **Step 1: Add the ToolInfo (after the `image-to-pdf` entry)**

Add `Presentation` to the lucide import line, then insert into `TOOLS`:

```ts
  {
    slug: "image-to-pptx",
    title: "이미지 → PPT",
    description: "이미지를 배경 위 원하는 위치·크기로 배치해 PPTX로 만듭니다.",
    i18nKey: "tools.image-to-pptx",
    href: "/tools/image-to-pptx",
    icon: Presentation,
    category: "ppt",
    keywords: ["pptx", "slides", "ppt", "image to ppt", "이미지", "슬라이드", "악보"],
  },
```

- [ ] **Step 2: Verify** `pnpm tsc --noEmit` passes (no hardcoded counts elsewhere — slug/count derive from registry).

- [ ] **Step 3: Commit**

```bash
git add src/lib/constants.ts
git commit -m "feat(image-to-pptx): registry entry"
```

---

## Task 7: labels.ts

**Files:**
- Create: `src/components/tools/image-to-pptx/labels.ts`

- [ ] **Step 1: Implement** (mirror `image-to-pdf/labels.ts`)

```ts
import type { Dictionary } from "@/i18n/config";

export interface ImageToPptxLabels {
  title: string;
  description: string;
  uploadPrompt: string;
  uploadHint: string;
  uploadMaxSize: string;
  reupload: string;
  convertTemplate: string;
  filesOneTemplate: string;
  filesManyTemplate: string;
  addAria: string;
  deleteAria: string;
  processing: string;
  slideAspectLabel: string;
  aspect169: string;
  aspect43: string;
  bgLabel: string;
  bgImage: string;
  bgColor: string;
  bgPick: string;
  placeLabel: string;
  posX: string;
  posY: string;
  sizeW: string;
  sizeH: string;
  resultTitle: string;
  slideCountTemplate: string;
  download: string;
  again: string;
  fileUpload: Dictionary["common"]["fileUpload"];
}

export function getImageToPptxLabels(dict: Dictionary): ImageToPptxLabels {
  const t = dict.tools["image-to-pptx"];
  const p = t.page;
  return {
    title: t.title,
    description: t.description,
    uploadPrompt: p.uploadPrompt,
    uploadHint: p.uploadHint,
    uploadMaxSize: p.uploadMaxSize,
    reupload: p.reupload,
    convertTemplate: p.convert,
    filesOneTemplate: p.filesOne,
    filesManyTemplate: p.filesMany,
    addAria: p.addAria,
    deleteAria: p.deleteAria,
    processing: p.processing,
    slideAspectLabel: p.slideAspectLabel,
    aspect169: p.aspect169,
    aspect43: p.aspect43,
    bgLabel: p.bgLabel,
    bgImage: p.bgImage,
    bgColor: p.bgColor,
    bgPick: p.bgPick,
    placeLabel: p.placeLabel,
    posX: p.posX,
    posY: p.posY,
    sizeW: p.sizeW,
    sizeH: p.sizeH,
    resultTitle: p.resultTitle,
    slideCountTemplate: p.slideCount,
    download: p.download,
    again: p.again,
    fileUpload: dict.common.fileUpload,
  };
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tools/image-to-pptx/labels.ts
git commit -m "feat(image-to-pptx): labels mapper"
```

---

## Task 8: `PlacementEditor` — drag/resize + numeric X/Y/W/H (two-way)

Adapt `CropSelector` math. The "image" is the slide canvas (background drawn
behind); the movable box is the placement box. State is the box as **fractions
of the slide** (0..1). Free aspect resize (independent W/H) per the user spec —
the displayed reference image is fit-to-box (contain) inside the box so it never
distorts even when the box aspect differs.

**Files:**
- Create: `src/components/tools/image-to-pptx/PlacementEditor.tsx`

- [ ] **Step 1: Implement**

Key contract (props + behavior). Reuse `CropSelector`'s pointer-capture
drag/resize pattern (`handlePointerDown/Move/Up`, `handleResize*`) but:
- Replace `aspectLockedResize` with **free** resize (each handle moves its edge;
  clamp box within [0,1]).
- Render a slide-aspect container (`paddingTop: 100/aspect %`) showing the
  background (color fill or `<img>` cover) with the box overlaid.
- The reference image (`refImageUrl`) is drawn inside the box with
  `object-contain` anchored top-left (matches `computeSlidePlacement`).

```tsx
"use client";
import { useCallback, useRef, useState, type PointerEvent as RPE } from "react";
import type { Box } from "@/lib/pptx/slidePlacement";

type Handle = "nw" | "ne" | "se" | "sw" | "n" | "e" | "s" | "w";

interface PlacementEditorProps {
  /** Box as fractions of slide (0..1). Controlled. */
  box: Box;
  onBoxChange: (box: Box) => void;
  slideAspect: number; // w/h, e.g. 13.333/7.5
  background: { kind: "color"; color: string } | { kind: "image"; url: string };
  refImageUrl: string | null; // first image, shown inside the box
}

function clamp01Box(b: Box): Box {
  const w = Math.max(0.02, Math.min(1, b.w));
  const h = Math.max(0.02, Math.min(1, b.h));
  const x = Math.max(0, Math.min(b.x, 1 - w));
  const y = Math.max(0, Math.min(b.y, 1 - h));
  return { x, y, w, h };
}

export function PlacementEditor(props: PlacementEditorProps) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef({ px: 0, py: 0, box: props.box });
  const [mode, setMode] = useState<null | "move" | Handle>(null);

  const rect = () => ref.current!.getBoundingClientRect();

  const onMoveDown = (e: RPE<HTMLDivElement>) => {
    e.preventDefault();
    setMode("move");
    drag.current = { px: e.clientX, py: e.clientY, box: props.box };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onHandleDown = (e: RPE<HTMLDivElement>, h: Handle) => {
    e.preventDefault();
    e.stopPropagation();
    setMode(h);
    drag.current = { px: e.clientX, py: e.clientY, box: props.box };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };
  const onMove = useCallback(
    (e: RPE<HTMLDivElement>) => {
      if (!mode) return;
      const r = rect();
      const dx = (e.clientX - drag.current.px) / r.width;
      const dy = (e.clientY - drag.current.py) / r.height;
      const b = { ...drag.current.box };
      if (mode === "move") {
        b.x += dx;
        b.y += dy;
      } else {
        if (mode.includes("w")) { b.x += dx; b.w -= dx; }
        if (mode.includes("n")) { b.y += dy; b.h -= dy; }
        if (mode.includes("e")) { b.w += dx; }
        if (mode.includes("s")) { b.h += dy; }
      }
      props.onBoxChange(clamp01Box(b));
    },
    [mode, props],
  );
  const onUp = () => setMode(null);

  const bg =
    props.background.kind === "color"
      ? { background: props.background.color }
      : {
          backgroundImage: `url(${props.background.url})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
        };

  return (
    <div
      ref={ref}
      className="relative w-full overflow-hidden rounded-lg border select-none"
      style={{ paddingTop: `${100 / props.slideAspect}%`, ...bg }}
      onPointerMove={onMove}
      onPointerUp={onUp}
    >
      <div
        className="absolute cursor-move border-2"
        style={{
          left: `${props.box.x * 100}%`,
          top: `${props.box.y * 100}%`,
          width: `${props.box.w * 100}%`,
          height: `${props.box.h * 100}%`,
          borderColor: "var(--accent-electric)",
        }}
        onPointerDown={onMoveDown}
      >
        {props.refImageUrl && (
          <img
            src={props.refImageUrl}
            alt=""
            draggable={false}
            className="pointer-events-none absolute left-0 top-0 h-full w-full object-contain object-left-top"
          />
        )}
        {(["nw","n","ne","e","se","s","sw","w"] as Handle[]).map((h) => (
          <div
            key={h}
            role="button"
            aria-label={`resize ${h}`}
            onPointerDown={(e) => onHandleDown(e, h)}
            className="absolute size-3 rounded-sm border-2 bg-white"
            style={{ borderColor: "var(--accent-electric)", ...HANDLE_POS[h], touchAction: "none" }}
          />
        ))}
      </div>
    </div>
  );
}

const HANDLE_POS: Record<Handle, React.CSSProperties> = {
  nw: { top: -6, left: -6 }, n: { top: -6, left: "calc(50% - 6px)" },
  ne: { top: -6, right: -6 }, e: { top: "calc(50% - 6px)", right: -6 },
  se: { bottom: -6, right: -6 }, s: { bottom: -6, left: "calc(50% - 6px)" },
  sw: { bottom: -6, left: -6 }, w: { top: "calc(50% - 6px)", left: -6 },
};
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tools/image-to-pptx/PlacementEditor.tsx
git commit -m "feat(image-to-pptx): placement editor (drag/resize box on slide)"
```

---

## Task 9: `PlacementControls` — numeric X/Y/W/H (two-way, percent)

Right-panel numeric inputs, commit-on-blur (reuse image-resize input pattern).
Values are percent (0..100) = box fraction × 100.

**Files:**
- Create: `src/components/tools/image-to-pptx/PlacementControls.tsx`

- [ ] **Step 1: Implement**

```tsx
"use client";
import { useEffect, useState } from "react";
import type { Box } from "@/lib/pptx/slidePlacement";

interface Props {
  box: Box;
  onBoxChange: (b: Box) => void;
  labels: { placeLabel: string; posX: string; posY: string; sizeW: string; sizeH: string };
}

const FIELDS: { key: keyof Box; lab: keyof Props["labels"] }[] = [
  { key: "x", lab: "posX" }, { key: "y", lab: "posY" },
  { key: "w", lab: "sizeW" }, { key: "h", lab: "sizeH" },
];

export function PlacementControls({ box, onBoxChange, labels }: Props) {
  // Local draft so typing doesn't fight the live box (commit on blur/Enter).
  const [draft, setDraft] = useState<Record<keyof Box, string>>({
    x: "", y: "", w: "", h: "",
  });
  const [editing, setEditing] = useState<keyof Box | null>(null);

  useEffect(() => {
    if (editing) return;
    setDraft({
      x: String(Math.round(box.x * 100)),
      y: String(Math.round(box.y * 100)),
      w: String(Math.round(box.w * 100)),
      h: String(Math.round(box.h * 100)),
    });
  }, [box, editing]);

  const commit = (key: keyof Box, raw: string) => {
    const pct = Math.max(0, Math.min(100, Number(raw) || 0));
    onBoxChange({ ...box, [key]: pct / 100 });
    setEditing(null);
  };

  return (
    <div className="space-y-2">
      <p className="font-display text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {labels.placeLabel}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {FIELDS.map((f) => (
          <label key={f.key} className="flex items-center gap-1.5 text-[12px]">
            <span style={{ color: "var(--ink-soft)" }} className="w-10">
              {labels[f.lab]}
            </span>
            <input
              type="number"
              min={0}
              max={100}
              value={draft[f.key]}
              onFocus={() => setEditing(f.key)}
              onChange={(e) => setDraft((d) => ({ ...d, [f.key]: e.target.value }))}
              onBlur={(e) => commit(f.key, e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && commit(f.key, (e.target as HTMLInputElement).value)}
              className="nameplate h-8 w-full rounded-[9px] px-2 text-right"
            />
          </label>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add src/components/tools/image-to-pptx/PlacementControls.tsx
git commit -m "feat(image-to-pptx): numeric placement controls (two-way, percent)"
```

---

## Task 10: `BackgroundPicker` + `SlideAspectSelector`

**Files:**
- Create: `src/components/tools/image-to-pptx/BackgroundPicker.tsx`
- Create: `src/components/tools/image-to-pptx/SlideAspectSelector.tsx`

- [ ] **Step 1: Implement `SlideAspectSelector`** (nameplate toggle, blue when active — 4-role button system)

```tsx
"use client";
import type { SlideKind } from "@/lib/pptx/slideSize";

export function SlideAspectSelector(props: {
  value: SlideKind;
  onChange: (k: SlideKind) => void;
  labels: { slideAspectLabel: string; aspect169: string; aspect43: string };
}) {
  const opts: { k: SlideKind; lab: string }[] = [
    { k: "16:9", lab: props.labels.aspect169 },
    { k: "4:3", lab: props.labels.aspect43 },
  ];
  return (
    <div>
      <p className="mb-1.5 font-display text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {props.labels.slideAspectLabel}
      </p>
      <div className="flex gap-1.5">
        {opts.map((o) => (
          <button
            key={o.k}
            type="button"
            data-active={props.value === o.k}
            onClick={() => props.onChange(o.k)}
            className="nameplate h-8 flex-1 rounded-[9px] px-3 font-display text-[12px] font-medium"
          >
            {o.lab}
          </button>
        ))}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Implement `BackgroundPicker`** (image upload OR `<input type=color>`)

```tsx
"use client";
import { useRef } from "react";

export type BgChoice =
  | { kind: "color"; color: string }
  | { kind: "image"; file: File; url: string };

export function BackgroundPicker(props: {
  value: BgChoice;
  onChange: (b: BgChoice) => void;
  labels: { bgLabel: string; bgImage: string; bgColor: string; bgPick: string };
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <div>
      <p className="mb-1.5 font-display text-[11px]" style={{ color: "var(--ink-soft)" }}>
        {props.labels.bgLabel}
      </p>
      <div className="flex items-center gap-1.5">
        <button
          type="button"
          data-active={props.value.kind === "image"}
          onClick={() => fileRef.current?.click()}
          className="nameplate h-8 flex-1 rounded-[9px] px-3 text-[12px]"
        >
          {props.labels.bgImage}
        </button>
        <button
          type="button"
          data-active={props.value.kind === "color"}
          onClick={() =>
            props.onChange({
              kind: "color",
              color: props.value.kind === "color" ? props.value.color : "#FFFFFF",
            })
          }
          className="nameplate h-8 flex-1 rounded-[9px] px-3 text-[12px]"
        >
          {props.labels.bgColor}
        </button>
        {props.value.kind === "color" && (
          <input
            type="color"
            value={props.value.color}
            onChange={(e) => props.onChange({ kind: "color", color: e.target.value })}
            aria-label={props.labels.bgColor}
            className="h-8 w-10 rounded-[9px] border"
          />
        )}
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) props.onChange({ kind: "image", file: f, url: URL.createObjectURL(f) });
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/image-to-pptx/BackgroundPicker.tsx src/components/tools/image-to-pptx/SlideAspectSelector.tsx
git commit -m "feat(image-to-pptx): background picker + slide aspect selector"
```

---

## Task 11: `ImageToPptx` main component

Clone `ImageToPdf.tsx` skeleton (file ingest, dnd grid via `pdf-editor/`,
`useToolProcessor`, reset/reupload/add). Swap the right side for the
placement editor + controls + background + aspect. Consume staged files on mount
(D5 receiver). Run → `buildPptx`.

**Files:**
- Create: `src/components/tools/image-to-pptx/ImageToPptx.tsx`
- Create: `src/components/tools/image-to-pptx/ImageToPptxResult.tsx`

- [ ] **Step 1: Implement `ImageToPptx.tsx`** — start by copying `ImageToPdf.tsx`, then apply these changes:
  1. Imports: drop `assembleSections`/`PageSizeSelector`/`downloadBlob`(pdf); add
     `buildPptx` from `@/lib/pptx/assemblePptx`, `PlacementEditor`,
     `PlacementControls`, `BackgroundPicker` (+`BgChoice`), `SlideAspectSelector`,
     `downloadBlobObject` from `@/lib/pdf/downloadBlob`, `consumeStagedFiles` from
     `@/lib/common/toolHandoff`, `SLIDE_SIZES`/`SlideKind`, `Box`.
  2. State: `const [box, setBox] = useState<Box>({ x: 0.1, y: 0.1, w: 0.8, h: 0.8 });`
     `const [slideKind, setSlideKind] = useState<SlideKind>("16:9");`
     `const [bg, setBg] = useState<BgChoice>({ kind: "color", color: "#FFFFFF" });`
  3. Result type:
     ```ts
     export interface ImageToPptxResultData { bytes: Uint8Array; name: string; slideCount: number; }
     ```
  4. `useToolProcessor` processor:
     ```ts
     processor: async (_files, onProgress) => {
       const live = items.filter((p) => !p.deleted);
       if (live.length === 0) throw new Error("슬라이드로 만들 이미지가 없습니다.");
       const files = live.map((p) => fileById.get(p.sourceFileId)!).filter(Boolean);
       const bytes = await buildPptx(
         {
           files,
           boxFrac: box,
           slideKind,
           background:
             bg.kind === "color"
               ? { kind: "color", color: bg.color.replace("#", "") }
               : { kind: "image", file: bg.file },
         },
         onProgress,
       );
       const name = `${deriveBaseName(items[0]?.sourceFileName)}.pptx`;
       return { bytes, name, slideCount: files.length };
     },
     onDownload: (res) =>
       downloadBlobObject(
         res.bytes,
         res.name,
         "application/vnd.openxmlformats-officedocument.presentationml.presentation",
       ),
     ```
     (Maintain a `fileById: Map<string, File>` alongside `sourceBytesById`, or
     reuse `accepted` files keyed by item id during `ingest`.)
  5. On mount, consume handoff (before manual upload):
     ```ts
     useEffect(() => {
       const staged = consumeStagedFiles();
       if (staged && staged.files.length > 0) void ingest(staged.files, "replace");
       // eslint-disable-next-line react-hooks/exhaustive-deps
     }, []);
     ```
     Guard StrictMode double-invoke with a `useRef(false)` consumed flag.
  6. Editor JSX (right column inside the 52vh layout): the dnd image grid stays on
     the left (reuse the `SortableCell`/`PageItemCard` block from ImageToPdf, minus
     rotation — pass no rotate handler or keep it, harmless); the right column adds:
     ```tsx
     <SlideAspectSelector value={slideKind} onChange={setSlideKind} labels={labels} />
     <BackgroundPicker value={bg} onChange={setBg} labels={labels} />
     <PlacementEditor
       box={box}
       onBoxChange={setBox}
       slideAspect={SLIDE_SIZES[slideKind].w / SLIDE_SIZES[slideKind].h}
       background={bg.kind === "color" ? { kind: "color", color: bg.color } : { kind: "image", url: bg.url }}
       refImageUrl={items[0] ? (sourceUrlById.get(items[0].sourceFileId) ?? null) : null}
     />
     <PlacementControls box={box} onBoxChange={setBox} labels={labels} />
     ```
  7. Object URLs for `refImageUrl`/background: create+revoke in a `useEffect` keyed
     on files (StrictMode-safe object-URL pattern from image-compress — see
     `ontab_conventions`). Do NOT create URLs imperatively.

- [ ] **Step 2: Implement `ImageToPptxResult.tsx`** — clone `ImageToPdfResult.tsx`; show `slideCount` via `slideCountTemplate`, download button (`.btn-download`), "다시 하기" (`again`). No compress-handoff (no downstream pptx tool yet).

- [ ] **Step 3: Verify build**

Run: `pnpm tsc --noEmit && pnpm build`
Expected: passes.

- [ ] **Step 4: Commit**

```bash
git add src/components/tools/image-to-pptx/ImageToPptx.tsx src/components/tools/image-to-pptx/ImageToPptxResult.tsx
git commit -m "feat(image-to-pptx): main tool component + result"
```

---

## Task 12: Route page + Screen3 inline mount

**Files:**
- Create: `src/app/[lang]/(chrome)/tools/image-to-pptx/page.tsx`
- Modify: `src/components/landing/Screen3Workspace.tsx` (add a `case`)

- [ ] **Step 1: Page** — clone `tools/image-to-pdf/page.tsx`, swap to
  `getImageToPptxLabels` + `<ImageToPptx labels={labels} lang={lang} />`.

- [ ] **Step 2: Screen3 `renderToolBody()` switch** — add:
  ```tsx
  case "image-to-pptx":
    return <ImageToPptx labels={getImageToPptxLabels(dict)} lang={lang} inline />;
  ```

- [ ] **Step 3: Verify** `pnpm build`; visit `/{lang}/tools/image-to-pptx`.

- [ ] **Step 4: Commit**

```bash
git add src/app src/components/landing/Screen3Workspace.tsx
git commit -m "feat(image-to-pptx): route page + inline mount"
```

---

## Task 13: ppt-extract → image-to-pptx handoff (D5)

**Files:**
- Modify: `src/components/tools/ppt-extract/PptExtractResult.tsx` (+ labels + i18n key)

- [ ] **Step 1: Add a `.handoff-action` button** to the result action card:
  ```tsx
  <button
    type="button"
    className="handoff-action ..."
    onClick={() => {
      const files = extractedImages.map((img) => new File([img.bytes], img.name, { type: img.mime }));
      stageFiles(files, "ppt-extract");
      router.push(`/${lang}/tools/image-to-pptx`);
    }}
  >
    {labels.toPptx}
  </button>
  ```
  Import `stageFiles` from `@/lib/common/toolHandoff`. Add `ppt-extract.page.toPptx`
  i18n key (ko: "이미지 → PPT로 보내기", en: "Send to Images → PPT") + label wiring.

- [ ] **Step 2: Verify** `pnpm tsc --noEmit && pnpm build`.

- [ ] **Step 3: Commit**

```bash
git add src/components/tools/ppt-extract src/i18n
git commit -m "feat(image-to-pptx): ppt-extract handoff entry"
```

---

## Task 14: imageFit relocation (optional cleanup, D2)

Lower priority — do only if it stays small. Move `src/lib/pdf/imageFit.ts` →
`src/lib/common/imageFit.ts`, update imports in `assembleSections.ts` and
`imageFit.test.ts`. If it touches more than those, defer to a TODO.

- [ ] **Step 1: Move + update imports.** Run `pnpm tsc --noEmit` + the imageFit/assembleSections tests.
- [ ] **Step 2: Commit** `refactor: relocate imageFit to lib/common (shared by pdf + pptx)`.

---

## Verification checklist (pre-/review)

- [ ] `pnpm tsc --noEmit` clean
- [ ] `pnpm vitest run` — slideSize, slidePlacement, assemblePptx green
- [ ] `pnpm build` clean
- [ ] /qa: upload 3 differing-size images → box drag/resize ↔ X/Y/W/H numeric round-trip → background image + solid color → 16:9/4:3 → download .pptx → opens in PowerPoint/Keynote with N slides, each image fit-to-box top-left, no overflow/distortion
- [ ] /qa: 30+ images → file size reasonable (downscale), no OOM
- [ ] /qa: ppt-extract → "보내기" → image-to-pptx pre-filled, images appear once (StrictMode)
- [ ] /review → /ship

## NOT in scope (carried from spec)
Gradient bg; per-slide individual placement; multiple images/slide; user embed-quality control; bidirectional handoff; image rotation in placement editor.
