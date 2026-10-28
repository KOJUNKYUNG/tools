// sRGB ↔ OKLCH (Björn Ottosson's OKLab, as CSS Color 4 defines it), for
// turning a recipe colour's hue while its lightness and chroma stay.

/** Below this chroma a colour is a grey: it has no hue to turn. */
const ACHROMATIC = 1e-4;

interface Oklch {
  l: number;
  c: number;
  /** Degrees. */
  h: number;
}

const toLinear = (v: number) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
const fromLinear = (v: number) => (v <= 0.0031308 ? v * 12.92 : 1.055 * v ** (1 / 2.4) - 0.055);

function linearToOklch([r, g, b]: [number, number, number]): Oklch {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: (Math.atan2(B, A) * 180) / Math.PI };
}

function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const A = c * Math.cos((h * Math.PI) / 180);
  const B = c * Math.sin((h * Math.PI) / 180);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (rgb: number[]) => rgb.every((v) => v >= -1e-6 && v <= 1 + 1e-6);

/** `#rgb`, `#rgba`, `#rrggbb` or `#rrggbbaa` as 0–255 channels and the alpha's own hex. */
function parseHex(hex: string): { rgb: [number, number, number]; alpha: string } | null {
  const m = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(hex);
  if (!m) return null;
  let digits = m[1].toLowerCase();
  if (digits.length <= 4) digits = [...digits].map((d) => d + d).join("");
  const channel = (i: number) => parseInt(digits.slice(2 * i, 2 * i + 2), 16);
  return { rgb: [channel(0), channel(1), channel(2)], alpha: digits.slice(6) };
}

const toHex = (v: number) =>
  Math.round(Math.min(1, Math.max(0, fromLinear(v))) * 255)
    .toString(16)
    .padStart(2, "0");

/**
 * `hex` with its OKLCH hue turned by `degrees`, lightness, chroma and alpha
 * kept. Where the turned colour falls outside sRGB, chroma gives way (the
 * least it must) so lightness and hue still hold. Greys, and anything that
 * is not a hex colour, come back unchanged.
 */
export function turnHue(hex: string, degrees: number): string {
  const parsed = parseHex(hex);
  if (!parsed) return hex;
  // map() keeps the three channels but types the result as number[].
  const colour = linearToOklch(parsed.rgb.map((v) => toLinear(v / 255)) as [number, number, number]);
  if (colour.c < ACHROMATIC) return hex;
  const turned = { ...colour, h: colour.h + degrees };
  let rgb = oklchToLinear(turned);
  if (!inGamut(rgb)) {
    let lo = 0;
    let hi = turned.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ ...turned, c: mid }))) lo = mid;
      else hi = mid;
    }
    rgb = oklchToLinear({ ...turned, c: lo });
  }
  return `#${rgb.map(toHex).join("")}${parsed.alpha}`;
}
