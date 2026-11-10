/**
 * Each slide's stack (`stackLayers`) and the covering backgrounds in it, read
 * from a deck. The preview, the engine and the output check read the deck
 * their own way, so each hands in a `PartReader`; all three then see the
 * same stacks, and the plan (`coveringDeletions`) decides from them.
 */

import type { SlideSize } from "@/lib/image/slideImage";
import {
  coveringGroupKey,
  coveringIn,
  stackLayers,
  type CoveringBackground,
  type StackLayer,
  type StackPart,
} from "./coveringBackgrounds";
import { slideColours, type PartReader } from "./slideColours";
import { parseXml } from "./xmlTree";

export interface SlideStack {
  /** The slide part. */
  part: string;
  /** Its stack, bottom first. */
  layers: StackLayer[];
  /** Its covering backgrounds, bottom first, wherever in the stack they lie. */
  covering: CoveringBackground[];
  /** Their covering-background group's key (`coveringGroupKey`); null when it has none. */
  coveringKey: string | null;
  /** Their picture parts, bottom first, each resolved from the part holding it. */
  coveringPictures: string[];
}

/** The stacks of `slideParts` (in the order given), read through `reader`. */
export async function readSlideStacks(
  reader: PartReader,
  slideParts: readonly string[],
  slide: SlideSize,
): Promise<SlideStack[]> {
  const coloursOf = slideColours(reader);
  // A deck's layouts and master are shared by many slides: read each once.
  const parsed = new Map<string, Promise<StackPart>>();
  const parsedPart = (part: string) => {
    let found = parsed.get(part);
    if (!found) parsed.set(part, (found = reader.text(part).then((xml) => ({ part, root: parseXml(xml ?? "") }))));
    return found;
  };
  const targets = new Map<string, Promise<ReadonlyMap<string, string | null>>>();
  const targetsOf = (part: string) => {
    let found = targets.get(part);
    if (!found) targets.set(part, (found = reader.targets(part)));
    return found;
  };

  const stacks: SlideStack[] = [];
  for (const part of slideParts) {
    const xml = (await reader.text(part)) ?? "";
    const layoutPart = await reader.related(part, "slideLayout");
    const masterPart = layoutPart && (await reader.related(layoutPart, "slideMaster"));
    const layers = stackLayers(
      { part, root: parseXml(xml) },
      layoutPart ? await parsedPart(layoutPart) : null,
      masterPart ? await parsedPart(masterPart) : null,
    );
    const covering = coveringIn(layers, slide, await coloursOf(part, xml));
    const resolved = new Map<string, ReadonlyMap<string, string | null>>();
    for (const c of covering) if (!resolved.has(c.part)) resolved.set(c.part, await targetsOf(c.part));
    /** The picture part a relationship id of `holding` (the part holding a covering background) names. */
    const resolve = (relId: string, holding: string) => resolved.get(holding)?.get(relId);
    stacks.push({
      part,
      layers,
      covering,
      coveringKey: covering.length > 0 ? coveringGroupKey(covering, resolve) : null,
      coveringPictures: covering.flatMap((c) => c.pictures.flatMap((id) => resolve(id, c.part) ?? [])),
    });
  }
  return stacks;
}
