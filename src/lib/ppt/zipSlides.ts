import type JSZip from "jszip";
import { parseRelationships, relsPartOf } from "@/lib/output-check/pptxPackage";
import { partsUnder, slideOrder } from "./slideOrder";

/** Every file part of a deck loaded with JSZip. */
export function zipParts(zip: JSZip): string[] {
  const parts: string[] = [];
  zip.forEach((path, file) => {
    if (!file.dir) parts.push(path);
  });
  return parts;
}

/** A part's text, its name compared case-insensitively as OPC compares part names; null when absent. */
async function textOf(zip: JSZip, parts: readonly string[], part: string): Promise<string | null> {
  const lower = part.toLowerCase();
  const name = parts.find((p) => p.toLowerCase() === lower);
  return (name && (await zip.file(name)?.async("text"))) ?? null;
}

/**
 * A deck's slide parts in presentation order (`slideOrder`), read from a deck
 * loaded with JSZip, as the output check's package reads them.
 */
export async function slidesInOrder(zip: JSZip): Promise<string[]> {
  const parts = zipParts(zip);
  const presentation = "ppt/presentation.xml";
  const [xml, rels] = await Promise.all([
    textOf(zip, parts, presentation),
    textOf(zip, parts, relsPartOf(presentation)),
  ]);
  return slideOrder(partsUnder(parts, "ppt/slides"), xml, parseRelationships(rels ?? "", "ppt"));
}
