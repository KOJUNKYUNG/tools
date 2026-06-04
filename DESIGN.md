---
version: alpha
name: Ontab
description: >-
  Scaffold only. Adopts the Google DESIGN.md format (see docs/adr/0003).
  Token values and prose are intentionally empty — they will be authored
  during the upcoming design re-adjustment, not back-filled from the current
  system. The runtime source of truth for live tokens stays src/app/globals.css
  (@theme); when this file is populated, its tokens must mirror that block.
# Token categories to populate during the re-design (omit any that stay empty):
#   colors:      palette anchors + accents (mirror globals.css @theme)
#   typography:  fontFamily / fontSize / fontWeight / lineHeight per role
#   rounded:     corner-radius scale
#   spacing:     spacing scale
#   components:  button roles (btn-primary, btn-download, nameplate[+active]),
#                glass-btn, toolcard — fills the "no Components section" gap
#                that the current docs/design.md has.
---

# Ontab — DESIGN.md

> **DRAFT / scaffold — not yet authoritative.**
> This file reserves the Google DESIGN.md structure ([ADR-0003](docs/adr/0003-adopt-design-md-standard-format.md))
> ahead of a full design re-adjustment. **Until it is populated, the spec for
> the _current_ visual system is [`docs/design.md`](docs/design.md) +
> [ADR-0001](docs/adr/0001-silver-design-system.md).** Do not treat the empty
> sections below as design intent.

The eight sections below are the canonical DESIGN.md order (h2, no duplicates).
Fill front-matter tokens first, then the matching prose. Validate with:

```bash
pnpm design:lint        # = designmd lint --format json DESIGN.md
```

> Use the **`designmd`** bin, not `design.md`. The dotted bin name hangs
> `pnpm exec` and collides in file search with this `DESIGN.md` and
> `docs/design.md`.

## Overview
<!-- TODO: visual theme & atmosphere — the one-paragraph aesthetic intent. -->

## Colors
<!-- TODO: palette + semantic roles. Note: the DESIGN.md spec has no dark-mode
     mechanism — document the .dark scheme here in prose (see docs/design.md §6). -->

## Typography
<!-- TODO: families + scale per role (KO / display / body / mono). -->

## Layout
<!-- TODO: layout + spacing strategy, --tweak-* layout constants. -->

## Elevation & Depth
<!-- TODO: metallic depth — rim / brushed / emboss, shadow scale. -->

## Shapes
<!-- TODO: corner radii, surface/material shapes. -->

## Components
<!-- TODO: button roles (btn-primary / btn-download / nameplate[+active]),
     glass-btn, toolcard, tool cards. This is the gap in docs/design.md. -->

## Do's and Don'ts
<!-- TODO: the visual fidelity contract (verbatim handoff porting), the
     "no new tokens / no new material classes" reuse discipline, forbidden
     warm tones. Carry these over from docs/design.md §3, §7, §8. -->
