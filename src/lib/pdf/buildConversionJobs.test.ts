import { describe, it, expect } from "vitest";
import { buildConversionJobs } from "./buildConversionJobs";
import type { PageItem } from "./pageItem";

function page(over: Partial<PageItem>): PageItem {
  return {
    id: over.id ?? crypto.randomUUID(),
    sourceFileId: over.sourceFileId ?? "f1",
    sourceFileName: over.sourceFileName ?? "a.pdf",
    kind: over.kind ?? "pdf",
    sourcePageIndex: over.sourcePageIndex ?? 0,
    rotation: over.rotation ?? 0,
    splitAfter: over.splitAfter ?? false,
    deleted: over.deleted ?? false,
  };
}

describe("buildConversionJobs", () => {
  it("maps non-deleted pages to jobs in order", () => {
    const jobs = buildConversionJobs([
      page({ sourceFileId: "f1", sourcePageIndex: 0 }),
      page({ sourceFileId: "f1", sourcePageIndex: 1 }),
      page({ sourceFileId: "f2", sourcePageIndex: 0 }),
    ]);
    expect(jobs).toEqual([
      { sourceFileId: "f1", sourceFileName: "a.pdf", sourcePageIndex: 0, rotation: 0 },
      { sourceFileId: "f1", sourceFileName: "a.pdf", sourcePageIndex: 1, rotation: 0 },
      { sourceFileId: "f2", sourceFileName: "a.pdf", sourcePageIndex: 0, rotation: 0 },
    ]);
  });

  it("drops deleted pages", () => {
    const jobs = buildConversionJobs([
      page({ sourcePageIndex: 0 }),
      page({ sourcePageIndex: 1, deleted: true }),
      page({ sourcePageIndex: 2 }),
    ]);
    expect(jobs.map((j) => j.sourcePageIndex)).toEqual([0, 2]);
  });

  it("carries rotation", () => {
    const jobs = buildConversionJobs([page({ rotation: 90 })]);
    expect(jobs[0].rotation).toBe(90);
  });

  it("returns empty for no input or all-deleted", () => {
    expect(buildConversionJobs([])).toEqual([]);
    expect(buildConversionJobs([page({ deleted: true })])).toEqual([]);
  });
});
