/**
 * Covering backgrounds (CONTEXT.md → Covering background, spec #105): the
 * elements at the bottom of a slide's stack that act as its background. One
 * pure rule, shared by the preview analysis, the engine and the output check,
 * so what the preview promises is what the engine does.
 *
 * Walking the slide's top-level elements from the bottom, an element
 * qualifies when it
 * - holds no text (no non-empty text run anywhere in it),
 * - holds a picture: a picture element, a shape filled with a picture, or a
 *   group containing either (the picture's transparency does not matter;
 *   a video or sound is not a picture), and
 * - covers at least 90% of the slide's area with its bounds (their part on
 *   the slide; a group by its own bounds).
 * Qualifying elements form a run from the bottom, ending at the first that
 * does not. The run counts only when at least one top-level element lies
 * above it: a lone large picture is the slide's content (an image-to-pptx
 * sheet-music slide), not its background.
 *
 * Unknown bounds (an element inheriting its frame, a turn other than a
 * quarter) never qualify: the rule errs toward keeping an element.
 */

import type { SlideSize } from "@/lib/image/slideImage";
import { animationCuts, cutSpans, type Span } from "./slideAnimations";
import { child, findAll, parseXml, type XmlElement } from "./xmlTree";

/** A covering background, as the span of the slide XML it takes up. */
export interface CoveringBackground extends Span {
  /** Shape ids (`cNvPr` ids) of the element and everything in it. */
  shapeIds: string[];
  /** Relationship ids of its pictures, in document order. */
  pictures: string[];
}

/** The share of the slide's area an element must cover, as a fraction. */
const COVER = { num: 9, den: 10 };
/** The shape tree's own children that are not elements on the slide. */
const NOT_ELEMENTS = new Set(["p:nvGrpSpPr", "p:grpSpPr", "p:extLst"]);
/** Media a picture element may play: such an element is not a picture. */
const MEDIA = /(?:^|:)(?:videoFile|audioFile|quickTimeFile|wavAudioFile|media)$/;
/** One full turn in DrawingML's 1/60000 degree. */
const TURN = 21600000;

/** The slide's top-level elements, bottom of the stack first; null when it is not a slide. */
export function topLevelElements(root: XmlElement | null): XmlElement[] | null {
  if (root?.name !== "p:sld") return null;
  const spTree = child(child(root, "p:cSld"), "p:spTree");
  return spTree ? spTree.children.filter((c) => !NOT_ELEMENTS.has(c.name)) : null;
}

/** Every element in `el` (itself included) whose name matches `name`. */
const named = (el: XmlElement, name: RegExp) => findAll(el, (e) => name.test(e.name));

/** Shape ids (`cNvPr` ids) in `el`, in document order: the element's own first. */
export function shapeIdsIn(el: XmlElement): string[] {
  return named(el, /(?:^|:)cNvPr$/).flatMap((c) => (c.attrs.id === undefined ? [] : [c.attrs.id]));
}

/** The relationship ids a `blipFill` shows: its blip's, then any variant's (an SVG). */
function blipIds(blipFill: XmlElement | undefined): string[] {
  const blip = child(blipFill, "a:blip");
  if (!blip) return [];
  return findAll(blip, () => true).flatMap((el) =>
    ["r:embed", "r:link"].flatMap((a) => (el.attrs[a] ? [el.attrs[a]] : [])),
  );
}

/** The relationship ids of the pictures an element shows; empty when it holds none. */
function picturesOf(el: XmlElement): string[] {
  switch (el.name) {
    case "p:pic": {
      const nvPr = child(child(el, "p:nvPicPr"), "p:nvPr");
      if (nvPr && named(nvPr, MEDIA).length > 0) return [];
      return blipIds(child(el, "p:blipFill"));
    }
    case "p:sp":
      return blipIds(child(child(el, "p:spPr"), "a:blipFill"));
    case "p:grpSp":
      return el.children.flatMap(picturesOf);
    default:
      return [];
  }
}

/** An element's bounds on the slide (EMU), after a quarter turn; null when unknown. */
function boundsOf(el: XmlElement): { x: number; y: number; w: number; h: number } | null {
  const props = el.name === "p:grpSp" ? child(el, "p:grpSpPr") : child(el, "p:spPr");
  const xfrm = child(props, "a:xfrm");
  const [off, ext] = [child(xfrm, "a:off"), child(xfrm, "a:ext")];
  let [x, y, w, h] = [off?.attrs.x, off?.attrs.y, ext?.attrs.cx, ext?.attrs.cy].map(Number);
  if (![x, y, w, h].every(Number.isFinite) || w <= 0 || h <= 0) return null;
  const rot = (((Number(xfrm?.attrs.rot ?? 0) % TURN) + TURN) % TURN) / (TURN / 4);
  if (!Number.isInteger(rot)) return null;
  // A quarter turn swaps the sides about the centre.
  if (rot % 2 === 1) [x, y, w, h] = [x + (w - h) / 2, y + (h - w) / 2, h, w];
  return { x, y, w, h };
}

/** Whether the element's bounds cover at least 90% of the slide's area. */
function covers(el: XmlElement, slide: SlideSize): boolean {
  const b = boundsOf(el);
  if (!b) return false;
  const across = Math.min(b.x + b.w, slide.w) - Math.max(b.x, 0);
  const down = Math.min(b.y + b.h, slide.h) - Math.max(b.y, 0);
  return across > 0 && down > 0 && across * down * COVER.den >= slide.w * slide.h * COVER.num;
}

/** The covering backgrounds of a slide's top-level `elements` (bottom first). */
export function coveringIn(elements: XmlElement[], slide: SlideSize): CoveringBackground[] {
  const run: CoveringBackground[] = [];
  for (const el of elements) {
    const pictures = el.hasText ? [] : picturesOf(el);
    if (pictures.length === 0 || !covers(el, slide)) break;
    run.push({ start: el.start, end: el.end, shapeIds: shapeIdsIn(el), pictures });
  }
  // Nothing above the run: the elements are the slide's content.
  return run.length < elements.length ? run : [];
}

/** The covering backgrounds of a slide, bottom first; none for XML that is not a slide. */
export function findCoveringBackgrounds(slideXml: string, slide: SlideSize): CoveringBackground[] {
  const elements = topLevelElements(parseXml(slideXml));
  return elements ? coveringIn(elements, slide) : [];
}

/**
 * The key of the covering-background group a slide's covering backgrounds
 * belong to: the set of picture parts they use, whatever relationship ids
 * name them. The preview groups slides by it and the user keeps a group by
 * it, so the engine and the output check derive it the same way.
 * `partOf` resolves a relationship id of the slide to its part name.
 */
export function coveringGroupKey(
  covering: readonly CoveringBackground[],
  partOf: (relId: string) => string | null | undefined,
): string {
  // OPC part names compare case-insensitively.
  const parts = covering.flatMap((c) => c.pictures.flatMap((id) => partOf(id)?.toLowerCase() ?? []));
  return `covering:${[...new Set(parts)].sort().join("|")}`;
}

/**
 * The slide without its covering backgrounds or the animations that name
 * them, unless `keep` keeps them (they then stay untouched). Their
 * relationships stay: the caller drops those its part no longer names.
 */
export function deleteCoveringBackgrounds(
  slideXml: string,
  slide: SlideSize,
  keep: (covering: CoveringBackground[]) => boolean,
): string {
  const root = parseXml(slideXml);
  const elements = topLevelElements(root);
  const covering = elements ? coveringIn(elements, slide) : [];
  if (!root || covering.length === 0 || keep(covering)) return slideXml;
  const ids = new Set(covering.flatMap((c) => c.shapeIds));
  return cutSpans(slideXml, [...covering, ...animationCuts(root, ids)]);
}
