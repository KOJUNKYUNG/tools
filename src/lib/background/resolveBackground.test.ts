import { describe, expect, it, vi } from "vitest";
import { paperRecipe } from "@/lib/gallery/recipes";
import { NO_FILTERS, type FilterSet } from "@/lib/image/filterSet";
import type { PrepareStep } from "@/lib/image/slideImage";
import { resolveBackground, type BackgroundChoice, type BackgroundDrawing } from "./resolveBackground";

const PICTURE = new File([new Uint8Array([1])], "gallery-mesh.jpg", { type: "image/jpeg" });
const DRAWN = new File([new Uint8Array([2])], "edited.png", { type: "image/png" });
const SOLID = new File([new Uint8Array([3])], "solid.png", { type: "image/png" });
const PICTURE_STEP: PrepareStep = (fitted) => fitted;
const SOLID_STEP: PrepareStep = (fitted) => fitted;
const RECIPE = paperRecipe("mesh-3c")!;

/** Drawing stand-ins that record what they were asked to draw. */
function drawing(): BackgroundDrawing & { drawn: unknown[]; solids: string[] } {
  const drawn: unknown[] = [];
  const solids: string[] = [];
  return {
    drawn,
    solids,
    drawEdited: async (props) => {
      drawn.push(props);
      return DRAWN;
    },
    solidPicture: async (rgb) => {
      solids.push(rgb);
      return SOLID;
    },
    step: (kind) => (kind === "solid" ? SOLID_STEP : PICTURE_STEP),
  };
}

const choice = (overrides: Partial<BackgroundChoice>): BackgroundChoice => ({
  fill: null,
  file: null,
  crop: null,
  edited: null,
  filters: NO_FILTERS,
  ...overrides,
});
const filters = (change: Partial<FilterSet>): FilterSet => ({ ...NO_FILTERS, ...change });

describe("resolveBackground", () => {
  it("turns a solid colour with grain into a picture of the colour, its filters as the solid step", async () => {
    const draw = drawing();
    const resolved = await resolveBackground(
      choice({ fill: { kind: "colour", rgb: "336699" }, filters: filters({ grain: 0.2 }) }),
      draw,
    );
    expect(resolved).toEqual({ kind: "picture", file: SOLID, step: SOLID_STEP });
    expect(draw.solids).toEqual(["336699"]);
  });

  it("keeps a solid colour with only colour effects a fill, of the colour they make", async () => {
    const draw = drawing();
    const resolved = await resolveBackground(
      choice({ fill: { kind: "colour", rgb: "FFFFFF" }, filters: filters({ veil: -0.5 }) }),
      draw,
    );
    expect(resolved).toEqual({ kind: "fill", fill: { kind: "colour", rgb: "808080" } });
    expect(draw.solids).toEqual([]);
  });

  it("keeps an unfiltered solid colour as it is", async () => {
    const resolved = await resolveBackground(choice({ fill: { kind: "colour", rgb: "336699" } }), drawing());
    expect(resolved).toEqual({ kind: "fill", fill: { kind: "colour", rgb: "336699" } });
  });

  it("keeps \"no background\" a fill, whatever the filters", async () => {
    const resolved = await resolveBackground(choice({ fill: { kind: "none" }, filters: filters({ grain: 0.2 }) }), drawing());
    expect(resolved).toEqual({ kind: "fill", fill: { kind: "none" } });
  });

  it("draws an edited recipe to a file and keeps the crop set on the gallery file", async () => {
    const draw = drawing();
    const crop = { x: 100, y: 50, width: 1600, height: 900 };
    const resolved = await resolveBackground(choice({ file: PICTURE, crop, edited: RECIPE }), draw);
    expect(resolved).toEqual({ kind: "picture", file: DRAWN, crop, step: PICTURE_STEP });
    expect(draw.drawn).toEqual([RECIPE]);
  });

  it("takes an unedited picture as it is, centred when it has no crop", async () => {
    const draw = drawing();
    const resolved = await resolveBackground(choice({ file: PICTURE }), draw);
    expect(resolved).toEqual({ kind: "picture", file: PICTURE, step: PICTURE_STEP });
    expect(draw.drawn).toEqual([]);
  });

  it("stops with the drawing's failure, never falling back to the unedited file", async () => {
    const failure = new Error("drawing failed");
    const draw = { ...drawing(), drawEdited: vi.fn(async () => Promise.reject(failure)) };
    await expect(resolveBackground(choice({ file: PICTURE, edited: RECIPE }), draw)).rejects.toBe(failure);
  });

  it("refuses a run with nothing picked", async () => {
    await expect(resolveBackground(choice({}), drawing())).rejects.toThrow(/no background/);
  });
});
