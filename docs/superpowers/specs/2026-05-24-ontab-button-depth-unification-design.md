# Ontab — Button & Depth Design Unification (cross-cutting)

Date: 2026-05-24
Status: approved (design direction confirmed by user)

## Problem

`pdf-arrange` (latest tool) and the earlier-migrated tools (`image-compress`,
`image-resize`, `ppt-background`) share the silver design system but diverged on
**button treatment and dimensionality (입체감)**:

- `pdf-arrange` toolbar uses raised metallic `.nameplate` buttons; its primary
  "적용" action is a **dark monochrome fill** (`--ink-strong` bg, theme-inverting
  `--bg` label). No blue.
- Older tools use **flat** `--surface-2` buttons; toggle/selected states and
  primary actions lean on **blue** `--accent-electric` fills.
- The **result/download panels are already identical** across both (blue
  download button + flat secondary) — no change needed there.

User decision: unify everything to the **pdf-arrange feel** (raised metallic +
dark monochrome primary). Reinforced by prior feedback that `--accent-electric`
blue "reads as too loud" — so blue is demoted to a single role.

This is a **cross-cutting** change: codified once in `globals.css`, retrofit
onto the 4 migrated tools in a dedicated PR, then inherited automatically by the
4 not-yet-migrated tools.

## Canonical button taxonomy

Four roles. Each maps to a treatment; treatments live in `globals.css` so tools
stop carrying inline `style={{ background: ... }}` and just apply a class.

| Role | When | Treatment |
|------|------|-----------|
| **Secondary / toolbar** | re-upload, clear, again, any non-primary action | `.nameplate` (raised metallic) |
| **Toggle (selected)** | format picker, mode picker — the active option | `.nameplate[data-active="true"]` (dark fill) |
| **Primary execute** | 압축/변환/적용/실행 — runs the operation | `.btn-primary` (dark fill, theme-inverting label) |
| **Primary download** | "결과 다운로드" — the result is ready | `.btn-download` (blue `--accent-electric` + glint) |

Blue (`--accent-electric`) survives **only** on download buttons. Everywhere
else the button emphasis is carried by the dark monochrome fill + metallic
depth. (Scope note: this spec governs **buttons**. Non-button blue accents —
range-slider `accentColor`, the live quality `%` readout, focus rings — are out
of scope here and folded into the separate `--accent-electric` retune.)

## Shared classes to add (`globals.css`)

`.nameplate` and `.nameplate[data-active="true"]` already exist and stay as-is.
Add two treatment classes. Color/depth reuse existing tokens only — **no new
tokens, no new material classes** (per brand memory).

```css
/* Primary execute action: dark monochrome, theme-inverting label.
 * Mirrors .nameplate[data-active="true"] fill so primary buttons and active
 * toggles stay visually identical. */
.btn-primary {
  background: var(--ink-strong);
  color: var(--bg);
  border: 1px solid var(--ink-strong);
  box-shadow: var(--shadow-sm);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.btn-primary:hover  { transform: translateY(-1px); box-shadow: var(--shadow-md); }
.btn-primary:active { transform: translateY(0);   box-shadow: var(--shadow-sm); }
.btn-primary:disabled { cursor: not-allowed; opacity: 0.5; transform: none; }
.dark .btn-primary { background: var(--silver-100); color: var(--silver-900); border-color: var(--silver-100); }

/* Primary download: the single sanctioned blue moment. */
.btn-download {
  background: var(--accent-electric);
  color: #fff;
  border: 1px solid var(--accent-electric);
  box-shadow: 0 1px 2px rgba(20, 30, 60, 0.15);
  transition: transform 0.15s ease, box-shadow 0.15s ease, opacity 0.15s ease;
}
.btn-download:hover  { transform: translateY(-1px); }
.btn-download:active { transform: translateY(0); }
.btn-download:disabled { cursor: not-allowed; opacity: 0.5; transform: none; }
```

Layout (height, padding, flex, gap, font size) stays as Tailwind utilities on
the element — only the **treatment** (color + depth) is centralized. Apply
`.glint` alongside `.btn-download` where the older tools already do.

## Corner radius

Buttons standardize to `rounded-[9px]` (the nameplate keyboard-key radius from
the pdf-arrange toolbar). Currently 5px/8px/9px are mixed. Small result rows /
thumbnail cards keep their current 5–6px — only **buttons** change.

## Retrofit scope (this PR)

Replace inline button styling with the canonical classes in:

- `image-compress` — `ImageCompressControls.tsx` (format toggles → nameplate +
  `data-active`), `ImageCompressResult.tsx` (download → `.btn-download`,
  recompress → `.nameplate`).
- `image-resize` — controls + result subcomponents (same pattern).
- `ppt-background` — mode selector / picker buttons + any primary/secondary.
- `pdf-arrange` — extract its inline "적용" dark fill into `.btn-primary`;
  download in `PdfArrangeResult.tsx` → `.btn-download`. Behavior unchanged; this
  is the reference, so mostly a class swap to prove the shared classes match.

`.nameplate` toolbar buttons in `EditorTopStrip.tsx` already match the canonical
secondary treatment — no visual change, optionally simplify.

## Out of scope (deferred to polish backlog)

- `--accent-electric` hue/saturation retune (ADR-level; tracked separately).
- Magic-number → `--tweak-*` tokenization.
- Icon/label/copy tidy pass.
- `FileUpload` i18n leak.

## Verification

- `pnpm exec tsc --noEmit`, `pnpm test`, `pnpm build` stay green.
- Visual: user runs dev server; agent uses `/browse` + `/design-review` to
  confirm light + dark mode on each of the 4 tools, before/after parity (no
  unintended layout shift), and that primary/secondary/toggle/download all read
  consistently across tools.

## Why this is future-proof

The 4 not-yet-migrated tools (`ppt-extract`, `pdf-compress`, `image-to-pdf`,
`pdf-to-image`) will be built directly against these classes — they never
re-derive button styling. The taxonomy (4 roles → 4 classes) is the contract new
tools follow.
