/**
 * The order PowerPoint shows a deck's slides in: the presentation's slide
 * list (`p:sldIdLst` in `ppt/presentation.xml`), each entry naming its slide
 * part through a relationship. Slide N, wherever this tool says it (the slide
 * picker, the engine's targets, the output check), is the N-th part here.
 *
 * File names do not order slides: PowerPoint keeps a slide's file when it is
 * moved, so `slide3.xml` may be shown first. When the list is missing, or an
 * entry does not resolve to a slide part, the order falls back to the slide
 * files' trailing numbers, as before.
 *
 * Pure, without a zip or package reader, so the engine, the preview and the
 * output check (each reading the deck its own way) share it.
 */

/** A relationship of `ppt/presentation.xml`, its target resolved to a part name. */
export interface PresentationRelationship {
  id: string;
  part: string | null;
}

/** The trailing integer of a part's file name (`ppt/slides/slide12.xml` → 12); 0 without one. */
export function trailingNumber(part: string): number {
  const m = part.match(/(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 0;
}

/** Parts sorted by their trailing file number. */
export function inFileOrder(parts: readonly string[]): string[] {
  return [...parts].sort((a, b) => trailingNumber(a) - trailingNumber(b));
}

/** The XML parts directly under `dir` among a package's `parts`, by their trailing file number. */
export function partsUnder(parts: readonly string[], dir: string): string[] {
  const pattern = new RegExp(`^${dir}/[^/]+\\.xml$`);
  return inFileOrder(parts.filter((p) => pattern.test(p)));
}

/** The relationship ids the slide list names, in order; null when the deck has no list. */
function listedIds(presentationXml: string): string[] | null {
  const list = presentationXml.match(/<(?:\w+:)?sldIdLst\b[^>]*>([\s\S]*?)<\/(?:\w+:)?sldIdLst>/)?.[1];
  if (list === undefined) return null;
  // The relationship id is the entry's namespaced `id` (`r:id`); the plain `id` is a number.
  return [...list.matchAll(/<(?:\w+:)?sldId\b[^>]*>/g)].map(
    (m) => m[0].match(/\s\w+:id\s*=\s*(?:"([^"]*)"|'([^']*)')/)?.slice(1).find((v) => v !== undefined) ?? "",
  );
}

/**
 * `slideParts` in presentation order. Slide parts the list does not name
 * (which PowerPoint does not show) follow in file order, so no part is lost.
 */
export function slideOrder(
  slideParts: readonly string[],
  presentationXml: string | null,
  relationships: readonly PresentationRelationship[],
): string[] {
  const fallback = inFileOrder(slideParts);
  const ids = presentationXml === null ? null : listedIds(presentationXml);
  if (ids === null) return fallback;

  // OPC part names compare case-insensitively.
  const byLower = new Map(slideParts.map((p) => [p.toLowerCase(), p]));
  const partOf = new Map(relationships.map((r) => [r.id, r.part]));
  const listed: string[] = [];
  for (const id of ids) {
    const part = byLower.get(partOf.get(id)?.toLowerCase() ?? "");
    if (part === undefined || listed.includes(part)) return fallback;
    listed.push(part);
  }
  return [...listed, ...fallback.filter((p) => !listed.includes(p))];
}
