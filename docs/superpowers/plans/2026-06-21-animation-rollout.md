# Animation rollout (#5) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Roll the drop & settle motion system out to the result-reveal moment (a scale pop on the shared done card) and tokenise the landing hero transition, building on the #1 motion tokens.

**Architecture:** Add one new easing token (`--ease-pop`) + a `result-pop` keyframe/utility to `globals.css` (the single source of truth), apply the utility to the shared `ProcessingStatus` done card, and swap the landing hero's literal timing for motion tokens. `docs/brand.html` mirrors the new token + a demo. Reduced motion falls back to opacity-only.

**Tech Stack:** Next.js (App Router), CSS custom properties + keyframes, Vitest (node env, colocated `*.test.ts`), standalone HTML reference. Design contract guarded by `pnpm design:check`.

**Testing note:** Design-token + small-component work. Verification is the colocated token test (real RED-GREEN for Task 1), `pnpm build`, `pnpm design:check`, and manual browser. No forced unit tests on the visual changes.

**Locked values (from spec):** `--ease-pop: cubic-bezier(.34, 1.40, .64, 1)`; `@keyframes result-pop` scale 0.90 → 1 + opacity; `.result-pop` runs 400ms; reduced-motion → `ob-fade` opacity-only.

**Scope guard:** Only `ProcessingStatus` (done state) and `Screen1Landing` get behaviour changes. Per-tool result components, the `error` state, landing redesign (#4), and the `top` layout transitions are untouched. `DESIGN.md` is not touched.

---

## File Structure

- `src/app/globals.css` — **Modify.** Add `--ease-pop` to `:root`; add `@keyframes result-pop` + `.result-pop`; add `.result-pop` to the `prefers-reduced-motion` block.
- `src/app/globals.motion.test.ts` — **Modify.** Add guards for `--ease-pop`, the `result-pop` keyframe, and the reduced-motion fallback.
- `src/components/common/ProcessingStatus.tsx` — **Modify.** Add `result-pop` to the done-state container className.
- `src/components/landing/Screen1Landing.tsx` — **Modify.** Hero transition literals → motion tokens.
- `docs/brand.html` — **Modify.** Mirror `--ease-pop` in the token block; add a `result-pop` demo.

---

## Task 1: `--ease-pop` token + `result-pop` keyframe/utility in `globals.css`

**Files:**
- Modify: `src/app/globals.css` (`:root` motion tokens end at line 146; keyframes/reduced-motion block at lines 299-332)
- Test: `src/app/globals.motion.test.ts`

- [ ] **Step 1: Add failing test assertions**

In `src/app/globals.motion.test.ts`, add this new `it` block inside the existing `describe("motion tokens (single source of truth)", ...)` (after the existing `prefers-reduced-motion` test):

```ts
  it("declares the result-pop reveal (token, keyframe, reduced-motion fallback)", () => {
    // back-out overshoot easing token
    expect(css).toMatch(/--ease-pop:\s*cubic-bezier\(\.34,\s*1\.40,\s*\.64,\s*1\)/);
    // keyframe scales up from 0.90
    expect(css).toMatch(/@keyframes\s+result-pop/);
    expect(css).toMatch(/scale\(0\.90\)/);
    // reduced-motion downgrades .result-pop to the opacity-only fade
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.result-pop[\s\S]*?ob-fade/);
  });
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm test src/app/globals.motion.test.ts`
Expected: FAIL — `--ease-pop` / `result-pop` not present yet.

- [ ] **Step 3: Add the `--ease-pop` token**

In `src/app/globals.css`, immediately after the `--motion-settle: 500ms;` line (currently line 146, inside the first `:root`), add:

```css
  --ease-pop:      cubic-bezier(.34, 1.40, .64, 1); /* back-out overshoot — result reward */
```

- [ ] **Step 4: Add the `result-pop` keyframe + utility**

In `src/app/globals.css`, immediately after the `.toolcard-enter { ... }` rule (currently ends line 315) and before the `/* Opacity-only fallback ... */` comment (line 317), insert:

```css

/* Result reveal — the shared "완료" card pops in (a bounded reward, the one
 * place motion enters tool UI). Opacity-only fallback under reduced motion. */
@keyframes result-pop {
  from { opacity: 0; transform: scale(0.90); }
  to   { opacity: 1; transform: scale(1); }
}
.result-pop { animation: result-pop 400ms var(--ease-pop) both; }
```

- [ ] **Step 5: Add `.result-pop` to the reduced-motion block**

In `src/app/globals.css`, inside the existing `@media (prefers-reduced-motion: reduce) { ... }` block, immediately after the `.toolcard-enter { ... }` rule (currently lines 325-327), add:

```css
  .result-pop {
    animation: ob-fade var(--motion-base) var(--ease-standard) both;
  }
```

- [ ] **Step 6: Run the test to verify it passes**

Run: `pnpm test src/app/globals.motion.test.ts`
Expected: PASS (4 tests — the 3 existing + the new one).

- [ ] **Step 7: Verify the design contract**

Run: `pnpm design:check`
Expected: `✓ DESIGN.md ↔ globals.css in sync — N color anchors verified.` (`--ease-pop` is not a `--mono-*` colour, so the drift checker ignores it.)

- [ ] **Step 8: Commit**

```bash
git add src/app/globals.css src/app/globals.motion.test.ts
git commit -m "feat: result-pop reveal token + keyframe in globals.css"
```

---

## Task 2: Apply `result-pop` to the ProcessingStatus done card

**Files:**
- Modify: `src/components/common/ProcessingStatus.tsx` (done-state container, currently line 93-100)

- [ ] **Step 1: Add the class to the done container**

In `src/components/common/ProcessingStatus.tsx`, the `status === "done"` branch renders:

```tsx
        <div
          className="flex h-full w-full items-center gap-3 rounded-[8px] border px-3 py-2"
          style={{
```

Change the `className` to append `result-pop`:

```tsx
        <div
          className="result-pop flex h-full w-full items-center gap-3 rounded-[8px] border px-3 py-2"
          style={{
```

Leave the `error` branch and everything else unchanged.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Manual check (user runs `pnpm dev`)**

Run a tool to completion. Expected: the done card pops in (scale 0.90 → 1 with a slight overshoot, ~400ms). With OS reduce-motion on, it fades with no scale. The error state still appears instantly.

- [ ] **Step 4: Commit**

```bash
git add src/components/common/ProcessingStatus.tsx
git commit -m "feat: ProcessingStatus done card pops in on result reveal"
```

---

## Task 3: Tokenise the landing hero transition

**Files:**
- Modify: `src/components/landing/Screen1Landing.tsx` (hero transition, currently line 43)

- [ ] **Step 1: Replace the literal transition with tokens**

In `src/components/landing/Screen1Landing.tsx`, the hero block's `style` currently has:

```tsx
            transition: "transform 320ms cubic-bezier(.4,0,.2,1), opacity 240ms ease",
```

Replace that line with:

```tsx
            transition: "transform var(--motion-base) var(--ease-settle), opacity var(--motion-base) var(--ease-standard)",
```

Leave the `scale(${heroVisible ? 1 : 0.94})` transform and the `CategoryStrip` / `top` layout transitions unchanged.

- [ ] **Step 2: Verify it compiles**

Run: `pnpm build`
Expected: build succeeds.

- [ ] **Step 3: Manual check (user runs `pnpm dev`)**

Load the landing screen and open a category. Expected: the hero entrance / lid-open fade+scale feels the same as before (now driven by tokens — 300ms settle curve).

- [ ] **Step 4: Commit**

```bash
git add src/components/landing/Screen1Landing.tsx
git commit -m "refactor: landing hero transition references motion tokens"
```

---

## Task 4: Mirror `--ease-pop` + result-pop demo in `docs/brand.html`

**Files:**
- Modify: `docs/brand.html`

- [ ] **Step 1: Mirror the `--ease-pop` token in the `:root`**

In `docs/brand.html`, the `:root` motion block has:
```css
    --motion-fast:   250ms; --motion-base: 300ms; --motion-settle: 500ms;
```
Add `--ease-pop` on the next line:
```css
    --motion-fast:   250ms; --motion-base: 300ms; --motion-settle: 500ms;
    --ease-pop: cubic-bezier(.34,1.40,.64,1);
```

- [ ] **Step 2: Add `--ease-pop` to the Motion token `<pre>` block**

In the Motion section's token `<pre>` (the one listing `--ease-standard` … `--motion-settle`), add a line after `--motion-settle`:
```
--ease-pop:      cubic-bezier(.34,1.40,.64,1);   /* 결과 팝 리빌 */
```

- [ ] **Step 3: Add the result-pop demo markup**

In the Motion section, after the `진입 데모` panel (the `#demo-card` block) and before the `hover lift 데모` heading, insert:

```html
  <h3>결과 리빌 데모</h3>
  <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px;">
    <button class="theme-btn" style="position:static;" id="replay-pop">리빌 리플레이</button>
    <span class="muted">완료 카드가 팝으로 등장</span>
  </div>
  <div class="panel" style="min-height:64px;display:flex;align-items:center;justify-content:center;">
    <div id="pop-card" style="display:flex;align-items:center;gap:12px;width:100%;max-width:360px;background:var(--surface);border-radius:8px;padding:10px 12px;box-shadow:inset 2px 0 0 var(--ink-strong);transform-origin:center;">
      <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="var(--ink-strong)" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M8.5 12.5l2.5 2.5 4.5-5"/></svg>
      <span style="flex:1;"></span>
      <span style="background:var(--ink-strong);color:var(--bg);border-radius:9px;padding:6px 12px;font-size:11.5px;font-weight:600;white-space:nowrap;">다운로드</span>
    </div>
  </div>
```

- [ ] **Step 4: Add the result-pop CSS**

In the SECOND `<style>` block (the one with `.play-drop` / `brand-drop-settle`), add before its closing `</style>`:

```css
  @keyframes brand-result-pop {
    from { opacity:0; transform:scale(0.90); }
    to   { opacity:1; transform:scale(1); }
  }
  .play-pop { animation:brand-result-pop 400ms var(--ease-pop) both; }
```

And inside the existing `@media (prefers-reduced-motion: reduce)` block in that style section (where `.play-drop { animation:none; }` lives), add:
```css
    .play-pop { animation:none; }
```

- [ ] **Step 5: Extend the script to replay the pop**

Inside the existing `<script>` IIFE, immediately before its closing `})();`, add:

```js
    var popCard=document.getElementById('pop-card');
    function replayPop(){
      popCard.classList.remove('play-pop');
      void popCard.offsetWidth;
      popCard.classList.add('play-pop');
    }
    document.getElementById('replay-pop').addEventListener('click',replayPop);
    popCard.addEventListener('click',replayPop);
    setTimeout(replayPop,400);
```

- [ ] **Step 6: Verify (structural)**

Run:
`node -e "const s=require('fs').readFileSync('docs/brand.html','utf8'); console.log('ease-pop root:',/--ease-pop:\s*cubic-bezier/.test(s),'pop demo:',s.includes('id=\"pop-card\"'),'pop kf:',s.includes('brand-result-pop'),'replay fn:',s.includes('function replayPop'),'script tags:',(s.match(/<script/g)||[]).length,(s.match(/<\/script>/g)||[]).length,'style tags:',(s.match(/<style/g)||[]).length,(s.match(/<\/style>/g)||[]).length);"`
Expected: ease-pop root true, pop demo true, pop kf true, replay fn true, script tags 1/1, style tags 2/2.

- [ ] **Step 7: Commit**

```bash
git add docs/brand.html
git commit -m "docs: brand.html mirrors --ease-pop + result-pop demo"
```

---

## Task 5: Final verification

- [ ] **Step 1: Test + design contract + build**

```bash
pnpm test src/app/globals.motion.test.ts
pnpm design:check
pnpm build
```
Expected: motion test PASS (4 tests); `✓ DESIGN.md ↔ globals.css in sync`; build clean.

- [ ] **Step 2: Manual browser pass (user runs `pnpm dev`)**

- Tool completion → done card pops in (overshoot), error still instant.
- Landing hero entrance / lid open unchanged in feel.
- `docs/brand.html` → result-pop demo runs; token block shows `--ease-pop`.
- OS reduce-motion → done card fades (no scale); existing hover/entrance transforms still suppressed.

- [ ] **Step 3: Confirm scope**

```bash
git diff --stat 001c2b7..HEAD
```
Expected files only: `src/app/globals.css`, `src/app/globals.motion.test.ts`, `src/components/common/ProcessingStatus.tsx`, `src/components/landing/Screen1Landing.tsx`, `docs/brand.html`. No `DESIGN.md`, no per-tool result components.

---

## Self-Review

**Spec coverage:**
- `--ease-pop` token + `result-pop` keyframe/utility → Task 1. ✓
- Apply to ProcessingStatus done (only), error untouched → Task 2. ✓
- Reduced-motion opacity fallback for `.result-pop` → Task 1 Step 5. ✓
- Landing hero/lid tokenisation, `top`/scale left alone → Task 3. ✓
- brand.html mirrors `--ease-pop` + demo, reduced-motion in demo → Task 4. ✓
- design:check green, motion test extended → Task 1 + Task 5. ✓
- Out of scope (per-tool results, error reveal, #4, DESIGN.md) → scope guard + Task 5 Step 3. ✓

**Placeholder scan:** No TBD/TODO. Every code step shows exact code. The brand.html edits point to exact existing anchors with full insert code.

**Type/name consistency:** Token `--ease-pop`, keyframe `result-pop`, class `.result-pop` used identically across Tasks 1-2 and the test. brand.html demo deliberately namespaces `brand-result-pop` / `.play-pop` (mirrors, doesn't reuse the runtime keyframe), consistent with the existing `brand-drop-settle` / `.play-drop` convention.
