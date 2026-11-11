/**
 * Covering backgrounds (CONTEXT.md → Covering background, spec #105): the
 * elements at the bottom of a slide's stack that act as its background. One
 * pure rule, shared by the preview analysis, the engine and the output check,
 * so what the preview promises is what the engine does.
 *
 * A slide's stack (spec #163) is its background graphics, the master's then
 * the layout's (CONTEXT.md → Background graphics: their top-level elements but
 * placeholders and hidden ones, unless the slide or layout hides them), then
 * the slide's own top-level elements.
 *
 * Walking the stack's elements from the bottom, an element qualifies when it
 * - holds no text (no non-empty text run anywhere in it),
 * - holds a picture: a picture element, a shape filled with a picture, or a
 *   group containing either (the picture's transparency does not matter;
 *   a video or sound is not a picture), or is filled opaquely: a shape whose
 *   own fill, or the fill its style reference names in the theme, is opaque
 *   (`fills.ts`), or a group with such a member, and
 * - covers at least 90% of the slide's area with its bounds (their part on
 *   the slide; a group by its own bounds).
 * Qualifying elements form one run from the bottom across the parts, ending at
 * the first that does not; a background graphic under 90% of the slide (a
 * logo) is passed over instead, as if hidden, so it never hides a slide's own
 * covering background from the rule. The slide's own elements in it count only when at
 * least one element lies above the run: a lone large picture is the slide's
 * content (an image-to-pptx sheet-music slide), not its background. A master
 * or layout holds no content, so one there needs nothing above it.
 *
 * Hidden elements (`cNvPr hidden`, as the selection pane hides them) show
 * nothing, so the rule passes over them: they never qualify, never end the
 * run, never count as lying above it, and a hidden member never qualifies
 * its group.
 *
 * Unknown bounds (an element inheriting its frame, a turn other than a
 * quarter) never qualify: the rule errs toward keeping an element.
 */

import type { SlideSize } from "@/lib/image/slideImage";
import { fillChild, shownFill, type Colours, type ResolvedFill, type Swatch } from "./fills";
import { animationCuts, cutSpans, type Span } from "./slideAnimations";
import { child, findAll, parseXml, type XmlElement } from "./xmlTree";

/** Which part of a slide's stack holds an element. */
export type Holder = "master" | "layout" | "slide";

/** One part's elements in a slide's stack, bottom first. */
export interface StackLayer {
  /** The part's name in the package. */
  part: string;
  holder: Holder;
  /** Its elements on the slide: a slide's top-level elements, a master's or layout's background graphics. */
  elements: XmlElement[];
}

/** A covering background, as the span of its part's XML it takes up. */
export interface CoveringBackground extends Span {
  /** The part that holds it, and which of the stack's parts that is. */
  part: string;
  holder: Holder;
  /** Shape ids (`cNvPr` ids) of the element and everything in it. */
  shapeIds: string[];
  /** Relationship ids of its pictures, in document order. */
  pictures: string[];
  /** What its opaque fills show (a shape's, or a group's members'), in document order. */
  fills: Swatch[];
}

/** The share of the slide's area an element must cover, as a fraction. */
const COVER = { num: 9, den: 10 };
/** The shape tree's own children that are not elements on the slide. */
const NOT_ELEMENTS = new Set(["p:nvGrpSpPr", "p:grpSpPr", "p:extLst"]);
/** Media a picture element may play: such an element is not a picture. */
const MEDIA = /(?:^|:)(?:videoFile|audioFile|quickTimeFile|wavAudioFile|media)$/;
/** One full turn in DrawingML's 1/60000 degree. */
const TURN = 21600000;

/** The roots of the parts a slide's stack is made of. */
const STACK_PARTS = new Set(["p:sld", "p:sldLayout", "p:sldMaster"]);

/**
 * The top-level elements of a slide, layout or master, bottom of the stack
 * first; null for any other XML.
 */
export function topLevelElements(root: XmlElement | null): XmlElement[] | null {
  if (!root || !STACK_PARTS.has(root.name)) return null;
  const spTree = child(child(root, "p:cSld"), "p:spTree");
  return spTree ? spTree.children.filter((c) => !NOT_ELEMENTS.has(c.name)) : null;
}

/** Every element in `el` (itself included) whose name matches `name`. */
const named = (el: XmlElement, name: RegExp) => findAll(el, (e) => name.test(e.name));

/**
 * Whether the element is hidden: its own `cNvPr hidden` is "1" or "true",
 * under whatever prefix its non-visual properties use (`p:nvSpPr`, an ink
 * stroke's `p14:nvContentPartPr`).
 */
function isHidden(el: XmlElement): boolean {
  const nv = el.children.find((c) => /^(?:[^:]+:)?nv\w*Pr$/.test(c.name));
  const hidden = nv?.children.find((c) => /^(?:[^:]+:)?cNvPr$/.test(c.name))?.attrs.hidden;
  return hidden === "1" || hidden === "true";
}

/** The element's `p:nvPr`, under whichever `nv*Pr` it has. */
const nvPrOf = (el: XmlElement) =>
  child(el.children.find((c) => /^(?:[^:]+:)?nv\w*Pr$/.test(c.name)), "p:nvPr");

/** Whether the element is a placeholder: a frame for the slide to fill, never a background graphic. */
const isPlaceholder = (el: XmlElement) => child(nvPrOf(el), "p:ph") !== undefined;

/** A master's or layout's background graphics among its top-level elements. */
const backgroundGraphics = (elements: XmlElement[]) =>
  elements.filter((el) => !isPlaceholder(el) && !isHidden(el));

/** Whether a slide or layout shows the background graphics under it ("Hide background graphics" off). */
const showsBackgroundGraphics = (root: XmlElement) => !["0", "false"].includes(root.attrs.showMasterSp ?? "");

/** A part of a slide's stack, parsed; an unreadable one has a null root. */
export interface StackPart {
  part: string;
  root: XmlElement | null;
}

/**
 * A slide's stack, bottom first: the master's background graphics, then the
 * layout's, then the slide's own elements. A layout hiding background
 * graphics drops the master's; a slide hiding them drops both.
 */
export function stackLayers(slide: StackPart, layout: StackPart | null, master: StackPart | null): StackLayer[] {
  return [
    ...(layout && showsGraphicsUnder(slide) ? layoutLayers(layout, master) : []),
    { part: slide.part, holder: "slide", elements: topLevelElements(slide.root) ?? [] },
  ];
}

/** Whether a slide or layout part shows the background graphics under it. */
const showsGraphicsUnder = (p: StackPart) => p.root !== null && showsBackgroundGraphics(p.root);

/**
 * The background graphics a layout shows, bottom first: the master's (unless
 * the layout hides them), then its own. Master mode reads every layout's,
 * since slides added later show them.
 */
export function layoutLayers(layout: StackPart, master: StackPart | null): StackLayer[] {
  const graphics = (p: StackPart) => backgroundGraphics(topLevelElements(p.root) ?? []);
  const layers: StackLayer[] = [];
  if (master && showsGraphicsUnder(layout)) layers.push({ part: master.part, holder: "master", elements: graphics(master) });
  layers.push({ part: layout.part, holder: "layout", elements: graphics(layout) });
  return layers;
}

/** Whether the element shows text: a text run with more than whitespace in it, outside hidden members. */
function showsText(el: XmlElement): boolean {
  return el.hasText && !isHidden(el) && (el.children.length === 0 || el.children.some(showsText));
}

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
  if (isHidden(el)) return [];
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

/**
 * What the fills of an element show, opaque or not; empty when it has none.
 * A member of a group that takes the group's fill (`a:grpFill`) gets
 * `groupFill`.
 */
function fillsOf(el: XmlElement, colours: Colours, groupFill?: XmlElement): ResolvedFill[] {
  if (isHidden(el)) return [];
  switch (el.name) {
    case "p:sp": {
      const shown = shownFill(child(el, "p:spPr"), child(child(el, "p:style"), "a:fillRef"), colours, groupFill);
      return shown ? [shown] : [];
    }
    case "p:grpSp": {
      // A group's own group fill passes on the enclosing group's.
      const own = fillChild(child(el, "p:grpSpPr"));
      const fill = own?.name === "a:grpFill" ? groupFill : own;
      return el.children.flatMap((c) => fillsOf(c, colours, fill));
    }
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

/**
 * Why an element covering the slide did not qualify: it shows text, or
 * without a picture its fills are all transparent, or it has no fill.
 */
export type MissReason = "text" | "transparent fill" | "no fill";

/**
 * The rule's working on one slide's stack (master, layout and slide), for the
 * real-file coverage report: what it found, and what it nearly found.
 */
export interface CoveringRun {
  /** The qualifying elements from the bottom, the slide's own included even with nothing above them. */
  qualifying: CoveringBackground[];
  /** The element that ended the run although it covers the slide, and why; null when none did. */
  missed: (Span & { reason: MissReason }) | null;
  /** Whether a shown element lies above the run. */
  somethingAbove: boolean;
}

/** The rule's working on a slide's stack (`stackLayers`, bottom first). */
export function coveringRun(layers: readonly StackLayer[], slide: SlideSize, colours: Colours): CoveringRun {
  // A background graphic not covering the slide (a logo) is passed over like
  // a hidden one: it lies under all of the slide's elements, so it neither
  // ends the run before a slide's own photo nor counts as lying above one.
  const shown = layers.flatMap(({ part, holder, elements }) =>
    elements
      .filter((el) => !isHidden(el) && (holder === "slide" || covers(el, slide)))
      .map((el) => ({ el, part, holder })),
  );
  const qualifying: CoveringBackground[] = [];
  let missed: CoveringRun["missed"] = null;
  for (const { el, part, holder } of shown) {
    if (!covers(el, slide)) break;
    const [pictures, fills] = [picturesOf(el), fillsOf(el, colours)];
    const opaque = fills.filter((f) => f.opaque).map((f) => f.swatch);
    const reason: MissReason | null = showsText(el)
      ? "text"
      : pictures.length > 0 || opaque.length > 0
        ? null
        : fills.length > 0
          ? "transparent fill"
          : "no fill";
    if (reason) {
      missed = { start: el.start, end: el.end, reason };
      break;
    }
    qualifying.push({ start: el.start, end: el.end, part, holder, shapeIds: shapeIdsIn(el), pictures, fills: opaque });
  }
  return { qualifying, missed, somethingAbove: qualifying.length < shown.length };
}

/** A background graphic, by the part holding it and where its XML starts. */
export interface GraphicRef {
  part: string;
  start: number;
}

/**
 * Whether a line shows: the element's own `a:ln` with a fill other than none,
 * or, with no line fill of its own, the line style its style reference names
 * (index 0 is no line).
 */
function showsLine(props: XmlElement | undefined, style: XmlElement | undefined): boolean {
  const own = fillChild(child(props, "a:ln"));
  if (own) return own.name !== "a:noFill";
  return Number(child(style, "a:lnRef")?.attrs.idx ?? 0) > 0;
}

/**
 * Whether a background graphic shows something: text, a picture, a fill
 * (opaque or not) or a line. An empty shape with no fill and no line shows
 * nothing; any element other than a shape, connector or group (a picture, a
 * table, a chart, ink) is taken to show something.
 */
function showsSomething(el: XmlElement, colours: Colours): boolean {
  if (isHidden(el)) return false;
  switch (el.name) {
    case "p:sp":
      return (
        showsText(el) ||
        picturesOf(el).length > 0 ||
        fillsOf(el, colours).length > 0 ||
        showsLine(child(el, "p:spPr"), child(el, "p:style"))
      );
    case "p:cxnSp":
      return showsLine(child(el, "p:spPr"), child(el, "p:style"));
    case "p:grpSp":
      return el.children.some((c) => showsSomething(c, colours));
    case "p:nvGrpSpPr":
    case "p:grpSpPr":
    case "p:extLst":
      return false;
    default:
      return true;
  }
}

/**
 * The background graphics of a slide's stack (its master's and layout's
 * elements) that show something, bottom first: what hiding background
 * graphics on the slide takes away.
 */
export function graphicsShowing(layers: readonly StackLayer[], colours: Colours): GraphicRef[] {
  return layers
    .filter((l) => l.holder !== "slide")
    .flatMap(({ part, elements }) =>
      elements.filter((el) => showsSomething(el, colours)).map((el) => ({ part, start: el.start })),
    );
}

/**
 * The covering backgrounds of a slide's stack (bottom first), fills resolved
 * against the slide's `colours`.
 */
export function coveringIn(layers: readonly StackLayer[], slide: SlideSize, colours: Colours): CoveringBackground[] {
  const { qualifying, somethingAbove } = coveringRun(layers, slide, colours);
  // Nothing above the run: the slide's elements in it are its content.
  return somethingAbove ? qualifying : qualifying.filter((c) => c.holder !== "slide");
}

/**
 * The key of the covering-background group a slide's covering backgrounds
 * belong to: the set of picture parts they use, whatever relationship ids
 * name them, and of what their opaque fills show (`#rrggbb` or `fill`, never
 * a part name). The preview groups slides by it and the user keeps a group
 * by it, so the engine and the output check derive it the same way.
 * `partOf` resolves a relationship id of `part` (the part holding a covering
 * background) to the picture's part name.
 */
export function coveringGroupKey(
  covering: readonly CoveringBackground[],
  partOf: (relId: string, part: string) => string | null | undefined,
): string {
  // OPC part names compare case-insensitively.
  const parts = covering.flatMap((c) => [
    ...c.pictures.flatMap((id) => partOf(id, c.part)?.toLowerCase() ?? []),
    ...c.fills,
  ]);
  return `covering:${[...new Set(parts)].sort().join("|")}`;
}

/**
 * A slide, layout or master without these covering backgrounds of it and the
 * animations naming them. Their relationships stay: the caller drops those
 * the part no longer names.
 */
export function withoutCovering(partXml: string, covering: readonly CoveringBackground[]): string {
  const root = covering.length > 0 ? parseXml(partXml) : null;
  if (!root) return partXml;
  const ids = new Set(covering.flatMap((c) => c.shapeIds));
  return cutSpans(partXml, [...covering, ...animationCuts(root, ids)]);
}
