import { describe, it, expect } from "vitest";
import { buildEncryptArgs, buildDecryptArgs } from "./qpdfArgs";

const IN = "/input.pdf";
const OUT = "/output.pdf";

describe("buildEncryptArgs", () => {
  const base = {
    userPassword: "open123",
    ownerPassword: "owner456",
  };

  it("starts with --encrypt user owner 256 and ends with -- in out", () => {
    const args = buildEncryptArgs({
      ...base,
      permissions: { allowPrint: false, allowCopy: false },
    });
    expect(args[0]).toBe("--encrypt");
    expect(args[1]).toBe("open123");
    expect(args[2]).toBe("owner456");
    expect(args[3]).toBe("256");
    // positional input/output come after the `--` separator, in order.
    const sep = args.indexOf("--");
    expect(sep).toBeGreaterThan(3);
    expect(args.slice(sep)).toEqual(["--", IN, OUT]);
  });

  it("denies print and copy by default (both toggles off)", () => {
    const args = buildEncryptArgs({
      ...base,
      permissions: { allowPrint: false, allowCopy: false },
    });
    expect(args).toContain("--print=none");
    expect(args).toContain("--extract=n");
    // editing is always restricted regardless of toggles.
    expect(args).toContain("--modify=none");
  });

  it("allows printing when allowPrint is true", () => {
    const args = buildEncryptArgs({
      ...base,
      permissions: { allowPrint: true, allowCopy: false },
    });
    expect(args).toContain("--print=full");
    expect(args).toContain("--extract=n");
  });

  it("allows copy/extract when allowCopy is true", () => {
    const args = buildEncryptArgs({
      ...base,
      permissions: { allowPrint: false, allowCopy: true },
    });
    expect(args).toContain("--extract=y");
    expect(args).toContain("--print=none");
  });

  it("allows both when both toggles are on", () => {
    const args = buildEncryptArgs({
      ...base,
      permissions: { allowPrint: true, allowCopy: true },
    });
    expect(args).toContain("--print=full");
    expect(args).toContain("--extract=y");
    // editing still locked.
    expect(args).toContain("--modify=none");
  });

  it("never emits the ignored --accessibility flag (warns under AES-256)", () => {
    const args = buildEncryptArgs({
      ...base,
      permissions: { allowPrint: true, allowCopy: true },
    });
    expect(args.some((a) => a.startsWith("--accessibility"))).toBe(false);
  });

  it("honors custom input/output paths", () => {
    const args = buildEncryptArgs({
      ...base,
      permissions: { allowPrint: false, allowCopy: false },
      inputPath: "/a.pdf",
      outputPath: "/b.pdf",
    });
    expect(args.slice(-3)).toEqual(["--", "/a.pdf", "/b.pdf"]);
  });
});

describe("buildDecryptArgs", () => {
  it("passes the password and decrypts to output", () => {
    const args = buildDecryptArgs({ password: "secret" });
    expect(args).toContain("--password=secret");
    expect(args).toContain("--decrypt");
    expect(args.slice(-3)).toEqual(["--", IN, OUT]);
    // password must precede the -- separator and the --decrypt verb.
    expect(args.indexOf("--password=secret")).toBeLessThan(args.indexOf("--"));
  });

  it("honors custom input/output paths", () => {
    const args = buildDecryptArgs({
      password: "x",
      inputPath: "/in.pdf",
      outputPath: "/out.pdf",
    });
    expect(args.slice(-3)).toEqual(["--", "/in.pdf", "/out.pdf"]);
  });

  it("handles passwords containing special characters verbatim", () => {
    const args = buildDecryptArgs({ password: "a=b&c #d" });
    expect(args).toContain("--password=a=b&c #d");
  });
});
