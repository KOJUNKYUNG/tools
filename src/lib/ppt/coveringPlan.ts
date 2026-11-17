/**
 * What ppt-background deletes with the old background, from which part, and
 * which slides hide their background graphics instead (spec #163). One pure
 * plan, shared by the engine and the output check, so the check holds the
 * engine to it, and by the preview, so it promises what the engine does.
 *
 * Every slide the apply scope takes (every slide in master mode) gets the new
 * background, and with the old one goes:
 * - its covering backgrounds, unless the user keeps their group (unticks it
 *   in the picker): kept ones stay over the new background. A slide clears
 *   when it is in scope and keeps nothing;
 * - its background graphics (CONTEXT.md → Background graphics: the master's
 *   and layout's elements count as the old background), unless the user
 *   keeps one (`graphicKey`);
 * - the background pieces the user picks (CONTEXT.md → Background piece, by
 *   `pieceKey`), kept covering backgrounds or not.
 *
 * A slide's own elements go from it. One on its master or layout goes from
 * that part when it goes on every slide showing the part (always in master
 * mode). When it goes on only some of them, those hide their background
 * graphics instead (PowerPoint's "Hide background graphics"). That hides all
 * of them at once, so the ones that stay on the slide (kept graphics, a kept
 * covering background) are copied onto it, under its own elements. Master
 * mode also deletes the covering backgrounds of every layout's stack
 * (`layouts`) on the same terms, so layouts no slide uses yet lose theirs too:
 * slides added later show the new background.
 */

import type { BgMode } from "./changeBackground";
import type { CoveringBackground, StackElement } from "./coveringBackgrounds";
import type { BackgroundGraphic, BackgroundPiece, SlideStack } from "./slideStacks";

export interface CoveringScope {
  mode: BgMode;
  /** 1-based, in presentation order, for `specific-slides`. */
  targetSlides?: readonly number[];
  /** Keys of the covering-background groups the user keeps (`coveringGroupKey`). */
  keptCovering?: readonly string[];
  /** Keys of the background pieces the user picked (`pieceKey`); none by default. */
  pickedPieces?: readonly string[];
  /** Keys of the background graphics the user keeps (`graphicKey`); none by default: they go. */
  keptGraphics?: readonly string[];
}

/** What the plan reads of a slide's stack; the preview keeps only this much. */
export interface PlannedSlide {
  /** The slide part. */
  part: string;
  /** The parts of its stack, bottom first (`SlideStack.layers`). */
  layers: readonly { part: string }[];
  covering: readonly CoveringBackground[];
  coveringKey: string | null;
  /** Its background pieces, bottom first. */
  pieces: readonly BackgroundPiece[];
  /** Its background graphics but its covering backgrounds, bottom first. */
  graphics: readonly BackgroundGraphic[];
}

/** What the plan reads of a layout's stack. */
export interface PlannedLayout {
  covering: readonly CoveringBackground[];
  coveringKey: string | null;
}

/** The stack of a slide, as the plan reads it. */
export const plannedSlide = ({ part, layers, covering, coveringKey, pieces, graphics }: SlideStack): PlannedSlide => ({
  part,
  layers: layers.map(({ part }) => ({ part })),
  covering,
  coveringKey,
  pieces,
  graphics,
});

export interface CoveringPlan {
  /** The covering backgrounds to delete, by the part holding them (slides, layouts, masters), bottom first. */
  deletions: Map<string, CoveringBackground[]>;
  /**
   * The slides that hide their background graphics, by part, each with the
   * background graphics that stay on it, bottom of the stack first: copied
   * onto it.
   */
  hides: Map<string, StackElement[]>;
  /**
   * The background pieces and graphics to delete, by the part holding them,
   * bottom first: picked pieces from the slides in scope, background graphics
   * from their master or layout.
   */
  pieces: Map<string, StackElement[]>;
}

/** Elements by the part holding them, each once (by where it starts). */
type ByPart<T> = Map<string, Map<number, T>>;

function addTo<T extends StackElement>(into: ByPart<T>, e: T): void {
  const inPart = into.get(e.part) ?? new Map<number, T>();
  inPart.set(e.start, e);
  into.set(e.part, inPart);
}

const bottomFirst = <T extends StackElement>(byPart: ByPart<T>): Map<string, T[]> =>
  new Map([...byPart].map(([part, found]) => [part, [...found.values()].sort((a, b) => a.start - b.start)]));

/**
 * The plan for `stacks` (every slide's, in presentation order) under
 * `scope`; `layouts` are every layout's, read in master mode only.
 */
export function coveringPlan(
  stacks: readonly PlannedSlide[],
  { mode, targetSlides, keptCovering = [], pickedPieces = [], keptGraphics = [] }: CoveringScope,
  layouts: readonly PlannedLayout[] = [],
): CoveringPlan {
  const kept = new Set(keptCovering);
  const isKept = (s: PlannedLayout) => s.coveringKey !== null && kept.has(s.coveringKey);
  const inScope = stacks.map((_, i) => mode !== "specific-slides" || (targetSlides?.includes(i + 1) ?? false));
  const clearing = stacks.map((s, i) => inScope[i] && !isKept(s));
  /** Whether every slide showing `part` (the master or layout holding an element) is among `slides`. */
  const everyShowing = (part: string, slides: readonly boolean[]) =>
    stacks.every((s, i) => slides[i] || !s.layers.some((l) => l.part === part));
  const keptGraphic = new Set(keptGraphics);
  const goes = (g: BackgroundGraphic) => !keptGraphic.has(g.key);

  const covering: ByPart<CoveringBackground> = new Map();
  const collect = (found: readonly CoveringBackground[]) => {
    for (const c of found) if (c.holder === "slide" || everyShowing(c.part, clearing)) addTo(covering, c);
  };
  const picked = new Set(pickedPieces);
  const pieces: ByPart<StackElement> = new Map();
  const hides = new Map<string, StackElement[]>();
  stacks.forEach((s, i) => {
    if (!inScope[i]) return;
    for (const p of s.pieces) if (picked.has(p.key)) addTo(pieces, p);
    const graphicsGoing = s.graphics.filter(goes);
    for (const g of graphicsGoing) if (everyShowing(g.part, inScope)) addTo(pieces, g);
    if (clearing[i]) collect(s.covering);
    const coveringGraphics = s.covering.filter((c) => c.holder !== "slide");
    // Something going here stays in its part for another slide showing it: only hiding takes it away here.
    const hidden =
      graphicsGoing.some((g) => !everyShowing(g.part, inScope)) ||
      (clearing[i] && coveringGraphics.some((c) => !everyShowing(c.part, clearing)));
    if (!hidden) return;
    // Hiding takes every background graphic: what stays on the slide comes back as copies.
    const place = (e: StackElement) => s.layers.findIndex((l) => l.part === e.part);
    const staying = [...s.graphics.filter((g) => !goes(g)), ...(clearing[i] ? [] : coveringGraphics)];
    hides.set(s.part, staying.sort((a, b) => place(a) - place(b) || a.start - b.start));
  });
  // A layout showing a kept group, one no slide uses yet included, keeps it too.
  if (mode === "master") for (const l of layouts) if (!isKept(l)) collect(l.covering);
  return { deletions: bottomFirst(covering), hides, pieces: bottomFirst(pieces) };
}
