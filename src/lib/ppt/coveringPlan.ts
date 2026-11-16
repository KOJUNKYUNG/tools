/**
 * Which covering backgrounds ppt-background deletes, and from which part, and
 * which slides hide their background graphics instead (spec #163). One pure
 * plan, shared by the engine and the output check, so the check holds the
 * engine to it, and by the preview, so it promises what the engine does.
 *
 * Every slide the apply scope takes (every slide in master mode) gets the new
 * background. Its covering backgrounds go too, unless the user keeps their
 * group (unticks it in the picker): kept ones stay over the new background.
 * A slide clears when it is in scope and keeps nothing. A clearing slide's
 * own covering backgrounds go from it. One on its master or layout goes from
 * that part when every slide showing the part clears: deleting it there
 * clears them all. When only some of them clear, those hide their
 * background graphics instead (PowerPoint's "Hide background graphics"),
 * which takes every other background graphic on them too. Master mode also
 * deletes the covering backgrounds of every layout's stack (`layouts`) on the
 * same terms, so layouts no slide uses yet lose theirs too: slides added
 * later show the new background.
 *
 * The background pieces the user picks (CONTEXT.md → Background piece, by
 * `pieceKey`) go from every slide in scope that has them, kept covering
 * backgrounds or not. One among the background graphics (on the master or a
 * layout) follows the covering backgrounds' rule over the slides in scope: it
 * goes from its part when every slide showing it is in scope (always in
 * master mode), else the slides in scope showing it hide their background
 * graphics.
 */

import type { BgMode } from "./changeBackground";
import type { CoveringBackground, GraphicRef } from "./coveringBackgrounds";
import type { BackgroundPiece, SlideStack } from "./slideStacks";

export interface CoveringScope {
  mode: BgMode;
  /** 1-based, in presentation order, for `specific-slides`. */
  targetSlides?: readonly number[];
  /** Keys of the covering-background groups the user keeps (`coveringGroupKey`). */
  keptCovering?: readonly string[];
  /** Keys of the background pieces the user picked (`pieceKey`); none by default. */
  pickedPieces?: readonly string[];
}

/** What the plan reads of a slide's stack; the preview keeps only this much. */
export interface PlannedSlide {
  /** The slide part. */
  part: string;
  /** The parts of its stack, bottom first (`SlideStack.layers`). */
  layers: readonly { part: string }[];
  covering: readonly CoveringBackground[];
  coveringKey: string | null;
  showing: readonly GraphicRef[];
  /** Its background pieces, bottom first. */
  pieces: readonly BackgroundPiece[];
}

/** What the plan reads of a layout's stack. */
export interface PlannedLayout {
  covering: readonly CoveringBackground[];
  coveringKey: string | null;
}

/** The stack of a slide, as the plan reads it. */
export const plannedSlide = ({ part, layers, covering, coveringKey, showing, pieces }: SlideStack): PlannedSlide => ({
  part,
  layers: layers.map(({ part }) => ({ part })),
  covering,
  coveringKey,
  showing,
  pieces,
});

export interface CoveringPlan {
  /** The covering backgrounds to delete, by the part holding them (slides, layouts, masters), bottom first. */
  deletions: Map<string, CoveringBackground[]>;
  /**
   * The slides that hide their background graphics, by part, each with how
   * many other background graphics showing something go with them.
   */
  hides: Map<string, number>;
  /**
   * The picked background pieces to delete, by the part holding them, bottom
   * first: a slide's own from the slides in scope, a background graphic from
   * its master or layout when every slide showing it is in scope.
   */
  pieces: Map<string, BackgroundPiece[]>;
}

/**
 * The plan for `stacks` (every slide's, in presentation order) under
 * `scope`; `layouts` are every layout's, read in master mode only.
 */
export function coveringPlan(
  stacks: readonly PlannedSlide[],
  { mode, targetSlides, keptCovering = [], pickedPieces = [] }: CoveringScope,
  layouts: readonly PlannedLayout[] = [],
): CoveringPlan {
  const kept = new Set(keptCovering);
  const isKept = (s: PlannedLayout) => s.coveringKey !== null && kept.has(s.coveringKey);
  const inScope = stacks.map((_, i) => mode !== "specific-slides" || (targetSlides?.includes(i + 1) ?? false));
  const clearing = stacks.map((s, i) => inScope[i] && !isKept(s));
  /** Whether every slide showing `part` (the master or layout holding an element) is among `slides`. */
  const everyShowing = (part: string, slides: readonly boolean[]) =>
    stacks.every((s, i) => slides[i] || !s.layers.some((l) => l.part === part));
  const everyShowingClears = (part: string) => everyShowing(part, clearing);

  const byPart = new Map<string, Map<number, CoveringBackground>>();
  const collect = (covering: readonly CoveringBackground[]) => {
    for (const c of covering) {
      if (c.holder !== "slide" && !everyShowingClears(c.part)) continue;
      const inPart = byPart.get(c.part) ?? new Map<number, CoveringBackground>();
      inPart.set(c.start, c);
      byPart.set(c.part, inPart);
    }
  };
  /** A picked background graphic some slide out of scope shows: it stays in its part, hidden on the slides in scope. */
  const hiddenNotDeleted = (p: BackgroundPiece) => p.holder !== "slide" && !everyShowing(p.part, inScope);

  const hides = new Map<string, number>();
  const picked = new Set(pickedPieces);
  const piecesByPart = new Map<string, Map<number, BackgroundPiece>>();
  stacks.forEach((s, i) => {
    if (!inScope[i]) return;
    const going = s.pieces.filter((p) => picked.has(p.key));
    for (const p of going.filter((p) => !hiddenNotDeleted(p))) {
      const inPart = piecesByPart.get(p.part) ?? new Map<number, BackgroundPiece>();
      inPart.set(p.start, p);
      piecesByPart.set(p.part, inPart);
    }
    const hiddenForPiece = going.some(hiddenNotDeleted);
    if (clearing[i]) collect(s.covering);
    const hiddenForCovering =
      clearing[i] && s.covering.some((c) => c.holder !== "slide" && !everyShowingClears(c.part));
    if (hiddenForCovering || hiddenForPiece) {
      // What the slide loses anyway does not count: its covering backgrounds when it clears, and its picked pieces.
      const gone = [...(clearing[i] ? s.covering : []), ...going];
      const isGone = (g: GraphicRef) => gone.some((e) => e.part === g.part && e.start === g.start);
      hides.set(s.part, s.showing.filter((g) => !isGone(g)).length);
    }
  });
  // A layout showing a kept group, one no slide uses yet included, keeps it too.
  if (mode === "master") for (const l of layouts) if (!isKept(l)) collect(l.covering);
  const bottomFirst = <T extends { start: number }>(byStart: Map<string, Map<number, T>>) =>
    new Map([...byStart].map(([part, found]) => [part, [...found.values()].sort((a, b) => a.start - b.start)]));
  return { deletions: bottomFirst(byPart), hides, pieces: bottomFirst(piecesByPart) };
}

/**
 * Whether the picked background graphics (pieces on the master or a layout)
 * make some slide in scope hide its background graphics, taking others that
 * show something (a logo) with them: the picker's notice. Hiding the
 * covering backgrounds alone already asks for is not counted.
 */
export function picksHideOtherGraphics(stacks: readonly PlannedSlide[], scope: CoveringScope): boolean {
  const hiddenWithoutPicks = coveringPlan(stacks, { ...scope, pickedPieces: [] }).hides;
  return [...coveringPlan(stacks, scope).hides].some(([part, others]) => others > 0 && !hiddenWithoutPicks.has(part));
}
