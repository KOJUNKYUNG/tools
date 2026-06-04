# Ontab — Design specification

The implementation contract for Ontab's visual surface. Read this when you're
about to build, port, or alter UI in this repo.

- **Why silver?** See [ADR-0001](./adr/0001-silver-design-system.md).
- **Vocabulary** (silver, tray + lid, material classes, visual fidelity contract):
  [CONTEXT.md → Design System](../CONTEXT.md#design-system).
- **Earlier wood/cream/beige spec:** archived at
  [`_archive/refactoring-plan.md`](./_archive/refactoring-plan.md). Not a
  baseline for new work.

This file is intentionally thin: when a number lives in the code, the code is
the source of truth and we link to it. We document **decisions and contracts**,
not values that would rot the moment Tailwind regenerates a token.

---

## 1. Source-of-truth files

| Concern                     | File                                                            |
| --------------------------- | --------------------------------------------------------------- |
| Color tokens, surfaces      | [`src/app/globals.css`](../src/app/globals.css) `@theme` block  |
| Material classes (CSS)      | `src/app/globals.css` (search for `.rim`, `.brushed`, etc.)     |
| Layout tweak variables      | `src/app/globals.css` (`--tweak-*` under `:root`)               |
| Brand components            | [`src/components/brand/`](../src/components/brand/)             |
| Interactive landing screens | [`src/components/landing/`](../src/components/landing/)         |
| Design handoff (local only) | `ontab_design/` — gitignored, shared out of band                |

If a token or magic number isn't in one of the files above, it doesn't exist
yet. Don't invent — extend the existing scale.

---

## 2. Color system

OKLCH on hue **250** (cool neutral). The scale is `silver-50` … `silver-900`,
exposed both as CSS vars (`--silver-50` …) and Tailwind utility colors
(`bg-silver-50`, `text-silver-700`, …) via `@theme inline` in `globals.css`.

Accents:

- `accent-electric` — primary accent (focus rings, active states, links).
  `accent-electric-hi` is the hover/raised variant.
- `accent-copper` — secondary accent. Sparing use; reserved for status or
  highlight moments.

Semantic aliases (also in `globals.css`): `--bg`, `--bg-soft`, `--surface`,
`--surface-2`, `--border`, `--hairline`, `--ink-soft`, `--ink`, `--ink-strong`,
`--headline`. **Prefer the semantic aliases over raw `--silver-*` when you can.**
They survive dark-mode swaps for free.

### Forbidden

- Warm tones — wood, cream, beige, terracotta. ADR-0001 deprecates them.
- New color tokens. Extend the silver scale or reuse an accent.
- Hard-coded hex / rgb in components. Always go through a CSS variable or
  Tailwind utility.

---

## 3. Material classes

These are pre-composed CSS classes in `globals.css` that produce the silver
look. **Reuse, never re-invent.**

| Class                | Purpose                                                    |
| -------------------- | ---------------------------------------------------------- |
| `rim`                | Subtle metallic edge on cards / panels                     |
| `brushed`            | Brushed-metal surface texture                              |
| `lid`                | The tray lid (lifts to reveal tools)                       |
| `glint`              | Diagonal highlight pass (rarely combined alone)            |
| `nameplate`          | Inset engraved label, used on `Nameplate` component        |
| `glass-btn`          | Translucent button surface                                 |
| `toolcard`           | Tool card chrome                                           |
| `tray-photo`         | Full-bleed tray imagery on the landing                     |
| `dark-tray-surface`  | Dark-mode swap for `tray-photo` (CSS-only, no JS)          |

If you need a treatment that isn't here, **stop and discuss** before adding
a class. The named set is small on purpose.

---

## 4. Typography

| Role     | Family          | Usage                                       |
| -------- | --------------- | ------------------------------------------- |
| Korean   | Pretendard      | All Korean text                             |
| Display  | Space Grotesk   | Headlines, wordmark, nameplates             |
| Body     | Inter           | English body, UI strings                    |
| Mono     | JetBrains Mono  | Code, slugs displayed inline                |

Loaded as Next.js `next/font` in `src/app/layout.tsx`. **Geist is deprecated**
— don't add it back.

---

## 5. Layout & motion constants

Layout numbers live as CSS custom properties under `:root` in `globals.css`,
prefixed `--tweak-*`. Current set (as of Phase 0 merge):

- `--tweak-bg-scale`
- `--tweak-header-bg-opacity`, `--tweak-footer-bg-opacity`
- `--tweak-categories-y`, `--tweak-title-y`
- `--tweak-card-height`, `--tweak-card-padding`
- `--tweak-emboss-depth`
- `--tweak-workspace-width`

When a component reads one of these, it must use `var(--tweak-*, <fallback>)`
so the variable can be retuned without code edits. Example pattern (from
`Screen3Workspace`):

```ts
width: "min(var(--tweak-workspace-width, 620px), calc(100vw - 32px))"
```

Motion: easing functions and durations are encoded **per-component as inline
styles** to preserve the design handoff verbatim (see §7). There's no global
motion token system on purpose — each screen's choreography is hand-tuned and
must not drift toward a generic "default transition."

---

## 6. Dark mode

`next-themes` with `attribute="class"` and the `.dark` selector. Two rules:

1. **No JS swap for images.** The tray photo's dark variant is selected via
   `html.dark .tray-photo` in CSS only. JS-driven swaps cause a flash on
   locale change (locale routing remounts the tree).
2. **Prefer semantic tokens** (`--ink`, `--surface`, …) so a single dark-mode
   override in `globals.css` flips the whole UI. Raw `--silver-*` references
   make components dark-mode-blind.

---

## 7. Visual fidelity contract (load-bearing)

The design handoff (`ontab_design/`, local-only) is the source of truth for
inline styles, magic numbers, and className combinations. When porting handoff
JSX into the app, **preserve those verbatim** — only the React / TS scaffolding
(imports, state shapes, types) is allowed to change.

Concretely, do not "clean up":

- Inline `style={{...}}` blocks that look hand-crafted
  (78px wordmark size, 50×150 nameplate, `min(var(--tweak-workspace-width,
  620px), calc(100vw - 32px))`, per-screen cubic-bezier timings, etc.)
- Hard-coded paddings, gaps, or sizes that match the handoff
- className stacks combining multiple material classes — even if redundant
  in isolation, the combination produces the metallic effect

If a value looks "weird," check the handoff first. If it still looks weird,
**ask** — don't refactor.

This is the most-broken rule when AI agents touch the UI. It's the rule that
makes Ontab look like Ontab, so it gets its own ADR-grade contract.

---

## 8. Adding new visual elements

Ordered checklist before you write CSS:

1. **Is there an existing material class that fits?** If yes, use it.
2. **Is there an existing semantic token?** Use `--surface`, `--ink`, etc.
   before `--silver-*`.
3. **Does the handoff cover this?** If yes, port verbatim.
4. **None of the above?** Stop, write a short note in the relevant ADR or
   open a new ADR. New visual primitives are decisions, not features.

---

## 9. Related

- [`CONTEXT.md`](../CONTEXT.md) — terminology, route structure, landing-inline
  execution model.
- [`docs/adr/0001-silver-design-system.md`](./adr/0001-silver-design-system.md) — why silver.
- [`docs/adr/0002-next16-native-i18n-and-chrome-route-group.md`](./adr/0002-next16-native-i18n-and-chrome-route-group.md) — why the `(chrome)` group exists (the landing's full-bleed contract is the reason).
- [`CONTEXT.md` → Phases](../CONTEXT.md#phases) — product roadmap.
