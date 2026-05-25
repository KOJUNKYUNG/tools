import { describe, it, expect } from "vitest";
import { deriveImageName, deriveZipName } from "./pdfToImageNaming";

describe("deriveImageName", () => {
  it("zero-pads the ordinal to the total's digit width", () => {
    expect(deriveImageName("report", 1, 12, "jpg")).toBe("report-01.jpg");
    expect(deriveImageName("report", 10, 12, "jpg")).toBe("report-10.jpg");
  });

  it("uses no padding when total is single-digit", () => {
    expect(deriveImageName("report", 5, 5, "png")).toBe("report-5.png");
  });

  it("pads to three digits for 100+ pages", () => {
    expect(deriveImageName("a", 7, 100, "jpg")).toBe("a-007.jpg");
  });

  it("uses the given extension", () => {
    expect(deriveImageName("doc", 1, 1, "png")).toBe("doc-1.png");
  });
});

describe("deriveZipName", () => {
  it("appends -images.zip to the base", () => {
    expect(deriveZipName("report")).toBe("report-images.zip");
  });
});
