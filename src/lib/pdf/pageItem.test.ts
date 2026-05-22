import { describe, expect, it } from "vitest";
import {
  type PageItem,
  buildOutputNames,
  countSections,
  splitIntoSections,
} from "./pageItem";

/** Minimal PageItem factory for tests — only the fields under test matter. */
function page(overrides: Partial<PageItem> = {}): PageItem {
  return {
    id: overrides.id ?? Math.random().toString(36).slice(2),
    sourceFileId: overrides.sourceFileId ?? "f1",
    sourceFileName: overrides.sourceFileName ?? "doc.pdf",
    kind: overrides.kind ?? "pdf",
    sourcePageIndex: overrides.sourcePageIndex ?? 0,
    rotation: overrides.rotation ?? 0,
    splitAfter: overrides.splitAfter ?? false,
    deleted: overrides.deleted ?? false,
  };
}

describe("splitIntoSections", () => {
  it("returns a single section when there are no dividers", () => {
    const items = [page({ id: "a" }), page({ id: "b" }), page({ id: "c" })];

    const sections = splitIntoSections(items);

    expect(sections).toHaveLength(1);
    expect(sections[0].map((p) => p.id)).toEqual(["a", "b", "c"]);
  });

  it("returns N sections when every page has a divider after it", () => {
    const items = [
      page({ id: "a", splitAfter: true }),
      page({ id: "b", splitAfter: true }),
      page({ id: "c", splitAfter: true }),
    ];

    const sections = splitIntoSections(items);

    expect(sections.map((s) => s.map((p) => p.id))).toEqual([
      ["a"],
      ["b"],
      ["c"],
    ]);
  });

  it("cuts after each divider for arbitrary placement", () => {
    const items = [
      page({ id: "a" }),
      page({ id: "b", splitAfter: true }),
      page({ id: "c" }),
      page({ id: "d" }),
    ];

    const sections = splitIntoSections(items);

    expect(sections.map((s) => s.map((p) => p.id))).toEqual([
      ["a", "b"],
      ["c", "d"],
    ]);
  });

  it("excludes deleted pages from sections", () => {
    const items = [
      page({ id: "a" }),
      page({ id: "b", deleted: true }),
      page({ id: "c" }),
    ];

    const sections = splitIntoSections(items);

    expect(sections.map((s) => s.map((p) => p.id))).toEqual([["a", "c"]]);
  });

  it("ignores a divider sitting on a deleted page", () => {
    const items = [
      page({ id: "a" }),
      page({ id: "b", deleted: true, splitAfter: true }),
      page({ id: "c" }),
    ];

    const sections = splitIntoSections(items);

    expect(sections.map((s) => s.map((p) => p.id))).toEqual([["a", "c"]]);
  });

  it("skips empty sections when a whole section is deleted", () => {
    const items = [
      page({ id: "a", splitAfter: true }),
      page({ id: "b", deleted: true, splitAfter: true }),
      page({ id: "c" }),
    ];

    const sections = splitIntoSections(items);

    expect(sections.map((s) => s.map((p) => p.id))).toEqual([["a"], ["c"]]);
  });

  it("does not emit a trailing empty section for a divider on the last page", () => {
    const items = [page({ id: "a" }), page({ id: "b", splitAfter: true })];

    const sections = splitIntoSections(items);

    expect(sections.map((s) => s.map((p) => p.id))).toEqual([["a", "b"]]);
  });

  it("returns no sections when every page is deleted", () => {
    const items = [
      page({ id: "a", deleted: true }),
      page({ id: "b", deleted: true }),
    ];

    expect(splitIntoSections(items)).toEqual([]);
  });

  it("returns no sections for an empty input", () => {
    expect(splitIntoSections([])).toEqual([]);
  });
});

describe("countSections", () => {
  it("counts one section with no dividers", () => {
    expect(countSections([page(), page()])).toBe(1);
  });

  it("counts sections matching splitIntoSections", () => {
    const items = [
      page({ splitAfter: true }), // section 1: [0]
      page(), // section 2: [1, 2]
      page({ splitAfter: true }),
      page(), // section 3: [3]
    ];
    expect(countSections(items)).toBe(3);
  });

  it("counts zero when all pages are deleted", () => {
    expect(countSections([page({ deleted: true })])).toBe(0);
  });
});

describe("buildOutputNames", () => {
  it("produces a single pdf name for one section", () => {
    const names = buildOutputNames("report", 1);

    expect(names.fileNames).toEqual(["report.pdf"]);
  });

  it("produces numbered names and a split zip for multiple sections", () => {
    const names = buildOutputNames("report", 3);

    expect(names.fileNames).toEqual([
      "report-1.pdf",
      "report-2.pdf",
      "report-3.pdf",
    ]);
    expect(names.zipName).toBe("report-split.zip");
  });
});
