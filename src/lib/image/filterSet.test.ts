import { describe, expect, it } from "vitest";
import { filterPlan, filtersAfter, filtersFor, isFiltered, laidPaperFilter, NO_FILTERS, type FilterSet } from "./filterSet";

const FULL_HD = { width: 1920, height: 1080 };

describe("is filtered", () => {
  it("counts no filters, and a veil moved back to 0, as unfiltered", () => {
    expect(isFiltered(NO_FILTERS, "picture")).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, veil: 0 }, "picture")).toBe(false);
  });

  it("counts blur or grain on a picture as filtered", () => {
    expect(isFiltered({ ...NO_FILTERS, blur: 0.005 }, "picture")).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, grain: 0.05 }, "picture")).toBe(true);
  });

  it("counts a veil on a picture as filtered, dark or light", () => {
    expect(isFiltered({ ...NO_FILTERS, veil: -0.2 }, "picture")).toBe(true);
    expect(isFiltered({ ...NO_FILTERS, veil: 0.2 }, "picture")).toBe(true);
  });

  it("does not apply a veil kept from a picture to a solid colour, and brings it back on the next picture", () => {
    const kept = filtersAfter({ ...NO_FILTERS, veil: -0.2 }, "pick");
    expect(isFiltered(kept, "solid")).toBe(false);
    expect(filterPlan(kept, "solid", FULL_HD)).toEqual([]);
    expect(isFiltered(filtersAfter(kept, "pick"), "picture")).toBe(true);
  });

  it("counts nothing on no background as filtered", () => {
    expect(isFiltered({ ...NO_FILTERS, veil: 0.4 }, "none")).toBe(false);
  });
});

describe("filter plan for an output size", () => {
  it("has no step for an unfiltered picture", () => {
    expect(filterPlan(NO_FILTERS, "picture", FULL_HD)).toEqual([]);
  });

  it("has no step for a blur, veil or grain at 0", () => {
    expect(filterPlan({ ...NO_FILTERS, blur: 0, veil: 0, grain: 0 }, "picture", FULL_HD)).toEqual([]);
    // "None" at full strength, as the effects group starts.
    expect(NO_FILTERS).toMatchObject({ paper: null, paperStrength: 1 });
  });

  it("lays the Paper filter, then blur, then the veil, then grain", () => {
    const all: FilterSet = { blur: 0.01, veil: -0.3, grain: 0.1, paper: "flutedGlass", paperStrength: 0.8 };
    expect(filterPlan(all, "picture", FULL_HD).map((step) => step.filter)).toEqual(["paper", "blur", "veil", "grain"]);
  });

  it("lays the chosen Paper filter at its strength", () => {
    const glass: FilterSet = { ...NO_FILTERS, paper: "flutedGlass", paperStrength: 0.6 };
    expect(filterPlan(glass, "picture", FULL_HD)).toMatchObject([{ filter: "paper", paper: "flutedGlass", strength: 0.6 }]);
    expect(isFiltered(glass, "picture")).toBe(true);
  });

  it("draws the Paper filter on one CSS box of the slide's aspect, at the pixel ratio that reaches each size", () => {
    const glass: FilterSet = { ...NO_FILTERS, paper: "flutedGlass" };
    const box = { cssWidth: 1280, cssHeight: 720 };
    expect(filterPlan(glass, "picture", { width: 1280, height: 720 })).toMatchObject([{ box, pixelRatio: 1 }]);
    expect(filterPlan(glass, "picture", { width: 3840, height: 2160 })).toMatchObject([{ box, pixelRatio: 3 }]);
    // A 4:3 slide and a portrait one, each with its own box.
    expect(filterPlan(glass, "picture", { width: 1920, height: 1440 })).toMatchObject([
      { box: { cssWidth: 960, cssHeight: 720 }, pixelRatio: 2 },
    ]);
    expect(filterPlan(glass, "picture", { width: 1080, height: 1920 })).toMatchObject([
      { box: { cssWidth: 720, cssHeight: 1280 }, pixelRatio: 1.5 },
    ]);
  });

  it("has no step for a Paper filter at strength 0, or for \"none\"", () => {
    expect(filterPlan({ ...NO_FILTERS, paper: "flutedGlass", paperStrength: 0 }, "picture", FULL_HD)).toEqual([]);
    expect(filterPlan({ ...NO_FILTERS, paper: null, paperStrength: 1 }, "picture", FULL_HD)).toEqual([]);
  });

  it("names the Paper filter the plan lays, at any size, or none", () => {
    expect(laidPaperFilter({ ...NO_FILTERS, paper: "flutedGlass", paperStrength: 0.4 }, "picture")).toBe("flutedGlass");
    expect(laidPaperFilter({ ...NO_FILTERS, paper: "flutedGlass", paperStrength: 0 }, "picture")).toBeNull();
    expect(laidPaperFilter(NO_FILTERS, "picture")).toBeNull();
    expect(laidPaperFilter({ ...NO_FILTERS, paper: "flutedGlass" }, "none")).toBeNull();
  });

  it("sizes the blur as a share of the width, so 1280 and 3840 blur alike", () => {
    const blurred: FilterSet = { ...NO_FILTERS, blur: 0.01 };
    expect(filterPlan(blurred, "picture", { width: 1280, height: 720 })).toEqual([{ filter: "blur", radius: 12.8 }]);
    expect(filterPlan(blurred, "picture", { width: 3840, height: 2160 })).toEqual([{ filter: "blur", radius: 38.4 }]);
  });

  it("lays grain cells of 1 px at Full HD, scaled with the width, in one pattern", () => {
    const grainy: FilterSet = { ...NO_FILTERS, grain: 0.1 };
    const [hd] = filterPlan(grainy, "picture", FULL_HD);
    const [small] = filterPlan(grainy, "picture", { width: 1280, height: 720 });
    const [uhd] = filterPlan(grainy, "picture", { width: 3840, height: 2160 });
    expect(hd).toMatchObject({ filter: "grain", amount: 0.1, cell: 1 });
    expect(uhd).toMatchObject({ filter: "grain", amount: 0.1, cell: 2 });
    expect(small).toMatchObject({ filter: "grain", cell: 2 / 3 });
    // One pattern at every size.
    expect(new Set([hd, small, uhd].map((step) => step.filter === "grain" && step.seed)).size).toBe(1);
  });

  it("lays grain cells of 1 px at a portrait slide's Full HD, by its long side", () => {
    const grainy: FilterSet = { ...NO_FILTERS, grain: 0.1 };
    expect(filterPlan(grainy, "picture", { width: 1080, height: 1920 })).toMatchObject([{ filter: "grain", amount: 0.1, cell: 1 }]);
    expect(filterPlan(grainy, "picture", { width: 2160, height: 3840 })).toMatchObject([{ filter: "grain", amount: 0.1, cell: 2 }]);
  });

  it("lays grain in whole-pixel cells from 1 px up, so cells never alternate between 1 and 2 px", () => {
    // A 2560-wide fit would give 1.33 px cells, a 3200-wide one 1.67 px.
    const grainy: FilterSet = { ...NO_FILTERS, grain: 0.1 };
    expect(filterPlan(grainy, "picture", { width: 2560, height: 1440 })).toMatchObject([{ cell: 1 }]);
    expect(filterPlan(grainy, "picture", { width: 3200, height: 1800 })).toMatchObject([{ cell: 2 }]);
  });

  it("softens grain whose cells are below a pixel, as a downscale averages them", () => {
    // Each pixel of the 1280 picture stands for 1.5 × 1.5 cells, whose average varies 1.5 times less.
    const [small] = filterPlan({ ...NO_FILTERS, grain: 0.15 }, "picture", { width: 1280, height: 720 });
    expect(small).toMatchObject({ filter: "grain" });
    expect(small.filter === "grain" && small.amount).toBeCloseTo(0.1);
  });

  it("lays the veil as a signed share of the way to black or white, at any size", () => {
    const dark = { ...NO_FILTERS, veil: -0.3 };
    expect(filterPlan(dark, "picture", FULL_HD)).toEqual([{ filter: "veil", amount: -0.3 }]);
    expect(filterPlan(dark, "picture", { width: 3840, height: 2160 })).toEqual([{ filter: "veil", amount: -0.3 }]);
  });
});

describe("filter state across the tool", () => {
  const veiled: FilterSet = { blur: 0.01, veil: -0.3, grain: 0.1, paper: "flutedGlass", paperStrength: 0.5 };

  it("keeps the filters when another background is picked", () => {
    expect(filtersAfter(veiled, "pick")).toEqual(veiled);
  });

  it("keeps the filters after 다시 하기", () => {
    expect(filtersAfter(veiled, "again")).toEqual(veiled);
  });

  it("clears every filter on the effects reset", () => {
    expect(filtersAfter(veiled, "reset")).toEqual(NO_FILTERS);
    expect(isFiltered(filtersAfter(veiled, "reset"), "picture")).toBe(false);
  });

  it("leaves the filters alone on the recipe edit's reset", () => {
    expect(filtersAfter(veiled, "recipeReset")).toEqual(veiled);
  });
});

describe("filters offered for a background", () => {
  it("offers a picture the effects group with the veil, from dark through 0 to light", () => {
    for (const webgl2 of [true, false]) {
      const veil = filtersFor("picture", webgl2)?.veil;
      expect(veil).toBeTruthy();
      expect(veil!.min).toBeLessThan(0);
      expect(veil!.max).toBeGreaterThan(0);
    }
  });

  it("offers a picture blur from 0 and grain from 0, with or without WebGL2", () => {
    for (const webgl2 of [true, false]) {
      const offered = filtersFor("picture", webgl2);
      expect(offered?.blur?.min).toBe(0);
      expect(offered?.blur?.max).toBeGreaterThan(0);
      expect(offered?.grain?.min).toBe(0);
      expect(offered?.grain?.max).toBeGreaterThan(0);
    }
  });

  it("offers no effects group for no background", () => {
    expect(filtersFor("none", true)).toBeNull();
  });

  it("hides the veil on a solid colour, where it would only change the colour picked", () => {
    expect(filtersFor("solid", true)?.veil ?? null).toBeNull();
  });

  it("hides blur on a solid colour, where it changes nothing", () => {
    expect(filtersFor("solid", true)?.blur ?? null).toBeNull();
  });

  it("offers a picture fluted glass among the Paper filters, with a strength from 0 to 100%, only with WebGL2", () => {
    const paper = filtersFor("picture", true)?.paper;
    expect(paper?.filters).toContain("flutedGlass");
    expect(paper?.strength).toMatchObject({ min: 0, max: 1 });
    expect(filtersFor("picture", false)?.paper ?? null).toBeNull();
  });
});
