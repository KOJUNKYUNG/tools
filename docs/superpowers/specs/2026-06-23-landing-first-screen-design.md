# Landing first-screen enhancement — design spec

**Date:** 2026-06-23
**Scope:** Brand foundation goal #4 — enhance the landing **first screen** (Screen 1).
**Decision:** Variant **B (tray)**, implemented on **Screen 1 only**.
**Status:** Implemented on branch `feat/landing-first-screen-tray` (tsc + build green).

---

## Goal

Make the landing first screen immediately legible to a non-expert (the north star:
a pastor preparing a weekly church PPT) and let them reach a tool fast — **without
over-explaining**. Today the first screen shows only the brand name, a single
abstract descriptor line, and the category tabs; the differentiators (no login, no
upload, no limits) live only in the footer.

Two directions were explored side-by-side in `docs/landing-explore.html`:

- **Variant A** — keep the centered hero, stack a value headline + benefit blocks
  under "Ontab" (minimal change). *Considered, not chosen.*
- **Variant B (chosen)** — bring the **tool workspace surface (the "tray")** onto
  the first screen as a real, material panel, with "Ontab" tossed at the top and the
  value layer centered inside it.

---

## Design intent (record for later doc sync)

> **Entry is the lead; the value/trust layer is the supporting cast.** The tray
> previews the stage where work actually happens.

- The primary flow is **fast entry via the category tabs**. SEO-driven visitors
  arrive with a task in mind and expect: "a site for working on documents in the
  browser — PPT/PDF/image, each with tools — let me go to my category." The added
  headline + benefit blocks are **for the minority who pause** and wonder "what is
  this / how does it work / is it safe / is it free." Over-explaining is harmful, so
  the layer stays quiet and secondary.
- **Why the tray:** the brand mark is a document tossed on a desk. Variant B makes
  that literal — the first screen *is* the tool tray (the white workspace surface),
  with "Ontab" tossed at the top, slightly tilted. It gives the brand a material
  home and foreshadows the surface where the user will actually work.
- **Eventual vision (NOT this PR):** the same tray persists into Screen 2 (category
  grid) and Screen 3 (tool workspace) at one constant size, unifying the per-tool
  workspace heights. That is a larger change (Screen 2/3 + the CONTEXT contract) and
  is deliberately deferred — see **Out of scope** / **Deferred follow-up**.

This intent must be carried into the brand/design docs during the deferred doc-sync.

---

## Layout & composition (Screen 1 only)

Header (unchanged, keeps the wordmark) + `CategoryStrip` (unchanged position) +
**tray** + Footer. The tray replaces the old centered hero block.

```
Header: [mark Ontab]                          [KO/EN] [☾]
        ─────────────────────────────────────────────
              eyebrow · [프레젠테이션 | 문서 | 이미지]   ← CategoryStrip (unchanged)

        ┌───────────────── tray (white) ─────────────────┐
        │                  Ontab  (tilted)                │   ← top-center, +2.5°
        │                                                 │
        │           브라우저 탭에서 끝내는 문서 작업          │   ← headline
        │      로그인 없음        │        업로드 없음        │   ← benefit blocks
        │      <2 sentences>     │     <2 sentences>      │
        └─────────────────────────────────────────────────┘
        ─────────────────────────────────────────────
Footer: © 2026 …                                v0.1 · …
```

The tray rides the existing lid entrance (scale `0.94 → 1` + opacity) and is hidden
(`opacity 0`, `pointer-events:none`, `aria-hidden`) once a category opens.

---

## Copy (final — KO / EN)

**Headline** (`landing.headline`)
- KO: `브라우저 탭에서 끝내는 문서 작업`
- EN: `Document work, done in a browser tab`

**Benefit blocks** (`landing.benefits` — array of `{ label, desc }`, where `desc`
is an array of sentences, each rendered on its own line)

| # | label (KO / EN) | desc (KO) | desc (EN) |
|---|---|---|---|
| 1 | 로그인 없음 / No sign-up | 로그인과 설치 없이 사용 가능합니다. <br> 제한 없이 무료로 사용하세요. | No account or install needed. <br> It's free, with no usage limits. |
| 2 | 업로드 없음 / No upload | 파일을 브라우저 안에서만 처리합니다. <br> 서버에 업로드하지 않아 파일이 유출될 위험이 없습니다. | Files are processed in your browser, never sent to a server. <br> So nothing leaves your device. |

`<br>` marks the per-sentence line break. Tone is unified (`~합니다`): first sentence
states what is absent, second the resulting benefit.

---

## Visual treatment (tuned at 1440×900 via docs/landing-explore.html)

Reuses existing tokens only. **No new tokens, no color additions.**

| Element | Spec |
|---|---|
| Tray | `position:absolute` in `main`; `top 150px`, `bottom 120px`; `width min(var(--tweak-workspace-width), calc(100vw - 32px))` (= the live tool width, 950px); `--surface`, `1px --border`, `border-radius 14px`, `box-shadow var(--shadow-lg)` |
| "Ontab" title | `font-display`, 112px, weight 520, track −0.02em; top-center (`top 80px`, centered), `rotate(2.5deg)` |
| Headline | `font-display`, 21px, weight 450, track −0.02em, `--ink-strong`, centered |
| Value layer position | centered at `top: calc(50% + 65px)` of the tray |
| Benefit label | `font-mono`, 12px, `letter-spacing 0.12em`, uppercase, `--ink-strong` |
| Benefit desc | `font-ko`, 11px, `line-height 1.5`, `--ink-soft`; one sentence per line |
| Block | `max-width 215px`, `padding 0 20px`, `margin-top 15px` from headline |
| Block separator | faint 1px vertical line — `color-mix(in srgb, var(--ink-soft) 28%, transparent)` |

Motion: rides the existing lid entrance; no per-element animation; result-pop not
involved.

**Cross-height caveat:** values were tuned at 1440×900. The `CategoryStrip` is
percentage-positioned while the tray uses fixed px (top/bottom) — verify there is no
collision across viewport heights (≈768 → 1080) in the dev server; adjust the tray
`top` or the strip offset if needed.

---

## Files changed

- **`src/components/landing/Screen1Landing.tsx`** — hero block replaced by the tray
  (inline styles, mirroring the existing hero's inline-style convention; comment
  points to `docs/landing-explore.html`).
- **`src/i18n/dictionaries/ko.json`** / **`en.json`** — under `landing`: removed the
  unused `descriptor`; added `headline` (string) and `benefits` (array of
  `{ label, desc:string[] }`).
- **No `i18n/config.ts` change** — `Dictionary` is inferred from `ko.json`.
- **No `globals.css` / token change** — reuses `--tweak-workspace-width`,
  `--surface`, `--border`, `--shadow-lg`, and the motion tokens.

---

## Out of scope

- **Screen 2 (grid) and Screen 3 (workspace)** — not touched this PR.
- **Tray persistence across screens** and **workspace-height unification** (analysis
  below) — the eventual vision, deferred.
- `DESIGN.md`, `docs/brand.html`, `docs/design-preview.html`, `CONTEXT.md` edits.

---

## Known doc tension + deferred follow-up (per user's plan)

- **CONTEXT tension:** `CONTEXT.md` states *"Tray + Lid … is conceptual, not
  material … There is no photographic tray, no rendered lid."* This PR introduces a
  **material rendered tray on Screen 1**, partially superseding that statement.
  CONTEXT is **not** edited now (deferred); the Screen 2/3 contract still holds as
  written. Reconcile during the doc-sync pass.
- The brand/design-doc sync is **deferred** to a later cleanup that reconciles
  `design-preview.html` + `brand.html` and folds in this landing work. Also stale
  until then: `DESIGN.md`'s "Landing hero" prose (describes the old 14px descriptor).
- `docs/landing-explore.html` is a **temporary** session companion (real-scale
  1440×900 preview + tuning) to be merged into `design-preview.html` during that
  pass, then removed.
- **Workspace-height unification analysis (for the persistence step):** tool bodies
  are content/flex-driven (e.g. `pdf-arrange` result `min-h-[440px]`, 204px tiles;
  two-pane tools fill via `flex-1`; many use `min-h-0 … overflow-y-auto`). A unified
  tray content height of **~460–500px (panel ~520–560px)** fits the heaviest tools
  without forcing scroll; exact value to be confirmed visually at 1280×800.

---

## Verification

`pnpm exec tsc --noEmit` → green. `pnpm build` → green. Visual check by the user in
the dev server and via `docs/landing-explore.html`. Shipping gate `/review` → `/ship`
before the PR.
