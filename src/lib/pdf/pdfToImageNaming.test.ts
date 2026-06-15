import { describe, it, expect } from "vitest";
import {
  assignImageNames,
  deriveBatchZipName,
  deriveZipName,
} from "./pdfToImageNaming";

describe("assignImageNames", () => {
  it("names each image after its own source pdf, numbered within that source", () => {
    const names = assignImageNames(
      [
        { sourceFileId: "a", sourceFileName: "report.pdf" },
        { sourceFileId: "a", sourceFileName: "report.pdf" },
        { sourceFileId: "b", sourceFileName: "notes.pdf" },
      ],
      "jpg",
    );
    expect(names).toEqual(["report-1.jpg", "report-2.jpg", "notes-1.jpg"]);
  });

  it("zero-pads within each source to its own count width", () => {
    const jobs = Array.from({ length: 12 }, () => ({
      sourceFileId: "a",
      sourceFileName: "doc.pdf",
    }));
    const names = assignImageNames(jobs, "png");
    expect(names[0]).toBe("doc-01.png");
    expect(names[11]).toBe("doc-12.png");
  });

  it("strips the source extension to form the base", () => {
    const names = assignImageNames(
      [{ sourceFileId: "a", sourceFileName: "My Report.PDF" }],
      "jpg",
    );
    expect(names).toEqual(["My Report-1.jpg"]);
  });

  it("falls back to 'output' when a name has no usable base", () => {
    const names = assignImageNames(
      [{ sourceFileId: "a", sourceFileName: ".pdf" }],
      "jpg",
    );
    expect(names).toEqual(["output-1.jpg"]);
  });

  it("numbers two sources independently even when interleaved", () => {
    const names = assignImageNames(
      [
        { sourceFileId: "a", sourceFileName: "a.pdf" },
        { sourceFileId: "b", sourceFileName: "b.pdf" },
        { sourceFileId: "a", sourceFileName: "a.pdf" },
      ],
      "jpg",
    );
    expect(names).toEqual(["a-1.jpg", "b-1.jpg", "a-2.jpg"]);
  });
});

describe("deriveZipName", () => {
  it("appends -images.zip to the base", () => {
    expect(deriveZipName("report")).toBe("report-images.zip");
  });
});

describe("deriveBatchZipName", () => {
  it("numbers each batch zip after the source base", () => {
    expect(deriveBatchZipName("bulletin", 1)).toBe("bulletin-images-1.zip");
    expect(deriveBatchZipName("bulletin", 12)).toBe("bulletin-images-12.zip");
  });
});
