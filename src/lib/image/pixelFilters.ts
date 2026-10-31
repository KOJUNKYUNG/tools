/**
 * The filter set's pixel filters (CONTEXT "Filter set"), as pure functions
 * over RGBA pixel buffers, so the browser runs them on the fitted picture
 * and its preview alike and Node runs them under test. Each changes the
 * buffer in place and leaves alpha untouched.
 */

/**
 * A light or dark veil: every pixel blended towards white (`amount` above 0)
 * or black (below 0) by `|amount|`, a share from 0 to 1. R, G and B move
 * alike, so a dark veil scales them by the same factor.
 */
export function veil(pixels: Uint8ClampedArray, amount: number): void {
  if (amount === 0) return;
  const target = amount > 0 ? 255 : 0;
  overlay(pixels, [target, target, target], Math.abs(amount));
}

/** An RGB colour, each channel 0 to 255. */
export type Rgb = readonly [number, number, number];

/**
 * A colour overlay: every pixel blended towards `colour` by `amount`, a
 * share from 0 to 1, as a shape of that colour laid over the picture at
 * that opacity would show.
 */
export function overlay(pixels: Uint8ClampedArray, colour: Rgb, amount: number): void {
  if (amount <= 0) return;
  const share = Math.min(1, amount);
  const [r, g, b] = colour;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] += (r - pixels[i]) * share;
    pixels[i + 1] += (g - pixels[i + 1]) * share;
    pixels[i + 2] += (b - pixels[i + 2]) * share;
  }
}

/** A pixel's luma (Rec. 709 weights, as CSS filters use), 0 to 255. */
function luma(r: number, g: number, b: number): number {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/**
 * Saturation: each channel moved away from the pixel's luma by `1 + amount`,
 * so −1 is grey, 0 the picture, and above 0 more colourful (CSS's
 * `saturate()`, keeping the luma). Channels clip at 0 and 255.
 */
export function saturate(pixels: Uint8ClampedArray, amount: number): void {
  if (amount === 0) return;
  const k = 1 + amount;
  for (let i = 0; i < pixels.length; i += 4) {
    const l = luma(pixels[i], pixels[i + 1], pixels[i + 2]);
    pixels[i] = l + (pixels[i] - l) * k;
    pixels[i + 1] = l + (pixels[i + 1] - l) * k;
    pixels[i + 2] = l + (pixels[i + 2] - l) * k;
  }
}

/**
 * Contrast: each channel moved away from mid grey by `1 + amount`, so below
 * 0 the picture fades towards grey and above 0 its darks and lights part
 * (CSS's `contrast()`). Channels clip at 0 and 255.
 */
export function contrast(pixels: Uint8ClampedArray, amount: number): void {
  if (amount === 0) return;
  const k = 1 + amount;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] = 127.5 + (pixels[i] - 127.5) * k;
    pixels[i + 1] = 127.5 + (pixels[i + 1] - 127.5) * k;
    pixels[i + 2] = 127.5 + (pixels[i + 2] - 127.5) * k;
  }
}

/** How grain is laid: its strength, and its cells in pixels of this buffer. */
export interface GrainParams {
  /** The largest change, as a share of full scale (0.2 moves a channel by up to 51 of 255). */
  amount: number;
  /** A cell's side in pixels; below 1 each pixel takes the cell at its centre. */
  cell: number;
  /** The pattern: the same seed lays the same pattern. */
  seed: number;
  /**
   * Larger grain: the cells blurred by a Gaussian of this standard deviation
   * in px, then scaled back to the cells' spread, so specks grow round and
   * as strong (noise, then a blur, as photo editors grow grain). 0 = cells.
   */
  spread?: number;
  /** Colour grain: the share of a separate pattern per channel mixed into the shared one, 0 to 1. */
  colour?: number;
  /** Response by brightness: the change weighed by 4·L·(1 − L), full at mid grey, none at black or white. */
  response?: boolean;
}

/**
 * Grain: each cell of a grid laid over the picture moves R, G and B by the
 * same amount, so the change is monochrome and a 4:2:0 JPEG, which halves
 * only the colour detail, keeps it. The change is triangular around 0, so a
 * flat field keeps its mean, and comes from a hash of the cell and `seed`,
 * so a preview and its result laid with the same grid share one pattern.
 * A channel clips at 0 and 255, so near black, white or a pure colour the
 * change is smaller there than on the other channels. `spread`, `colour`
 * and `response` change its look (see GrainParams); at 0, 0 and off it is
 * the plain cells.
 */
export function grain(
  pixels: Uint8ClampedArray,
  width: number,
  height: number,
  { amount, cell, seed, spread = 0, colour = 0, response = false }: GrainParams,
): void {
  if (amount === 0) return;
  const scale = amount * 255;
  const mono = grainPattern(width, height, cell, seed, spread);
  // Colour grain: one more pattern per channel, from the next seeds.
  const channels = colour > 0 ? [1, 2, 3].map((k) => grainPattern(width, height, cell, seed + k, spread)) : null;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const p = y * width + x;
      const i = p * 4;
      let weight = scale;
      if (response) {
        const l = luma(pixels[i], pixels[i + 1], pixels[i + 2]) / 255;
        weight *= 4 * l * (1 - l);
      }
      const shared = mono(x, y, p);
      if (!channels) {
        const d = Math.round(shared * weight);
        pixels[i] += d;
        pixels[i + 1] += d;
        pixels[i + 2] += d;
      } else {
        for (let k = 0; k < 3; k++) pixels[i + k] += Math.round(((1 - colour) * shared + colour * channels[k](x, y, p)) * weight);
      }
    }
  }
}

/** A grain pattern's value at pixel (x, y), index p: triangular in −1..1 around 0. */
type Pattern = (x: number, y: number, p: number) => number;

/**
 * One grain pattern: each pixel's cell value, read straight from the hash,
 * or, with a spread, a field of those values blurred and scaled back.
 */
function grainPattern(width: number, height: number, cell: number, seed: number, spread: number): Pattern {
  // The cell under each pixel's centre, by column and by row.
  const column = new Int32Array(width);
  for (let x = 0; x < width; x++) column[x] = Math.floor((x + 0.5) / cell);
  const row = new Int32Array(height);
  for (let y = 0; y < height; y++) row[y] = Math.floor((y + 0.5) / cell);
  const cellAt: Pattern = (x, y) => cellValue(column[x], row[y], seed);
  if (spread <= 0) return cellAt;
  const field = spreadField(width, height, cell, seed, spread, cellAt);
  return (_x, _y, p) => field[p];
}

/** A cell's value from the hash: two uniforms from its halves, centred so their sum's mean is exactly 1. */
function cellValue(i: number, j: number, seed: number): number {
  const h = hash(i, j, seed);
  return ((h & 0xffff) + 0.5) / 65536 + ((h >>> 16) + 0.5) / 65536 - 1;
}

/**
 * The last blurred fields, by size, cell, seed and spread: a field does not
 * depend on the picture, so a preview redrawn for another filter, and the
 * channels' patterns, reuse it rather than blur again.
 */
const spreadFields = new Map<string, Float32Array>();
/** The colour grain's four patterns. */
const SPREAD_FIELDS_KEPT = 4;

/** The cells blurred by `spread` px and scaled back to the cells' spread (a triangular −1..1 value's, √(1/6)). */
function spreadField(width: number, height: number, cell: number, seed: number, spread: number, cellAt: Pattern): Float32Array {
  const key = `${width}x${height}/${cell}/${seed}/${spread}`;
  const kept = spreadFields.get(key);
  if (kept) return kept;
  const field = new Float32Array(width * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) field[y * width + x] = cellAt(x, y, 0);
  gaussianField(field, width, height, spread);
  let squares = 0;
  for (let p = 0; p < field.length; p++) squares += field[p] * field[p];
  const rms = Math.sqrt(squares / field.length);
  if (rms > 0) {
    const k = Math.sqrt(1 / 6) / rms;
    for (let p = 0; p < field.length; p++) field[p] *= k;
  }
  if (spreadFields.size >= SPREAD_FIELDS_KEPT) spreadFields.delete(spreadFields.keys().next().value!);
  spreadFields.set(key, field);
  return field;
}

/**
 * A Gaussian blur of `sigma` px along each axis of a one-channel field,
 * edges read as the edge value. An exact kernel, not box blurs: grain's
 * sigmas are a pixel or two, where box blurs' whole-pixel radii would
 * draw neighbouring sizes alike.
 */
function gaussianField(field: Float32Array, width: number, height: number, sigma: number): void {
  const radius = Math.ceil(3 * sigma);
  const kernel = new Float32Array(2 * radius + 1);
  let total = 0;
  for (let k = -radius; k <= radius; k++) total += kernel[k + radius] = Math.exp(-(k * k) / (2 * sigma * sigma));
  for (let k = 0; k < kernel.length; k++) kernel[k] /= total;
  const line = new Float32Array(Math.max(width, height));
  const pass = (count: number, length: number, at: (n: number, k: number) => number) => {
    for (let n = 0; n < count; n++) {
      for (let k = 0; k < length; k++) line[k] = field[at(n, k)];
      for (let k = 0; k < length; k++) {
        let sum = 0;
        for (let j = -radius; j <= radius; j++) sum += kernel[j + radius] * line[Math.min(length - 1, Math.max(0, k + j))];
        field[at(n, k)] = sum;
      }
    }
  };
  pass(height, width, (y, x) => y * width + x);
  pass(width, height, (x, y) => y * width + x);
}

/** A well-mixed 32-bit hash of a cell and a seed (the murmur3 finaliser). */
function hash(i: number, j: number, seed: number): number {
  let h = (Math.imul(i, 0x27d4eb2d) + Math.imul(j, 0x165667b1) + Math.imul(seed, 0x9e3779b1)) | 0;
  h = Math.imul(h ^ (h >>> 15), 0x85ebca6b);
  h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
  return (h ^ (h >>> 16)) >>> 0;
}

/**
 * A blur close to a Gaussian of standard deviation `radius` px: three box
 * blurs along each axis (a box blur runs in constant time per pixel, however
 * wide), each reading past the picture's edge as its edge pixel, so the
 * edges do not fade towards black. Where the picture has transparent
 * pixels, colours are weighted by alpha, so a transparent pixel's colour
 * (black, as a canvas reads it) does not bleed into its neighbours; alpha
 * itself is untouched.
 */
export function blur(pixels: Uint8ClampedArray, width: number, height: number, radius: number): void {
  if (radius <= 0) return;
  const boxes = boxRadii(radius);
  if (boxes.every((r) => r === 0)) return;
  const n = width * height;
  let opaque = true;
  for (let i = 3; i < pixels.length; i += 4) {
    if (pixels[i] !== 255) {
      opaque = false;
      break;
    }
  }
  // One channel at a time, so the float buffers stay two picture-sized planes.
  const channel = new Float32Array(n);
  const scratch = new Float32Array(n);
  const blurChannel = () => {
    for (const r of boxes) {
      boxRows(channel, scratch, width, height, r);
      boxColumns(scratch, channel, width, height, r);
    }
  };
  // The blurred alpha the colours are divided by, where any pixel is not opaque.
  let weight: Float32Array | null = null;
  if (!opaque) {
    for (let p = 0; p < n; p++) channel[p] = pixels[p * 4 + 3];
    blurChannel();
    weight = channel.slice();
  }
  for (let c = 0; c < 3; c++) {
    for (let p = 0; p < n; p++) channel[p] = weight ? pixels[p * 4 + c] * pixels[p * 4 + 3] : pixels[p * 4 + c];
    blurChannel();
    for (let p = 0; p < n; p++) {
      if (!weight) pixels[p * 4 + c] = channel[p];
      // Where nothing around is visible, the colour stays as it was.
      else if (weight[p] > 0) pixels[p * 4 + c] = channel[p] / weight[p];
    }
  }
}

/**
 * The three box radii whose blurs, one after another, come closest to a
 * Gaussian of standard deviation `sigma` (Kutskir's "fastest Gaussian blur").
 */
function boxRadii(sigma: number): number[] {
  const n = 3;
  // Box widths are odd: the narrower width for the first m boxes, the wider for the rest.
  const ideal = Math.sqrt((12 * sigma * sigma) / n + 1);
  let narrow = Math.floor(ideal);
  if (narrow % 2 === 0) narrow--;
  const wide = narrow + 2;
  const m = Math.round((12 * sigma * sigma - n * narrow * narrow - 4 * n * narrow - 3 * n) / (-4 * narrow - 4));
  return Array.from({ length: n }, (_, i) => ((i < m ? narrow : wide) - 1) / 2);
}

/**
 * One box blur of radius `r` from `src` into `dst` along each row, by a
 * running sum; past either end it reads the end pixel.
 */
function boxRows(src: Float32Array, dst: Float32Array, width: number, height: number, r: number): void {
  const span = 2 * r + 1;
  for (let y = 0; y < height; y++) {
    const start = y * width;
    const last = start + width - 1;
    // The window of the row's first pixel, less its rightmost: r copies of the edge, then pixels 0 … r−1.
    let sum = r * src[start];
    for (let k = 0; k < r; k++) sum += src[Math.min(start + k, last)];
    for (let i = start; i <= last; i++) {
      sum += src[Math.min(i + r, last)];
      dst[i] = sum / span;
      sum -= src[Math.max(i - r, start)];
    }
  }
}

/**
 * One box blur of radius `r` from `src` into `dst` down each column, as
 * boxRows does along rows, run row by row with one running sum per column
 * so it reads memory in order.
 */
function boxColumns(src: Float32Array, dst: Float32Array, width: number, height: number, r: number): void {
  const span = 2 * r + 1;
  const last = height - 1;
  const sums = new Float64Array(width);
  // The window of the first row, less its lowest: r copies of the edge, then rows 0 … r−1.
  for (let x = 0; x < width; x++) sums[x] = r * src[x];
  for (let k = 0; k < r; k++) {
    const row = Math.min(k, last) * width;
    for (let x = 0; x < width; x++) sums[x] += src[row + x];
  }
  for (let y = 0; y < height; y++) {
    const add = Math.min(y + r, last) * width;
    const drop = Math.max(y - r, 0) * width;
    const out = y * width;
    for (let x = 0; x < width; x++) {
      sums[x] += src[add + x];
      dst[out + x] = sums[x] / span;
      sums[x] -= src[drop + x];
    }
  }
}
