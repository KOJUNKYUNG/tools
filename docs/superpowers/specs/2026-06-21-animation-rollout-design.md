# Animation rollout (#5) — result-pop reveal + landing tokenisation

Date: 2026-06-21
Status: Approved (brainstorming)
Scope: Brand foundation goal #5 (animation rollout). Builds on the motion
tokens shipped in #1 (PR #37, `globals.css`). Landing redesign (#4) stays
separate.

## Context

The motion language (drop & settle) and its tokens (`--ease-standard`,
`--ease-settle`, `--motion-fast/base/settle`, the `drop-settle` keyframe,
reduced-motion fallback) shipped in #1. The locked principle: **brand motion
lives at the shell / launcher level; tools stay quiet inside** (only functional
micro-feedback). #5 rolls the system out to the two remaining surfaces decided
in brainstorming:

1. The **result reveal** moment — the shared "완료" card. Treated as a reward
   reveal (an explicit, bounded exception to "tools stay quiet"): the user chose
   a gentle scale **pop**, opacity-only fallback under reduced motion.
2. The **landing hero / lid-open transition**, which still uses duplicated
   literal timing values. Tokenise to remove the duplication while keeping the
   feel. (No landing redesign — that's #4.)

## Design

### 1. Result pop reveal

New runtime values in `src/app/globals.css`:

```css
/* :root */
--ease-pop: cubic-bezier(.34, 1.40, .64, 1); /* back-out overshoot — result reward */
```

```css
/* top-level */
@keyframes result-pop {
  from { opacity: 0; transform: scale(0.90); }
  to   { opacity: 1; transform: scale(1); }
}
.result-pop { animation: result-pop 400ms var(--ease-pop) both; }
```

(`400ms` is the locked duration; it is not one of the existing duration tokens
and is single-use, so it stays a literal in the `.result-pop` class rather than
adding a `--motion-*` token nobody else references — YAGNI.)

**Application:** add `result-pop` to the **done-state container** in
`src/components/common/ProcessingStatus.tsx` (`status === "done"`). This is the
shared "result ready" surface many tools render. The `error` state is not a
reward and stays instant. Per-tool result components (galleries, previews) are
content and are NOT animated (avoids motion noise inside tools).

**Reduced motion:** extend the existing `@media (prefers-reduced-motion: reduce)`
block so `.result-pop` falls back to an opacity-only fade (reuse `ob-fade`):
```css
.result-pop { animation: ob-fade var(--motion-base) var(--ease-standard) both; }
```

### 2. Landing tokenisation

In `src/components/landing/Screen1Landing.tsx`, the hero (and its lid-open /
close transition driven by `heroVisible`) currently uses literal values:
```
transition: "transform 320ms cubic-bezier(.4,0,.2,1), opacity 240ms ease"
```
Replace with motion tokens, preserving the feel:
```
transition: "transform var(--motion-base) var(--ease-settle), opacity var(--motion-base) var(--ease-standard)"
```
(320ms → `--motion-base` 300ms; the easing softens slightly to the brand settle
curve — within "keep the feel".) The `scale(0.94)` start value and the `top`
layout transitions (`200ms ease`, positional, not brand motion) are left as-is.

### 3. brand.html

`docs/brand.html` mirrors the runtime: add `--ease-pop` to the Motion token
block and a small `result-pop` live demo (a "완료" card popping in) alongside the
existing drop & settle / hover demos. Honour reduced-motion in the demo (per the
doc's own principle #4).

## Verification

- `pnpm build` — compiles clean.
- `pnpm design:check` — green (motion/easing tokens are not colour anchors).
- `src/app/globals.motion.test.ts` — extend to assert `--ease-pop` and the
  `result-pop` keyframe (scale 0.90 → 1) exist, plus the reduced-motion fallback
  covers `.result-pop`.
- Manual: trigger a tool to completion → done card pops in; landing hero entrance
  unchanged in feel; with OS reduce-motion on, the done card fades (no scale) and
  hover/entrance transforms stay suppressed.

## Out of scope

- Per-tool result components / galleries (stay as content).
- Landing redesign and hero layout (#4).
- Sweeping the remaining per-tool inline `transition-colors` to tokens.
- `error`-state reveal animation.
