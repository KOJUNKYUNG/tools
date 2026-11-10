# Ontab — Context & Glossary

**Ontab** is a free, no-login, no-payment web toolbox of file utilities (PPT,
PDF, image) that runs in the browser tab — "on tab". It serves non-expert
global users (Korean and English) — pastors preparing weekly church PPTs,
teachers, students, office workers, small-business owners — who need to fix a file fast without
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
| The design spec — tokens, typography, components, Do's & Don'ts | **`DESIGN.md`** (root) | The design system changes (ADR-0003 / ADR-0004; populated 2026-06) |
| The brand identity expression — logo, iconography, motion (rendered) | **`docs/brand.html`** (open in a browser) | The brand identity changes — logo, icon system, or motion. Mirrors runtime (`globals.css` + brand components); not a second source of truth |
| The silver-era implementation contract (historical) | **`docs/_archive/design.md`** | Superseded by root `DESIGN.md` (ADR-0004) — archived, do not extend |
| The spec and tickets for multi-PR work | **GitHub issues** (`/to-spec`, `/to-tickets`) | Issue track only, once scope settles — see `docs/agents/workflow.md` |
| Pre-2026-10 specs and plans (historical) | **`docs/superpowers/`** | Frozen archive — read for history and prior art, add nothing |
| How work moves from idea to merged PR | **`docs/agents/workflow.md`** | The workflow changes |
| Cross-tool improvement ranking (shared causes, tool order) | **`docs/research/tool-backlog.md`** | Step 1 of the re-check order; re-ranked when a spec ships or new evidence lands |
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

### Display size
The pixels a picture in a deck actually needs: the largest extent it is drawn
at across every use, crop zoom and group scaling included, at a slide width
given in **projected pixels** (what a projector or screen shows). ppt-compress
downsamples only pictures holding more pixels than their display size, and
leaves a picture whose display size it cannot work out untouched (spec #91). A
PNG keeps its pixels when resizing saves under a tenth over its same-size
encode, since resizing softens it and a PNG of few colours can even grow.
_Avoid_: ppi of slide inches — slide sizes vary (20 × 11.25 in is common) and
say nothing about what is shown.

### Background crop
The part of an image that becomes a slide background: a rectangle of the
slide's aspect that the user places on the image (moved, or shrunk to zoom
in; centred and as large as possible by default). ppt-background keeps only
those pixels and discards the rest, so the background cannot be repositioned
in PowerPoint afterwards; the user re-runs the tool with the original image.
Gallery backgrounds are cropped the same way. image-to-pptx places the same
frame through the same picker as ppt-background (one shared background
editor, so both look and behave alike); its frame keeps its centre and zoom
when the user switches the slide between 16:9 and 4:3, pushed back inside
the picture if it no longer fits. A new pick starts centred again.
_Avoid_: "cover" or fill offsets: the earlier XML-only approach that kept the
whole image in the deck.

### Screen size
The screen a tool sizes a deck's pictures for, Full HD or 4K: a picture holds
no more pixels than it shows with the slide filling that screen, and is never
enlarged. ppt-background always uses 4K (one picture per deck); image-to-pptx
lets the user choose, Full HD by default (many pictures per deck). It sets the
size pictures enter a deck at; **display size** is what ppt-compress works out
for pictures already there.
_Avoid_: a long-edge cap: 1920 px on the long edge of a portrait picture holds
1920 rows where Full HD shows 1080.

### Placement
Where image-to-pptx puts the slide pictures: one box for the whole deck, in
which each picture is fitted keeping its shape (anchored top-left or
centred). The user places a frame, not a picture: the deck's pictures may
differ in size and shape, so the alignment says where in the frame each sits,
and the frame is placed with the first picture in view. Its size is a share of the **fill size**, the first picture as
large as fits the slide (100%); it can grow to 300%, past the slide's edges.
At any size the box may reach past the slide's edges, as long as it still
covers 5% of the slide on each axis (all of itself where it is smaller), so
it can be grabbed again on the preview; a box larger than the slide may leave
a gap. What
lies outside the slide is cut off when the deck is made: only the visible
part enters the deck, sized for the [screen size](#screen-size), so it cannot
be moved back in PowerPoint (the user re-runs the tool), as with the
[background crop](#background-crop). Position is the box's top-left corner
from the slide's top-left, as a share of the slide; it goes negative past
the slide's left or top edge. Width and height are locked to the first picture's
shape by default; unlocked, the box is an area for pictures of other shapes.
Pictures of another shape than the first may leave a gap even when the first
fills the slide; the background shows there. In a frame past the slide, such
a picture can fall wholly off its slide, which then shows the background
alone; since the user expects every slide to show its picture and judges the
frame by the first one, the tool names those slides and asks before making
the deck (it does not refuse: the deck is valid).
_Avoid_: "X / Y" as labels (users read them as nothing; say "from the left"
and "from the top"); cm or pixels (slide sizes differ between 16:9 and 4:3,
and pixels depend on the screen size).

### Background graphics
The elements of a slide's master and layout that show on the slide, under the
slide's own elements: everything in them but placeholders (which are only
frames for the slide to fill), unless the slide or its layout hides them
(PowerPoint's "Hide background graphics", 배경 그래픽 숨기기). A logo, a
decorative band or a full-slide picture placed on the master are background
graphics. Hiding them on a slide hides all of them at once; PowerPoint has no
way to hide one.
_Avoid_: "master shapes" (the layout's count too).

### Covering background
An element lying at the bottom of a slide's stack, under the slide's content,
that acts as the slide's background and hides or tints the real one, so a new
background would not show as chosen. A slide's stack is its background
graphics (master's, then layout's), then its own elements; a covering
background may lie in any of them, and one in the master or a layout covers
every slide that shows it. It is a top-level element with no text
whose bounds cover at least 90% of the slide and which either holds a picture
(a picture, a shape filled with a picture, or a group containing one) or is
filled opaquely (a solid or gradient fill with no transparency, or a pattern
fill, often a plain rectangle laid under everything; a shape without its own
fill takes the one its style reference names in the theme). Elements qualify
upwards from the bottom while consecutive ones do, and only with at least one
element above them (a master or layout holds no content, so one there needs
none). Hidden elements show nothing and are passed over. A slide
whose only element is one large picture holds content (a sheet-music slide
from image-to-pptx, a lyrics image); a translucent overlay that darkens a
photo for legible lyrics, a filled box holding text, a large element higher in
the stack, or one under 90% (sheet music on a background, typically 60–80% of
the slide) is content too. Decks exported from design
tools often carry one as a picture-filled shape or a group, and a picture may
be mostly transparent (soft colour blobs), so a picture's transparency does
not tell it from content. ppt-background deletes covering backgrounds on the
slides it changes unless the user keeps one (sheet music caught by the rule);
the user keeps the original file. One in the master or a layout is deleted
there when every slide showing it changes (master mode always); when only some
do, those slides hide their background graphics instead, and ppt-background
says so when other background graphics that show something go with it.
Background graphics that are not covering backgrounds (a logo) stay.
_Avoid_: "covering picture" (it need not be a picture); "individual
background" — that is a slide's own background.

### Background piece
An element the user picks in ppt-background to be deleted with the old
background, when the rule leaves part of it behind: a background built from
several smaller elements (colour blobs, a band, a frame), none of which covers
90% of the slide. Any element without text that shows something and takes at
least 5% of the slide can be picked, wherever it lies in the slide's stack,
background graphics included; smaller ones (icons, lines) cannot. A group is
one piece, as the slide's selection pane shows it. None is
picked by default, so the tool behaves as the rule says unless the user asks
for more. Picking one picks the same element (the same picture, or the same
fill at the same place and size) on every slide that has it, and it goes from
the slides that change, as a covering background would (one in the background
graphics follows the same rule).
_Avoid_: "decoration" (a piece may be content the user wants gone); "covering
background" for a piece (the rule never finds it).

### Visible background
What a viewer sees behind a slide's content: the first of its covering
backgrounds, its own background, its layout's background, or the master's.
ppt-background shows each slide's visible background as the current one and
replaces it: in all or chosen slides by setting the slide's own background
and deleting covering backgrounds; in master mode by setting the master's and
deleting what lies above it on every slide (covering backgrounds, slides' own
backgrounds, layouts' backgrounds). Both look the same; master mode also
reaches slides added later in PowerPoint.

### Slide's own background
The background a single slide declares for itself, which overrides its
layout's and master's. Real decks set one (usually a solid colour) on nearly
every slide, so a changed master background does not show through.
_Avoid_: "individual background" for covering backgrounds.

### No background
The ppt-background choice that returns slides to the theme's background
colour (`bg1`), as on a blank slide of a new PowerPoint deck. It is written
as that colour, never by removing the slide's own background: a slide
without one shows its layout's or master's, which may be a picture. In master
mode the master takes the theme colour, so a master picture goes too. The
new background is a picture, a solid colour, or no background; all three
follow the same apply scope and covering-background toggle.
_Avoid_: "transparent" or "remove background" (the slide is never left
without a background).

### Recipe edit
A change the user makes to a gallery gradient or pattern before applying it:
its colours, size, grain, softness and the one value that most decides its
shape (such as the god rays' density), which the browser applies by drawing
the gallery item's Paper Shaders recipe (`scripts/gallery/shaders.json`)
anew. Only Paper items have a recipe; photos and the three legacy gradients
are used as they are. An unedited pick is the gallery file itself, never a
fresh drawing (a GPU drawing differs slightly from the file); an edited one
is drawn at the file's composition and size and then cropped like any
picture. Grain and softness here are the shader's own, changing how the
shape is drawn: grain along colour edges and the recipe's own grain dots
(mesh and grain gradients, kept at the spec-end visual QA, 2026-11-01:
they are part of how the recipe looks), softness as colours mixing into
each other. Blur, and grain laid over any finished picture, belong to the
[filter set](#filter-set).
Where WebGL2 is missing the edit is not offered; a failed drawing of an edit
is an error, never a silent fall back to the unedited file. image-to-pptx
offers the same edit through the shared background editor.
_Avoid_: "customising the gallery file" (the file is never changed); calling
Paper's grain a filter.

### Filter set
The effects ppt-background and image-to-pptx (through the shared background
editor) lay over a finished background picture, after its crop and fit and
before its format is chosen, baked into its pixels. image-to-pptx fits the
picture to the deck's [screen size](#screen-size) first, not to 4K; since
strengths are shares of the picture, the result looks the same.
They combine, in one fixed order the user does not change: the
adjustments (blur, saturation, contrast), then one at a time of Paper
Shaders' image filters (the "style": fluted glass, paper texture, halftone
dots in two colours and in a mosaic of the picture's colours, CMYK
halftone), which redraw the adjusted picture, then the overlays (a colour
overlay, then a light or dark veil) over everything, so they tone the
style's own colours too, and grain last (its size, colour and response by
brightness as options). Each style offers a few of its own settings. They
apply to any picture, gallery or uploaded, and to a solid colour, which
takes every filter but blur (which changes nothing on it) and the
two-colour halftone (which replaces the colour): its colour effects only
change the colour it is filled with, and grain or a style makes it go into
the deck as a picture instead of a colour. "No
background" takes none: it is the theme's colour by definition. Strengths
are set as shares of the picture, never in pixels, so the preview and the
4K result look alike and a projector's downscale does not erase the grain.
Filters stay set when the user picks another background (a recipe edit
does not), and through 다시 하기. Paper's filters
need WebGL2 and are not offered without it. The deck holds only the
filtered picture, so a filter cannot be changed in PowerPoint; the user
re-runs the tool.
_Avoid_: "effect" for a recipe edit's grain or softness; PowerPoint picture
effects (they show differently or not at all in other viewers).

### Alias
A slug kept live for SEO / backwards compatibility that renders a different
**canonical** tool, declared via `aliasOf` in the registry. Today: `pdf-merge`,
`pdf-split`, `pdf-pages` → **pdf-arrange**; `heic-convert` → `image-compress`.
An alias is **not** a separate tool — don't count it as one.

### Non-expert user
The target audience: the five [target users](#target-users). They do not
know what "rasterize" means and will not read a tutorial. UI text and
defaults assume zero domain literacy.

### Finished in the tool
A tool's own job is complete when its file comes out: the user never has to
open PowerPoint (or any other program) to finish or adjust what the tool did.
A tool may write a PowerPoint feature into the file (a native background
transparency, a solid fill) as the way it does its job; "the user can set it in
PowerPoint" is never the reason a tool leaves something out. What remains for
the user in PowerPoint is their own content: editing text, changing or
reordering slides.
_Avoid_: justifying a gap or a design by an adjustment the user would make
afterwards in PowerPoint.

### Leaving the screen
The tab stops being shown while a run is in progress: another tab in front,
the window minimized or fully covered by another window, the screen turned
off, or another app in front on a phone. Ontab assumes the user keeps the tab
on screen and says so during a run. Leaving is still normal, so it must never
break a run: the run may slow down or pause, and when the user returns it goes
on and ends with the same file as if they had never left. Keeping a run going
while the user is away is welcome where it costs little, but it is not a
promise. Where a tool reduces a PNG's colours, any two runs differ a little in
their pixels even on screen, so for those pictures the same file means the same
quality.
_Avoid_: promising that a run finishes while the tab is hidden; "background
processing" (nothing is built to run away from the tab).

### Paused run
A run that stops making progress because the user left the screen, and goes on
by itself when they return. Only a run that truly stops is called paused; one
that only slows down is not. While it is paused the tab's title says so, and
after the user returns a line says it was paused and is going on, until the run
ends. Neither asks the user to do anything: the request to stay on the screen
was made during the run. A run that cannot go on is not paused: it ends in an
error that names the cause and keeps the input for another try.
_Avoid_: "stalled" or "stuck" in UI text; asking the user to reopen the tab.

### Target users
Who Ontab is for, and the work each brings. A tool's **feature-scope check**
(`docs/agents/workflow.md`) and backlog ranking test ideas against this table,
not against church work alone.

| Target | Typical work | Documents | Formats |
| ------ | ------------ | --------- | ------- |
| Pastors and church staff | Weekly worship decks (song lyrics, sermon), bulletins, sheet music, event promotion | Decks, bulletin and sheet-music PDFs, posters and notice images, phone photos | PPTX, PDF, JPG / PNG / HEIC |
| Teachers (school, Sunday school, academy and university lecturers) | Lesson materials and worksheets, exams, collecting students' photo submissions, notices to parents | Decks, worksheet and exam PDFs, notice images and posters, phone photos | PPTX, PDF, JPG / HEIC; HWP (no tool reads it) |
| Students | Assignments under upload limits, presentations, photos of notes and boards | Decks, PDFs, scans, phone photos | PPTX, PDF, JPG / HEIC |
| Office workers | Merging and splitting reports and contracts, fitting attachment limits, confidentiality marks, passwords, receipts to PDF, notices | PDFs, decks, photos, notice images | PDF, PPTX, JPG; Word / Excel need a server (non-goal) |
| Small-business owners | Menus, flyers, print posters, social-media images, product photos sized for marketplaces, copies of documents for submission | Images, posters, PDFs | JPG / PNG / HEIC / WebP, PDF |

Work shared across targets:
- **Promotion material**: print posters, notice images, and social-media
  formats such as an Instagram carousel or a YouTube thumbnail. Users name
  these by purpose, not by pixels; take the pixel sizes from the platform's
  current spec when building, since platforms change them.
- **Upload and attachment limits**: most targets shrink a file to fit a
  submission, a mail, or a messenger.
- **Phone photos** (HEIC on iPhones) arrive as input everywhere.

### Non-goals
Deliberate exclusions — these are out of scope by decision, not by omission.
Don't propose them as features:

- **Accounts / login / auth** (Clerk keys exist in `.env` as placeholders only).
- **Server-side storage or a hosted background-image gallery** (Supabase
  placeholders only; the in-app gallery is local files in `public/gallery/`,
  listed in `src/lib/gallery/catalog.ts`).
- **Paid / Pro tiers or payment** — Ontab is free; AdSense is the sole
  (deprioritized) monetization path.
- **Server-side format conversions** (PDF → Word / Excel / PPT). All processing
  is in-browser; conversions that need a server are out of scope.

---

## Design System

The design spec is **root [`DESIGN.md`](DESIGN.md)** (Google DESIGN.md standard
format, ADR-0003) — tokens, typography, components, and Do's & Don'ts live
there. The entries below define vocabulary only.

The **rendered brand reference** — logo, iconography, and motion shown live, each
with its design intent — is [`docs/brand.html`](docs/brand.html) (open in a
browser). It expresses identity and is kept **separate** from `DESIGN.md`: the
`designmd` token contract has no motion/iconography schema, so putting them there
would break `design:lint`. `brand.html` mirrors runtime values (`globals.css` +
the `src/components/brand/` assets) — it is documentation, not a source of truth.

### Monochrome
The active visual language (2026-06 redesign): **high-contrast monochrome —
"editorial black & white"**. One 7-step neutral ramp (`--mono-*`), no accent
hue; emphasis is contrast, inversion, and weight (`--emphasis`). Supersedes
**Silver** (ADR-0004). Do not introduce silver tokens, warm tones, or any
color outside the ramp.

### Silver (superseded)
The 2026-05 metallic language (OKLCH hue 250, `silver-*` tokens, blue
`accent-electric`). Superseded by Monochrome in 2026-06 (ADR-0004 supersedes
ADR-0001). The `silver-*` and `accent-*` tokens are **removed** from the
codebase — the only emphasis token is `--emphasis`.

### Tray + Lid
The product metaphor. The landing experience is a toolbox: a **tray** holds
the tools and opens when a category is chosen. Since the monochrome redesign
the metaphor is **conceptual, not material** — it lives in the open/close
interaction, motion, and copy. There is no photographic tray, no rendered
lid, no material panels.

### Treatment classes
The shared CSS treatments in `src/app/globals.css`, documented in DESIGN.md →
Components: `.toolcard`, `.nameplate`, `.btn-primary`, `.btn-download`,
`.handoff-action`, `.focus-ring`. **Reuse these — do not invent new treatment
classes.** The silver material classes (`rim`, `brushed`, `lid`, `glint`,
`glass-btn`, `tray-photo`, `dark-tray-surface`) are retired.

### Visual fidelity contract (historical)
During the silver era, the gitignored handoff (`ontab_design/`) was the
verbatim source of truth for inline styles and magic numbers. Since the
monochrome redesign, **`DESIGN.md` is the binding contract**; the handoff is
historical reference only.

### Typography
Clash Display (display / headline — Latin only) + IBM Plex Sans KR (title /
body, KO + EN) + Nanum Gothic Coding (label / mono). Pretendard is retained
solely for canvas text rasterisation (`renderTextToPng`) and as a Korean
fallback. The silver-era stack (Space Grotesk, Inter, JetBrains Mono) is
deprecated.

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

## Output correctness

How Ontab guards against handing the user a wrong file. Two layers: the
**output check** at run time (primary — it protects the user's actual file)
and the **regression set** at development time (secondary — it catches
breakage from code or engine changes, and keeps the output checks themselves
honest).

### Silent bad output
An engine finishes without error, but the result is wrong: it won't open or
is reported as damaged, content is missing (pages, slides, images), it
contradicts what the user asked for (wrong dimensions, larger after
compressing, a replaced background still embedded), its file size is out of
proportion to the input and the request, or two engines read it differently
(e.g. an invalid soft mask that one viewer drops and another renders).
Subjective quality loss is **not** silent bad output. _Avoid_: "corrupt output" for the whole class — corruption is one kind.

### Output property
A condition a tool's result must always satisfy, preferably stated **relative
to the input or the user's request** (e.g. "pdf-arrange: page count equals the
pages the user kept"). Each tool declares its own, and every tool declares a
**size bound**. Both layers check output properties: the output check checks
the cheap ones on every run; the regression set checks all of them on sample
files. A size bound acts at run time only for compressors, whose job is to
shrink: an output no smaller than the input becomes a distinct **could not
shrink** result with no download (never the original passed off as
compressed). Elsewhere a merely large file is still usable, so it is never
blocked.

### Output check
Re-examining a tool's result in the browser before the download is offered.
Cheap by design — structure, counts, first-page render — not an exhaustive
audit. On failure it first **recovers silently** (re-run in a safer mode,
e.g. a compressor without image re-encoding); if no recovery exists, it **blocks the download** with a
plain-language message. It never warns-and-allows. It flags only what is
certainly wrong: a false positive blocks a user with a good file.

### Cross-engine check
An output check that re-opens the result with a **different** engine than the
one that wrote it. Preferred, because an engine tends to accept its own
mistakes. _Avoid_: calling a same-engine re-open a cross-engine check.

### Regression set
Development-time tests that verify output properties on sample files: synthetic
files generated by the tests (committed, run automatically) plus the user's
real files (local-only, never committed — the repo is public), run whenever an
engine version changes. A test that passes because an engine failed to load is
a bug, not a pass.

### Pinned engine
A library that reads or writes the user's file (PDF, PPTX, image), declared at
an exact version so a routine dependency update can never swap it unverified.
Bumping one is deliberate: the real-file regression set must pass on the new
version first. Other libraries keep their existing specifiers.

### Output check constraints
Output correctness must not break the product's premise. Every output check:

1. **Stays in the browser** — no server-side validators, no file leaves the tab.
2. **Adds no limits** — no new caps on count, size, or usage.
3. **Asks nothing of the user** — no jargon, no "download anyway?" choices.
4. **Stays fast** — target ≤ ~20% of the tool's processing time.
5. **Adds no step** — hidden inside upload → process → download, inline on the
   landing.

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
`TOOLS` registry; specific candidates and their priority live in GitHub issues and memory.

### Phase 3 — SEO & monetization
Per-tool metadata, JSON-LD, sitemap, AdSense placement.

### Phase 4 — Docs & public launch
README polish, contribution docs, open-source publication.

---

## Working conventions

### Workflow
Work runs on one of two tracks — the **issue track** for multi-PR work
(`/grill-with-docs` → `/to-spec` → `/to-tickets` → `/implement`) or the
**direct track** for single-PR work — then the `pnpm verify` gate, UI
verification (built-in browser self-check, then the user's visual QA), review,
and ship. Full detail: [`docs/agents/workflow.md`](docs/agents/workflow.md).

### Task boundary
One spec, or one feature / bugfix / polished tool. The user approves before the
next one starts, and each ends with a Done / Why / Next recap. Inside an
approved spec, tickets run back to back with a one-line progress note.

### Design & brand sync
Any change that touches design or brand — `globals.css` tokens, brand components
(`src/components/brand/`), the logo, icons, or motion — keeps the reference docs
in step **in the same commit**, and consults them **before** starting (they carry
the *intent*, not just the values):

- **Color / type / component tokens** ↔ [`DESIGN.md`](DESIGN.md) (ADR-0003;
  `pnpm design:check` guards color drift automatically).
- **Logo, iconography, motion** ↔ [`docs/brand.html`](docs/brand.html) — a
  hand-maintained rendered mirror with **no automated guard**, so update its
  values *and* its design-intent notes whenever the runtime changes. It is the
  **comprehensive registry**: every icon in the site — the bespoke tool line set
  *and* the functional lucide UI icons (download, retry, add, delete, status, …)
  — and **every motion** (brand entrance + component transitions) must be
  catalogued there. Adding a new icon or motion to code means adding it to
  `brand.html` in the **same commit**; an icon/motion not in the catalogue is a
  gap to fix, not an exception.

`brand.html` carries design intent on purpose: it's where the "why" of the logo,
icon system, and motion lives, so future brand work stays coherent.

### Staging
Never `git add -A` — the design handoff folder and other local-only artifacts
are at risk. Always stage explicit paths.
