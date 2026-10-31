import { describe, expect, it } from "vitest";
import { blur, contrast, grain, overlay, saturate, veil } from "./pixelFilters";

/** RGBA pixels, four numbers each. */
const pixels = (...rgba: number[]) => Uint8ClampedArray.from(rgba);

/** A `width` × `height` field of one RGBA colour. */
const field = (width: number, height: number, rgba: [number, number, number, number]) => {
  const out = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < out.length; i += 4) out.set(rgba, i);
  return out;
};

describe("grain", () => {
  const W = 64;
  const H = 48;

  it("leaves pixels unchanged at 0", () => {
    const picture = field(W, H, [90, 140, 200, 255]);
    grain(picture, W, H, { amount: 0, cell: 1, seed: 7 });
    expect(picture).toEqual(field(W, H, [90, 140, 200, 255]));
  });

  it("changes R, G and B by the same amount per pixel", () => {
    const picture = field(W, H, [90, 140, 200, 255]);
    grain(picture, W, H, { amount: 0.15, cell: 1, seed: 7 });
    let changed = 0;
    for (let i = 0; i < picture.length; i += 4) {
      const d = picture[i] - 90;
      expect(picture[i + 1] - 140).toBe(d);
      expect(picture[i + 2] - 200).toBe(d);
      if (d !== 0) changed++;
    }
    // Grain, not a uniform shift: most pixels move.
    expect(changed).toBeGreaterThan((W * H) / 2);
  });

  it("has a mean change near zero over a flat field", () => {
    const picture = field(W, H, [128, 128, 128, 255]);
    grain(picture, W, H, { amount: 0.2, cell: 1, seed: 3 });
    let sum = 0;
    for (let i = 0; i < picture.length; i += 4) sum += picture[i] - 128;
    // Within a level and a half, against changes of up to 51 levels.
    expect(Math.abs(sum / (W * H))).toBeLessThan(1.5);
  });

  it("repeats exactly for the same seed, and differs for another", () => {
    const a = field(W, H, [128, 128, 128, 255]);
    const b = field(W, H, [128, 128, 128, 255]);
    const c = field(W, H, [128, 128, 128, 255]);
    grain(a, W, H, { amount: 0.1, cell: 1.5, seed: 11 });
    grain(b, W, H, { amount: 0.1, cell: 1.5, seed: 11 });
    grain(c, W, H, { amount: 0.1, cell: 1.5, seed: 12 });
    expect(a).toEqual(b);
    expect(a).not.toEqual(c);
  });

  it("lays one change per cell, so a cell of 2 px is a 2 × 2 block", () => {
    const picture = field(8, 8, [128, 128, 128, 255]);
    grain(picture, 8, 8, { amount: 0.2, cell: 2, seed: 5 });
    const at = (x: number, y: number) => picture[(y * 8 + x) * 4];
    for (let y = 0; y < 8; y += 2) {
      for (let x = 0; x < 8; x += 2) {
        expect([at(x + 1, y), at(x, y + 1), at(x + 1, y + 1)]).toEqual([at(x, y), at(x, y), at(x, y)]);
      }
    }
  });

  it("leaves alpha untouched", () => {
    const picture = field(W, H, [128, 128, 128, 77]);
    grain(picture, W, H, { amount: 0.2, cell: 1, seed: 1 });
    for (let i = 3; i < picture.length; i += 4) expect(picture[i]).toBe(77);
  });
  /** The mean absolute difference between horizontal neighbours' red, over a flat grey field with grain. */
  const roughness = (options: Partial<Parameters<typeof grain>[3]>) => {
    const picture = field(W, H, [128, 128, 128, 255]);
    grain(picture, W, H, { amount: 0.15, cell: 1, seed: 4, ...options });
    let sum = 0;
    for (let y = 0; y < H; y++) for (let x = 1; x < W; x++) sum += Math.abs(picture[(y * W + x) * 4] - picture[(y * W + x - 1) * 4]);
    return sum / (H * (W - 1));
  };
  /** The standard deviation of red over a flat grey field with grain. */
  const deviation = (options: Partial<Parameters<typeof grain>[3]>) => {
    const picture = field(W, H, [128, 128, 128, 255]);
    grain(picture, W, H, { amount: 0.15, cell: 1, seed: 4, ...options });
    let sq = 0;
    for (let i = 0; i < picture.length; i += 4) sq += (picture[i] - 128) ** 2;
    return Math.sqrt(sq / (W * H));
  };

  it("lays the plain cells at no spread, no colour and no response", () => {
    const plain = field(W, H, [90, 140, 200, 255]);
    const options = field(W, H, [90, 140, 200, 255]);
    grain(plain, W, H, { amount: 0.15, cell: 1, seed: 7 });
    grain(options, W, H, { amount: 0.15, cell: 1, seed: 7, spread: 0, colour: 0, response: false });
    expect(options).toEqual(plain);
  });

  it("grows smoother with every step of spread, at about the same strength", () => {
    const spreads = [0, 0.3, 0.6, 0.9, 1.2];
    const rough = spreads.map((spread) => roughness({ spread }));
    for (let k = 1; k < rough.length; k++) expect(rough[k]).toBeLessThan(rough[k - 1]);
    for (const spread of spreads) expect(deviation({ spread })).toBeCloseTo(deviation({ spread: 0 }), -0.5);
  });

  it("moves the channels apart with colour grain, and alike without", () => {
    const picture = field(W, H, [128, 128, 128, 255]);
    grain(picture, W, H, { amount: 0.15, cell: 1, seed: 7, colour: 0.5 });
    let apart = 0;
    for (let i = 0; i < picture.length; i += 4) if (picture[i] !== picture[i + 1] || picture[i] !== picture[i + 2]) apart++;
    expect(apart).toBeGreaterThan((W * H) / 2);
  });

  it("with the response by brightness, leaves black and white alone and changes mid grey", () => {
    for (const level of [0, 255]) {
      const picture = field(W, H, [level, level, level, 255]);
      grain(picture, W, H, { amount: 0.2, cell: 1, seed: 7, response: true });
      expect(picture).toEqual(field(W, H, [level, level, level, 255]));
    }
    expect(deviation({ response: true })).toBeGreaterThan(0.9 * deviation({}));
  });
});

describe("saturate", () => {
  it("leaves pixels unchanged at 0", () => {
    const picture = pixels(200, 100, 50, 255);
    saturate(picture, 0);
    expect([...picture]).toEqual([200, 100, 50, 255]);
  });

  it("turns a colour grey of its own luma at −1, alpha untouched", () => {
    const picture = pixels(200, 100, 50, 90);
    saturate(picture, -1);
    const l = Math.round(0.2126 * 200 + 0.7152 * 100 + 0.0722 * 50);
    expect([...picture]).toEqual([l, l, l, 90]);
  });

  it("moves channels away from the luma above 0, and leaves grey grey", () => {
    const picture = pixels(150, 120, 100, 255, 128, 128, 128, 255);
    saturate(picture, 0.5);
    expect(picture[0] - picture[2]).toBeGreaterThan(50);
    expect([...picture.slice(4)]).toEqual([128, 128, 128, 255]);
  });
});

describe("contrast", () => {
  it("leaves pixels unchanged at 0", () => {
    const picture = pixels(10, 128, 250, 255);
    contrast(picture, 0);
    expect([...picture]).toEqual([10, 128, 250, 255]);
  });

  it("fades towards mid grey below 0 and parts darks and lights above", () => {
    const low = pixels(0, 255, 64, 255);
    contrast(low, -0.5);
    expect([...low]).toEqual([64, 191, 96, 255]);
    const high = pixels(64, 191, 128, 255);
    contrast(high, 0.5);
    expect([...high]).toEqual([32, 223, 128, 255]);
  });
});

describe("overlay", () => {
  it("leaves pixels unchanged at 0", () => {
    const picture = pixels(10, 128, 250, 255);
    overlay(picture, [255, 0, 0], 0);
    expect([...picture]).toEqual([10, 128, 250, 255]);
  });

  it("blends every pixel towards the colour by the share, alpha untouched", () => {
    const picture = pixels(0, 100, 200, 40);
    overlay(picture, [200, 0, 100], 0.5);
    expect([...picture]).toEqual([100, 50, 150, 40]);
  });
});

describe("blur", () => {
  it("leaves pixels unchanged at radius 0", () => {
    const picture = pixels(10, 20, 30, 255, 200, 100, 0, 255);
    blur(picture, 2, 1, 0);
    expect([...picture]).toEqual([10, 20, 30, 255, 200, 100, 0, 255]);
  });

  it("leaves a flat field unchanged up to its edges", () => {
    const picture = field(40, 30, [90, 140, 200, 255]);
    blur(picture, 40, 30, 6);
    expect(picture).toEqual(field(40, 30, [90, 140, 200, 255]));
  });

  it("softens a hard edge, and keeps each side's far end", () => {
    // Left half black, right half white.
    const W = 60;
    const picture = new Uint8ClampedArray(W * 4 * 4);
    for (let y = 0; y < 4; y++) {
      for (let x = 0; x < W; x++) picture.set(x < W / 2 ? [0, 0, 0, 255] : [255, 255, 255, 255], (y * W + x) * 4);
    }
    blur(picture, W, 4, 3);
    const at = (x: number) => picture[(1 * W + x) * 4];
    expect(at(0)).toBe(0);
    expect(at(W - 1)).toBe(255);
    // Next to the edge, part way.
    expect(at(W / 2 - 1)).toBeGreaterThan(60);
    expect(at(W / 2)).toBeLessThan(195);
    // Monotone across it.
    for (let x = 1; x < W; x++) expect(at(x)).toBeGreaterThanOrEqual(at(x - 1));
  });

  it("leaves alpha untouched", () => {
    const picture = field(20, 20, [0, 0, 0, 255]);
    for (let i = 0; i < picture.length; i += 8) picture.set([255, 255, 255, 40], i);
    const alphas = [...picture].filter((_, i) => i % 4 === 3);
    blur(picture, 20, 20, 4);
    expect([...picture].filter((_, i) => i % 4 === 3)).toEqual(alphas);
  });

  it("does not darken a picture's colour next to its transparent pixels", () => {
    // Opaque red beside fully transparent black, as a canvas reads a cut-out.
    const W = 20;
    const picture = new Uint8ClampedArray(W * 4);
    for (let x = 0; x < W; x++) picture.set(x < 10 ? [255, 0, 0, 255] : [0, 0, 0, 0], x * 4);
    blur(picture, W, 1, 3);
    expect(picture[9 * 4]).toBe(255);
  });
});

describe("veil", () => {
  it("leaves pixels unchanged at 0", () => {
    const picture = pixels(10, 128, 250, 255, 0, 0, 0, 40);
    veil(picture, 0);
    expect([...picture]).toEqual([10, 128, 250, 255, 0, 0, 0, 40]);
  });

  it("a dark veil scales R, G and B alike", () => {
    const picture = pixels(200, 100, 50, 255);
    veil(picture, -0.5);
    expect([...picture]).toEqual([100, 50, 25, 255]);
  });

  it("a light veil moves R, G and B towards 255", () => {
    const picture = pixels(55, 155, 255, 255);
    veil(picture, 0.5);
    expect([...picture]).toEqual([155, 205, 255, 255]);
  });

  it("leaves alpha untouched", () => {
    const picture = pixels(200, 100, 50, 0, 200, 100, 50, 128);
    veil(picture, -0.6);
    expect([picture[3], picture[7]]).toEqual([0, 128]);
    veil(picture, 0.6);
    expect([picture[3], picture[7]]).toEqual([0, 128]);
  });
});
