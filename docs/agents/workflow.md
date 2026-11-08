# Workflow

How work moves from idea to merged PR in this repo. Global defaults live in the user's `~/.claude/CLAUDE.md`; this file holds the repo specifics.

## Pick the track

- **Issue track**: work that spans more than one PR (e.g. output-defense hardening). These skills are user-invoked, so the user drives each step; end each step by naming the next command.
  1. `/grill-with-docs`: settle scope; `CONTEXT.md` and ADRs update as terms and decisions resolve.
  2. `/to-spec`: the spec is published as a GitHub issue.
  3. `/to-tickets`: tracer-bullet tickets published as issues with blocking edges, once the user approves the breakdown.
  4. `/implement`, one ticket at a time: it runs `tdd` and `mattpocock-skills:code-review` itself.
- **Direct track**: a single-PR change (one tool's polish, a bug fix). Settle scope in chat (`grilling` when ambiguous), then build with `tdd`. No issue.
- **Docs / config / typo**: commit straight to `master`.

On the issue track, the GitHub issue is the source of truth for progress; auto-memory keeps lessons and decision context only. The repo is **public**, so issues are public.

`docs/superpowers/` is a frozen archive of the specs and plans written before 2026-10: read it for history and prior art; new specs go to issues.

## Branch and PR unit

One spec (issue track) or one tool (direct track) = one branch = one PR. Tickets land as commits on that branch; a spec too large for one reviewable PR splits along ticket groups into sequential PRs: merge one, then cut the next branch from the new `master`. Each ticket runs in a fresh session on the spec's branch, one at a time (tickets are sized to fit one context window). Branch names: `chore/polish-{slug}`, `feat/{slug}`, `fix/{slug}`, `refactor/{slug}`. A PR body lists `Closes #N` for each ticket it finishes.

Within an approved spec, run ticket to ticket with a one-line progress note. Stop for the user at spec boundaries, open decisions, visual checks, and hard stops.

## Re-check and polish order

Re-checking or polishing many tools runs in four steps: diagnose across tools, fix within one tool.

1. **Diagnose across tools.** Compare all tools side by side; inconsistencies show only there (one tool caps images at 1920 px, another embeds them as-is). Reuse an existing review and re-rank it instead of auditing again. Output: the tool order.
2. **Fix shared causes once.** A problem with one cause in several tools is fixed at the shared source in one change.
3. **One tool at a time**, in that order: logic first, then its UI, as one PR. A logic change often reshapes the UI, so polishing UI first is wasted work. Open each tool's turn with a short **feature-scope check** (competitors' published feature lists, and the work of each target user in `CONTEXT.md` "Target users", not church work alone); ideas found go to their own spec or the backlog, not into the fix in progress.
4. **Site-wide visual check last**: phone, tablet, dark, English, across all tools. These defects mostly live in shared chrome, and checking earlier gets re-broken by later changes.

**Reuse check.** Whenever a tool gains a capability (a picker, an encoder rule, a size policy), ask which other tools could use it. If any could, build it as a shared module and note the tools that should adopt it; each adopts it in step 2 or on its own turn.

## Verify gate

`pnpm verify` runs typecheck, lint, tests, `design:check`, and build. It is green before any visual check and before any PR. CI (`.github/workflows/ci.yml`) runs the same gate on every PR to `master` and every push to `master`.

## Real-file regression set

`pnpm test:real` runs each registered tool's engine entry over the maintainer's real files in `tests/fixtures/` (gitignored, never committed; `REAL_FIXTURES_DIR` overrides the path) and checks every result at `full` depth. It is local-only: not part of `pnpm test`, `pnpm verify`, or CI. Run it before bumping a pinned engine (it must pass on the new version) and after changing a tool's engine or checker. It fails when the folder is missing or holds nothing a tool accepts, and prints the time each tool's `quick` check adds against the ~20% budget. When bumping justpdf, also run it with `REAL_FIXTURES_DIR=tests/print-intent-samples`: only that folder holds the hybrid-reference and non-zero-generation files justpdf loses objects from (`src/lib/pdf/plainPdf.ts`).

New fixtures need no bookkeeping: drop the file in the folder. To register a tool, add `<engine>.real.ts` next to its engine calling `realFileSuite(...)` (see `src/lib/output-check/realFileSuite.ts`; `src/lib/ppt/changeBackground.real.ts` is the example). pdf-to-image's engine needs a browser canvas, so it is not registered: `src/lib/pdf/pdfToImage.real.ts` checks its choice of intent instead (see the leaving-the-screen check).

### ppt-background coverage report

`pnpm report:ppt-background` prints what the local decks show of the covering-background rule (`src/lib/ppt/coveringBackgrounds.ts`, the same rule the tool runs), so you know which decks to collect next. It reads the same folder (`REAL_FIXTURES_DIR` overrides it) and writes nothing. Per deck: the producer its properties name, slide size, covering backgrounds by form and slide, near misses, slides' and layouts' own background kinds, and covering backgrounds with animations. A near miss is the full-slide element that ended the run from the bottom (for text, a transparent fill, or no fill), which may sit above covering backgrounds on the same slide, or a run with nothing above it. A deck ppt-background already changed (its `ppt/media/background_custom*` picture) is marked as a re-run input; keep such outputs in the folder, since re-using the tool's output is where problems have shown up. The report ends with spec #105's producer × purpose matrix (deck counts, `·` for an empty cell) and, per case, the producers it was seen in; `·` and `— not seen yet` mark what to collect next.

Deck properties misreport the producer (Canva and 미리캔버스 write `Microsoft Office PowerPoint 14.0000`; Google Slides writes none) and never say the purpose, so tag decks in `coverage-tags.json` in the fixture folder (local, never committed), using the matrix's names (the producer and purpose lists at the top of `report.ts`):

```json
{ "deck.pptx": { "producer": "Canva", "purpose": "lyrics-text" } }
```

The script is TypeScript run by Node itself (type stripping); `scripts/lib/register.mjs` resolves the `@/` alias and extensionless imports, so it needs no extra package.

## Leaving-the-screen check

`pnpm check:leaving-screen` checks what happens when the user leaves the screen during a run (CONTEXT "Leaving the screen"), in real Chrome on the real GPU, through the tool's real page. Run it after a change to how a tool waits, draws or yields, and after bumping pdf.js, pdf-lib or Paper. It is local-only: not part of `pnpm test`, `pnpm verify`, or CI. It runs the last production build, so run `pnpm build` first (`--origin=<url>` takes a running app instead, but a dev server's freezes are not a user's).

```bash
pnpm check:leaving-screen --tool=pdf-arrange --fixture=<file in tests/fixtures>
```

It runs the tool twice on the same file, once visible and once minimized from the click on (`--hide-after=<ms>` later) and restored after `--hide-for` seconds (15; past 300 the browser's timers are at their slowest), and prints pass or fail per comparison: both runs ended in a result, the visible run stayed on screen, the window was hidden before the run ended (a run too fast to catch fails here, so use a larger file), ppt-background's and image-to-pptx's Paper runs really drew with Paper, only a run that truly stops was called paused (the tab's title while hidden and back afterwards, the was-paused line until the end), and each saved file has the same content (a PDF by its pages' pixels, allowing 8 of 255 per value on 0.01% of a page's values, since two draws of one file differ by that; a picture by its pixels, a zip or `.pptx` entry by entry; bytes may differ). A PNG that browser-image-compression quantizes (ppt-compress, image-compress) differs between any two runs, visible ones too, since its quantizer starts from `Math.random()`: fixing that made two encodes identical. Fidelity to the original does not change (measured 2026-11-02), so ppt-compress's file comparison fails whatever the screen did: read its other lines. It exits non-zero on any failure. It also prints how long the run took hidden, the progress when the window was hidden and when it came back, and the visible run's longest freeze, as the longest gap between frames, during the run and from upload to the start.

`--tool` takes any tool whose run needs only a file. ppt-background sets up a Paper item first: `--edit=recipe` (the default) moves its hue, `--edit=filter` adds the first Paper filter; `--edit=photo` and `--edit=effect` (the item's file with blur) draw nothing with Paper, so must not be called paused, and need a deck large enough to catch. image-to-pptx takes the same `--edit` values, set up in the background editor its background row opens; without `--edit` it runs on its white background. With `--context-loss` it forces a WebGL context loss during the apply and during the preview, on screen and while minimized. An apply must end in the right picture, or in the error that fits (the existing message on screen, the left-the-screen one when minimized) with a retry that gives the right picture; a hang or another picture fails. A preview must say what fits (nothing for a recipe preview, which opens again by itself, or for a minimized filter preview, whose lost draft is replaced anyway), draw again, and leave the apply right.

pdf-arrange, pdf-watermark and image-to-pdf (which shares pdf-arrange's assembler) call pdf-lib with a yield every 5000 objects (`src/lib/pdf/pdfLibYields.ts`), its default being every 50 to 100. pdf-lib's cost follows objects, not bytes, so to re-measure the freeze after bumping pdf-lib, build PDFs near the 50 MB limit (`node --max-old-space-size=8192 scripts/check-leaving-screen/build-large-pdfs.mjs <a real PDF over 50 MB> <a real deck, repeated>`, into `tests/large-pdf-samples/`) and pass one as `--fixture=../large-pdf-samples/<name>.pdf`. The ebook's 21,000 pages take the file comparison longer than is worth waiting for: read the freeze lines, printed first.

pdf-to-image draws each page with pdf.js's print intent, which keeps moving while hidden, unless print would draw it differently (`pageIntent`: annotations that differ between the two, or any layers); such a page keeps the display intent and pauses. So what its run does depends on the file: pass `--paused` for a file with such a page.

A run over its 50 MB part target ends with one download button per part; the check clicks each and compares the parts. Pages of big pictures can differ between two visible runs too (`real-cut`-style files, on the real GPU), and pictures are compared exactly, so when its file comparison fails, `--compare` the visible outputs of two runs before blaming the screen.

`--print-intent` compares the two intents page by page on the fixtures, on `tests/print-intent-samples/` (local: the pdf.js project's `test/pdfs` annotation and form files and a public form, kept out of `test:real`'s folder since they are made to be awkward), and on samples it builds, with the rule's choice per page. It passes when no page sent to print differs; a DIFF on a page that stays on display is expected. The canvas stays in software (`--gpu` takes the tool's own, for freezes at `--dpi=300`); the display intent can differ from itself by a few pixels between two draws, so it redraws before blaming the intent, and it runs a copy of the rule, since the page cannot import it. `pnpm test:real` checks the same rule without a canvas: for every page sent to print, pdf.js must build the same drawing for both intents. When bumping pdf.js, run both: a new difference between the intents would otherwise change pictures with no error.

`--compare <a> <b>` compares two files by content on its own. Outputs go to a `tests/leaving-screen-*` folder (gitignored), removed at the end; `--keep` leaves them, to look into a failure. Inputs stay in `tests/fixtures/` (`REAL_FIXTURES_DIR` overrides the folder). A Chrome window opens, and it may sit behind other windows, but keep the screen on: with it off, Chrome sends no frames and the visible run fails its check. On a machine with no real GPU it stops at once.

## UI verification

Every UI change passes two checks, in order:

1. **Self-check** in the built-in browser pane (`mcp__Claude_Browser__*`): load the page, screenshot it, read the DOM and console, and interact to test the UI stability contract (polishing checklist C).
2. **User visual QA**: the user's judgement is final. Send screenshots and name what to look at.

Start the dev server with `preview_start` (configured in `.claude/launch.json`), or attach to the one the user already runs. The pane manages the process; a raw `pnpm dev` in the shell blocks it.

Real files for a self-check stay in `tests/` (the user's rule: no copies elsewhere, e.g. not in `public/`). To feed one to a tool page, start `preview_start` "measure-ppt-ratios" and fetch `http://localhost:4310/fixtures/<name>` from the page, then hand the blob to the tool's file input through a `DataTransfer`.

Check every layout in the landing workspace (`/{lang}`, open the tool from its category) as well as on the tool's own page: the landing workspace is a fixed screen that does not scroll, so a tool taller than the window is cut off there and runs into the footer.

## Review

Two skills share the name `code-review`; always name which one.

- `mattpocock-skills:code-review`: standards + spec axes. `/implement` runs it; on the direct track, run it before the PR.
- Built-in `/code-review`: correctness bug hunt. Run it once on the branch diff before opening the PR.

## Ship

1. `pnpm verify` green and visual QA passed.
2. **Hard stop**: show the user the commit list and the PR title/body; wait for go.
3. `git push -u origin <branch>`, then `gh pr create`.
4. Merge only on the user's go, as a squash.

**Stacked PRs** (exception: only when the next PR must start before the previous one merges). Squash-merging the base rewrites its SHAs, so each child turns CONFLICTING. Merge children first when possible. Otherwise, per child: `git rebase --onto origin/master <old-base-sha> <child>`, `git push --force-with-lease` (on the user's go), retarget the PR to `master`, confirm `git diff origin/master HEAD --stat` lists only that PR's files, then squash-merge.
