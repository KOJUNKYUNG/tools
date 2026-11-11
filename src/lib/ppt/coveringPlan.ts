/**
 * Which covering backgrounds ppt-background deletes, and from which part, and
 * which slides hide their background graphics instead (spec #163). One pure
 * plan, shared by the engine and the output check, so the check holds the
 * engine to it, and by the preview, so it promises what the engine does.
 *
 * A slide changes when the apply scope takes it (every slide in master mode)
 * and the user does not keep its covering-background group. A changing
 * slide's own covering backgrounds go from it. One on its master or layout
 * goes from that part when every slide showing the part changes: deleting it
 * there changes them all. When only some of them change, those hide their
 * background graphics instead (PowerPoint's "Hide background graphics"),
 * which takes every other background graphic on them too. Master mode also
 * deletes the covering backgrounds of every layout's stack (`layouts`) on the
 * same terms, so layouts no slide uses yet lose theirs too: slides added
 * later show the new background.
 */

import type { BgMode } from "./changeBackground";
import type { CoveringBackground, GraphicRef } from "./coveringBackgrounds";
import type { SlideStack } from "./slideStacks";

export interface CoveringScope {
  mode: BgMode;
  /** 1-based, in presentation order, for `specific-slides`. */
  targetSlides?: readonly number[];
  /** Keys of the covering-background groups the user keeps (`coveringGroupKey`). */
  keptCovering?: readonly string[];
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
}

/** What the plan reads of a layout's stack. */
export interface PlannedLayout {
  covering: readonly CoveringBackground[];
  coveringKey: string | null;
}

/** The stack of a slide, as the plan reads it. */
export const plannedSlide = ({ part, layers, covering, coveringKey, showing }: SlideStack): PlannedSlide => ({
  part,
  layers: layers.map(({ part }) => ({ part })),
  covering,
  coveringKey,
  showing,
});

export interface CoveringPlan {
  /** The covering backgrounds to delete, by the part holding them (slides, layouts, masters), bottom first. */
  deletions: Map<string, CoveringBackground[]>;
  /**
   * The slides that hide their background graphics, by part, each with how
   * many other background graphics showing something go with them.
   */
  hides: Map<string, number>;
}

/**
 * The plan for `stacks` (every slide's, in presentation order) under
 * `scope`; `layouts` are every layout's, read in master mode only.
 */
export function coveringPlan(
  stacks: readonly PlannedSlide[],
  { mode, targetSlides, keptCovering = [] }: CoveringScope,
  layouts: readonly PlannedLayout[] = [],
): CoveringPlan {
  const kept = new Set(keptCovering);
  const isKept = (s: PlannedLayout) => s.coveringKey !== null && kept.has(s.coveringKey);
  const changing = stacks.map(
    (s, i) => (mode !== "specific-slides" || (targetSlides?.includes(i + 1) ?? false)) && !isKept(s),
  );
  const everyShowingChanges = (part: string) =>
    stacks.every((s, i) => changing[i] || !s.layers.some((l) => l.part === part));

  const byPart = new Map<string, Map<number, CoveringBackground>>();
  const collect = (covering: readonly CoveringBackground[]) => {
    for (const c of covering) {
      if (c.holder !== "slide" && !everyShowingChanges(c.part)) continue;
      const inPart = byPart.get(c.part) ?? new Map<number, CoveringBackground>();
      inPart.set(c.start, c);
      byPart.set(c.part, inPart);
    }
  };
  const hides = new Map<string, number>();
  stacks.forEach((s, i) => {
    if (!changing[i]) return;
    collect(s.covering);
    if (s.covering.some((c) => c.holder !== "slide" && !everyShowingChanges(c.part))) {
      const isCovering = (g: GraphicRef) => s.covering.some((c) => c.part === g.part && c.start === g.start);
      hides.set(s.part, s.showing.filter((g) => !isCovering(g)).length);
    }
  });
  // A layout showing a kept group, one no slide uses yet included, keeps it too.
  if (mode === "master") for (const l of layouts) if (!isKept(l)) collect(l.covering);
  const deletions = new Map(
    [...byPart].map(([part, found]) => [part, [...found.values()].sort((a, b) => a.start - b.start)]),
  );
  return { deletions, hides };
}
