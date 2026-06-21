# Brand motion tokens + `docs/brand.html` Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Define drop & settle motion tokens as the single source of truth in `globals.css`, retrofit the shared brand primitives to consume them, and ship a standalone `docs/brand.html` documenting the shipped logo + icons and the new motion language.

**Architecture:** Motion values live once in `src/app/globals.css` (`:root` tokens + a top-level `@keyframes drop-settle` + a `prefers-reduced-motion` block). Shared primitives (FadeInCenter, `.toolcard`, `.btn-*`, `.nameplate`, `.handoff-action`, ToolCard) reference those tokens. `docs/brand.html` is a build-free standalone reference (precedent: `docs/design-preview.html`) that **mirrors** the token values and the logo/icon SVG markup for display — the runtime components and `globals.css` remain the source of truth.

**Tech Stack:** Next.js (App Router), CSS custom properties + keyframes, Vitest (node env, colocated `*.test.ts`), plain HTML/CSS/JS for the reference doc. Design contract guarded by `pnpm design:check`.

**Testing note:** This is design-token + static-doc work, so most verification is a compile gate (`pnpm build`), the design contract gate (`pnpm design:check`), and manual browser inspection of `docs/brand.html`. The one genuinely automatable regression guard — that the motion tokens exist with exact values — is covered by a Vitest test in Task 1 (real RED-GREEN). No other forced unit tests; visual correctness is verified in the browser.

**Source-of-truth values (locked in the spec):**
```css
--ease-standard: cubic-bezier(.4, 0, .2, 1);
--ease-settle:   cubic-bezier(.25, .8, .25, 1);
--motion-fast:   250ms;
--motion-base:   300ms;
--motion-settle: 600ms;
```
```css
@keyframes drop-settle {
  0%   { opacity: 0; transform: translateY(9px); }
  60%  { opacity: 1; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

**Scope guard:** Only the shared primitives below are retrofitted. Per-tool `transition-colors` (~150ms micro-feedback) are intentionally left untouched (principle #2: "tools stay quiet inside"). `DESIGN.md` is not touched. Landing redesign (#4) and broader animation rollout (#5) are out of scope — FadeInCenter is edited as a primitive; its consumer screens are not.

---

## File Structure

- `src/app/globals.css` — **Modify.** Add motion tokens to `:root`; add top-level `@keyframes drop-settle`, `.animate-drop-settle`, `@keyframes ob-fade`, and a `prefers-reduced-motion` block; retokenise `.toolcard`, `.btn-primary`, `.btn-download`, `.nameplate`, `.handoff-action`.
- `src/app/globals.motion.test.ts` — **Create.** Regression guard asserting the five tokens + keyframe stops are present in `globals.css`.
- `src/components/brand/FadeInCenter.tsx` — **Modify (rewrite).** scale-fade → drop & settle via `.animate-drop-settle`.
- `src/components/brand/ToolCard.tsx` — **Modify.** Inline transition string → token references.
- `docs/brand.html` — **Create.** Standalone reference: Logo, Iconography, Motion sections + light/dark toggle.

---

## Task 1: Motion tokens + keyframe + reduced-motion in `globals.css`

**Files:**
- Modify: `src/app/globals.css` (`:root` block ends at line 140; button/card treatments at lines 224-288)
- Test: `src/app/globals.motion.test.ts`

- [ ] **Step 1: Write the failing test**

Create `src/app/globals.motion.test.ts`:

```ts
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "globals.css"),
  "utf8",
);

describe("motion tokens (single source of truth)", () => {
  it("declares the five motion tokens with locked values", () => {
    expect(css).toMatch(/--ease-standard:\s*cubic-bezier\(\.4,\s*0,\s*\.2,\s*1\)/);
    expect(css).toMatch(/--ease-settle:\s*cubic-bezier\(\.25,\s*\.8,\s*\.25,\s*1\)/);
    expect(css).toMatch(/--motion-fast:\s*250ms/);
    expect(css).toMatch(/--motion-base:\s*300ms/);
    expect(css).toMatch(/--motion-settle:\s*600ms/);
  });

  it("defines the drop-settle keyframe with the 9 / -4 / 0 stops", () => {
    expect(css).toMatch(/@keyframes\s+drop-settle/);
    expect(css).toMatch(/translateY\(9px\)/);
    expect(css).toMatch(/translateY\(-4px\)/);
  });

  it("honours prefers-reduced-motion", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/globals.motion.test.ts`
Expected: FAIL — tokens/keyframe not yet present.

- [ ] **Step 3: Add the motion tokens to `:root`**

In `src/app/globals.css`, immediately before the closing `}` of the `:root` block (after the `--shadow-inset` line, currently line 139), add:

```css

  /* ── Motion — drop & settle. Single source of truth; brand.html mirrors. ── */
  --ease-standard: cubic-bezier(.4, 0, .2, 1);   /* general in-out (fades, colour) */
  --ease-settle:   cubic-bezier(.25, .8, .25, 1); /* decelerate-and-rest — brand character */
  --motion-fast:   250ms;  /* hover colour/border, toggles, button lift */
  --motion-base:   300ms;  /* card hover lift, opacity, small transforms */
  --motion-settle: 600ms;  /* drop & settle signature entrance */
```

- [ ] **Step 4: Add the keyframe, utility class, fade fallback, and reduced-motion block**

At the end of `src/app/globals.css` (after the `.btn-download:disabled` rule), append:

```css

/* ── Drop & settle — the signature brand entrance (shell / launcher level). ── */
@keyframes drop-settle {
  0%   { opacity: 0; transform: translateY(9px); }
  60%  { opacity: 1; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}
.animate-drop-settle {
  animation: drop-settle var(--motion-settle) var(--ease-settle) both;
}

@keyframes ob-fade { from { opacity: 0; } to { opacity: 1; } }

/* Quiet down for reduced-motion: keep a gentle opacity fade, drop all transform. */
@media (prefers-reduced-motion: reduce) {
  .animate-drop-settle {
    animation: ob-fade var(--motion-base) var(--ease-standard) both;
  }
  .toolcard, .btn-primary, .btn-download, .nameplate, .handoff-action {
    transition-duration: 0.01ms !important;
  }
  .toolcard:hover, .btn-primary:hover, .btn-download:hover { transform: none !important; }
}
```

- [ ] **Step 5: Retokenise the primitive treatments**

Apply these exact replacements in `src/app/globals.css`:

`.nameplate` transition (line ~228):
```css
  transition: transform var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard), border-color var(--motion-fast) var(--ease-standard);
```

`.toolcard` transition (line ~236):
```css
  transition: transform var(--motion-base) var(--ease-settle), border-color var(--motion-fast) var(--ease-standard);
```

`.handoff-action` transition (line ~254):
```css
  transition: border-color var(--motion-fast) var(--ease-standard), background var(--motion-fast) var(--ease-standard);
```

`.btn-primary` transition (line ~272):
```css
  transition: transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), opacity var(--motion-fast) var(--ease-standard);
```

`.btn-download` transition (line ~284):
```css
  transition: transform var(--motion-fast) var(--ease-standard), box-shadow var(--motion-fast) var(--ease-standard), opacity var(--motion-fast) var(--ease-standard);
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/app/globals.motion.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 7: Verify the design contract is still green**

Run: `pnpm design:check`
Expected: `✓ DESIGN.md ↔ globals.css in sync — N color anchors verified.` (motion tokens are not `--mono-*`, so the drift checker ignores them.)

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/app/globals.motion.test.ts
git commit -m "feat: motion tokens + drop-settle keyframe in globals.css"
```

---

## Task 2: Retrofit FadeInCenter to drop & settle

**Files:**
- Modify (rewrite): `src/components/brand/FadeInCenter.tsx`

- [ ] **Step 1: Rewrite the component**

Replace the entire contents of `src/components/brand/FadeInCenter.tsx` with:

```tsx
import type { ReactNode } from "react";

/**
 * FadeInCenter — the signature brand entrance. Content drops a short distance
 * and settles into place (drop & settle), echoing the brand mark's "tossed
 * folder landing on a desk". The motion lives in globals.css
 * (.animate-drop-settle), which also honours prefers-reduced-motion.
 */
export function FadeInCenter({ children }: { children: ReactNode }) {
  return <div className="animate-drop-settle">{children}</div>;
}
```

(The previous `"use client"` + `useState`/`requestAnimationFrame` dance is no longer needed — a pure CSS animation replays on mount.)

- [ ] **Step 2: Verify it compiles and lints**

Run: `pnpm build`
Expected: build succeeds; no type or ESLint errors referencing `FadeInCenter`.

- [ ] **Step 3: Manual check (user runs `pnpm dev`)**

Open a tool / workspace screen. Expected: the wrapped content drops ~9px and settles (overshoot to -4px then rest) over 600ms on load, instead of the old scale-up. With OS "reduce motion" enabled, it fades in with no transform.

- [ ] **Step 4: Commit**

```bash
git add src/components/brand/FadeInCenter.tsx
git commit -m "feat: FadeInCenter uses drop & settle entrance"
```

---

## Task 3: Retokenise ToolCard inline transition

**Files:**
- Modify: `src/components/brand/ToolCard.tsx:31-32`

- [ ] **Step 1: Replace the inline transition string**

In `src/components/brand/ToolCard.tsx`, change the `transition` value inside the `style` object (currently lines 31-32) to reference tokens:

```tsx
        transition:
          "transform var(--motion-base) var(--ease-settle), opacity var(--motion-base) var(--ease-standard), height var(--motion-base) var(--ease-standard), padding var(--motion-base) var(--ease-standard)",
```

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Manual check (user runs `pnpm dev`)**

Hover a tool card → it lifts with the settle easing; click → it zooms/fades on open. Behaviour matches before, now driven by tokens.

- [ ] **Step 4: Commit**

```bash
git add src/components/brand/ToolCard.tsx
git commit -m "refactor: ToolCard transition references motion tokens"
```

---

## Task 4: `docs/brand.html` scaffold + Logo section

**Files:**
- Create: `docs/brand.html`

- [ ] **Step 1: Create the scaffold with fonts, mirrored tokens, light/dark toggle**

Create `docs/brand.html`. Mirror the font + base setup from `docs/design-preview.html` (lines 13-33 there cover the Google Fonts link, Pretendard, and the local `@font-face` for Clash Display + IBM Plex Sans KR — copy those verbatim, keeping the `../src/fonts/...` relative paths). Then use this document body:

```html
<!DOCTYPE html>
<html lang="ko">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Ontab — Brand reference</title>
<!--
  Living brand reference — NOT the runtime source of truth.
  Logo/icons mirror src/components/brand/*; motion tokens mirror
  src/app/globals.css. Open this file directly in a browser. Toggle theme
  top-right. Keep the mirrored values in sync when the source changes.
-->
<!-- PASTE: the <link> font tags + <style>@font-face blocks from docs/design-preview.html lines 13-33 -->
<style>
  :root {
    --mono-0:#ffffff; --mono-100:#d9d9da; --mono-200:#c6c6c7; --mono-400:#9d9c9e;
    --mono-600:#4a494a; --mono-900:#242324; --mono-1000:#000000;
    /* Motion — mirrors src/app/globals.css */
    --ease-standard: cubic-bezier(.4,0,.2,1);
    --ease-settle:   cubic-bezier(.25,.8,.25,1);
    --motion-fast:   250ms; --motion-base: 300ms; --motion-settle: 600ms;
    --bg:var(--mono-100); --surface:var(--mono-0); --border:var(--mono-200);
    --ink:var(--mono-600); --ink-strong:var(--mono-900); --headline:var(--mono-900);
    --font-display:'Clash Display','IBM Plex Sans KR',ui-sans-serif,system-ui,sans-serif;
    --font-body:'IBM Plex Sans KR',ui-sans-serif,system-ui,sans-serif;
    --font-mono:'Nanum Gothic Coding',ui-monospace,monospace;
  }
  [data-theme="dark"] {
    --bg:var(--mono-900); --surface:var(--mono-600); --border:var(--mono-400);
    --ink:var(--mono-200); --ink-strong:var(--mono-100); --headline:var(--mono-0);
  }
  * { box-sizing:border-box; }
  body { margin:0; background:var(--bg); color:var(--ink-strong);
    font-family:var(--font-body); line-height:1.6; padding:48px 32px 96px; }
  .wrap { max-width:960px; margin:0 auto; }
  h1 { font-family:var(--font-display); font-size:34px; letter-spacing:-0.02em; margin:0 0 4px; }
  h2 { font-family:var(--font-display); font-size:22px; letter-spacing:-0.02em;
    margin:64px 0 16px; padding-bottom:8px; border-bottom:1px solid var(--border); }
  h3 { font-size:15px; margin:28px 0 10px; color:var(--ink-strong); }
  p { color:var(--ink); max-width:62ch; }
  code, pre { font-family:var(--font-mono); font-size:13px; }
  pre { background:var(--surface); border:1px solid var(--border); border-radius:4px;
    padding:14px 16px; overflow:auto; }
  .panel { background:var(--surface); border:1px solid var(--border); border-radius:4px; padding:24px; }
  .grid { display:grid; gap:16px; }
  .muted { color:var(--ink); font-size:13px; }
  .theme-btn { position:fixed; top:16px; right:16px; background:var(--surface);
    border:1px solid var(--border); color:var(--ink-strong); border-radius:4px;
    padding:8px 14px; font-family:var(--font-body); font-size:13px; cursor:pointer; }
  .do-dont { display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width:640px){ .do-dont{ grid-template-columns:1fr; } }
</style>
</head>
<body>
<button class="theme-btn" id="theme">테마 전환</button>
<div class="wrap">
  <h1>Ontab brand reference</h1>
  <p class="muted">Logo · Iconography · Motion. Mirrors the runtime source — see header comment.</p>

  <h2>Logo</h2>
  <p>책상 위에 툭 던진 서류철 + "On". 헤더 마크는 고정색(테마 반전 없음 — 사용자 선택),
     파비콘은 정사각·OS 다크 모드에서 반전됩니다.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(180px,1fr));">
    <div class="panel" style="display:flex;align-items:center;justify-content:center;min-height:160px;">
      <!-- PASTE: the full <svg>…</svg> from src/components/brand/BrandMark.tsx (lines 18-94),
           converted JSX→HTML attrs: strokeWidth→stroke-width, strokeLinejoin→stroke-linejoin,
           strokeLinecap→stroke-linecap, drop className/role/aria-* React props.
           Set width="120" height="120". -->
    </div>
    <div class="panel" style="display:flex;align-items:center;justify-content:center;min-height:160px;background:var(--mono-900);">
      <img src="../src/app/icon.svg" width="96" height="96" alt="Ontab favicon (square, OS-inverting)" />
    </div>
  </div>
  <h3>여백 · 최소 크기</h3>
  <p class="muted">클리어 스페이스 = 마크 높이의 25%. 최소 표시 크기 24px(파비콘) / 28px(헤더 마크).</p>
  <h3>금지 사용</h3>
  <div class="do-dont">
    <div class="panel"><span class="muted">✘ 마크 색을 테마에 맞춰 임의 반전 (헤더 마크는 고정색)</span></div>
    <div class="panel"><span class="muted">✘ 비율 왜곡 · 그림자/그라데이션 추가 · 회전</span></div>
  </div>
</div>
<script>
  (function(){
    var b=document.getElementById('theme');
    b.addEventListener('click',function(){
      document.documentElement.setAttribute('data-theme',
        document.documentElement.getAttribute('data-theme')==='dark'?'light':'dark');
    });
  })();
</script>
</body>
</html>
```

- [ ] **Step 2: Fill the BrandMark SVG**

Open `src/components/brand/BrandMark.tsx`, copy the `<svg>…</svg>` element (lines 18-94) into the first Logo panel where the PASTE comment is. Convert React attribute names to HTML: `strokeWidth`→`stroke-width`, `strokeLinejoin`→`stroke-linejoin`, `strokeLinecap`→`stroke-linecap`. Remove `className`, `role={...}`, `aria-hidden={...}`, and the `{title ? … }` expression. Set `width="120" height="120"` on the `<svg>` and keep the existing `viewBox`. The fills are literal hex (`#242324`, `#ffffff`, `#d9d9da`) — keep them (the mark is fixed-colour by design).

- [ ] **Step 3: Paste the font setup**

Copy the `<link rel="preconnect">`, the Google Fonts `<link href=…css2…>`, the Pretendard `<link>`, and the two `@font-face` `<style>` blocks from `docs/design-preview.html` (lines 13-33) into the `<head>` where the PASTE comment is.

- [ ] **Step 4: Verify in a browser (manual)**

Open `docs/brand.html` directly (file://). Expected: heading renders in Clash Display; the BrandMark renders left, the favicon renders on a dark panel right (inverted via its own `prefers-color-scheme` style); the theme toggle flips the page light/dark.

- [ ] **Step 5: Commit**

```bash
git add docs/brand.html
git commit -m "docs: brand.html scaffold + Logo section"
```

---

## Task 5: `docs/brand.html` Iconography section

**Files:**
- Modify: `docs/brand.html`

- [ ] **Step 1: Add the Iconography section markup**

Before the closing `</div>` of `.wrap`, add:

```html
  <h2>Iconography</h2>
  <p>도구 아이콘은 자체 Line 세트. 24 그리드 · stroke 1.0 · currentColor(테마 반전) ·
     round cap/join. 은유 규칙: 페이지(접힌 모서리)·슬라이드(16:9 + 제목선)·이미지(프레임 + 해/봉우리).
     반복 동사는 한 글리프 — 압축=네 모서리 화살표, 변환=대상 포맷으로 들어가는 화살표, 추출=깔때기.</p>
  <div class="grid" style="grid-template-columns:repeat(auto-fit,minmax(120px,1fr));">
    <!-- one .icon-cell per ToolIcon (10 total) -->
  </div>
```

Add to the `<style>` block:

```css
  .icon-cell { background:var(--surface); border:1px solid var(--border); border-radius:4px;
    padding:18px 10px; display:flex; flex-direction:column; align-items:center; gap:10px;
    color:var(--ink-strong); }
  .icon-cell svg { width:32px; height:32px; }
  .icon-cell span { font-size:11.5px; color:var(--ink); font-family:var(--font-mono); }
```

- [ ] **Step 2: Fill the 10 icon cells**

From `src/components/brand/ToolIcons.tsx`, each exported icon is an `<Icon>` wrapping `<path>` children with `viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round"`. For each of the 10 icons, add one cell. Pattern (repeat per icon, substituting the paths and label):

```html
    <div class="icon-cell">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <!-- PASTE the <path .../> children from the matching ToolIcons export -->
      </svg>
      <span>ToolLockIcon</span>
    </div>
```

The 10 icons and their source exports (copy each export's `<path>` children verbatim; the JSX `<path d="…" />` is already valid HTML):
1. `ToolLockIcon` (ToolIcons.tsx:43-50) — label "lock"
2. `ToolWatermarkIcon` (53-59) — "watermark"
3. `ToolArrangeIcon` (62-69) — "arrange"
4. `ToolCompressIcon` (73-80) — "compress"
5. `ToolExtractIcon` (83-87) — "extract"
6. `ToolPdfToImageIcon` (90-97) — "pdf→image"
7. `ToolImageToPdfIcon` (100-106) — "image→pdf"
8. `ToolImageToPptxIcon` (109-115) — "image→pptx"
9. `ToolResizeIcon` (118-125) — "resize"
10. `ToolBackgroundIcon` (128-134) — "background"

Use the export name (or the short label shown above) as the `<span>` text — pick the short labels for readability.

- [ ] **Step 3: Verify in a browser (manual)**

Reload `docs/brand.html`. Expected: 10 icon cells render the real glyphs in `currentColor` (they invert when you toggle the theme), hairline stroke, on a 24 grid.

- [ ] **Step 4: Commit**

```bash
git add docs/brand.html
git commit -m "docs: brand.html Iconography section"
```

---

## Task 6: `docs/brand.html` Motion section

**Files:**
- Modify: `docs/brand.html`

- [ ] **Step 1: Add the Motion section markup**

Before the closing `</div>` of `.wrap`, add:

```html
  <h2>Motion — drop &amp; settle</h2>
  <p>브랜드 모션 언어는 "툭 던져 안착". 셸/런처 레벨(도구를 고르고 들어가는 순간)에만 적용하고,
     도구 작업 화면 안은 조용하게 둡니다. 진입과 hover lift는 같은 settle 감속을 공유합니다.</p>

  <h3>원칙</h3>
  <ol class="muted" style="max-width:62ch;">
    <li>브랜드 모션은 셸/런처 레벨에만.</li>
    <li>도구 안은 조용하게 — 장식 진입·transform 없음, 기능적 마이크로 피드백만.</li>
    <li>하나의 settle 성격 — 진입과 hover lift가 같은 easing(<code>--ease-settle</code>)을 공유.</li>
    <li><code>prefers-reduced-motion</code> 존중 — transform 제거, 페이드만.</li>
  </ol>

  <h3>토큰</h3>
  <pre>--ease-standard: cubic-bezier(.4,0,.2,1);
--ease-settle:   cubic-bezier(.25,.8,.25,1);
--motion-fast:   250ms;   /* hover 색·테두리·버튼 lift */
--motion-base:   300ms;   /* 카드 hover lift, opacity */
--motion-settle: 600ms;   /* drop & settle 진입 */</pre>

  <h3>진입 데모</h3>
  <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
    <button class="theme-btn" style="position:static;" id="replay">진입 리플레이</button>
    <span class="muted">카드를 클릭해도 재생</span>
  </div>
  <div class="panel" style="min-height:96px;display:flex;align-items:center;justify-content:center;">
    <div id="demo-card" style="display:flex;gap:12px;align-items:center;width:100%;max-width:360px;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:12px;cursor:pointer;">
      <span style="flex:none;width:40px;height:40px;display:flex;align-items:center;justify-content:center;color:var(--ink-strong);">
        <svg viewBox="0 0 24 24" width="24" height="24" fill="none" stroke="currentColor" stroke-width="1" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9,8 H15 L17.5,10.5 V20.5 H9 Z"/><path d="M15,8 V10.5 H17.5"/><path d="M9,15 H5 V4 H11 L13,6 V8"/><path d="M11,4 V6 H13"/></svg>
      </span>
      <span style="display:flex;flex-direction:column;">
        <span style="font-size:14px;font-weight:600;color:var(--headline);">PDF 합치기</span>
        <span style="font-size:11.5px;color:var(--ink);">여러 PDF를 한 파일로</span>
      </span>
    </div>
  </div>

  <h3>hover lift 데모 — 마우스를 올려보세요</h3>
  <div class="panel" style="display:flex;gap:16px;align-items:center;flex-wrap:wrap;">
    <button id="demo-btn" style="background:var(--ink-strong);color:var(--bg);border:none;border-radius:4px;padding:10px 20px;font-family:var(--font-body);font-size:14px;font-weight:600;cursor:pointer;transition:transform var(--motion-fast) var(--ease-standard),opacity var(--motion-fast) var(--ease-standard);">압축 실행</button>
    <div id="demo-hovercard" style="display:flex;gap:10px;align-items:center;background:var(--bg);border:1px solid var(--border);border-radius:4px;padding:12px 16px;cursor:pointer;transition:transform var(--motion-base) var(--ease-settle),border-color var(--motion-base) var(--ease-settle);">
      <span style="font-size:13px;color:var(--ink-strong);">PDF 압축 카드</span>
    </div>
    <span class="muted">버튼 = fast + standard · 카드 = base + settle</span>
  </div>
```

Add to the `<style>` block:

```css
  #demo-btn:hover { transform:translateY(-1px); opacity:.92; }
  #demo-btn:active { transform:translateY(0); }
  #demo-hovercard:hover { transform:translateY(-2px); border-color:var(--ink-strong); }
  @keyframes brand-drop-settle {
    0%{opacity:0;transform:translateY(9px);}
    60%{opacity:1;transform:translateY(-4px);}
    100%{opacity:1;transform:translateY(0);}
  }
  .play-drop { animation:brand-drop-settle var(--motion-settle) var(--ease-settle) both; }
```

- [ ] **Step 2: Add the replay script**

Inside the existing `<script>` IIFE (before its closing `})();`), add:

```js
    var card=document.getElementById('demo-card');
    function replay(){
      card.classList.remove('play-drop');
      void card.offsetWidth;
      card.classList.add('play-drop');
    }
    document.getElementById('replay').addEventListener('click',replay);
    card.addEventListener('click',replay);
    setTimeout(replay,200);
```

- [ ] **Step 3: Verify in a browser (manual)**

Reload `docs/brand.html`. Expected: the demo card drops in and settles (overshoot then rest) on load and on replay/click; hovering the button lifts 1px (fast), hovering the card lifts 2px with the settle easing; the token block matches `globals.css`. Toggle the theme — demos still read correctly. Enable OS "reduce motion" — the drop demo still uses a CSS keyframe here (doc demo), which is acceptable for a reference page; the note in principle #4 documents the runtime behaviour.

- [ ] **Step 4: Commit**

```bash
git add docs/brand.html
git commit -m "docs: brand.html Motion section + live demos"
```

---

## Task 7: Final verification

- [ ] **Step 1: Full test + design contract + build**

```bash
pnpm test src/app/globals.motion.test.ts
pnpm design:check
pnpm build
```
Expected: motion test PASS; `✓ DESIGN.md ↔ globals.css in sync`; build succeeds with no errors.

- [ ] **Step 2: Manual browser pass (user runs `pnpm dev`)**

Checklist:
- Workspace/tool entrance drops & settles (FadeInCenter).
- Tool card hover lifts with settle easing; button hover lifts (fast).
- `docs/brand.html`: all three sections render real artifacts; theme toggle works; motion demos run.
- OS reduce-motion: runtime entrance fades without transform; hover lifts are suppressed.

- [ ] **Step 3: Confirm scope was respected**

```bash
git diff --stat 71e7ea1..HEAD
```
Expected files only: `src/app/globals.css`, `src/app/globals.motion.test.ts`, `src/components/brand/FadeInCenter.tsx`, `src/components/brand/ToolCard.tsx`, `docs/brand.html`. No `DESIGN.md`, no per-tool files, no landing `Screen*` files.

---

## Self-Review

**Spec coverage:**
- Motion tokens (5) + `--motion-entrance` dropped → Task 1. ✓
- drop-settle keyframe (9/-4/0) → Task 1. ✓
- reduced-motion fallback → Task 1. ✓
- Primitive application (FadeInCenter, .toolcard, .btn-*, .nameplate, .handoff-action, ToolCard) → Tasks 1-3. ✓
- Per-tool transitions untouched (principle #2) → scope guard + Task 7 Step 3. ✓
- brand.html Logo / Iconography / Motion → Tasks 4-6. ✓
- brand.html references/mirrors tokens, no redefinition of the contract → Task 4 (mirror with header note). ✓
- `pnpm design:check` green, verified empirically → Task 1 Step 7 + Task 7. ✓
- DESIGN.md untouched → scope guard + Task 7 Step 3. ✓

**Placeholder scan:** The only PASTE directives point to exact source files + line ranges for already-committed SVG/font markup (mirroring committed artwork verbatim is correct and DRY — re-pasting 10 icon SVGs + the 80-line BrandMark into the plan would invite copy errors). All new code (CSS, FadeInCenter, brand.html scaffold, motion demo JS, the guard test) is shown in full. No TBD/TODO.

**Type/name consistency:** Token names (`--ease-standard`, `--ease-settle`, `--motion-fast`, `--motion-base`, `--motion-settle`), keyframe name (`drop-settle`), and utility class (`.animate-drop-settle`) are used identically across Tasks 1-3 and mirrored in brand.html. The brand.html demo keyframe is deliberately namespaced `brand-drop-settle` / `.play-drop` to avoid implying it reads the runtime keyframe.
