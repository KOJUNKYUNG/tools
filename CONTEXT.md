# Ontab — Context & Glossary

This is the canonical vocabulary for the Ontab codebase. When writing issues,
plans, ADRs, commit messages, or code identifiers, use the terms defined here
exactly — don't drift to synonyms. If a concept you need isn't listed, that's
a signal: either reconsider the term, or extend this file via `/grill-with-docs`.

For decisions referenced below, see `docs/adr/`.

---

## Product

### Ontab
The service. "On tab" — a toolbox that lives on a browser tab. A free,
no-login, no-payment web app of file utilities (PPT, PDF, image) aimed at
non-expert global users. Korean and English. AdSense is the only monetization
path, and it's deprioritized.

### Tool
A single utility (e.g. `pdf-merge`, `image-resize`). Each tool has a stable
**slug** that appears in routes, i18n keys, and analytics. The tool set is
**open-ended and grows over time** — Phase 2 adds more, and others can land
at any phase. Treat the table below as the **current snapshot**, not a cap:
any registry, type union, i18n key map, route generator, or test fixture
must accept new slugs being added without code changes to unrelated tools.

Snapshot as of 2026-05 (the Phase 1 migration surface):

| Slug              | Category | Purpose                                |
| ----------------- | -------- | -------------------------------------- |
| `ppt-background`  | PPT      | Apply / replace slide background       |
| `ppt-extract`     | PPT      | Extract slides → images / text         |
| `pdf-merge`       | PDF      | Combine multiple PDFs                  |
| `pdf-split`       | PDF      | Split a PDF into ranges                |
| `pdf-pages`       | PDF      | Reorder / delete / rotate pages        |
| `pdf-compress`    | PDF      | Reduce PDF file size                   |
| `pdf-to-image`    | PDF      | Rasterize PDF pages                    |
| `image-to-pdf`    | Image    | Bundle images into a PDF               |
| `image-resize`    | Image    | Resize raster images                   |
| `image-compress`  | Image    | Compress raster images                 |

Phase 2 will add more, and the list will keep evolving. **Anything that
hard-codes "10" is a bug** — derive counts from the registry, not from a
literal.

### Non-expert user
The target audience. Pastors preparing weekly church PPTs, lecturers,
students, office workers. They do not know what "rasterize" means and will
not read a tutorial. UI text and defaults assume zero domain literacy.

---

## Design System

For the concrete implementation contract (token names, material classes,
typography, layout variables, the visual fidelity rule), see
[`docs/design.md`](docs/design.md). The entries below define vocabulary.

### Silver
The active visual language (locked in 2026-05). OKLCH palette with hue 250
(cool neutral), accent colors `accent-electric` (blue) and `accent-copper`.
The previous **wood / cream / beige** direction is **deprecated** — do not
introduce warm tones. See `docs/adr/0001-silver-design-system.md`.

### Tray + Lid
The product metaphor. The landing experience is a physical-feeling toolbox:
a **tray** holds the tools; a **lid** lifts to reveal them when a category
is chosen. Replaces the earlier "desk with stationery" metaphor.

### Material classes
Pre-defined CSS classes in `src/app/globals.css` that produce the silver
look-and-feel: `rim`, `brushed`, `lid`, `glint`, `nameplate`, `glass-btn`,
`toolcard`, `tray-photo`, `dark-tray-surface`. **Reuse these — do not invent
new material classes or silver tokens.**

### Visual fidelity contract
The design handoff in `ontab_design/` (gitignored, local only) is the source
of truth for inline styles, magic numbers (e.g. 78px wordmark, 92px card
height, 620px workspace, 900ms cubic-bezier), and className combinations.
When porting handoff JSX into the app, **preserve those verbatim**; only the
React/TS scaffolding (imports, state, types) is allowed to change.

### Typography
Pretendard (Korean), Space Grotesk (display), Inter (body), JetBrains Mono.
Geist is deprecated.

---

## Architecture

### Landing-inline execution model (core contract)
The final shape of every tool is **inline inside the landing page** — the
user uploads, processes, and downloads without leaving `/`. The interactive
landing's third screen (`Screen3Workspace`) is where this happens. The
`[lang]/(chrome)/tools/{slug}` routes remain, but only as **deep links for
SEO and backwards compatibility**. A migrated tool ships the same component
in two mount points: inline in `Screen3Workspace` and standalone at its
slug route.

### Phase 0 → Phase 1 bridge
Until a given tool is migrated, `Screen3Workspace`'s "open this tool" action
is a temporary `Link` to `/${locale}/tools/${slug}`. Phase 1 work for that
tool means **replacing that bridge link with an inline call** to the tool's
component. The bridge stays in place tool-by-tool; do not remove it
wholesale.

### Route structure (do not refactor)
```
src/app/
├── layout.tsx                          # real root: <html>, fonts, Providers, Toaster
├── proxy.ts                            # Next 16 native locale redirect (/ → /ko or /en)
└── [lang]/
    ├── layout.tsx                      # slim; mounts <LangSync> only
    ├── page.tsx                        # InteractiveLanding (no chrome)
    └── (chrome)/
        ├── layout.tsx                  # Header + Footer chrome
        └── tools/{slug}/page.tsx       # × 10
```
The `(chrome)` group exists specifically so the landing can render
full-bleed tray imagery without Header/Footer margins. **Do not** flatten
the group or move the landing under chrome.

### i18n
Native Next 16 `[lang]` segment + `proxy.ts` locale negotiation
(`@formatjs/intl-localematcher` + `negotiator`). Translation JSON lives in
`src/i18n/locales/{ko,en}.json`. Two locales: `ko`, `en`. **No `next-intl`.**
Locale toggle is a two-state KO/EN switch in the header — there is no
third-axis navigation.

---

## Phases

Roadmap units. Each phase is a discrete release surface, not a sprint.

### Phase 0 — Foundation (complete, merged 2026-05)
i18n infra, route structure, silver design tokens, material classes, brand
components (`src/components/brand/`), interactive landing
(`src/components/landing/`), new Header/Footer/LanguageToggle. All 10 tool
pages preserved as-is under `(chrome)/tools/{slug}`.

### Phase 1 — Tool migration (in progress)
Migrate each tool's page body to the silver design and absorb its
`IMPROVEMENTS.md` items. Then replace the corresponding Phase 0 bridge link
in `Screen3Workspace` with an inline component call. **One tool = one
branch = one PR**, branch name `feat/ontab-phase-1-{slug}`. Priority order:
`ppt-background → image-resize → image-compress → pdf-merge → pdf-split →
pdf-pages → pdf-compress → pdf-to-image → image-to-pdf → ppt-extract`.

### Phase 2 — New tools
Additional utilities beyond the canonical 10: PDF watermark / page numbers /
lock / OCR / edit, image background-removal / crop / watermark / HEIC&SVG
conversion, PPTX compression, slides → image batch. Priority is re-evaluated
at the end of Phase 1.

### Phase 3 — SEO & monetization
Per-tool metadata, JSON-LD, sitemap, AdSense placement.

### Phase 4 — Docs & public launch
README polish, contribution docs, open-source publication.

---

## Working conventions

### Task boundary
One feature / bugfix / migrated tool. The user must approve before the next
one starts. Each task ends with a Done / Why / Next recap. No automatic
chaining.

### Subagent-driven development
Large work is scoped via `superpowers:brainstorming`, captured in a plan
file under `docs/superpowers/plans/`, and dispatched task-by-task via
`superpowers:subagent-driven-development`. The main session reviews and
coordinates; subagents do the writing.

### Static verification only
Subagents must not run `pnpm dev` (no interactive Ctrl+C). Verification is
`pnpm exec tsc --noEmit` + `pnpm build`. The user runs the dev server.

### Staging
Never `git add -A` — the design handoff folder and other local-only artifacts
are at risk. Always stage explicit paths.
