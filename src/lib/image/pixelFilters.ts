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
  const share = Math.min(1, Math.abs(amount));
  const target = amount > 0 ? 255 : 0;
  for (let i = 0; i < pixels.length; i += 4) {
    pixels[i] += (target - pixels[i]) * share;
    pixels[i + 1] += (target - pixels[i + 1]) * share;
    pixels[i + 2] += (target - pixels[i + 2]) * share;
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
}

/**
 * Grain: each cell of a grid laid over the picture moves R, G and B by the
 * same amount, so the change is monochrome and a 4:2:0 JPEG, which halves
 * only the colour detail, keeps it. The change is triangular around 0, so a
 * flat field keeps its mean, and comes from a hash of the cell and `seed`,
 * so a preview and its result laid with the same grid share one pattern.
 * A channel clips at 0 and 255, so near black, white or a pure colour the
 * change is smaller there than on the other channels.
 */
export function grain(pixels: Uint8ClampedArray, width: number, height: number, { amount, cell, seed }: GrainParams): void {
  if (amount === 0) return;
  const scale = amount * 255;
  // The cell under each pixel's centre, by column and by row.
  const column = new Int32Array(width);
  for (let x = 0; x < width; x++) column[x] = Math.floor((x + 0.5) / cell);
  for (let y = 0; y < height; y++) {
    const row = Math.floor((y + 0.5) / cell);
    for (let x = 0; x < width; x++) {
      const h = hash(column[x], row, seed);
      // Two uniforms from the hash's halves, centred so their sum's mean is exactly 1.
      const tri = ((h & 0xffff) + 0.5) / 65536 + ((h >>> 16) + 0.5) / 65536 - 1;
      const d = Math.round(tri * scale);
      const i = (y * width + x) * 4;
      pixels[i] += d;
      pixels[i + 1] += d;
      pixels[i + 2] += d;
    }
  }
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
