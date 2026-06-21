# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root, or
- **`CONTEXT-MAP.md`** at the repo root if it exists — it points at one `CONTEXT.md` per context. Read each one relevant to the topic.
- **`docs/adr/`** — read ADRs that touch the area you're about to work in. In multi-context repos, also check `src/<context>/docs/adr/` for context-scoped decisions.

If any of these files don't exist, **proceed silently**. Don't flag their absence; don't suggest creating them upfront. The producer skill (`/grill-with-docs`) creates them lazily when terms or decisions actually get resolved.

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

If the concept you need isn't in the glossary yet, that's a signal — either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/grill-with-docs`).

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
| `CONTEXT.md` | `/grill-with-docs` | **Lazily** — only when a term or concept actually resolves. Never pre-fill. |
| `docs/adr/` | `/grill-with-docs` | Only when a decision passes all three gates below. |
| `DESIGN.md` (root) | the design system changes | Google-standard design spec (ADR-0003). **Populated and authoritative** since the monochrome redesign (ADR-0004) — tokens, typography, components, Do's & Don'ts. |
| `docs/_archive/design.md` | — | The silver-era implementation contract, **archived** (superseded by root `DESIGN.md`, ADR-0004). Historical only; do not extend. |
| `docs/brand.html` | superpowers `brainstorming` (brand foundation) | The brand identity expression changes — logo, iconography, motion. A rendered, browser-openable reference that mirrors runtime (`globals.css` + `src/components/brand/`); kept separate from `DESIGN.md` because `designmd` has no motion/iconography schema. |
| `docs/superpowers/specs/{date}-{slug}-design.md` | superpowers `brainstorming` | Before building, once the design settles. One tool/feature = one spec. |
| `docs/superpowers/plans/{date}-{slug}.md` | superpowers `writing-plans` | After the spec, just before implementation. Paired with its spec. |
| `docs/agents/*` (this file, issue-tracker, triage-labels) | Human / config | Static. Only when operating conventions change. |

### Three patterns that govern all of the above

1. **Lazy creation.** `CONTEXT.md` and ADRs are never written ahead of need.
   They capture decisions *as they crystallise*. Their absence is not a gap to
   flag.
2. **spec → plan → code pipeline.** A tool flows `specs/{slug}-design.md`
   (what to build) → `plans/{slug}.md` (how to slice it) → implementation. The
   spec and plan are a pair; don't write a plan without a settled spec.
3. **`docs/agents/*` is operating config, not product content.** domain /
   issue-tracker / triage-labels describe *how agents work*, not *what Ontab
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
