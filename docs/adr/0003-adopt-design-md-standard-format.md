# ADR 0003 — Adopt the Google DESIGN.md standard format

- **Status:** Accepted
- **Date:** 2026-06-05
- **Relates to:** ADR-0001 (silver design system — may be revised by the
  upcoming re-design)

## Context

Design information is scattered across `docs/design.md` (a thin, repo-specific
implementation contract), ADR-0001, `src/app/globals.css`, a cross-cutting
button-system spec, and memory. The current `docs/design.md` has no
machine-readable token block and no Components section, so the button system is
undocumented as a contract.

Google Labs open-sourced **DESIGN.md** — a format for describing a visual
identity to coding agents: YAML front-matter tokens (`colors`, `typography`,
`rounded`, `spacing`, `components`) plus eight ordered prose sections (Overview,
Colors, Typography, Layout, Elevation & Depth, Shapes, Components, Do's and
Don'ts), with an official validator (`@google/design.md`). It is portable across
agents (Claude Code, Cursor, Stitch, …).

A full design re-adjustment is planned. That re-design is the moment to author a
proper, standards-compliant design spec rather than retrofitting one.

## Decision

Adopt the DESIGN.md format as Ontab's design specification, at repo root
`DESIGN.md`.

- **Token source of truth stays `src/app/globals.css` (`@theme`).** When
  `DESIGN.md` is populated, its front-matter tokens **mirror** that block; they
  are not a second runtime source. Changing a `DESIGN.md` token requires
  changing `globals.css` in the same commit (the sync rule lives in
  `docs/agents/domain.md`). The validator's `export --format css-tailwind` can
  regenerate the theme to check drift.
- **The populated `DESIGN.md` lands with the re-design.** Until then, root
  `DESIGN.md` is a validated scaffold (structure only), and the spec for the
  *current* system remains `docs/design.md` + ADR-0001.
- **Validator added** as a devDependency (`@google/design.md`), run via
  `pnpm design:lint`. Use the **`designmd`** bin, not `design.md` — the dotted
  bin name hangs `pnpm exec`.

## Considered options

- **Keep the thin-contract `docs/design.md` as-is.** Rejected: no standard, no
  agent portability, and the Components/button gap persists.
- **Make `DESIGN.md` front matter the sole token source, generate
  `globals.css` from it.** Rejected: a build/codegen step is overkill for a
  single-maintainer project; tokens change rarely.
- **Hybrid — only "anchor" tokens in front matter, the rest by reference.**
  Rejected: a partial token block reduces the value of standard tooling, which
  expects the full set.

Chosen: full standard format + `globals.css` as the runtime source the front
matter mirrors.

## Consequences

**Positive**
- One portable, validatable design spec; the button system finally has a
  documented Components contract.
- `lint` / `diff` / `export` tooling turns "did the design change?" into a
  diff-able check across the re-design.

**Negative / accepted costs**
- Token values are duplicated between `DESIGN.md` and `globals.css`. Accepted:
  design tokens change rarely (silver has been locked since 2026-05), the sync
  rule + `export` check bound the drift, and the duplication buys standard
  tooling and agent portability.
- The validator pulls a larger dep tree with peer-range mismatches (ink, zod),
  and its `design.md` bin shim hangs `pnpm exec` (use the `designmd` alias).
