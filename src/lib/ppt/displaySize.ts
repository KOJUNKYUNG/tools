/**
 * Display-size reader (CONTEXT.md → Display size, spec #91): for each picture
 * part under `ppt/media/`, the largest extent it is drawn at on the deck's
 * slides, or null ("unknown") when that cannot be told with certainty. An
 * unknown picture keeps its pixels.
 *
 * Why per picture, in projected pixels, and not a fixed ppi cap: a ppi cap is
 * measured in slide inches, and slide sizes say nothing about what is shown
 * (most real decks use a 20 × 11.25 in slide, where PowerPoint's 150 or 220
 * ppi cap touches no picture). A cap also ignores how each picture is drawn:
 * a cropped photo enlarged on its slide needs more pixels than the slide box,
 * and a fixed cap would blur it. So each picture is sized by its own frames,
 * relative to the slide, and the preset turns that into pixels by giving the
 * slide's width in projected pixels (what a projector or screen shows).
 *
 * What it interprets so far: picture frames (`p:pic`) and shapes filled with
 * a picture (`p:sp`), placed directly on a slide's shape tree, stretched into
 * their own extent with no crop, inset or rotation. Any other use of a
 * picture makes it unknown: crops, groups, fill insets, rotation, tiles,
 * backgrounds, layouts, masters, notes, charts, diagrams, alternate content,
 * text fills, a frame that inherits its extent, anything not listed here.
 * A picture used several times takes its largest width and its largest
 * height, each over all its uses, so no use gets fewer pixels than it shows.
 *
 * Hand-rolled XML reading (no DOMParser) so it runs in Node as in the
 * browser. A use is counted from the raw text, independently of the parse:
 * every attribute value naming a picture's relationship id is one use, and a
 * picture is sized only when each of those is a use the reader interpreted.
 */

import { openPptxPackage, relsPartOf, type PptxPackage } from "@/lib/output-check/pptxPackage";

/** A picture's displayed extent, both sides in slide widths. */
export interface DisplaySize {
  width: number;
  height: number;
}

const MEDIA_PREFIX = "ppt/media/";
const SLIDE_PART = /^ppt\/slides\/[^/]+\.xml$/i;
const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ATTR_VALUES = /=\s*(?:"([^"]*)"|'([^']*)')/g;
const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[[\s\S]*?\]\]>|<!DOCTYPE[^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;

interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
}

/** The root element, or null for XML whose tags do not nest. */
function parseXml(xml: string): XmlElement | null {
  const top: XmlElement = { name: "", attrs: {}, children: [] };
  const stack = [top];
  for (const m of xml.matchAll(TOKEN)) {
    const [, closing, name, attrText, selfClosing] = m;
    if (name === undefined) continue; // comment, declaration, CDATA
    const parent = stack[stack.length - 1];
    if (closing) {
      if (stack.length === 1 || parent.name !== name) return null;
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of attrText.matchAll(ATTR)) attrs[a[1]] = a[2] ?? a[3];
    const element: XmlElement = { name, attrs, children: [] };
    parent.children.push(element);
    if (!selfClosing) stack.push(element);
  }
  return stack.length === 1 && top.children.length === 1 ? top.children[0] : null;
}

const child = (el: XmlElement | undefined, name: string) =>
  el?.children.find((c) => c.name === name);

/** True when every given edge attribute is absent or 0. */
const noEdges = (el: XmlElement) => ["l", "t", "r", "b"].every((k) => Number(el.attrs[k] ?? 0) === 0);

/** How often each attribute value occurs in the part's raw text. */
function valueCounts(xml: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of xml.matchAll(ATTR_VALUES)) {
    const value = m[1] ?? m[2];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/**
 * The relationship id and frame extent (EMU) of a picture stretched into its
 * frame without crop, inset or rotation; null for any other fill or frame.
 */
function plainUse(
  blipFill: XmlElement | undefined,
  spPr: XmlElement | undefined,
): { id: string; extent: [number, number] } | null {
  if (!blipFill || !spPr) return null;
  let id: string | undefined;
  let stretched = false;
  for (const c of blipFill.children) {
    if (c.name === "a:blip") id = c.attrs["r:embed"];
    else if (c.name === "a:srcRect" && noEdges(c)) continue;
    else if (c.name === "a:stretch" && c.children.every((f) => f.name === "a:fillRect" && noEdges(f))) {
      stretched = true;
    } else return null;
  }
  const xfrm = child(spPr, "a:xfrm");
  const ext = child(xfrm, "a:ext");
  if (!id || !stretched || !xfrm || !ext || Number(xfrm.attrs.rot ?? 0) !== 0) return null;
  const extent: [number, number] = [Number(ext.attrs.cx), Number(ext.attrs.cy)];
  return extent.every((n) => Number.isFinite(n) && n > 0) ? { id, extent } : null;
}

/** The frame extents (EMU) of each relationship id's interpreted uses on a slide. */
function slideUses(root: XmlElement | null): Map<string, [number, number][]> {
  const uses = new Map<string, [number, number][]>();
  const shapes = child(child(root ?? undefined, "p:cSld"), "p:spTree")?.children ?? [];
  for (const shape of root?.name === "p:sld" ? shapes : []) {
    const use =
      shape.name === "p:pic"
        ? plainUse(child(shape, "p:blipFill"), child(shape, "p:spPr"))
        : shape.name === "p:sp"
          ? plainUse(child(child(shape, "p:spPr"), "a:blipFill"), child(shape, "p:spPr"))
          : null;
    if (use) uses.set(use.id, [...(uses.get(use.id) ?? []), use.extent]);
  }
  return uses;
}

async function slideWidthEmu(pkg: PptxPackage): Promise<number | null> {
  const xml = await pkg.text("ppt/presentation.xml");
  const cx = Number(xml?.match(/<p:sldSz\b[^>]*\bcx="(\d+)"/)?.[1]);
  return cx > 0 ? cx : null;
}

/**
 * Each `ppt/media/` part's display size, or null when it is unknown (see the
 * module comment). Empty for bytes that are not a zip.
 */
export async function readDisplaySizes(deck: Uint8Array): Promise<Map<string, DisplaySize | null>> {
  const sizes = new Map<string, DisplaySize | null>();
  const pkg = await openPptxPackage(deck);
  if (!pkg) return sizes;

  const slideWidth = await slideWidthEmu(pkg);
  const unknown = new Set<string>();
  const extents = new Map<string, [number, number][]>();
  const partSet = new Set(pkg.parts);

  for (const source of pkg.parts.filter((p) => partSet.has(relsPartOf(p)))) {
    const rels = (await pkg.relationships(source)).filter(
      (r): r is typeof r & { part: string } => !r.external && r.part?.startsWith(MEDIA_PREFIX) === true,
    );
    if (rels.length === 0) continue;
    const xml = SLIDE_PART.test(source) && slideWidth !== null ? await pkg.text(source) : null;
    if (xml === null) {
      for (const r of rels) unknown.add(r.part);
      continue;
    }
    const named = valueCounts(xml);
    const uses = slideUses(parseXml(xml));
    for (const r of rels) {
      const found = uses.get(r.id) ?? [];
      if ((named.get(r.id) ?? 0) !== found.length) unknown.add(r.part);
      else extents.set(r.part, [...(extents.get(r.part) ?? []), ...found]);
    }
  }

  for (const part of pkg.parts.filter((p) => p.startsWith(MEDIA_PREFIX))) {
    const found = extents.get(part) ?? [];
    sizes.set(
      part,
      unknown.has(part) || found.length === 0 || slideWidth === null
        ? null
        : {
            width: Math.max(...found.map(([cx]) => cx)) / slideWidth,
            height: Math.max(...found.map(([, cy]) => cy)) / slideWidth,
          },
    );
  }
  return sizes;
}
