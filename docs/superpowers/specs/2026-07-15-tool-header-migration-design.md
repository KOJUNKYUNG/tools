# Tool header migration — strip → header, shared `ToolHeader`

- **Date:** 2026-07-15
- **Branch:** `refactor/tool-header`
- **PR:** 1 of 3 in the pdf-watermark polish session (this = common/foundational; PR-2 `chore/polish-pdf-watermark` redesign consumes it; PR-3 `chore/align-ppt-background-tray` follows).
- **Scope:** Move the file-info row + re-upload + primary action out of the in-body `ToolTopStrip` and into the tool **header**, for **every tool** and both mount modes (standalone page + landing inline). Extract one shared `ToolHeader`. Relocate the result-card "다시 하기" (again) into the header's primary-button lifecycle. Retire the per-tool header reset button.
- **References:** `DESIGN.md` (Buttons / File-info row / Result view), `docs/brand.html`, `src/app/globals.css` @theme. Memory: `common-component-unification`, `ontab_conventions`, `ontab_copy_conventions`, `result-pop-card-only`, `design-brand-sync`, `ontab-polishing-phase`.

---

## 1. Motivation

Every tool's standalone header currently shows only **title + description**, leaving the right side permanently empty, while the file-info + primary action live in a separate in-body `ToolTopStrip` one row below. The header and the strip are two stacked rows doing adjacent jobs.

Two structural problems make this more than cosmetic:

1. **The header is rendered in two places.** Standalone: each tool's `!inline` branch renders `<card><reset/><header>title·desc</header>{body}</card>`. Inline (landing): `Screen3Workspace` renders its **own** `<card><header>title·desc</header>{body}</card>` and the tool renders only `body`. The title/description markup is duplicated 13× in tools **and** once in `Screen3Workspace`.
2. **The strip lives in the body** (`ToolTopStrip` inside each tool body), so it is the same in both mounts — but it sits *below* the empty-right header.

Consolidating the strip into the header removes a row, fills the dead space, and lets us delete the duplicated header markup by extracting one `ToolHeader`.

This is the canon that PR-2 (pdf-watermark redesign) builds on, so it lands first.

## 2. Goals

1. Introduce one shared **`ToolHeader`** component; every tool renders it in **both** inline and standalone.
2. `Screen3Workspace` and the standalone tool cards **stop rendering their own header block** — the tool owns its header (it holds the file state the header now needs).
3. Header hosts: left = title + (description when empty / file-info when loaded); right = re-upload + a **stateful primary button** (execute → processing → again).
4. Relocate the result-card **again** action into the header; `ResultActions` becomes **download → handoff** only.
5. Retire the absolutely-positioned header **reset (RotateCcw)** button app-wide (re-upload is the reset path). Multi-file tools keep their in-body add/clear controls.
6. `ToolTopStrip` is **absorbed** into `ToolHeader` and removed.
7. Update `DESIGN.md` canon (header owns file-info + primary lifecycle; result card no longer carries again).

## 3. Non-goals (other PRs / sessions)

- The pdf-watermark **layout redesign** (settings box, free-drag page numbers, divider, defaults) — PR-2.
- `ppt-background` `--tray-h` placement fix — PR-3.
- Icon migration (lucide → brand line-set) — global backlog, untouched here.
- Any change to a tool's **body** controls, processing logic, or result summary content beyond removing the in-body strip and the again button.
- Multi-file tools' add/clear semantics — left exactly as-is.

## 4. Architecture — `ToolHeader`

### 4.1 Component

`src/components/common/ToolHeader.tsx` — one treatment site-wide. Renders the header row that today holds title/description, now also hosting the strip's responsibilities.

```ts
type PrimaryState = "execute" | "processing" | "again";

interface ToolHeaderProps {
  title: string;
  description: string;
  /** File summary "name · size" — omit when no file is loaded. */
  fileSummary?: string;
  /** Extra meta after the name, e.g. "· 12페이지" / "· 24 slides". */
  meta?: ReactNode;
  /** Re-upload — omitted when no file is loaded. */
  onReupload?: () => void;
  reuploadLabel?: string;
  /** Busy = a re-upload is being prepared or a run is in flight. */
  busy?: boolean;
  busyReuploadLabel?: string;
  /** Primary button lifecycle. Omitted when no file is loaded. */
  primary?: {
    state: PrimaryState;
    executeLabel: string;
    processingLabel: string;
    againLabel: string;
    onExecute?: () => void;
    onAgain?: () => void;
    /** Disables execute (e.g. nothing selected). Ignored for processing/again. */
    executeDisabled?: boolean;
  };
}
```

- **Empty (no file):** left = title over description; right = nothing.
- **Loaded:** left = title over `fileSummary + meta` (description is replaced by file-info); right = re-upload + primary button.
- The primary button is one element whose label/handler/disabled derive from `primary.state`:
  - `execute` → `executeLabel`, `onExecute`, `.btn-primary`, disabled iff `executeDisabled || busy`.
  - `processing` → `processingLabel`, no handler, `.btn-primary`, always disabled.
  - `again` → `againLabel`, `onAgain`, `.btn-primary` (re-run affordance).
- Re-upload keeps the **Toolbar-subtle** treatment and the canonical "다시 업로드 / Re-upload" label; disabled while `busy`, label swaps to the busy label when a re-upload is being prepared.
- Layout mirrors the current `ToolTopStrip`: `flex-wrap items-center justify-between`; left group truncates the file name; right group holds re-upload + primary. Same button specs (`h-9 min-w-[140px]` primary).

### 4.2 State → header mapping (per tool)

The tool derives `ToolHeaderProps` from its existing state (`hasFile`, `status`, `result`):

| tool state | left | right |
| --- | --- | --- |
| no file | title · description | — |
| file · idle | title · file-info | [다시 업로드] [적용/실행하기] |
| file · processing | title · file-info | [다시 업로드 ⋯(disabled)] [처리 중…(disabled)] |
| file · done | title · file-info | [다시 업로드] [다시 하기] |
| file · error | title · file-info | [다시 업로드] [실행하기] (re-run; body shows the error via `ProcessingStatus`) |

`primary.state` = `processing` when `status==="processing"`, `again` when `status==="done"`, else `execute` (idle/error). `onAgain` = the tool's existing `retry()`.

### 4.3 Mount wiring

- **Standalone** (tool `!inline` branch): render the card, then `<ToolHeader …/>` as the first child (replacing the old title/desc block **and** the absolute reset button), then `{body}`. `body` no longer contains `ToolTopStrip`.
- **Inline** (tool `inline` branch): render `<ToolHeader …/>` then `{body}` (no card — the card wrapper stays with `Screen3Workspace`).
- **`Screen3Workspace`**: keep the card wrapper; **delete** the inline title/description block (lines ~211–235) and the hidden slug span — the tool now renders its own header inside the card.
- **Standalone page** (`app/[lang]/(chrome)/tools/*/page.tsx`): unchanged (already just wraps the tool in a width container).

### 4.4 `ResultActions` change

`src/components/common/ResultActions.tsx` — drop the `again` prop; the canonical action set becomes **download → handoff**. All call sites that passed `again` remove it (the again action is now the header primary in the done state). `ResultCard` unaffected. `HandoffAction` unaffected. (`DESIGN.md` "Result view" line updated: the card holds download + handoff; **again lives in the header**.)

## 5. Affected files

- **New:** `src/components/common/ToolHeader.tsx`.
- **Removed:** `src/components/common/ToolTopStrip.tsx` (absorbed).
- **Edited — every tool** (`src/components/tools/*/*.tsx`, 13 tools): replace `!inline` header + reset button and the in-body `ToolTopStrip` with `ToolHeader`; drop the now-unused `RotateCcwIcon` import, `onReset`/`reset` label, and (in result components) the `again` action.
- **Edited:** `Screen3Workspace.tsx` (remove its header block), `ResultActions.tsx` (remove again), each tool's `*Result.tsx` / `labels.ts` (drop again/reset labels that移 to header — see §7).
- **Edited:** `DESIGN.md` (§7), memory sync.

## 6. Labels / i18n

- Header keeps existing keys: `title`, `description`, `fileInfo`, `pageCount`/`slideCount`, `reupload`, the execute verb (per-tool, e.g. `apply`/`적용하기`), `processing`.
- **again** label (`다시 하기` / `Start over`) moves conceptually from the result card to the header but keeps the **same key + string** — no copy change, only where it renders.
- **reset** label (`도구 초기화` / `Reset`) becomes dead → removed from every tool's `labels.ts` + both dictionaries.
- ko/en updated in parallel; EN-leak = 0. No new strings introduced.

## 7. `DESIGN.md` canon updates

- **File-info row**: now the header's left column when a file is loaded (title over `name · meta`), not a separate body row. The "same flat name·meta row" rule stays; its *location* moves to the header.
- **Buttons / Primary execute**: document the header primary **lifecycle** (execute → processing(disabled) → again) as one button, and re-upload beside it.
- **Result view**: `ResultActions` = download → handoff (again removed; again is the header primary in the done state).
- **Reset**: the absolute header reset (RotateCcw) is retired; re-upload is the single-file reset path (completes the ppt-background-era rule app-wide).

## 8. Verification

- Pure mapping (state → `PrimaryState`, file-info string composition) is trivial; unit-test the `PrimaryState` derivation helper with Vitest (idle/processing/done/error × hasFile).
- `pnpm tsc` + `build` + ESLint (core-web-vitals) + `pnpm design:check`.
- Manual (dev server by user, screenshots; no `/browse`): for a representative set (single-file: pdf-compress, pdf-lock, pdf-watermark; multi-file: pdf-arrange, image-to-pdf; ppt: ppt-compress, ppt-background) confirm in **both** standalone and landing-inline mounts:
  - header shows title·description when empty; swaps to file-info + [re-upload][execute] on load;
  - execute → processing(disabled, "처리 중…") → done shows [re-upload][다시 하기]; 다시 하기 returns to idle → [execute];
  - result card no longer shows an again button; download → handoff intact;
  - no header reset button anywhere; footprint/height unchanged across states (C — UI stability).

## 9. Risks

- **13-tool churn.** High file count, but the change is mechanical (same replacement per tool) and net-reduces duplicated markup. Do it tool-by-tool with `tsc`/build after each cluster.
- **Multi-file tools** (pdf-arrange family, image-to-pdf/pptx): they have add/clear + a full reset today. Removing the header reset must not strip their "clear all" affordance — verify each keeps a body path to empty the file set. If a tool relies solely on the header reset, add/keep a body control rather than removing function.
- **Inline header height.** Screen3Workspace centers the card; the header now carries an action row when a file is loaded. Confirm the `--tray-h` workspace envelope still holds and the card doesn't jump between empty/loaded (reserve is fine — the header row height is constant; only its contents swap).
- **again relocation** touches every result card — a shared-component change. Land `ResultActions` edit + all call sites together so no tool renders a stale again.
- **error state**: header primary returns to `execute` on error while the body shows the error; ensure retry semantics match today's `retry()`.

## 10. Sequencing note

PR-2 (pdf-watermark) branches from this once merged (or stacked on it). PR-3 (ppt tray) also assumes this header structure for ppt-background, so it follows PR-1.
