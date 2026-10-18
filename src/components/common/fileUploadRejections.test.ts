import { describe, it, expect } from "vitest";
import { ErrorCode, type FileRejection } from "react-dropzone";
import { rejectionMessages, type RejectionTemplates } from "./fileUploadRejections";

const TEMPLATES: RejectionTemplates = {
  tooLarge: "{name}: over {size}",
  invalidType: "{name}: bad type",
  tooMany: "one file at a time",
  other: "{name}: {message}",
};

const rejection = (name: string, ...codes: string[]): FileRejection => ({
  file: new File(["x"], name),
  errors: codes.map((code) => ({ code, message: `dropzone says ${code}` })),
});

describe("rejectionMessages", () => {
  it("says once that only one file fits, however many files were dropped", () => {
    const rejections = ["a.pdf", "b.pdf", "c.pdf"].map((n) => rejection(n, ErrorCode.TooManyFiles));
    expect(rejectionMessages(rejections, TEMPLATES, "10 MB")).toEqual(["one file at a time"]);
  });

  it("keeps the per-file messages for size and type", () => {
    const rejections = [
      rejection("big.pdf", ErrorCode.FileTooLarge),
      rejection("a.txt", ErrorCode.FileInvalidType),
    ];
    expect(rejectionMessages(rejections, TEMPLATES, "10 MB")).toEqual([
      "big.pdf: over 10 MB",
      "a.txt: bad type",
    ]);
  });

  it("reports a file's other problems alongside the one too-many-files message", () => {
    // react-dropzone marks only the files it would otherwise accept as too many.
    const rejections = [
      rejection("a.txt", ErrorCode.FileInvalidType),
      rejection("b.pdf", ErrorCode.TooManyFiles),
      rejection("c.pdf", ErrorCode.TooManyFiles),
    ];
    expect(rejectionMessages(rejections, TEMPLATES, "10 MB")).toEqual([
      "one file at a time",
      "a.txt: bad type",
    ]);
  });

  it("falls back to the generic template for any other code", () => {
    expect(rejectionMessages([rejection("a.pdf", "custom")], TEMPLATES, "10 MB")).toEqual([
      "a.pdf: dropzone says custom",
    ]);
  });
});
