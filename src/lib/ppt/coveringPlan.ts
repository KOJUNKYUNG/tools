/**
 * Which covering backgrounds ppt-background deletes, and from which part
 * (spec #163). One pure plan, shared by the engine and the output check, so
 * the check holds the engine to it, and by the preview, so it promises what
 * the engine does.
 *
 * A slide changes when the apply scope takes it (every slide in master mode)
 * and the user does not keep its covering-background group. A changing
 * slide's own covering backgrounds go from it. One on its master or layout
 * goes from that part when every slide showing the part changes: deleting it
 * there changes them all.
 */

import type { BgMode } from "./changeBackground";
import type { CoveringBackground } from "./coveringBackgrounds";
import type { SlideStack } from "./slideStacks";

export interface CoveringScope {
  mode: BgMode;
  /** 1-based, in presentation order, for `specific-slides`. */
  targetSlides?: readonly number[];
  /** Keys of the covering-background groups the user keeps (`coveringGroupKey`). */
  keptCovering?: readonly string[];
}

/**
 * The covering backgrounds to delete, by the part holding them (slides,
 * layouts, masters), bottom first. `stacks` are every slide's, in
 * presentation order.
 */
export function coveringDeletions(
  stacks: readonly SlideStack[],
  { mode, targetSlides, keptCovering = [] }: CoveringScope,
): Map<string, CoveringBackground[]> {
  const kept = new Set(keptCovering);
  const changing = stacks.map(
    (s, i) =>
      (mode !== "specific-slides" || (targetSlides?.includes(i + 1) ?? false)) &&
      !(s.coveringKey !== null && kept.has(s.coveringKey)),
  );
  const everyShowingChanges = (part: string) =>
    stacks.every((s, i) => changing[i] || !s.layers.some((l) => l.part === part));

  const byPart = new Map<string, Map<number, CoveringBackground>>();
  stacks.forEach((s, i) => {
    if (!changing[i]) return;
    for (const c of s.covering) {
      if (c.holder !== "slide" && !everyShowingChanges(c.part)) continue;
      const inPart = byPart.get(c.part) ?? new Map<number, CoveringBackground>();
      inPart.set(c.start, c);
      byPart.set(c.part, inPart);
    }
  });
  return new Map([...byPart].map(([part, found]) => [part, [...found.values()].sort((a, b) => a.start - b.start)]));
}
