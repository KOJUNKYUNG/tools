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
