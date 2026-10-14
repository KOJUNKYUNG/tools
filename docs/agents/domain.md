# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates them lazily when terms or decisions actually get resolved.

## File structure

Single-context repo (most repos):

```
/
├── CONTEXT.md
├── docs/adr/
│   ├── 0001-event-sourced-orders.md
│   └── 0002-postgres-for-write-model.md
└── src/
```

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag ADR conflicts

If your output contradicts an existing ADR, surface it explicitly rather than silently overriding:

> _Contradicts ADR-0007 (event-sourced orders) — but worth reopening because…_

---

## Document roles & authoring rules

`CONTEXT.md` carries the short [Document map](../../CONTEXT.md#document-map) —
the at-a-glance "what lives where". This section is the detailed companion:
*how* to write each doc and *when*. The split is deliberate — **`CONTEXT.md`
holds product content and routing; this file holds the meta rules.**

### Who produces what

| Doc | Producer | Timing |
| --- | -------- | ------ |
| `CONTEXT.md` | `/domain-modeling` (via `/grill-with-docs`) | **Lazily** — only when a term or concept actually resolves. Never pre-fill. |
| `docs/adr/` | `/domain-modeling` (via `/grill-with-docs`) | Only when a decision passes all three gates below. |
| `DESIGN.md` (root) | the design system changes | Google-standard design spec (ADR-0003). **Populated and authoritative** since the monochrome redesign (ADR-0004) — tokens, typography, components, Do's & Don'ts. |
| `docs/_archive/design.md` | — | The silver-era implementation contract, **archived** (superseded by root `DESIGN.md`, ADR-0004). Historical only; do not extend. |
| `docs/brand.html` | the brand changes | The brand identity expression changes — logo, iconography, motion. A rendered, browser-openable reference that mirrors runtime (`globals.css` + `src/components/brand/`); kept separate from `DESIGN.md` because `designmd` has no motion/iconography schema. |
| Spec (GitHub issue) | `/to-spec` | Issue track only, once `/grill-with-docs` settles scope. See `workflow.md`. |
| Tickets (GitHub issues) | `/to-tickets` | After the spec; one tracer-bullet slice each, with blocking edges. |
| `docs/superpowers/specs/`, `plans/` | — | **Frozen archive** of pre-2026-10 specs and plans. Read for history and prior art; add nothing. |
| `docs/agents/*` (this file, issue-tracker, triage-labels, workflow, tool-polishing-checklist) | Human / config | Static. Only when operating conventions change. |

### Three patterns that govern all of the above

1. **Lazy creation.** `CONTEXT.md` and ADRs are never written ahead of need.
   They capture decisions *as they crystallise*. Their absence is not a gap to
   flag.
2. **spec → tickets → code pipeline** (issue track). A spec issue (what to
   build) → ticket issues (how to slice it) → implementation. Tickets come only
   from a settled spec. Single-PR work skips the pipeline (`workflow.md`).
3. **`docs/agents/*` is operating config, not product content.** domain /
   issue-tracker / triage-labels / workflow describe *how agents work*, not *what Ontab
   is*. They rarely change.

### Adding a term to CONTEXT.md

Only terms meaningful to a domain expert — product and domain vocabulary, not
implementation details. One-sentence definition (what it IS, not what it does).
Be opinionated: pick one canonical word, list the rest as aliases to avoid. If
a term is used two ways, resolve it under "Flagged ambiguities".

### When an ADR qualifies

All three must be true, or skip it:

1. **Hard to reverse** — changing your mind later carries real cost.
2. **Surprising without context** — a future reader will wonder "why this way?".
3. **A real trade-off** — there were genuine alternatives and you picked one.

Number sequentially (`0001-`, `0002-`, …). A single paragraph is enough; the
value is recording *that* a decision was made and *why*.

### CONTEXT vs memory

`CONTEXT.md` = stable (product identity, terms, architecture contracts, Phase
*definitions*). Auto-memory = in flux (Phase *progress*, lessons, backlog,
session-to-session continuity). When the two overlap, `CONTEXT.md` wins and
memory points back to it rather than duplicating.

### Design tokens: DESIGN.md ↔ globals.css (ADR-0003)

`src/app/globals.css` (`@theme`) is the **runtime source of truth** for design
tokens. Once `DESIGN.md` (root, Google-standard) is populated, its front-matter
tokens **mirror** `globals.css` — they are documentation, not a second runtime
source. **Changing a token in one requires changing it in the other in the same
commit.** To check for drift, run `pnpm design:drift` (or `pnpm design:check`,
which also runs the validator). It parses the DESIGN.md front-matter color
anchors and asserts each still matches the `--mono-N` value its trailing
`(--mono-N)` comment references in the `globals.css` `:root` block.

> The official `designmd export --format css-tailwind DESIGN.md` path is **not**
> usable here: it aborts on the `2xl` spacing token (not a valid Tailwind v4
> identifier) before emitting any CSS. `scripts/check-design-drift.mjs` replaces
> it for the color anchors.

Lint with `pnpm design:lint`. **Always use the `designmd` bin, not `design.md`**
— the dotted bin name hangs `pnpm exec` (and collides with `DESIGN.md` in file
search). `--format json` keeps output non-interactive.

### Brand expression: `docs/brand.html` (manual mirror)

`DESIGN.md` only covers what `designmd` can schema-check: color, typography,
rounded, spacing, components. The brand's **logo, iconography, and motion** have
no schema there, so they live in [`docs/brand.html`](../brand.html) — a rendered,
browser-openable reference that mirrors the runtime (`globals.css` motion tokens +
`src/components/brand/` assets) and records each one's **design intent**.

Unlike the DESIGN.md ↔ globals.css color sync, **there is no automated drift
check** for `brand.html`. So any change to motion tokens, the logo, or the icon
set must update `brand.html` (values *and* intent notes) in the same commit. See
CONTEXT.md → Working conventions → "Design & brand sync".
