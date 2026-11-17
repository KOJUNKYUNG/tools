import { describe, expect, it } from "vitest";
import type { PreparedImage } from "@/lib/image/slideImage";
import { savedBackground, savedBackgroundName } from "./savedBackground";

const WIDE = { w: 16 / 9, h: 1 };
const prepared: PreparedImage = { bytes: new Uint8Array([1, 2, 3]), format: "jpeg", width: 3840, height: 2160 };

describe("savedBackground: what the result card offers to save", () => {
  it("is the picture the run put in the deck, for a picture background", () => {
    const picked = { kind: "picture", file: new File([], "photo.jpg") } as const;
    expect(savedBackground(picked, prepared, WIDE, "4k")).toEqual({ kind: "picture", picture: prepared });
  });

  it("is the colour at the run's screen size, for a solid colour the deck holds as a fill", () => {
    const fill = { kind: "fill", fill: { kind: "colour", rgb: "1F2A44" } } as const;
    expect(savedBackground(fill, null, WIDE, "full-hd")).toEqual({
      kind: "colour",
      rgb: "1F2A44",
      slide: WIDE,
      screen: "full-hd",
    });
  });

  it("is nothing for no background, which is the theme's colour and no file", () => {
    expect(savedBackground({ kind: "fill", fill: { kind: "none" } }, null, WIDE, "4k")).toBeNull();
  });
});

describe("savedBackgroundName", () => {
  it("names the file after the deck, with the picture's own extension", () => {
    expect(savedBackgroundName("worship-1117", "jpeg")).toBe("worship-1117-background.jpg");
    expect(savedBackgroundName("worship-1117", "png")).toBe("worship-1117-background.png");
  });
});
