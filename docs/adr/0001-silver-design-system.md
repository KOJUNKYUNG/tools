# ADR 0001 — Silver design system

- **Status:** Superseded by [ADR-0004](0004-monochrome-supersedes-silver.md)
  (monochrome) — the tray + lid metaphor survives; the metallic execution,
  palette, and typography do not
- **Date:** 2026-05-13
- **Supersedes:** the earlier wood / cream / beige direction explored
  during the 2026-04 redesign spec

## Context

Ontab's first design pass leaned on a "desk with stationery" metaphor in warm
tones (wood, cream, beige). It was charming but two things broke down:

1. The **tray + lid** product metaphor — a physical toolbox with a lid that
   lifts to reveal tools — reads as **metal**, not wood. The visual
   language and the metaphor were fighting.
2. Warm beige surfaces made it hard to land a confident, "premium utility"
   tone for non-expert global users; everything drifted toward "cozy app"
   when the goal is "tool that feels well-made."

In 2026-05 a complete silver/metallic handoff package was produced
(`ontab_design/`, gitignored). It nails the tray + lid metaphor, has
working dark-mode treatments, and ships material treatments
(brushed, rim, glint, etc.) as reusable CSS classes.

## Decision

Adopt the silver/metallic design language as the **only** visual system for
Ontab. The wood/cream/beige direction is deprecated and must not be
reintroduced.

Concretely:

- **Palette:** OKLCH scale on hue 250 (cool neutral), exposed as `silver-*`
  tokens. Accent colors are `accent-electric` (blue) and `accent-copper`.
  No new color tokens — extend the silver scale instead.
- **Material classes** (defined once in `src/app/globals.css`):
  `rim`, `brushed`, `lid`, `glint`, `nameplate`, `glass-btn`, `toolcard`,
  `tray-photo`, `dark-tray-surface`. Reuse these; do not invent new
  material classes.
- **Typography:** Pretendard (KO) + Space Grotesk (display) + Inter (body)
  + JetBrains Mono. Geist is deprecated.
- **Dark mode:** `next-themes` with `attribute="class"` and the `.dark`
  selector. The tray photo's dark variant is selected via
  `html.dark .tray-photo` — pure CSS, no JS swap — so that locale changes
  do not cause a flash.
- **Visual fidelity contract:** the handoff JSX in `ontab_design/` is the
  source of truth for inline styles, magic numbers (78px wordmark, 50×150
  nameplate, 92px card height, 620px workspace, 900ms cubic-bezier, etc.),
  and className combinations. When porting handoff code into the app,
  preserve those **verbatim**; only the React/TS scaffolding (imports,
  state, types) may be restructured.

## Consequences

**Positive**

- The product metaphor and the visual surface finally agree.
- Reuse is enforced by a small, named set of material classes — agents
  cannot drift the system one ad-hoc class at a time.
- The verbatim fidelity rule turns "does this look right?" from taste into
  a diff-able check.

**Negative / accepted costs**

- Any future warm-tone proposal (seasonal theme, holiday skin, etc.) has
  to argue past this ADR explicitly.
- The handoff folder is local-only and gitignored, so contributors need
  it shared out-of-band to reproduce designs. (Acceptable for now — the
  project is single-maintainer.)

## Related

- `CONTEXT.md` → "Design System" section (vocabulary).
- `src/app/globals.css` (token + material class definitions).
- `src/components/brand/` (components that consume the system).
