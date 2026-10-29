import { describe, expect, it } from "vitest";
import { filterPlan, filtersAfter, filtersFor, isFiltered, NO_FILTERS, type FilterSet } from "./filterSet";

const FULL_HD = { width: 1920, height: 1080 };

describe("is filtered", () => {
  it("counts no filters, and a veil moved back to 0, as unfiltered", () => {
    expect(isFiltered(NO_FILTERS, "picture")).toBe(false);
    expect(isFiltered({ ...NO_FILTERS, veil: 0 }, "picture")).toBe(false);
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

  it("lays the veil as a signed share of the way to black or white, at any size", () => {
    const dark = { ...NO_FILTERS, veil: -0.3 };
    expect(filterPlan(dark, "picture", FULL_HD)).toEqual([{ filter: "veil", amount: -0.3 }]);
    expect(filterPlan(dark, "picture", { width: 3840, height: 2160 })).toEqual([{ filter: "veil", amount: -0.3 }]);
  });
});

describe("filter state across the tool", () => {
  const veiled: FilterSet = { ...NO_FILTERS, veil: -0.3 };

  it("keeps the filters when another background is picked", () => {
    expect(filtersAfter(veiled, "pick")).toEqual(veiled);
  });

  it("keeps the filters after 다시 하기", () => {
    expect(filtersAfter(veiled, "again")).toEqual(veiled);
  });

  it("clears every filter on the effects reset", () => {
    expect(filtersAfter(veiled, "reset")).toEqual(NO_FILTERS);
    expect(NO_FILTERS.veil).toBe(0);
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

  it("offers no effects group for no background", () => {
    expect(filtersFor("none", true)).toBeNull();
  });

  it("hides the veil on a solid colour, where it would only change the colour picked", () => {
    expect(filtersFor("solid", true)?.veil ?? null).toBeNull();
  });
});
