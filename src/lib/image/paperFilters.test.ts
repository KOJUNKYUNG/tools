import { describe, expect, it } from "vitest";
import catalog from "../../../scripts/gallery/paper-props.json";
import { nextPattern, PAPER_FILTER_NAMES, PAPER_FILTERS, paperParams, settingShown, settingsOf, settingValues } from "./paperFilters";

/** A shader's prop in the gallery scripts' prop table. */
type CatalogProp = { kind: string; min?: number; max?: number; options?: string[] };
// The table's shaders are keyed by name; the JSON's literal type has no index signature.
const shaders = catalog.shaders as unknown as Record<string, { props: Record<string, CatalogProp> }>;

describe("Paper filters", () => {
  it("offers only props the shader has, within its ranges and options", () => {
    for (const name of PAPER_FILTER_NAMES) {
      const props = shaders[PAPER_FILTERS[name].shader].props;
      for (const [prop, setting] of Object.entries(settingsOf(name))) {
        const known = props[prop];
        expect(known, `${name}.${prop}`).toBeTruthy();
        if (setting.kind === "number") {
          expect(setting.range.min).toBeGreaterThanOrEqual(known.min ?? -Infinity);
          expect(setting.range.max).toBeLessThanOrEqual(known.max ?? Infinity);
          expect(setting.default).toBeGreaterThanOrEqual(setting.range.min);
          expect(setting.default).toBeLessThanOrEqual(setting.range.max);
        }
        if (setting.kind === "choice") expect(known.options).toEqual([...setting.options]);
        if (setting.kind === "pattern") expect(setting.max).toBeLessThanOrEqual(known.max ?? Infinity);
      }
      for (const prop of Object.keys(PAPER_FILTERS[name].params)) expect(props[prop], `${name}.${prop}`).toBeTruthy();
    }
  });

  it("draws the user's settings over the defaults, each filter's kept apart", () => {
    const settings = { flutedGlass: { angle: 45 }, halftoneMosaic: { size: 0.9 } };
    expect(settingValues("flutedGlass", settings)).toEqual({ size: 0.5, angle: 45, shape: "lines" });
    expect(paperParams("halftoneMosaic", settings)).toEqual({ size: 0.9 });
    expect(paperParams("halftoneDuotone", settings)).toMatchObject({ grainMixer: 0, size: 0.5, originalColors: false });
  });

  it("hides the duotone's dot colour while the dots take the picture's own colours", () => {
    expect(settingShown("halftoneDuotone", "colorFront", { originalColors: false })).toBe(true);
    expect(settingShown("halftoneDuotone", "colorFront", { originalColors: true })).toBe(false);
    expect(settingShown("halftoneDuotone", "colorBack", { originalColors: true })).toBe(true);
  });
});

describe("another pattern", () => {
  const range = { min: 1, max: 42 };

  it("is never the current one, and stays in the range", () => {
    for (const current of [1, 4, 42]) {
      for (const random of [0, 0.25, 0.5, 0.999]) {
        const next = nextPattern(range, current, random);
        expect(next).not.toBe(current);
        expect(next).toBeGreaterThanOrEqual(1);
        expect(next).toBeLessThanOrEqual(42);
      }
    }
  });

  it("reaches every other value", () => {
    const seen = new Set(Array.from({ length: 41 }, (_, k) => nextPattern(range, 4, (k + 0.5) / 41)));
    expect(seen.size).toBe(41);
  });
});
