# ADR 0002 — Next 16 native i18n + `(chrome)` route group

- **Status:** Accepted
- **Date:** 2026-05-13

## Context

Two structural decisions in the Phase 0 foundation look "unusual" to anyone
(human or agent) reading the codebase cold, and both are at high risk of
being **helpfully reverted** by a future contributor who hasn't seen this
note. They are:

1. **i18n without `next-intl`.** Ontab needs Korean and English. The
   industry-default answer is `next-intl`, and most LLM training data
   reaches for it reflexively. We don't use it.
2. **`src/app/[lang]/(chrome)/...` route group.** The landing page lives at
   `src/app/[lang]/page.tsx` — *outside* `(chrome)` — while every tool
   page lives at `src/app/[lang]/(chrome)/tools/{slug}/page.tsx`. A reader
   who doesn't know why will see this as accidental nesting and try to
   "flatten" it.

Both decisions are load-bearing. Reverting either silently breaks the
product.

## Decision

### i18n: Next 16 native segments + `proxy.ts`

- Locale lives in the URL as a dynamic segment: `src/app/[lang]/...`.
- `src/proxy.ts` (Next 16 native middleware replacement) handles locale
  negotiation on the root request using `@formatjs/intl-localematcher`
  + `negotiator`, then redirects `/` → `/ko` or `/en` based on the
  `Accept-Language` header.
- Translation strings live as plain JSON in `src/i18n/locales/{ko,en}.json`
  and are loaded directly by server components / passed down as props.
- Locales are exactly two: `ko` and `en`. The header surfaces a two-state
  KO/EN toggle. There is no third-axis navigation.
- **No `next-intl`, no `react-i18next`, no `lingui`.** If a richer
  formatting need appears (plurals, ICU MessageFormat), reach for
  `@formatjs/intl-messageformat` à la carte before adopting a framework.

### Route grouping: landing outside chrome, tools inside

```
src/app/
├── layout.tsx                      # real root: <html>, fonts, Providers, Toaster
├── proxy.ts                        # locale redirect
└── [lang]/
    ├── layout.tsx                  # slim; mounts <LangSync> only
    ├── page.tsx                    # InteractiveLanding (NO chrome)
    └── (chrome)/
        ├── layout.tsx              # Header + children + Footer
        └── tools/{slug}/page.tsx   # tools render inside chrome
```

The landing renders **full-bleed tray imagery** — the photo of the toolbox
has to reach the viewport edges with no Header/Footer margins biting into
it. Putting the landing outside the `(chrome)` group is what makes that
possible without conditional layout logic.

Tool pages, conversely, need the persistent Header/Footer (locale toggle,
theme toggle, branding), so they sit inside `(chrome)`.

## Rationale

**Why not `next-intl`?**

- The library's value-add over native segments is mostly server-side
  formatting helpers and a typed message catalog. We use **two** locales
  and almost no formatted strings beyond plain text. The dependency cost
  (bundle, upgrade churn, version-locking with Next 16) outweighs the win.
- Next 16's native `[lang]` + `proxy.ts` story is the framework's
  recommended path, and `AGENTS.md` already pins us to
  `node_modules/next/dist/docs/` as the canonical reference. Staying on
  framework primitives keeps us aligned.
- Adding `next-intl` later if a real need appears is straightforward; the
  reverse (ripping it out once it's threaded through every component) is
  not.

**Why the `(chrome)` group instead of flattening?**

- The alternative — one `[lang]/layout.tsx` with conditional
  `Header`/`Footer` rendering — pushes route knowledge into the layout
  ("am I on the landing right now?") which is exactly the kind of
  coupling Next's route groups exist to remove.
- Full-bleed imagery is part of the **visual fidelity contract**
  (see ADR-0001). Margins-from-chrome eating into the tray photo is a
  visible regression, not a minor styling nit.

## Consequences

**Positive**

- Zero i18n dependency to maintain or upgrade. Locale handling is ~30
  lines of code we own.
- The route tree is self-documenting: the layout you sit under tells you
  whether you have chrome.
- Adding a new tool is "create one file under `(chrome)/tools/{slug}/`"
  — no router config, no layout edits.

**Negative / accepted costs**

- Contributors expecting `next-intl` conventions (`useTranslations`,
  `getTranslator`) won't find them. The `src/i18n/` folder + this ADR are
  the orientation.
- If we ever need RTL or a third locale with very different formatting
  rules, we'll re-evaluate. That's a real trigger to reopen this ADR, not
  a reason to pre-empt it now.

## Do not, without reopening this ADR

- Add `next-intl`, `react-i18next`, `lingui`, or similar.
- Move `[lang]/page.tsx` under `(chrome)`.
- Remove the `(chrome)` group or fold its layout into `[lang]/layout.tsx`.
- Replace `proxy.ts` locale negotiation with a client-side detector.

If one of the above genuinely needs to happen, mark this ADR
**Superseded** in a follow-up ADR with the reason and the migration plan.

## Related

- ADR-0001 (silver design system) — visual fidelity contract referenced
  above.
- `CONTEXT.md` → "Architecture" section.
- `src/proxy.ts`, `src/i18n/`, `src/app/[lang]/(chrome)/layout.tsx`.
