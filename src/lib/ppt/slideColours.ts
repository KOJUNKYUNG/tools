/**
 * The colours each slide of a deck resolves its fills against (`fills.ts`):
 * its master's theme and colour map, overridden by its layout's then its own.
 * The preview, the engine and the output check read the deck differently, so
 * each hands in a `PartReader`.
 */

import type JSZip from "jszip";
import { parseRelationships, relsPartOf, type PptxPackage } from "@/lib/output-check/pptxPackage";
import { masterColours, NO_COLOURS, withOverride, type Colours } from "./fills";

/** The colours of a slide, given its part and XML. */
export type ColoursOf = (slidePath: string, slideXml: string) => Promise<Colours>;

export interface PartReader {
  /** A part's XML; null when it is absent. */
  text(part: string): Promise<string | null>;
  /** The first part `part` relates to by this relationship type (the URI's last segment); null when none. */
  related(part: string, type: string): Promise<string | null>;
}

/** Reads a deck loaded with JSZip. */
export function zipPartReader(zip: JSZip): PartReader {
  const text = async (part: string) => (await zip.file(part)?.async("text")) ?? null;
  return {
    text,
    async related(part, type) {
      const dir = part.slice(0, part.lastIndexOf("/"));
      const rels = parseRelationships((await text(relsPartOf(part))) ?? "", dir);
      return rels.find((r) => r.type.endsWith(`/${type}`) && r.part !== null)?.part ?? null;
    },
  };
}

/** Reads a deck opened by the output check. */
export function packagePartReader(pkg: PptxPackage): PartReader {
  return {
    text: (part) => pkg.text(part),
    related: async (part, type) => (await pkg.relatedParts(part, type))[0] ?? null,
  };
}

/**
 * The colours of a slide given its part and XML; a deck's layouts and masters
 * are read once each. A slide without a layout, master or theme resolves
 * against what it has.
 */
export function slideColours(reader: PartReader): ColoursOf {
  const ofMaster = once(async (path) => {
    const theme = await reader.related(path, "theme");
    return masterColours(theme && (await reader.text(theme)), await reader.text(path));
  });
  const ofLayout = once(async (path) => {
    const master = await reader.related(path, "slideMaster");
    return withOverride(master ? await ofMaster(master) : NO_COLOURS, await reader.text(path));
  });
  return async (slidePath, slideXml) => {
    const layout = await reader.related(slidePath, "slideLayout");
    return withOverride(layout ? await ofLayout(layout) : NO_COLOURS, slideXml);
  };
}

/** `colours` computed once per part path. */
function once(colours: (path: string) => Promise<Colours>): (path: string) => Promise<Colours> {
  const byPath = new Map<string, Promise<Colours>>();
  return (path) => {
    let found = byPath.get(path);
    if (!found) byPath.set(path, (found = colours(path)));
    return found;
  };
}
