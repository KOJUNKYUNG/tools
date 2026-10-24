/**
 * DrawingML fills as the ppt tools read them: whether a fill is opaque, and
 * the colour it shows, with theme colours resolved through the deck's theme.
 *
 * A fill is opaque when it is a solid fill with no transparency, a gradient
 * whose stops are all fully opaque, or a pattern fill whose two colours are
 * (CONTEXT.md → Covering background). A shape without an explicit fill takes
 * the one its style reference names from the theme's fill styles, its
 * placeholder colour (`phClr`) standing for the reference's colour.
 *
 * Colours are resolved for a swatch, not for print: the modifiers that change
 * a colour's lightness or saturation are applied, the rarer ones ignored. A
 * colour that cannot be resolved still counts as opaque or not by its
 * transparency modifiers; it shows as the neutral swatch.
 */

import { child, findAll, firstElementNamed, type XmlElement } from "./xmlTree";

/**
 * What a fill shows, for the preview: a resolved solid colour as lowercase
 * `#rrggbb`, or `"fill"` for a gradient, a pattern or a colour that could not
 * be resolved (a neutral swatch, named generically).
 */
export type Swatch = `#${string}` | "fill";

/** What theme colours and style references resolve against, for one slide. */
export interface Colours {
  /** The theme's colour scheme: slot (`dk1`, `accent1`…) → its colour element. */
  scheme: ReadonlyMap<string, XmlElement>;
  /** The colour map in force: `bg1`, `tx1`… → scheme slot. */
  map: Readonly<Record<string, string>>;
  /** The theme's fill styles (`fillRef` 1, 2, 3…) and background fill styles (1001…). */
  fillStyles: readonly XmlElement[];
  bgFillStyles: readonly XmlElement[];
}

/** No theme: theme colours stay unresolved and style references fill nothing. */
export const NO_COLOURS: Colours = { scheme: new Map(), map: {}, fillStyles: [], bgFillStyles: [] };

const FILLS = new Set(["a:noFill", "a:solidFill", "a:gradFill", "a:blipFill", "a:pattFill", "a:grpFill"]);
const COLOURS = new Set(["a:srgbClr", "a:schemeClr", "a:sysClr", "a:prstClr", "a:hslClr", "a:scrgbClr"]);

/** The fill among an element's children (`a:solidFill`, `a:grpFill`…), if any. */
export const fillChild = (el: XmlElement | undefined) => el?.children.find((c) => FILLS.has(c.name));
const colourChild = (el: XmlElement | undefined) => el?.children.find((c) => COLOURS.has(c.name));

/** The default colour map, PowerPoint's for a light theme. */
const DEFAULT_MAP: Record<string, string> = { bg1: "lt1", tx1: "dk1", bg2: "lt2", tx2: "dk2" };

/**
 * The colours of a master's slides: its theme's, under its colour map.
 * Unreadable parts count as absent.
 */
export function masterColours(themeXml: string | null, masterXml: string | null): Colours {
  // Only these few elements of the large theme and master are parsed (each
  // check of a deck reads them anew). The first match is the one meant: a
  // theme's own colour scheme precedes any extra ones, a master has one map.
  const scheme = new Map(
    (firstElementNamed(themeXml, "a:clrScheme")?.children ?? []).map((c) => [c.name.replace(/^a:/, ""), c]),
  );
  const fmt = firstElementNamed(themeXml, "a:fmtScheme");
  const styles = (name: string) => (child(fmt, name)?.children ?? []).filter((c) => FILLS.has(c.name));
  const map = { ...DEFAULT_MAP, ...firstElementNamed(masterXml, "p:clrMap")?.attrs };
  return { scheme, map, fillStyles: styles("a:fillStyleLst"), bgFillStyles: styles("a:bgFillStyleLst") };
}

/**
 * The colours under a layout's or slide's own colour map override
 * (`p:clrMapOvr/a:overrideClrMapping`), when its part declares one.
 */
export function withOverride(colours: Colours, partXml: string | null): Colours {
  // Only the override is read: parsing the whole part again would double the
  // cost of reading a slide (the output check reads every target slide).
  const override = child(firstElementNamed(partXml, "p:clrMapOvr"), "a:overrideClrMapping");
  return override ? { ...colours, map: { ...colours.map, ...override.attrs } } : colours;
}

/** Red, green and blue in 0…1, gamma-encoded (sRGB). */
type Rgb = [number, number, number];

const mapRgb = ([r, g, b]: Rgb, f: (c: number) => number): Rgb => [f(r), f(g), f(b)];

interface Colour {
  /** null when it could not be resolved. */
  rgb: Rgb | null;
  opaque: boolean;
}

const pct = (el: XmlElement) => Number(el.attrs.val) / 100000;

/** Whether a colour element's own modifiers leave it fully opaque. */
function opaqueModifiers(clr: XmlElement): boolean {
  return clr.children.every((m) => {
    if (m.name === "a:alpha" || m.name === "a:alphaMod") return pct(m) >= 1;
    if (m.name === "a:alphaOff") return pct(m) >= 0;
    return true;
  });
}

function hex(val: string | undefined): Rgb | null {
  if (!val || !/^[0-9a-f]{6}$/i.test(val)) return null;
  const byte = (i: number) => parseInt(val.slice(i, i + 2), 16) / 255;
  return [byte(0), byte(2), byte(4)];
}

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const toGamma = (c: number) => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp = (c: number) => Math.min(1, Math.max(0, c));

function toHsl([r, g, b]: Rgb): Rgb {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min;
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h / 6, s, l];
}

function fromHsl([h, s, l]: Rgb): Rgb {
  if (s === 0) return [l, l, l];
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
  const p = 2 * l - q;
  const channel = (t: number) => {
    const u = ((t % 1) + 1) % 1;
    if (u < 1 / 6) return p + (q - p) * 6 * u;
    if (u < 1 / 2) return q;
    if (u < 2 / 3) return p + (q - p) * (2 / 3 - u) * 6;
    return p;
  };
  return [channel(h + 1 / 3), channel(h), channel(h - 1 / 3)];
}

/** The colour after its lightness, saturation, hue, tint and shade modifiers. */
function modified(rgb: Rgb, clr: XmlElement): Rgb {
  let out = rgb;
  for (const m of clr.children) {
    const v = pct(m);
    if (!Number.isFinite(v)) continue;
    const hsl = toHsl(out);
    switch (m.name) {
      case "a:lumMod": out = fromHsl([hsl[0], hsl[1], clamp(hsl[2] * v)]); break;
      case "a:lumOff": out = fromHsl([hsl[0], hsl[1], clamp(hsl[2] + v)]); break;
      case "a:satMod": out = fromHsl([hsl[0], clamp(hsl[1] * v), hsl[2]]); break;
      case "a:satOff": out = fromHsl([hsl[0], clamp(hsl[1] + v), hsl[2]]); break;
      // Hue in 60000ths of a degree.
      case "a:hueOff": out = fromHsl([hsl[0] + Number(m.attrs.val) / 60000 / 360, hsl[1], hsl[2]]); break;
      // A tint mixes toward white, a shade toward black, in linear light.
      case "a:tint": out = mapRgb(out, (c) => toGamma(toLinear(c) * v + (1 - v))); break;
      case "a:shade": out = mapRgb(out, (c) => toGamma(toLinear(c) * v)); break;
    }
  }
  return mapRgb(out, clamp);
}

/** A few preset colours by name; the rest stay unresolved. */
const PRESETS: Record<string, string> = { black: "000000", white: "FFFFFF", red: "FF0000", blue: "0000FF", yellow: "FFFF00" };

/**
 * A colour element (`a:srgbClr`, `a:schemeClr`…), with `placeholder` standing
 * for `phClr` (a style reference's colour).
 */
function resolveColour(clr: XmlElement, colours: Colours, placeholder?: XmlElement, depth = 0): Colour {
  let base: Colour = { rgb: null, opaque: true };
  switch (clr.name) {
    case "a:srgbClr": base.rgb = hex(clr.attrs.val); break;
    case "a:sysClr": base.rgb = hex(clr.attrs.lastClr) ?? hex({ windowText: "000000", window: "FFFFFF" }[clr.attrs.val]); break;
    case "a:prstClr": base.rgb = hex(PRESETS[clr.attrs.val]); break;
    case "a:scrgbClr": {
      const linear = (k: string) => toGamma(clamp(Number(clr.attrs[k]) / 100000));
      base.rgb = [linear("r"), linear("g"), linear("b")];
      break;
    }
    case "a:hslClr": base.rgb = fromHsl([Number(clr.attrs.hue) / 60000 / 360, Number(clr.attrs.sat) / 100000, Number(clr.attrs.lum) / 100000]); break;
    case "a:schemeClr": {
      // A theme colour's own colour may not name a theme colour again.
      if (depth > 2) break;
      if (clr.attrs.val === "phClr") {
        if (placeholder) base = resolveColour(placeholder, colours, undefined, depth + 1);
        break;
      }
      const slot = colourChild(colours.scheme.get(colours.map[clr.attrs.val] ?? clr.attrs.val));
      if (slot) base = resolveColour(slot, colours, undefined, depth + 1);
      break;
    }
  }
  if (base.rgb && base.rgb.some((c) => !Number.isFinite(c))) base.rgb = null;
  return {
    rgb: base.rgb && modified(base.rgb, clr),
    opaque: base.opaque && opaqueModifiers(clr),
  };
}

const swatchOf = (rgb: Rgb | null): Swatch =>
  rgb ? `#${rgb.map((c) => Math.round(c * 255).toString(16).padStart(2, "0")).join("")}` : "fill";

export interface ResolvedFill {
  swatch: Swatch;
  opaque: boolean;
}

/**
 * What a fill element shows; null for no fill, a picture fill (pictures are
 * read apart) or a group fill (the caller resolves it to the group's).
 */
export function resolveFill(fill: XmlElement | undefined, colours: Colours, placeholder?: XmlElement): ResolvedFill | null {
  const colour = (clr: XmlElement | undefined) =>
    clr ? resolveColour(clr, colours, placeholder) : { rgb: null, opaque: true };
  switch (fill?.name) {
    case "a:solidFill": {
      const c = colour(colourChild(fill));
      return { swatch: swatchOf(c.rgb), opaque: c.opaque };
    }
    case "a:gradFill": {
      const stops = findAll(fill, (e) => e.name === "a:gs").map((gs) => colour(colourChild(gs)));
      return { swatch: "fill", opaque: stops.length > 0 && stops.every((s) => s.opaque) };
    }
    case "a:pattFill": {
      const sides = ["a:fgClr", "a:bgClr"].map((name) => colour(colourChild(child(fill, name))));
      return { swatch: "fill", opaque: sides.every((s) => s.opaque) };
    }
    default:
      return null;
  }
}

/**
 * The fill a style reference (`a:fillRef`, `p:bgRef`) names: index 0 is no
 * fill, 1… the theme's fill styles, 1001… its background fill styles.
 */
function styleFill(ref: XmlElement | undefined, colours: Colours): ResolvedFill | null {
  const idx = Number(ref?.attrs.idx);
  if (!ref || !Number.isInteger(idx) || idx <= 0) return null;
  const style = idx >= 1001 ? colours.bgFillStyles[idx - 1001] : colours.fillStyles[idx - 1];
  return resolveFill(style, colours, colourChild(ref));
}

/**
 * What an element's fill shows: the fill among `props`' children (a shape's
 * `p:spPr`, a background's `p:bgPr`), else the one its style reference `ref`
 * names (`a:fillRef`, `p:bgRef`). A group fill (`a:grpFill`) shows
 * `groupFill`, the enclosing group's fill, and never falls back to the style
 * reference: with no group fill, it shows none. null when it shows none.
 */
export function shownFill(
  props: XmlElement | undefined,
  ref: XmlElement | undefined,
  colours: Colours,
  groupFill?: XmlElement,
): ResolvedFill | null {
  const fill = fillChild(props);
  if (fill?.name === "a:grpFill") return resolveFill(groupFill, colours);
  return fill ? resolveFill(fill, colours) : styleFill(ref, colours);
}
