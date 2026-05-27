import { describe, expect, it } from "vitest";
import { aggregateFormats, pickThumbnailPath } from "./analyzePresentation";

describe("analyzePresentation pure helpers", () => {
  describe("aggregateFormats", () => {
    it("counts images and groups by extension (lowercase)", () => {
      const result = aggregateFormats([
        "image_1.PNG",
        "image_2.png",
        "logo.jpg",
        "diagram.emf",
        "photo.JPEG",
      ]);
      expect(result.imageCount).toBe(5);
      expect(result.formatCounts).toEqual({
        png: 2,
        jpg: 1,
        jpeg: 1,
        emf: 1,
      });
    });

    it("returns zeroes on empty input", () => {
      expect(aggregateFormats([])).toEqual({
        imageCount: 0,
        formatCounts: {},
      });
    });

    it("skips entries without extension", () => {
      const result = aggregateFormats(["noext", "ok.png"]);
      expect(result.imageCount).toBe(1);
      expect(result.formatCounts).toEqual({ png: 1 });
    });
  });

  describe("pickThumbnailPath", () => {
    it("returns docProps/thumbnail.jpeg when present (case-insensitive)", () => {
      const paths = ["ppt/media/image1.png", "docProps/thumbnail.jpeg", "ppt/slides/slide1.xml"];
      expect(pickThumbnailPath(paths)).toBe("docProps/thumbnail.jpeg");
    });

    it("falls back to .jpg, then .png", () => {
      expect(pickThumbnailPath(["docProps/thumbnail.jpg"])).toBe("docProps/thumbnail.jpg");
      expect(pickThumbnailPath(["docProps/thumbnail.png"])).toBe("docProps/thumbnail.png");
    });

    it("is case-insensitive on path", () => {
      expect(pickThumbnailPath(["docProps/Thumbnail.JPEG"])).toBe("docProps/Thumbnail.JPEG");
    });

    it("returns null when no thumbnail entry exists", () => {
      expect(pickThumbnailPath(["ppt/media/image1.png"])).toBe(null);
    });

    it("prefers jpeg over jpg over png", () => {
      const paths = [
        "docProps/thumbnail.png",
        "docProps/thumbnail.jpg",
        "docProps/thumbnail.jpeg",
      ];
      expect(pickThumbnailPath(paths)).toBe("docProps/thumbnail.jpeg");
    });
  });
});
