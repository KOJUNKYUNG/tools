# ADR 0004 — Monochrome supersedes the silver design system

- **Status:** Accepted
- **Date:** 2026-06-09 (foundation) · 2026-06-12 (landing & brand decisions)
- **Supersedes:** ADR-0001 (silver design system) — the metallic *execution*;
  the tray + lid *product metaphor* survives, flattened to abstraction
- **Relates to:** ADR-0003 (DESIGN.md standard format — the spec this
  redesign populates)

## Context

The silver system (ADR-0001) solved the wood-era problems, but its execution
drifted away from the product goal — a **well-made instrument: quiet, precise,
confident**:

1. **Material ornament fought flatness.** Brushed gradients, rims, glints,
   frosted glass, and a photographic metal tray added depth and ornament that
   the UI then had to work around (fragile `backdrop-filter`, blend-mode
   dependent hard-coded colors, inconsistent card grounds between the landing
   and deep-link routes).
2. **Emphasis depended on a hue.** The blue `accent-electric` carried
   selection and download states, so state reading depended on color rather
   than contrast — one more axis to keep consistent across light/dark.
3. **The system invited drift.** Per-tool one-offs (boxed file rows, filled
   toggles, tinted shadows) kept appearing because the material language had
   no single grammar to enforce.

In 2026-06 a full redesign replaced the execution: **high-contrast monochrome
("editorial black & white")** — confidence from contrast, typography, and
negative space, never from color or ornament.

## Decision

Adopt monochrome as the **only** visual system. The populated root `DESIGN.md`
is the binding spec (ADR-0003); this ADR records the supersession and the
hard-to-reverse calls.

- **Palette:** one 7-step neutral ramp (`--mono-0…1000`), consumed through
  semantic aliases (`--bg`, `--surface`, `--ink`, …) that invert for dark
  mode. No accent hue; emphasis is `--emphasis` (Black / Paper). The single
  exception is user document-preview content (original colors).
- **Typography:** Clash Display (display/headline, Latin only) + IBM Plex
  Sans KR (title/body) + Nanum Gothic Coding (label/mono). Pretendard is
  retained solely for canvas text rasterisation (`renderTextToPng`) and as a
  Korean fallback.
- **Depth:** flat — tone, hairlines, and contrast; crisp radii. The metallic
  material classes (`rim`, `brushed`, `lid`, `glint`, `glass-btn`) are
  retired.
- **Button grammar:** four roles — `.nameplate` (secondary outline), tab
  underline (every single-select), `.btn-primary` (dark fill), `.btn-download`
  (max-contrast fill).

### Landing & brand (decided 2026-06-12)

- **The tray photograph is retired.** `tray-bg.png`, `.tray-photo`, and the
  dark-mode `.dark-tray-surface` gradient go; every screen's ground is flat
  `--bg`. The tray + lid metaphor survives **conceptually** — in the
  open/close interaction, motion, and copy — not in rendering. (Considered:
  keeping the photo with an editorial B&W grade, or a non-object grain
  texture; rejected to keep surfaces genuinely flat and to unify the landing
  with deep-link routes.)
- **The tool grid floats** directly on `--bg` — no tray-well panel.
  (Considered: a `--bg-soft` recessed well as a flattened tray; rejected for
  a more minimal editorial read.)
- **Landing hero** = the `display` role at ×2 scale: Clash Display Medium
  78px, plain `--headline` ink. The Pretendard emboss ("stamped metal") and
  blend modes are removed. Clash Display appears exactly twice on the site:
  the header wordmark and the hero (Korean text structurally cannot use it —
  no Hangul glyphs).
- **Category selection is a single-select**, so it uses the same tab-underline
  grammar as every in-tool toggle (Screen 1 renders the row unselected; the
  glass buttons are retired).
- **Brand mark** flattens to a solid `--ink-strong` square with an inset 1px
  `--surface` line; **footer meta** (version/license) moves to the `label`
  role.

## Consequences

**Positive**

- One grammar site-wide: every single-select, button role, and surface step
  reads the same on every screen, and light/dark inversion is free via
  aliases.
- The landing, workspace, and deep-link routes finally share one ground —
  the card-shell unification's frosted-vs-photo workarounds become moot.
- `DESIGN.md` + `pnpm design:lint` turn "did the design change?" into a
  diff-able check.

**Negative / accepted costs**

- The neutralised `silver-*` compat tokens and the legacy
  `.nameplate[data-active]` fill (image category) linger until their cleanup
  passes — two systems coexist in the interim.
- A future re-introduction of color (e.g. marketing pages) has to argue past
  this ADR explicitly.
- The brand loses the photographic "physical toolbox" hook; motion and copy
  must carry the metaphor alone.

## Related

- Root `DESIGN.md` (the binding spec) · `src/app/globals.css` (runtime tokens).
- `CONTEXT.md` → "Design System" (vocabulary: Monochrome, Tray + Lid,
  Treatment classes).
- ADR-0001 (superseded) · ADR-0003 (spec format).
