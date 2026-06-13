# ADR 0005 — Biome adoption abandoned; ESLint trimmed to Next + React Hooks

- **Status:** Accepted
- **Date:** 2026-06-14
- **Relates to:** the global tooling default (Biome as linter/formatter)

## Context

The maintainer's standing default is Biome for linting + formatting. This
project still ran `eslint` (`eslint-config-next`: `core-web-vitals` +
`typescript`) with no formatter. Adopting Biome surfaced two blocking facts.

1. **The ESLint baseline was already red.** `pnpm lint` exited 1 on `master`
   (pre-dating this work): **1661 problems — 26 errors, 1635 warnings.** The
   bulk was `eslint-config-next/typescript`'s typescript-eslint rules
   (`no-unused-vars`, `no-explicit-any`, `no-this-alias`, …). The 26 errors
   were almost all **React Hooks v6 correctness rules** (`react-hooks/refs`,
   `react-hooks/set-state-in-effect`, `react-hooks/preserve-manual-memoization`)
   that `eslint-config-next` 16.x newly enforces — real bugs, not noise.

2. **Biome v2.5.0 crashed the machine.** During setup `biome.exe` ballooned to
   ~122 GB of virtual memory (Resource-Exhaustion-Detector event 2004) and
   froze a 32 GB laptop twice. Root cause is Biome v2's type-aware analysis,
   which scans `node_modules` `.d.ts` files (incl. transitive deps) for its
   project-domain lint rules; combined with a known v2 memory-leak regression
   it grows without bound. The leak is version-dependent and not reliably fixed
   in current releases.

## Decision

- **Do not adopt Biome** (linter or formatter) at this time. The global default
  does not fit this hardware — running the Biome binary risks freezing the
  machine. Revisit only with a memory-safe option (a pinned leak-free Biome
  release with `node_modules` hard-excluded and type-aware rules off, or
  Prettier for formatting) if formatting becomes a felt need.
- **Keep ESLint as the linter, trimmed to what Biome could never replace.**
  Drop the `eslint-config-next/typescript` preset; keep `core-web-vitals` only.
  This retains the Next-specific rules (`@next/next/*`) and the React Hooks
  correctness rules (`react-hooks/*`) while removing ~1600 typescript-eslint
  warnings. Result: **1661 → 39 findings** (19 errors + 20 warnings).
- **Fix the 19 React Hooks correctness errors** so the gate goes green.
- **No autoformatter is adopted.** Formatting stays editor-/author-driven.
- Add the missing `.gitattributes` (`* text=auto eol=lf`) — a standing
  project convention this repo lacked; independent of the Biome decision.

## Considered options

- **Biome as formatter only** (`linter.enabled: false`). Rejected: still runs
  the leaking `biome.exe`; the formatter is lower-risk than the linter but the
  binary's memory behaviour on this 32 GB machine is not worth the gamble for a
  cosmetic win.
- **Pin a "safe" Biome (e.g. v2.0.6) + hard-exclude `node_modules` + disable
  type-aware rules.** Rejected: leak reports persist across v2 releases; the
  residual risk to the machine outweighs the benefit.
- **Keep `eslint-config-next` whole and coexist with Biome.** Rejected: leaves
  the 1661-problem, exit-1 gate broken and adds the Biome risk on top.

Chosen: ESLint trimmed to `core-web-vitals`, no Biome, no formatter.

## Consequences

**Positive**
- The lint gate is small, meaningful, and green-able: Next + Hooks correctness
  only, no typescript-eslint noise.
- The machine is safe — no Biome binary in the toolchain.
- Line endings are now normalised repo-wide via `.gitattributes`.

**Negative / accepted costs**
- No automated formatter; style consistency relies on editors and review.
- The global Biome default is not honoured here; this ADR records why so the
  divergence is intentional, not drift.
- `react-hooks/exhaustive-deps` (warning) and `@next/next/no-img-element`
  (warning) remain as warnings — informational, non-blocking.
