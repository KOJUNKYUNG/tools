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

One spec (issue track) or one tool (direct track) = one branch = one PR. Tickets land as commits on that branch; a spec too large for one reviewable PR splits into stacked PRs along ticket groups. Branch names: `chore/polish-{slug}`, `feat/{slug}`, `fix/{slug}`, `refactor/{slug}`. A PR body lists `Closes #N` for each ticket it finishes.

Within an approved spec, run ticket to ticket with a one-line progress note. Stop for the user at spec boundaries, open decisions, visual checks, and hard stops.

## Verify gate

`pnpm verify` runs typecheck, lint, tests, `design:check`, and build. It is green before any visual check and before any PR.

## Real-file regression set

`pnpm test:real` runs each registered tool's engine entry over the maintainer's real files in `tests/fixtures/` (gitignored, never committed; `REAL_FIXTURES_DIR` overrides the path) and checks every result at `full` depth. It is local-only: not part of `pnpm test`, `pnpm verify`, or CI. Run it before bumping a pinned engine (it must pass on the new version) and after changing a tool's engine or checker. It fails when the folder is missing or holds nothing a tool accepts, and prints the time each tool's `quick` check adds against the ~20% budget.

New fixtures need no bookkeeping: drop the file in the folder. To register a tool, add `<engine>.real.ts` next to its engine calling `realFileSuite(...)` (see `src/lib/output-check/realFileSuite.ts`; `src/lib/ppt/changeBackground.real.ts` is the example).

## UI verification

Every UI change passes two checks, in order:

1. **Self-check** in the built-in browser pane (`mcp__Claude_Browser__*`): load the page, screenshot it, read the DOM and console, and interact to test the UI stability contract (polishing checklist C).
2. **User visual QA**: the user's judgement is final. Send screenshots and name what to look at.

Start the dev server with `preview_start` (configured in `.claude/launch.json`), or attach to the one the user already runs. The pane manages the process; a raw `pnpm dev` in the shell blocks it.

## Review

Two skills share the name `code-review`; always name which one.

- `mattpocock-skills:code-review`: standards + spec axes. `/implement` runs it; on the direct track, run it before the PR.
- Built-in `/code-review`: correctness bug hunt. Run it once on the branch diff before opening the PR.

## Ship

1. `pnpm verify` green and visual QA passed.
2. **Hard stop**: show the user the commit list and the PR title/body; wait for go.
3. `git push -u origin <branch>`, then `gh pr create`.
4. Merge only on the user's go, as a squash.

**Stacked PRs.** Squash-merging the base rewrites its SHAs, so each child turns CONFLICTING. Merge children first when possible. Otherwise, per child: `git rebase --onto origin/master <old-base-sha> <child>`, `git push --force-with-lease` (on the user's go), retarget the PR to `master`, confirm `git diff origin/master HEAD --stat` lists only that PR's files, then squash-merge.
