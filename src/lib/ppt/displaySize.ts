/**
 * Display-size reader (CONTEXT.md → Display size, spec #91): for each picture
 * part under `ppt/media/`, the largest extent it is drawn at in the deck, or
 * null ("unknown") when that cannot be told with certainty. An unknown
 * picture keeps its pixels.
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
 * What it interprets: in slides, layouts and masters, picture frames
 * (`p:pic`) and shapes filled with a picture (`p:sp`) with their own extent,
 * in the shape tree or in groups (`p:grpSp`, nested too), and background
 * picture fills (`p:bg`), which span the full slide. Each is stretched into
 * its frame; the whole picture's extent is then:
 * - the frame's extent, rotation ignored (a turned frame keeps its extent);
 * - narrowed or widened by the `a:fillRect` insets it is stretched into;
 * - divided by the share `a:srcRect` leaves visible (a crop enlarges the
 *   whole picture, a negative crop pads it and shrinks it);
 * - times each enclosing group's `a:ext` / `a:chExt` scale.
 * Any other use of a picture makes it unknown: tiles, notes, charts,
 * diagrams, handout and notes masters, alternate content, text fills, a
 * frame or group that inherits its extent, anything not listed here.
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
/** The parts drawn at slide size, each with the root element it must have. */
const DRAWN_PARTS: [RegExp, string][] = [
  [/^ppt\/slides\/[^/]+\.xml$/i, "p:sld"],
  [/^ppt\/slideLayouts\/[^/]+\.xml$/i, "p:sldLayout"],
  [/^ppt\/slideMasters\/[^/]+\.xml$/i, "p:sldMaster"],
];
const drawnRoot = (part: string) => DRAWN_PARTS.find(([re]) => re.test(part))?.[1];
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

type Extent = [number, number];

/**
 * The share of the width and height left between an element's edge
 * attributes (`l`/`r`, `t`/`b`, in 1/1000 of a percent; negative widens).
 */
const between = (el: XmlElement | undefined): Extent => {
  const edge = (k: string) => Number(el?.attrs[k] ?? 0) / 100000;
  return [1 - edge("l") - edge("r"), 1 - edge("t") - edge("b")];
};

/** How often each attribute value occurs in the part's raw text. */
function valueCounts(xml: string): Map<string, number> {
  const counts = new Map<string, number>();
  for (const m of xml.matchAll(ATTR_VALUES)) {
    const value = m[1] ?? m[2];
    counts.set(value, (counts.get(value) ?? 0) + 1);
  }
  return counts;
}

/** The extent, or null unless both sides are positive numbers. */
const positive = (extent: Extent): Extent | null =>
  extent.every((n) => Number.isFinite(n) && n > 0) ? extent : null;

/** An element's `cx`/`cy` (EMU), or null unless both are positive numbers. */
const extentOf = (el: XmlElement | undefined) => positive([Number(el?.attrs.cx), Number(el?.attrs.cy)]);

/**
 * The relationship id and whole-picture extent (EMU) of a picture stretched
 * into a frame of `frame` extent; null for a tile or any other fill.
 */
function fillUse(blipFill: XmlElement | undefined, frame: Extent | null): { id: string; extent: Extent } | null {
  if (!blipFill || !frame) return null;
  let id: string | undefined;
  let filled: Extent | null = null;
  let visible: Extent = [1, 1];
  for (const c of blipFill.children) {
    if (c.name === "a:blip") id = c.attrs["r:embed"];
    else if (c.name === "a:srcRect") visible = between(c);
    else if (c.name === "a:stretch" && c.children.every((f, i) => i === 0 && f.name === "a:fillRect")) {
      filled = between(child(c, "a:fillRect"));
    } else return null;
  }
  if (!id || !filled) return null;
  // The visible part fills the frame's inset rectangle, so the whole picture
  // spans that rectangle divided by the visible share.
  const extent = positive([(frame[0] * filled[0]) / visible[0], (frame[1] * filled[1]) / visible[1]]);
  return extent && { id, extent };
}

/** A shape's own frame extent (EMU); a rotation turns it but swaps no axes. */
const frameOf = (spPr: XmlElement | undefined) => extentOf(child(child(spPr, "a:xfrm"), "a:ext"));

/**
 * Adds each picture use in a shape tree's `shapes` to `uses`, its extent
 * scaled by `scale` (each enclosing group's child-to-parent ratio).
 */
function addTreeUses(shapes: XmlElement[], scale: Extent, uses: Map<string, Extent[]>): void {
  for (const shape of shapes) {
    if (shape.name === "p:grpSp") {
      const xfrm = child(child(shape, "p:grpSpPr"), "a:xfrm");
      const [ext, chExt] = [extentOf(child(xfrm, "a:ext")), extentOf(child(xfrm, "a:chExt"))];
      // Without both, the group's scale is unknown: its pictures stay uncounted.
      if (ext && chExt) {
        addTreeUses(shape.children, [(scale[0] * ext[0]) / chExt[0], (scale[1] * ext[1]) / chExt[1]], uses);
      }
      continue;
    }
    const spPr = child(shape, "p:spPr");
    const use =
      shape.name === "p:pic"
        ? fillUse(child(shape, "p:blipFill"), frameOf(spPr))
        : shape.name === "p:sp"
          ? fillUse(child(spPr, "a:blipFill"), frameOf(spPr))
          : null;
    if (use) {
      const extent: Extent = [use.extent[0] * scale[0], use.extent[1] * scale[1]];
      uses.set(use.id, [...(uses.get(use.id) ?? []), extent]);
    }
  }
}

/**
 * The whole-picture extents (EMU) of each relationship id's interpreted uses
 * in a slide, layout or master (root `rootName`) drawn at `slide` extent: its
 * background and its shape tree.
 */
function partUses(root: XmlElement | null, rootName: string, slide: Extent): Map<string, Extent[]> {
  const uses = new Map<string, Extent[]>();
  if (root?.name !== rootName) return uses;
  const cSld = child(root, "p:cSld");
  // A background picture spans the full slide.
  const bg = fillUse(child(child(child(cSld, "p:bg"), "p:bgPr"), "a:blipFill"), slide);
  if (bg) uses.set(bg.id, [bg.extent]);
  addTreeUses(child(cSld, "p:spTree")?.children ?? [], [1, 1], uses);
  return uses;
}

async function slideSizeEmu(pkg: PptxPackage): Promise<Extent | null> {
  const tag = (await pkg.text("ppt/presentation.xml"))?.match(/<p:sldSz\b[^>]*>/)?.[0];
  return positive([Number(tag?.match(/\bcx="(\d+)"/)?.[1]), Number(tag?.match(/\bcy="(\d+)"/)?.[1])]);
}

/**
 * Each `ppt/media/` part's display size, or null when it is unknown (see the
 * module comment). Empty for bytes that are not a zip.
 */
export async function readDisplaySizes(deck: Uint8Array): Promise<Map<string, DisplaySize | null>> {
  const sizes = new Map<string, DisplaySize | null>();
  const pkg = await openPptxPackage(deck);
  if (!pkg) return sizes;

  const slide = await slideSizeEmu(pkg);
  const unknown = new Set<string>();
  const extents = new Map<string, Extent[]>();
  const partSet = new Set(pkg.parts);

  for (const source of pkg.parts.filter((p) => partSet.has(relsPartOf(p)))) {
    const rels = (await pkg.relationships(source)).filter(
      (r): r is typeof r & { part: string } => !r.external && r.part?.startsWith(MEDIA_PREFIX) === true,
    );
    if (rels.length === 0) continue;
    const rootName = drawnRoot(source);
    const xml = rootName && slide ? await pkg.text(source) : null;
    if (!rootName || !slide || xml === null) {
      for (const r of rels) unknown.add(r.part);
      continue;
    }
    const named = valueCounts(xml);
    const uses = partUses(parseXml(xml), rootName, slide);
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
      unknown.has(part) || found.length === 0 || slide === null
        ? null
        : {
            width: Math.max(...found.map(([cx]) => cx)) / slide[0],
            height: Math.max(...found.map(([, cy]) => cy)) / slide[0],
          },
    );
  }
  return sizes;
}
