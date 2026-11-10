import type JSZip from "jszip";
import { parseRelationships, relsPartOf } from "@/lib/output-check/pptxPackage";
import { inFileOrder, slideOrder } from "./slideOrder";

/** The XML parts directly under `dir` in a deck loaded with JSZip, by their files' trailing numbers. */
export function partsUnder(zip: JSZip, dir: string): string[] {
  const pattern = new RegExp(`^${dir}/[^/]+\\.xml$`);
  const parts: string[] = [];
  zip.forEach((path) => {
    if (pattern.test(path)) parts.push(path);
  });
  return inFileOrder(parts);
}

/** A deck's slide parts in presentation order (`slideOrder`), read from a deck loaded with JSZip. */
export async function slidesInOrder(zip: JSZip): Promise<string[]> {
  const presentation = "ppt/presentation.xml";
  const [xml, rels] = await Promise.all([
    zip.file(presentation)?.async("text"),
    zip.file(relsPartOf(presentation))?.async("text"),
  ]);
  return slideOrder(partsUnder(zip, "ppt/slides"), xml ?? null, parseRelationships(rels ?? "", "ppt"));
}
