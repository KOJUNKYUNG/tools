# Landing first-screen enhancement — design spec

**Date:** 2026-06-23
**Scope:** Brand foundation goal #4 — enhance the landing **first screen** (Screen 1).
**Decision:** Variant **A (centered hero + value layer)**, Screen 1 only.
**Status:** Implemented on branch `feat/landing-first-screen` (tsc + build green).

---

## Goal

Make the landing first screen immediately legible to a non-expert (the north star:
a pastor preparing a weekly church PPT) and let them reach a tool fast — **without
over-explaining**. Today the first screen shows only the brand name, a single
abstract descriptor line, and the category tabs; the differentiators (no login, no
upload, no limits) live only in the footer.

Two directions were explored side-by-side in `docs/landing-explore.html`:

- **Variant A (chosen)** — keep the centered hero; under "Ontab", add a value
  headline + two benefit blocks. Minimal change; tabs stay the lead.
- **Variant B (tray)** — bring the tool workspace surface onto the landing as a
  material panel. Prototyped on this branch, then **dropped** (larger scope: it
  would touch Screen 2/3 + the CONTEXT "Tray + Lid is immaterial" contract).

---

## Design intent (record for later doc sync)

> **Entry is the lead; the value/trust layer is the supporting cast.**

- The primary flow is **fast entry via the category tabs**. SEO-driven visitors
  arrive with a task in mind and expect: "a site for working on documents in the
  browser — PPT/PDF/image, each with tools — let me go to my category." The added
  headline + benefit blocks are **for the minority who pause** and wonder "what is
  this / how does it work / is it safe / is it free." Over-explaining is harmful, so
  the layer stays quiet and secondary, never competing with the tabs.

---

## Layout & composition (Screen 1 only)

Header (unchanged, keeps the wordmark) + `CategoryStrip` (unchanged position) +
centered hero stack + Footer. The single descriptor line is replaced by the value
layer.

```
        eyebrow · [프레젠테이션 | 문서 | 이미지]   ← CategoryStrip (unchanged)

                       Ontab                      ← wordmark, 112px
             브라우저 탭에서 끝내는 문서 작업          ← headline
        로그인 없음        │        업로드 없음        ← benefit blocks
        <2 sentences>     │     <2 sentences>      ←   (faint divider)
```

The hero stack is centered (`top:50%`, nudged 20px up) and rides the existing lid
entrance (scale `0.94 → 1` + opacity), fading out once a category opens.

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
| Strip position | `CategoryStrip` keeps the original global position (`--tweak-categories-y` −64px); no Screen-1 override |
| Hero block | centered: `top:50%`, `transform: translate(-50%, calc(-50% - 10px + var(--tweak-title-y))) scale(…)`; lid entrance (scale 0.94→1 + opacity) |
| "Ontab" | `font-display`, 94px, weight 520, track −0.02em, line-height 1, `--headline` |
| Headline | `font-display`, 16px, weight 400, track −0.02em, line-height 1.2, `--ink-strong`; **7px** below "Ontab" (reads as its subtitle) |
| Benefit row | 43px below the headline |
| Benefit label | `font-mono`, 12px, `letter-spacing 0.12em`, uppercase, `--ink-strong` |
| Benefit desc | `font-ko`, 11px, `line-height 1.5`, `--ink-soft`; one sentence per line |
| Block | `max-width 215px`, `padding 0 20px` |
| Block separator | faint 1px vertical line — `color-mix(in srgb, var(--ink-soft) 28%, transparent)` |

Motion: rides the existing lid entrance; no per-element animation; result-pop not
involved.

---

## Files changed

- **`src/components/landing/Screen1Landing.tsx`** — descriptor replaced by the value
  layer (Ontab + headline + benefit blocks); inline styles mirror the existing hero
  convention; comment points to `docs/landing-explore.html`.
- **`src/i18n/dictionaries/ko.json`** / **`en.json`** — under `landing`: removed the
  unused `descriptor`; added `headline` (string) and `benefits` (array of
  `{ label, desc:string[] }`).
- **No `i18n/config.ts` change** — `Dictionary` is inferred from `ko.json`.
- **No `globals.css` / token change** — reuses `--tweak-title-y` and the motion tokens.

---

## Out of scope

- Variant B (the material tray) and any tray persistence across screens.
- Screen 2 (grid) and Screen 3 (workspace).
- `DESIGN.md`, `docs/brand.html`, `docs/design-preview.html`, `CONTEXT.md` edits.

---

## Deferred follow-up (per user's plan)

- The brand/design-doc sync is **deferred** to a later cleanup that reconciles
  `design-preview.html` + `brand.html` and folds in this landing work. Stale until
  then: `DESIGN.md`'s "Landing hero" prose (describes the old 14px descriptor).
- `docs/landing-explore.html` is a **temporary** session companion (real-scale
  1440×900 preview + tuning, with the dropped variant B kept for reference) to be
  merged into `design-preview.html` during that pass, then removed.

---

## Verification

`pnpm exec tsc --noEmit` → green. `pnpm build` → green. Visual check by the user in
the dev server and via `docs/landing-explore.html`. Shipping gate `/review` → `/ship`
before the PR.
