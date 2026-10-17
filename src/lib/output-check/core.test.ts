import { describe, it, expect, vi, afterEach } from "vitest";
import { OutputCheckError, runOutputCheck, type Violation } from "./core";
import { getErrorMessage } from "@/lib/errors";

const broken: Violation[] = [{ property: "slide-count", detail: "3 → 2" }];
const pass = async () => [];

afterEach(() => {
  vi.restoreAllMocks();
});

describe("runOutputCheck", () => {
  it("hands back the output when nothing is violated", async () => {
    await expect(
      runOutputCheck({ tool: "ppt-background", output: "good", check: pass }),
    ).resolves.toBe("good");
  });

  it("blocks with the corrupt-output error, which maps to the tool's hint", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = await runOutputCheck({
      tool: "ppt-background",
      output: "bad",
      check: async () => broken,
    }).catch((e: unknown) => e);
    expect(getErrorMessage(err, { corruptOutputHint: "tool hint" }).message).toBe(
      "tool hint",
    );
  });

  it("carries the violations it blocked on, so a tool can word a specific cause", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const err = await runOutputCheck({
      tool: "ppt-background",
      output: "bad",
      check: async () => broken,
    }).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(OutputCheckError);
    expect((err as OutputCheckError).violations).toEqual(broken);
  });

  it("recovers silently when the recovery passes the check", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      runOutputCheck({
        tool: "pdf-compress",
        output: "bad",
        check: async (out) => (out === "bad" ? broken : []),
        recover: async () => "original",
      }),
    ).resolves.toBe("original");
  });

  it("blocks when the recovery fails the check too", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      runOutputCheck({
        tool: "pdf-compress",
        output: "bad",
        check: async () => broken,
        recover: async () => "still bad",
      }),
    ).rejects.toThrow(/^CORRUPT_OUTPUT/);
  });

  it("blocks when the recovery itself throws", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      runOutputCheck({
        tool: "pdf-compress",
        output: "bad",
        check: async () => broken,
        recover: async () => {
          throw new Error("re-run failed");
        },
      }),
    ).rejects.toThrow(/^CORRUPT_OUTPUT/);
  });

  it("logs the recover and block events in development", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    await runOutputCheck({
      tool: "ppt-background",
      output: "bad",
      check: async () => broken,
    }).catch(() => {});
    expect(warn).toHaveBeenCalledWith(
      expect.stringContaining("ppt-background"),
      broken,
    );
  });

  it("does not block a file when the check itself crashes (not a certain defect)", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    await expect(
      runOutputCheck({
        tool: "ppt-background",
        output: "good",
        check: async () => {
          throw new Error("inspector bug");
        },
      }),
    ).resolves.toBe("good");
  });
});
