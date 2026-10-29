import { describe, expect, it } from "vitest";
import { filterPlan, filtersAfter, filtersFor, isFiltered, NO_FILTERS, type FilterSet } from "./filterSet";

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
  });

  it("lays blur, then the veil, then grain", () => {
    const all: FilterSet = { blur: 0.01, veil: -0.3, grain: 0.1 };
    expect(filterPlan(all, "picture", FULL_HD).map((step) => step.filter)).toEqual(["blur", "veil", "grain"]);
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
  const veiled: FilterSet = { blur: 0.01, veil: -0.3, grain: 0.1 };

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
});
