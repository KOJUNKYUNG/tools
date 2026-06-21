# Brand identity reference (`docs/brand.html`) + motion tokens

Date: 2026-06-21
Status: Approved (brainstorming)
Scope: Brand foundation phase, goal #1 (Motion). Goals #4 (landing) and #5
(animation rollout) are explicitly out of scope.

## Context

Brand foundation goals #2 (logo/mark) and #3 (tool icons) already shipped
(PR #36, master `9b39a99`). Logo and iconography are decided. The only open
design decision in the brand foundation phase is **Motion**.

This work produces two artifacts:

1. `docs/brand.html` — a standalone living brand reference (precedent:
   `docs/design-preview.html`) documenting the shipped Logo and Iconography and
   the newly designed Motion language.
2. Motion tokens in `src/app/globals.css` — the single runtime source of truth
   for duration/easing values that `brand.html` then demonstrates.

### Why separate from `DESIGN.md`

`DESIGN.md` is a Google Stitch `designmd` machine-verified token contract. Its
front-matter categories are `colors`, `typography`, `rounded`, `spacing`,
`components` only — there is no `motion` or `iconography` type. Adding motion
there would break `designmd` lint. So concerns are separated: `DESIGN.md` stays
the immutable token contract (untouched this session), `docs/brand.html`
expresses identity (logo, icons, motion). Colors/type in `brand.html` only
*reference* the `globals.css` tokens — never redefine them.

## Motion design

### Brand motion seed

The mark is "a tossed document folder settling on a desk" → the motion language
is **drop & settle**: elements fall a short distance and settle into place.

### Principles (documented in `brand.html`)

1. **Brand motion lives at the shell / launcher level** — the act of choosing a
   tool and entering it. Drop & settle and entrances belong here.
2. **Tools stay quiet inside.** Inside a tool's working UI there is no
   decorative entrance or transform motion. The only motion is functional
   micro-feedback (e.g. option-button colour change), which already runs at
   ~150ms and is left untouched.
3. **One settle character.** Entrances and hover lifts share the same
   decelerate-and-rest easing (`--ease-settle`) so the whole shell feels like
   one family.
4. **Respect reduced motion.** `prefers-reduced-motion: reduce` drops all
   transforms; only opacity (or an instant state change) remains.

### Tokens (`src/app/globals.css`, `:root`)

These consolidate the de-facto inline values (150/220/320/360/460ms, two
curves) scattered across the codebase into a small semantic set. Final values
were tuned interactively and locked by the user.

```css
:root {
  --ease-standard: cubic-bezier(.4, 0, .2, 1);   /* general in-out (fades, colour) */
  --ease-settle:   cubic-bezier(.25, .8, .25, 1); /* decelerate-and-rest — brand character */
  --motion-fast:   250ms;  /* hover colour/border, toggles, button lift */
  --motion-base:   300ms;  /* card hover lift, opacity, small transforms */
  --motion-settle: 600ms;  /* drop & settle signature entrance */
}
```

`--motion-entrance` is intentionally **not** introduced: the entrance *is*
drop & settle, which uses `--motion-settle`. Three core durations only (YAGNI).

### Drop & settle keyframe (`globals.css`)

A reusable keyframe + utility class (`.animate-drop-settle`) lives in
`globals.css` alongside the tokens:

```css
@keyframes drop-settle {
  0%   { opacity: 0; transform: translateY(9px); }
  60%  { opacity: 1; transform: translateY(-4px); }
  100% { opacity: 1; transform: translateY(0); }
}
```

Runs at `--motion-settle` with `--ease-settle`.

### Application (this session = shared primitives only)

Per the locked scope, only shared brand primitives are retrofitted to consume
the tokens; per-tool `transition-colors` are left as-is.

| Target | Change |
|---|---|
| `FadeInCenter` | scale-fade → drop & settle (the signature brand entrance) |
| `.toolcard:hover` (globals.css) | tokenise to `--motion-base` + `--ease-settle` |
| `.btn-primary`, `.btn-download` | `0.15s ease` → `--motion-fast` + `--ease-standard` |
| `.nameplate`, `.handoff-action` | tokenise their `0.15s` transitions |
| `ToolCard` inline (open zoom) | reference tokens instead of literals |
| per-tool `transition-colors` (~150ms) | untouched (principle #2) |

### Accessibility

Add `@media (prefers-reduced-motion: reduce)` in `globals.css`: zero out
transform on the drop-settle keyframe and the tokenised hover lifts, keeping
opacity-only or instant transitions.

## `docs/brand.html` structure

Standalone HTML opened directly in a browser (no build step), mirroring
`docs/design-preview.html`. Light/dark toggle. Three sections:

1. **Logo** — render the actual `BrandMark` and `icon.svg` artwork. Document:
   concept ("desk + tossed folder + On"), clear space, minimum size, misuse
   examples, and the header fixed-colour vs favicon OS-inverting difference.
2. **Iconography** — render all 12 `ToolIcons`. Document the system: 24 grid,
   stroke 1.0, `currentColor`, round caps/joins, and the metaphor rules
   (page/slide/image marks; one shape per recurring verb — compress = four
   corner arrows, convert = arrow into target, extract = funnel).
3. **Motion** — read the `globals.css` tokens and demonstrate them live:
   duration/easing samples, a drop & settle entrance demo, hover lift demos,
   and the four principles. Colours/type reference `globals.css` tokens; no
   redefinition.

## Verification

- Open `docs/brand.html` in a browser; confirm all three sections render the
  real artifacts and the motion demos run.
- Run `pnpm design:check` and confirm green. Expectation: motion tokens do not
  trip the drift checker (it anchors on colour only) — verify empirically.
- Confirm `FadeInCenter`-wrapped pages now drop & settle on load and the
  reduced-motion fallback removes the transform.

## Out of scope

- Landing (goal #4) and broader animation rollout (goal #5).
- Migrating every per-tool inline transition to tokens (full unification).
- Any change to `DESIGN.md`.
