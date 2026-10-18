import { describe, it, expect } from "vitest";
import { presetLabel, presetNotSmallerMessage, STRONGER_PRESET } from "./compressionPreset";

const labels = {
  presetLightLabel: "Light",
  presetMediumLabel: "Medium",
  presetHeavyLabel: "Heavy",
  notSmallerTryStronger: "{preset} could not shrink it. Try {next}.",
  notSmallerOptimized: "Even {preset} could not shrink it.",
};

describe("STRONGER_PRESET", () => {
  it("climbs low → medium → high and stops at the strongest", () => {
    expect(STRONGER_PRESET).toEqual({ low: "medium", medium: "high", high: null });
  });
});

describe("presetLabel", () => {
  it("names each preset from the tool's copy", () => {
    expect(presetLabel("low", labels)).toBe("Light");
    expect(presetLabel("medium", labels)).toBe("Medium");
    expect(presetLabel("high", labels)).toBe("Heavy");
  });
});

describe("presetNotSmallerMessage", () => {
  it("suggests the next stronger preset", () => {
    expect(presetNotSmallerMessage("low", labels)).toBe("Light could not shrink it. Try Medium.");
    expect(presetNotSmallerMessage("medium", labels)).toBe("Medium could not shrink it. Try Heavy.");
  });

  it("says even the strongest preset could not shrink it", () => {
    expect(presetNotSmallerMessage("high", labels)).toBe("Even Heavy could not shrink it.");
  });
});
