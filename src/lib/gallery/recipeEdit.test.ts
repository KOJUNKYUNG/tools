import { describe, expect, it } from "vitest";
import {
  addColour,
  applyEdit,
  canAddColour,
  colourChips,
  controlsFor,
  isEdited,
  removeColour,
  setColour,
  startEdit,
} from "./recipeEdit";
import { paperRecipe, type PaperRecipe } from "./recipes";

// Recipe props are `unknown` (any React prop); the casts below name the
// colour props' known shapes (a list of hex strings, or one).
function recipe(name: string): PaperRecipe {
  const found = paperRecipe(name);
  if (!found) throw new Error(`no recipe ${name}`);
  return found;
}

/**
 * Test oracle: `#rrggbb` → OKLCH (Ottosson's OKLab, CSS Color 4), checked
 * against the spec's own sample values below before it judges the module.
 */
function oklch(hex: string): { l: number; c: number; h: number } {
  const lin = (i: number) => {
    const v = parseInt(hex.slice(1 + 2 * i, 3 + 2 * i), 16) / 255;
    return v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4;
  };
  const [r, g, b] = [lin(0), lin(1), lin(2)];
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  return { l: L, c: Math.hypot(A, B), h: ((Math.atan2(B, A) * 180) / Math.PI + 360) % 360 };
}

const hueDistance = (a: number, b: number) => Math.abs(((a - b + 540) % 360) - 180);

it("test oracle matches CSS Color 4 sample values", () => {
  const red = oklch("#ff0000");
  expect(red.l).toBeCloseTo(0.628, 3);
  expect(red.c).toBeCloseTo(0.2577, 3);
  expect(red.h).toBeCloseTo(29.23, 1);
  const green = oklch("#00ff00");
  expect(green.l).toBeCloseTo(0.86644, 3);
  expect(green.c).toBeCloseTo(0.294827, 3);
  expect(green.h).toBeCloseTo(142.4953, 1);
});

describe("recipe edit", () => {
  it("draws the recipe itself when nothing is edited", () => {
    const mesh = recipe("mesh-4c");
    expect(applyEdit(mesh, startEdit(mesh))).toEqual(mesh);
  });

  it("turns every colour's hue by the shift, keeping its lightness and chroma", () => {
    const mesh = recipe("mesh-4c");
    const drawn = applyEdit(mesh, { ...startEdit(mesh), hueShift: 40 });
    const before = mesh.colors as string[];
    const after = drawn.colors as string[];
    expect(after).toHaveLength(before.length);
    after.forEach((hex, i) => {
      expect(hex).toMatch(/^#[0-9a-f]{6}$/);
      const was = oklch(before[i]);
      const now = oklch(hex);
      // 8-bit channels round each colour by up to about half a step.
      expect(now.l).toBeCloseTo(was.l, 2);
      expect(now.c).toBeCloseTo(was.c, 2);
      expect(hueDistance(now.h, was.h + 40)).toBeLessThan(2);
    });
    // The shape is drawn as before: only colours change.
    expect({ ...drawn, colors: null }).toEqual({ ...mesh, colors: null });
  });

  it("gives up only the chroma sRGB cannot show when a turned colour falls outside it", () => {
    // mesh-4c's purples turned toward teal reach past sRGB at their lightness.
    const mesh = recipe("mesh-4c");
    const after = applyEdit(mesh, { ...startEdit(mesh), hueShift: -90 }).colors as string[];
    let clipped = 0;
    after.forEach((hex, i) => {
      const was = oklch((mesh.colors as string[])[i]);
      const now = oklch(hex);
      expect(now.l).toBeCloseTo(was.l, 2);
      expect(hueDistance(now.h, was.h - 90)).toBeLessThan(2);
      if (Math.abs(now.c - was.c) < 0.005) return;
      clipped++;
      expect(now.c).toBeLessThan(was.c);
      // As much chroma as fits: the colour sits on sRGB's edge.
      expect(hex).toMatch(/^#(?:00|ff)|^#..(?:00|ff)|^#....(?:00|ff)/);
    });
    expect(clipped).toBeGreaterThan(0);
  });

  it("turns single-colour props too, and leaves greys and white as they are", () => {
    // godrays: a plum back, a white bloom and three grey rays.
    const rays = recipe("godrays");
    const drawn = applyEdit(rays, { ...startEdit(rays), hueShift: 120 });
    expect(drawn.colorBloom).toBe("#ffffff");
    expect(drawn.colors).toEqual(["#a8a8a8", "#a8a8a8", "#a8a8a8"]);
    expect(drawn.colorBack).not.toBe(rays.colorBack);
    expect(hueDistance(oklch(drawn.colorBack as string).h, oklch(rays.colorBack as string).h + 120)).toBeLessThan(2);
  });

  it("keeps a colour's own transparency", () => {
    // solar's last colour is #fc620366: 40% opaque orange.
    const solar = recipe("solar");
    const last = (applyEdit(solar, { ...startEdit(solar), hueShift: 60 }).colors as string[]).at(-1);
    expect(last).toMatch(/^#[0-9a-f]{6}66$/);
    expect(last).not.toBe("#fc620366");
  });

  it("offers the colour-family slider, starting at the recipe's own colours", () => {
    const mesh = recipe("mesh-4c");
    expect(controlsFor(mesh).hue).toEqual({ min: -180, max: 180, step: 1 });
    expect(startEdit(mesh).hueShift).toBe(0);
  });

  it("lists every recipe colour as a chip, single colours first, none removable", () => {
    const rays = recipe("godrays");
    expect(colourChips(rays, startEdit(rays))).toEqual([
      { id: "colorBack", colour: rays.colorBack, added: false },
      { id: "colorBloom", colour: "#ffffff", added: false },
      { id: "colors.0", colour: "#a8a8a8", added: false },
      { id: "colors.1", colour: "#a8a8a8", added: false },
      { id: "colors.2", colour: "#a8a8a8", added: false },
    ]);
  });

  it("changes only the chip's colour, and the hue shift then turns every chip", () => {
    const mesh = recipe("staticmesh-4c");
    const before = mesh.colors as string[];
    const picked = setColour(mesh, startEdit(mesh), "colors.1", "#2a9d8f");
    expect(applyEdit(mesh, picked).colors).toEqual([before[0], "#2a9d8f", before[2], before[3]]);
    expect(isEdited(mesh, picked)).toBe(true);

    const after = applyEdit(mesh, { ...picked, hueShift: 40 }).colors as string[];
    [before[0], "#2a9d8f", before[2], before[3]].forEach((was, i) => {
      expect(hueDistance(oklch(after[i]).h, oklch(was).h + 40)).toBeLessThan(2);
    });
  });

  it("draws a colour picked under a hue shift exactly as picked, and turns it with later shifts", () => {
    const mesh = recipe("mesh-4c");
    const shifted = { ...startEdit(mesh), hueShift: 60 };
    const picked = setColour(mesh, shifted, "colors.0", "#1e4d3a");
    expect((applyEdit(mesh, picked).colors as string[])[0]).toBe("#1e4d3a");
    expect(colourChips(mesh, picked)[0].colour).toBe("#1e4d3a");
    const turned = (applyEdit(mesh, { ...picked, hueShift: 90 }).colors as string[])[0];
    expect(hueDistance(oklch(turned).h, oklch("#1e4d3a").h + 30)).toBeLessThan(2);
  });

  it("changes a single-colour prop alone, keeping a colour's own transparency", () => {
    const rays = recipe("godrays");
    const drawn = applyEdit(rays, setColour(rays, startEdit(rays), "colorBack", "#102030"));
    expect(drawn.colorBack).toBe("#102030");
    expect({ ...drawn, colorBack: null }).toEqual({ ...rays, colorBack: null });
    // solar's last colour is #fc620366: the picker gives six digits, the 40% stays.
    const solar = recipe("solar");
    const last = `colors.${(solar.colors as string[]).length - 1}`;
    expect((applyEdit(solar, setColour(solar, startEdit(solar), last, "#00AAFF")).colors as string[]).at(-1)).toBe(
      "#00aaff66",
    );
  });

  it("counts a chip set back to the recipe's colour as unedited", () => {
    const mesh = recipe("staticmesh-2c");
    const own = (mesh.colors as string[])[0];
    const moved = setColour(mesh, startEdit(mesh), "colors.0", "#000000");
    expect(isEdited(mesh, setColour(mesh, moved, "colors.0", own))).toBe(false);
  });

  it("offers adding colours only where the shader takes a colour list, up to Paper's maximum or 6", () => {
    // Paper's maxColorCount: static mesh 10, god rays 5; dithering has no list.
    expect(controlsFor(recipe("staticmesh-2c")).maxColours).toBe(6);
    expect(controlsFor(recipe("godrays")).maxColours).toBe(5);
    expect(controlsFor(recipe("dithering-1")).maxColours).toBeNull();
    const dither = recipe("dithering-1");
    expect(canAddColour(dither, startEdit(dither))).toBe(false);
  });

  it("appends an added colour, starting as the last colour drawn, until the list is full", () => {
    const mesh = recipe("staticmesh-2c");
    const own = mesh.colors as string[];
    let edit = { ...startEdit(mesh), hueShift: 30 };
    const lastDrawn = colourChips(mesh, edit).at(-1)!.colour;
    edit = addColour(mesh, edit);
    expect(colourChips(mesh, edit).at(-1)).toEqual({ id: "colors.2", colour: lastDrawn, added: true });
    expect(isEdited(mesh, edit)).toBe(true);

    edit = setColour(mesh, { ...edit, hueShift: 0 }, "colors.2", "#e9c46a");
    expect(applyEdit(mesh, edit).colors).toEqual([...own, "#e9c46a"]);

    // 2 own + 4 added = 6: "+" goes, and adding more does nothing.
    for (let i = 0; i < 3; i++) edit = addColour(mesh, edit);
    expect(applyEdit(mesh, edit).colors).toHaveLength(6);
    expect(canAddColour(mesh, edit)).toBe(false);
    expect(addColour(mesh, edit)).toEqual(edit);
  });

  it("removes only added colours, so the list never drops below the recipe's", () => {
    const mesh = recipe("staticmesh-2c");
    const own = mesh.colors as string[];
    let edit = addColour(mesh, startEdit(mesh));
    edit = setColour(mesh, edit, "colors.2", "#111111");
    edit = addColour(mesh, edit);
    edit = setColour(mesh, edit, "colors.3", "#222222");

    expect(removeColour(mesh, edit, "colors.0")).toEqual(edit);
    edit = removeColour(mesh, edit, "colors.2");
    expect(applyEdit(mesh, edit).colors).toEqual([...own, "#222222"]);
    edit = removeColour(mesh, edit, "colors.2");
    expect(isEdited(mesh, edit)).toBe(false);
    expect(colourChips(mesh, edit).every((c) => !c.added)).toBe(true);
  });

  it("counts as edited only while the edit draws something other than the recipe", () => {
    const mesh = recipe("mesh-4c");
    const untouched = startEdit(mesh);
    expect(isEdited(mesh, untouched)).toBe(false);
    const moved = { ...untouched, hueShift: 25 };
    expect(isEdited(mesh, moved)).toBe(true);
    // Moved back to 0 by hand, or reset with 원래대로.
    expect(isEdited(mesh, { ...moved, hueShift: 0 })).toBe(false);
    expect(isEdited(mesh, startEdit(mesh))).toBe(false);
    // A chip change and an added colour are edits; 원래대로 starts over.
    const coloured = addColour(mesh, setColour(mesh, untouched, "colors.0", "#123456"));
    expect(isEdited(mesh, coloured)).toBe(true);
    expect(isEdited(mesh, startEdit(mesh))).toBe(false);
  });

  it("adds an opaque colour after a transparent one, since the picker has no transparency", () => {
    // solar's last colour is #fc620366.
    const solar = recipe("solar");
    expect(colourChips(solar, addColour(solar, startEdit(solar))).at(-1)!.colour).toBe("#fc6203");
  });
});

