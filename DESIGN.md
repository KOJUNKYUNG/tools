---
version: alpha
name: Ontab
description: >-
  Ontab's design system — a high-contrast monochrome ("editorial black & white")
  identity for a no-login, in-browser PPT / PDF / image toolbox. The runtime
  source of truth for live tokens is src/app/globals.css (@theme + :root/.dark);
  this front matter mirrors it (ADR-0003). Values here are the LIGHT reference;
  dark mode inverts the role assignments (see Colors). The only exception to the
  palette is user-uploaded document-preview content, which renders in its
  original colors.
# Fonts are loaded in src/app/layout.tsx (next/font): Clash Display + IBM Plex
# Sans KR are local (src/fonts), Nanum Gothic Coding via next/font/google.
colors:
  # The entire site palette — 7 neutral anchors. Light reference values; these
  # mirror globals.css --mono-0 … --mono-1000. Roles are assigned via the
  # semantic aliases described in the Colors section.
  primary: "#242324" # Ink — primary text & primary action      (--mono-900)
  secondary: "#4a494a" # Graphite — body text, strong lines      (--mono-600)
  muted: "#9d9c9e" # Ash — muted text, hairlines, disabled       (--mono-400)
  border: "#c6c6c7" # Pebble — borders, dividers, second surface (--mono-200)
  background: "#d9d9da" # Mist — app / page background            (--mono-100)
  surface: "#ffffff" # Paper — card surface                       (--mono-0)
  black: "#000000" # Black — maximum-contrast emphasis & focus    (--mono-1000)
typography:
  display:
    fontFamily: Clash Display
    fontSize: 39px
    fontWeight: 500
    lineHeight: 1.02
    letterSpacing: -0.02em
  headline:
    fontFamily: Clash Display
    fontSize: 28px
    fontWeight: 300
    lineHeight: 1.12
    letterSpacing: -0.02em
  title:
    fontFamily: IBM Plex Sans KR
    fontSize: 20px
    fontWeight: 500
    lineHeight: 1.3
  body:
    fontFamily: IBM Plex Sans KR
    fontSize: 16px
    fontWeight: 400
    lineHeight: 1.6
  label:
    fontFamily: Nanum Gothic Coding
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1
    letterSpacing: 0.14em
  mono:
    fontFamily: Nanum Gothic Coding
    fontSize: 13px
    fontWeight: 400
    lineHeight: 1.5
rounded:
  none: 0px
  sm: 2px
  md: 3px
  lg: 4px
  full: 9999px
spacing:
  base: 8px
  xs: 4px
  sm: 8px
  md: 16px
  lg: 24px
  xl: 32px
  "2xl": 48px
components:
  # Treatment lives in globals.css CSS classes (named per entry). These tokens
  # mirror each role's key colors BY REFERENCE — no new inline values, so the
  # class stays the single implementation (ADR-0003 deviation 3). Values shown
  # are light; dark inverts via the aliases.
  button-primary: # .btn-primary — primary execute (압축 / 변환 / 적용)
    backgroundColor: "{colors.primary}"
    textColor: "{colors.background}"
    rounded: "{rounded.md}"
  button-download: # .btn-download — result-ready download (the single boldest fill)
    backgroundColor: "{colors.black}"
    textColor: "{colors.surface}"
    rounded: "{rounded.md}"
  button-secondary: # .nameplate — secondary / toolbar action, unselected toggle
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  toggle-selected: # .nameplate[data-active] — selected single-select (tab underline)
    textColor: "{colors.primary}"
    backgroundColor: "{colors.surface}"
  input: # text / number fields
    backgroundColor: "{colors.background}"
    textColor: "{colors.primary}"
    rounded: "{rounded.md}"
  toolcard: # .toolcard — tool-grid card
    backgroundColor: "{colors.surface}"
    textColor: "{colors.primary}"
    rounded: "{rounded.lg}"
---

# Ontab — DESIGN.md

The visual system for Ontab. The **runtime source of truth for tokens is
[`src/app/globals.css`](src/app/globals.css)** (`@theme` + `:root`/`.dark`); the
front matter above mirrors it ([ADR-0003](docs/adr/0003-adopt-design-md-standard-format.md)).
Change a token in one place and change it in the other in the same commit.
Validate with:

```bash
pnpm design:lint        # = designmd lint --format json DESIGN.md
```

> This redesign **supersedes the metallic execution of
> [ADR-0001](docs/adr/0001-silver-design-system.md)** (silver / cool-blue, hue
> 250). The tray + lid *product metaphor* survives; its *rendering* becomes flat
> and neutral. Component rollout is incremental (tool by tool); this file is the
> target, and the Do's and Don'ts grow as tools are migrated.

## Overview

Ontab is a free, no-login, in-browser toolbox for PPT, PDF, and image chores,
aimed at non-expert global users (Korean + English). The feeling to evoke is a
**well-made instrument**: quiet, precise, confident.

The aesthetic is **high-contrast monochrome — editorial black & white**, drawn
from grainy documentary photography. Confidence comes from **contrast,
typography, and negative space**, never from color or ornament. Surfaces are
**flat and crisp**; hierarchy is built from tone, hairlines, and weight.

Two rules shape everything:

1. **The whole site uses one neutral palette** (seven grays, below). There is no
   accent hue. Emphasis is made with **contrast, inversion, and weight** — never
   color. The single exception is **user document-preview content**, which
   renders in its own original colors (it is the user's file, not our UI).
2. **The tray + lid metaphor stays, flattened.** The landing is still a toolbox
   whose lid lifts to reveal tools, but rendered as flat neutral panels and
   hairlines rather than brushed metal.

## Colors

The palette is a single **7-step neutral ramp** — five brand grays plus pure
white and black as the utility extremes. It is deliberately tight: there is no
hue anywhere in the UI.

- **Ink (`#242324`)** — primary text, headlines, and the primary action fill.
  The darkest brand gray (lifted slightly off pure black so the two read apart).
- **Graphite (`#4a494a`)** — body text and strong rules.
- **Ash (`#9d9c9e`)** — muted/secondary text, hairlines, disabled states. Never
  use Ash as body text on a light surface (it fails contrast — see Do's & Don'ts).
- **Pebble (`#c6c6c7`)** — borders, dividers, and secondary surfaces.
- **Mist (`#d9d9da`)** — the page / app background in light mode.
- **Paper (`#ffffff`)** — the primary card surface in light mode.
- **Black (`#000000`)** — maximum-contrast **emphasis**: focus rings, the
  download action, slider fills, selection marks.

### Semantic aliases (the real API)

Components consume **semantic aliases**, not raw anchors — the aliases flip for
dark mode for free. Raw `--mono-*` is reserved for on-paper overlays (see Do's &
Don'ts). The mapping (defined in `globals.css`):

| alias | role | Light | Dark |
| --- | --- | --- | --- |
| `--bg` | page background | Mist | Ink |
| `--bg-soft` | recessed panel / well | Pebble | Black |
| `--surface` | card surface | Paper | Graphite |
| `--surface-2` | secondary surface / row / input | Mist | Ink |
| `--border` | borders, dividers | Pebble | Graphite |
| `--hairline` | thin rules | Ash | Ash |
| `--ink-soft` | muted / hint text | Ash | Ash |
| `--ink` | body text | Graphite | Pebble |
| `--ink-strong` | strong text / primary fill | Ink | Mist |
| `--headline` | headings | Ink | Paper |
| `--emphasis` | focus / download / selection mark | Black | Paper |

**Dark mode** has no token mechanism in the DESIGN.md standard, so it lives in
prose here and in `globals.css .dark`: the same seven anchors, with the role
assignments inverted (light surfaces ↔ dark surfaces, dark ink ↔ light ink). One
deliberate dark-mode fix: `--border` steps to Ash (not Graphite) so a card face
and its border never collapse to the same value.

## Typography

Four families, six roles. Korean and Latin share one face for running text, so
mixed-language UI stays even. Fonts load via `next/font` in `layout.tsx`
(Clash Display + IBM Plex Sans KR are local in `src/fonts`; Nanum Gothic Coding
via Google).

| role | family / weight | where it's used |
| --- | --- | --- |
| `display` | Clash Display Medium · 39px | the landing brand moment (wordmark, lid) — the largest, rarest text |
| `headline` | Clash Display Light · 28px | screen / section headings |
| `title` | IBM Plex Sans KR Medium · 20px | tool titles, result titles |
| `body` | IBM Plex Sans KR Regular · 16px | descriptions, running UI text (KO + EN) |
| `label` | Nanum Gothic Coding · 13px, uppercase, tracked | eyebrows, technical labels, badges |
| `mono` | Nanum Gothic Coding · 13px | slugs, sizes, code-like values |

Display is set in Medium and Headline in Light — a deliberate editorial
inversion (a bold statement size over a thin, airy subhead). Labels and
mono share Nanum Gothic Coding, a Korean monospace, so technical strings in
either language stay fixed-width.

### Which UI element uses which role

This mapping is normative — it removes ambiguity for the rollout (the legacy
code applied one "brand" font to almost everything; that is not the target).

| UI element | role |
| --- | --- |
| landing wordmark / lid lettering | `display` |
| page / screen section heading | `headline` |
| tool title, result title, card header | `title` |
| description, paragraph, **button & toggle label**, dialog text | `body` |
| eyebrow, section tag, badge, field label, small caption | `label` |
| file size, dimension, percentage, slug, code-like value | `mono` |

**Clash Display is reserved for `display` + `headline` only.** Buttons, toggles,
labels, and values never use it — if Clash is showing up on a button or a small
label, that element is mis-mapped. Running UI text is IBM Plex Sans KR (`body` /
`title`); technical strings are Nanum Gothic Coding (`label` / `mono`).

## Layout

Desktop-first (designed at 1280+; responsive down to mobile, which only has to
*work*). Content sits in a centered column capped at
`--tweak-workspace-width` (**950px**). Spacing follows an **8px base** rhythm
(`xs 4 · sm 8 · md 16 · lg 24 · xl 32 · 2xl 48`) with a 4px half-step for
micro-adjustments.

Locked layout constants live in `globals.css` as `--tweak-*` custom properties
(`--tweak-workspace-width`, `--tweak-card-height`, `--tweak-card-padding`, …);
read them as `var(--tweak-*, <fallback>)` so they can be retuned without code
edits.

**Fixed width, fluid height.** Only the column width is fixed (950px). Height
flows with content — tools vary in complexity, so there is no single fixed
workspace height. Stability comes from the layout, not a fixed size: each region
(preview, controls, result) holds a stable height so a state change never shifts
its neighbours; reserve space for hints and disabled states, and fit the Done /
Processing / Error states inside the idle envelope.

**Landing-inline execution model.** Every tool runs inline on the landing — the
user uploads, processes, and downloads without leaving `/`. **Execution → result
swap** is the canonical layout: the **preview area persists** while only the
controls area swaps to a result view (download + re-apply). New and migrated
tools follow the `ppt-watermark` / `ppt-compress` pattern; `ppt-background` will
be unified to it.

## Elevation & Depth

**Flat.** Hierarchy is conveyed by **tone, hairlines, and contrast**, not by
shadows or material gradients. Surfaces stack by stepping the neutral ramp
(`--bg` → `--bg-soft` → `--surface`); regions separate with 1px `--border` /
`--hairline` rules. Shadows are minimal and reserved for genuinely *floating*
things (a result card, an on-paper overlay), never as default chrome.

**Dark-mode depth** can't rely on a black drop shadow (invisible on a dark
ground). Elevated surfaces in dark mode use a **lighter face + a light top edge
(Pebble) + a stronger black shadow** together.

The metallic treatments of the old silver system — `rim`, `brushed`, `glint`,
`lid` (metal) — are **retired**. The tray surface is reinterpreted as a flat
neutral panel.

## Shapes

**Architectural sharpness.** Corners are small and crisp: `sm 2px`, `md 3px`
(buttons, inputs, chips, small cards), `lg 4px` (panels, larger cards). Panels
read as near-square. `full` (9999px) is reserved for genuinely circular marks
(e.g. a selection badge). This replaces the old rounded scale (≈10px base) — the
crispness is what makes the system feel printed and engineered rather than soft.

## Components

Treatments live as CSS classes in `globals.css`; the front-matter `components`
tokens mirror each role's key colors by reference. **Reuse the classes — do not
invent new ones, and do not hard-code hex in a component.**

**Buttons — four roles** (no two of the two "loud" ones share a screen, so
grayscale alone separates them):

| role | class | treatment |
| --- | --- | --- |
| Secondary / toolbar | `.nameplate` | flat outline — `--surface` fill, `--border` edge |
| Selected toggle | segmented tab | **tab underline** — bold label + `--emphasis` bottom rule, *no* fill |
| Primary execute | `.btn-primary` | dark fill — `--ink-strong` bg, theme-inverting `--bg` label |
| Download | `.btn-download` | maximum-contrast fill — `--emphasis` (Black / Paper) |

Blue is gone. The old "your current choice" (blue toggle) becomes the **tab
underline**; the old "result ready" (blue download) becomes the **max-contrast
fill**. Single-select selectors of every kind — format pickers, presets, mode
tabs (`ModeSelector`, `ModeToggle`) — use the same selected-toggle underline. The
flat segmented tab is implemented per control (a bottom-hairline row; the active
item carries the `--emphasis` rule). The legacy `.nameplate[data-active]` inverted
fill is an interim until a tool is migrated — `pdf-watermark` is the first migrated
reference.

**Other components:**

- **Input / number fields** — `--surface-2` fill, `--border` edge, `--ink-strong`
  text, `--ink-soft` placeholder; focus shows a 2px `--emphasis` outline.
- **Slider** (e.g. opacity) — track `--border`, fill + thumb `--ink-strong`
  (replaces the old blue `accentColor`).
- **Gallery / thumbnail selection** — selected item gets an `--emphasis` outline
  and badge (replaces the old blue selection badge).
- **Preview frame** — the letterbox uses `--bg-soft` (theme-aware); the document
  *inside* is the palette exception and renders original colors.
- **Tool card** — `.toolcard`: `--surface` fill, `--border` edge, flat.
- **Result view** — replaces the controls area after execute; holds the result
  summary, `.btn-download`, and a `.nameplate` "re-apply".

**On-paper overlays.** Controls placed *on* a white document thumbnail (page
number badges, rotate/delete chips, filenames) must use the **fixed `--mono-*`
scale**, never theme-inverting aliases — otherwise they vanish in dark mode (the
paper stays white, but an `--ink-strong` label would turn light). See Do's &
Don'ts.

## Do's and Don'ts

**Do**

- Use only the seven neutral anchors. The one exception is user document-preview
  content (original colors).
- Make emphasis with contrast, inversion, and weight: primary execute = dark
  fill, download = max-contrast fill, selected toggle = tab underline.
- Prefer semantic aliases (`--bg`, `--surface`, `--ink`, …) over raw `--mono-*`
  — they invert for dark mode for free.
- Use the fixed `--mono-*` scale for on-paper overlays on white thumbnails.
- For a mark or label placed *on* an `--emphasis` fill (a selected dot, a download
  icon), use `--surface` so it inverts with the theme.
- In dark mode, lift elevated surfaces with a lighter face + light top edge +
  stronger shadow, not a black shadow alone.
- Keep the execution → result swap (preview persists).
- Preserve handoff / inline values verbatim when porting UI (the visual-fidelity
  contract — it's what makes Ontab look like Ontab). If a value looks odd, ask;
  don't refactor it away.

**Don't**

- Don't introduce any color outside the seven anchors — no blue `accent-electric`,
  no warm tones (wood / cream / beige), no new tokens or material classes.
- Don't use Ash (`#9d9c9e`) as body text on a light surface — it fails contrast.
  Ash is for muted text, hairlines, and disabled states only.
- Don't put theme-inverting aliases on on-paper overlays (they disappear in dark).
- Don't reintroduce the metallic classes (`rim`, `brushed`, `glint`, `lid`) —
  they're retired.
- Don't hard-code hex / rgb in a component — always go through a token, alias, or
  class.
- Don't add depth with heavy or default shadows; separate with tone and hairlines.
- Don't hard-code `#fff` / `#000` on an `--emphasis` fill — emphasis is Black in
  light but Paper in dark, so a white mark vanishes. Use `--surface`.
- Don't tint shadows (`rgba(20,30,60,…)`); shadows are neutral black (`rgba(0,0,0,…)`).
- Don't leave `glint` or other metallic helper classes on a migrated component.
- Don't give a preview / letterbox frame a fixed light gray (`--silver-100`); use
  `--bg-soft` so it survives dark mode.
