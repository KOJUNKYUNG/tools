# Ontab — Context & Glossary

**Ontab** is a free, no-login, no-payment web toolbox of file utilities (PPT,
PDF, image) that runs in the browser tab — "on tab". It serves non-expert
global users (Korean and English) — pastors preparing weekly church PPTs,
lecturers, students, office workers — who need to fix a file fast without
learning jargon, creating an account, or installing software. Files are
uploaded, processed, and downloaded inline on the landing page — an in-browser
alternative to server-upload tools (iLovePDF, ppt.ai) with no daily limits and
PPT-specific features they lack. The tool set is open-ended and grows over time.
AdSense is the only (deprioritized) monetization path.

This document is the **entry point and canonical vocabulary** for the codebase.
When writing issues, plans, ADRs, commit messages, or code identifiers, use the
terms defined here exactly — don't drift to synonyms. If a concept you need
isn't listed, that's a signal: either reconsider the term, or extend this file
via `/grill-with-docs`.

---

## Document map

Where each kind of information lives, and when it gets written. **`CONTEXT.md`
holds what's stable; memory holds what's in flux.** When they overlap, this file
wins.

| Need | Lives in | Written when |
| ---- | -------- | ------------ |
| What Ontab is, domain terms, architecture contracts, Phase *definitions* | **this file** (`CONTEXT.md`) | A term or concept actually resolves — lazily, via `/grill-with-docs` |
| A hard-to-reverse decision + its rationale | **`docs/adr/`** | The decision is hard to reverse, surprising without context, and a real trade-off |
| The design spec — Google DESIGN.md standard format | **`DESIGN.md`** (root) | Populated during the design re-adjustment (ADR-0003); a validated scaffold until then |
| The *current* visual implementation contract (tokens, material classes, fidelity rule) | **`docs/design.md`** | Authoritative until `DESIGN.md` is populated; UI conventions/tokens change |
| The design of one tool/feature | **`docs/superpowers/specs/{date}-{slug}-design.md`** | Before building it, once brainstorming settles the design |
| The task breakdown to build one tool/feature | **`docs/superpowers/plans/{date}-{slug}.md`** | After the spec, just before implementation |
| How agents consume these docs + the detailed authoring rules | **`docs/agents/domain.md`** | Doc conventions change |
| Issue-tracker mapping (= GitHub Issues) | **`docs/agents/issue-tracker.md`** | The tracker changes |
| Triage role → label mapping | **`docs/agents/triage-labels.md`** | The label scheme changes |
| Live progress, lessons, backlog (session-to-session) | **auto-memory** (`MEMORY.md` + per-topic files) | Anytime; points back to `CONTEXT.md`, never duplicates its definitions |

Phase *definitions* live here (see [Phases](#phases)); Phase *progress* lives in
memory. Superseded point-in-time docs (old PRDs, replans, the wood-era plan)
live in [`docs/_archive/`](docs/_archive/) — historical only, never a baseline
for new work. For the detailed authoring rules — when an ADR qualifies, how to
add a term, spec/plan naming — see [`docs/agents/domain.md`](docs/agents/domain.md).

---

## Product

### Ontab
The service. "On tab" — a toolbox that lives on a browser tab. A free,
no-login, no-payment web app of file utilities (PPT, PDF, image) aimed at
non-expert global users. Korean and English. AdSense is the only monetization
path, and it's deprioritized.

### Tool
A single utility (e.g. `pdf-compress`, `image-resize`). Each tool has a stable
**slug** (appears in routes, i18n keys, analytics) and a **category** — PPT,
PDF, or Image. The tool set is **open-ended and grows over time**; new tools
land at any phase.

The **`TOOLS` registry in [`src/lib/constants.ts`](src/lib/constants.ts) is the
single source of truth** for the live tool list. CONTEXT deliberately does not
enumerate it — any table here would drift. Anything that needs counts, slugs, or
categories **derives them from the registry**; hard-coding a tool count (e.g.
"10") or a slug list is a bug. A registry consumer, type union, i18n key map,
route generator, or test fixture must accept new slugs without code changes to
unrelated tools.

### pdf-arrange
The canonical PDF page-manipulation tool — combine, split, reorder, delete, and
rotate pages in one editor. It **absorbed** the earlier separate `pdf-merge`,
`pdf-split`, and `pdf-pages` tools; those slugs now survive only as aliases.
_Avoid_: treating merge / split / pages as distinct tools.

### Alias
A slug kept live for SEO / backwards compatibility that renders a different
**canonical** tool, declared via `aliasOf` in the registry. Today: `pdf-merge`,
`pdf-split`, `pdf-pages` → **pdf-arrange**; `heic-convert` → `image-compress`.
An alias is **not** a separate tool — don't count it as one.

### Non-expert user
The target audience. Pastors preparing weekly church PPTs, lecturers,
students, office workers. They do not know what "rasterize" means and will
not read a tutorial. UI text and defaults assume zero domain literacy.

### Non-goals
Deliberate exclusions — these are out of scope by decision, not by omission.
Don't propose them as features:

- **Accounts / login / auth** (Clerk keys exist in `.env` as placeholders only).
- **Server-side storage or a hosted background-image gallery** (Supabase
  placeholders only; the in-app gallery is local-only Mock data).
- **Paid / Pro tiers or payment** — Ontab is free; AdSense is the sole
  (deprioritized) monetization path.
- **Server-side format conversions** (PDF → Word / Excel / PPT). All processing
  is in-browser; conversions that need a server are out of scope.

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
        └── tools/{slug}/page.tsx       # one per tool slug (from the registry)
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

Roadmap units. Each phase is a discrete release surface, not a sprint. These are
**definitions** — what each phase *is*. Current **progress** (which phase, which
tool, what's done) lives in auto-memory, not here.

### Phase 0 — Foundation
i18n infra, route structure, silver design tokens, material classes, brand
components (`src/components/brand/`), interactive landing
(`src/components/landing/`), Header/Footer/LanguageToggle. Existing tool pages
preserved as-is under `(chrome)/tools/{slug}`.

### Phase 1 — Tool migration
Migrate each tool's page body to the silver design, then replace its Phase 0
bridge link in `Screen3Workspace` with an inline component call (the
landing-inline execution model). **One tool = one branch = one PR**, branch name
`feat/ontab-phase-1-{slug}`.

### Phase 2 — New tools
Utilities beyond the Phase 1 set (PPT / PDF / image). The live roster is the
`TOOLS` registry; specific candidates and their priority live in planning docs
(`docs/superpowers/`) and memory.

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
