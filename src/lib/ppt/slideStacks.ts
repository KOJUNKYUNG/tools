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
  layoutLayers,
  stackLayers,
  type CoveringBackground,
  type StackLayer,
  type StackPart,
} from "./coveringBackgrounds";
import { layoutColours, slideColours, type PartReader } from "./slideColours";
import { parseXml } from "./xmlTree";

/** A layout's background graphics (`layoutLayers`) and the covering backgrounds among them. */
export interface LayoutStack {
  /** The layout part. */
  part: string;
  /** Its stack, bottom first: the master's background graphics, then its own. */
  layers: StackLayer[];
  /** Its covering backgrounds, bottom first, on the master or the layout. */
  covering: CoveringBackground[];
  /** Their covering-background group's key (`coveringGroupKey`); null when it has none. */
  coveringKey: string | null;
}

/** A slide's stack: its background graphics, then its own elements. */
export interface SlideStack extends LayoutStack {
  /** The slide part. */
  part: string;
  /** Its covering backgrounds, bottom first, wherever in the stack they lie. */
  covering: CoveringBackground[];
  /** Their picture parts, bottom first, each resolved from the part holding it. */
  coveringPictures: string[];
}

type Targets = ReadonlyMap<string, string | null>;

/** Parses parts through `reader`, each once. */
function partsParsedOnce(reader: PartReader): (part: string) => Promise<StackPart> {
  const parsed = new Map<string, Promise<StackPart>>();
  return (part) => {
    let found = parsed.get(part);
    if (!found) parsed.set(part, (found = reader.text(part).then((xml) => ({ part, root: parseXml(xml ?? "") }))));
    return found;
  };
}

/** A part's relationship targets through `reader`, each part read once. */
function targetsReadOnce(reader: PartReader): (part: string) => Promise<Targets> {
  const targets = new Map<string, Promise<Targets>>();
  return (part) => {
    let found = targets.get(part);
    if (!found) targets.set(part, (found = reader.targets(part)));
    return found;
  };
}

/** The group key and picture parts of `covering`, each picture resolved from the part holding it. */
async function keyed(
  covering: readonly CoveringBackground[],
  targetsOf: (part: string) => Promise<Targets>,
): Promise<Pick<SlideStack, "coveringKey" | "coveringPictures">> {
  const resolved = new Map<string, Targets>();
  for (const c of covering) if (!resolved.has(c.part)) resolved.set(c.part, await targetsOf(c.part));
  /** The picture part a relationship id of `holding` (the part holding a covering background) names. */
  const resolve = (relId: string, holding: string) => resolved.get(holding)?.get(relId);
  return {
    coveringKey: covering.length > 0 ? coveringGroupKey(covering, resolve) : null,
    coveringPictures: covering.flatMap((c) => c.pictures.flatMap((id) => resolve(id, c.part) ?? [])),
  };
}

/** The stacks of `slideParts` (in the order given), read through `reader`. */
export async function readSlideStacks(
  reader: PartReader,
  slideParts: readonly string[],
  slide: SlideSize,
): Promise<SlideStack[]> {
  const coloursOf = slideColours(reader);
  // A deck's layouts and master are shared by many slides: read each once.
  const parsedPart = partsParsedOnce(reader);
  const targetsOf = targetsReadOnce(reader);

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
    stacks.push({ part, layers, covering, ...(await keyed(covering, targetsOf)) });
  }
  return stacks;
}

/**
 * The stacks of `layoutParts` (in the order given), read through `reader`:
 * master mode deletes their covering backgrounds whether or not a slide uses
 * them, since slides added later will.
 */
export async function readLayoutStacks(
  reader: PartReader,
  layoutParts: readonly string[],
  slide: SlideSize,
): Promise<LayoutStack[]> {
  const coloursOf = layoutColours(reader);
  const parsedPart = partsParsedOnce(reader);
  const targetsOf = targetsReadOnce(reader);
  const stacks: LayoutStack[] = [];
  for (const part of layoutParts) {
    const masterPart = await reader.related(part, "slideMaster");
    const layers = layoutLayers(await parsedPart(part), masterPart ? await parsedPart(masterPart) : null);
    const covering = coveringIn(layers, slide, await coloursOf(part));
    const { coveringKey } = await keyed(covering, targetsOf);
    stacks.push({ part, layers, covering, coveringKey });
  }
  return stacks;
}
