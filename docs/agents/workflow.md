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

`pnpm test:real` runs each registered tool's engine entry over the maintainer's real files in `tests/fixtures/` (gitignored, never committed; `REAL_FIXTURES_DIR` overrides the path) and checks every result at `full` depth. It is local-only: not part of `pnpm test`, `pnpm verify`, or CI. Run it before bumping a pinned engine (it must pass on the new version) and after changing a tool's engine or checker. It fails when the folder is missing or holds nothing a tool accepts, and prints the time each tool's `quick` check adds against the ~20% budget.

New fixtures need no bookkeeping: drop the file in the folder. To register a tool, add `<engine>.real.ts` next to its engine calling `realFileSuite(...)` (see `src/lib/output-check/realFileSuite.ts`; `src/lib/ppt/changeBackground.real.ts` is the example).

### ppt-background coverage report

`pnpm report:ppt-background` prints what the local decks show of the covering-background rule (`src/lib/ppt/coveringBackgrounds.ts`, the same rule the tool runs), so you know which decks to collect next. It reads the same folder (`REAL_FIXTURES_DIR` overrides it) and writes nothing. Per deck: the producer its properties name, slide size, covering backgrounds by form and slide, near misses, slides' and layouts' own background kinds, and covering backgrounds with animations. A near miss is the full-slide element that ended the run from the bottom (for text, a transparent fill, or no fill), which may sit above covering backgrounds on the same slide, or a run with nothing above it. A deck ppt-background already changed (its `ppt/media/background_custom*` picture) is marked as a re-run input; keep such outputs in the folder, since re-using the tool's output is where problems have shown up. The report ends with spec #105's producer × purpose matrix (deck counts, `·` for an empty cell) and, per case, the producers it was seen in; `·` and `— not seen yet` mark what to collect next.

Deck properties misreport the producer (Canva and 미리캔버스 write `Microsoft Office PowerPoint 14.0000`; Google Slides writes none) and never say the purpose, so tag decks in `coverage-tags.json` in the fixture folder (local, never committed), using the matrix's names (the producer and purpose lists at the top of `report.ts`):

```json
{ "deck.pptx": { "producer": "Canva", "purpose": "lyrics" } }
```

The script is TypeScript run by Node itself (type stripping); `scripts/ppt-background-coverage/register.mjs` resolves the `@/` alias and extensionless imports, so it needs no extra package.

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
