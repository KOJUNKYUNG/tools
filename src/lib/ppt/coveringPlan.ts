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
 * there changes them all. Master mode also deletes the covering backgrounds
 * of every layout's stack (`layouts`) on the same terms, so layouts no slide
 * uses yet lose theirs too: slides added later show the new background.
 */

import type { BgMode } from "./changeBackground";
import type { CoveringBackground } from "./coveringBackgrounds";
import type { LayoutStack, SlideStack } from "./slideStacks";

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
 * presentation order; `layouts` every layout's, read in master mode only.
 */
export function coveringDeletions(
  stacks: readonly SlideStack[],
  { mode, targetSlides, keptCovering = [] }: CoveringScope,
  layouts: readonly LayoutStack[] = [],
): Map<string, CoveringBackground[]> {
  const kept = new Set(keptCovering);
  const isKept = (s: LayoutStack) => s.coveringKey !== null && kept.has(s.coveringKey);
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
  stacks.forEach((s, i) => {
    if (changing[i]) collect(s.covering);
  });
  // A layout showing a kept group, one no slide uses yet included, keeps it too.
  if (mode === "master") for (const l of layouts) if (!isKept(l)) collect(l.covering);
  return new Map([...byPart].map(([part, found]) => [part, [...found.values()].sort((a, b) => a.start - b.start)]));
}
