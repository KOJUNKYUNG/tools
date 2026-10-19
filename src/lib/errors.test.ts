import { describe, it, expect, vi } from "vitest";
import {
  getErrorMessage,
  UserFacingError,
  WRONG_PASSWORD_PREFIX,
  INVALID_INPUT_PREFIX,
  type ErrorCopy,
} from "./errors";
import { ToolErrorCode } from "@/types";

/** The page's shared error copy, as a tool passes it from the dictionary. */
const copy: ErrorCopy = {
  unexpected: "UNEXPECTED",
  memory: "MEMORY",
  invalidFile: "INVALID",
};

describe("getErrorMessage — WRONG_PASSWORD sentinel", () => {
  it("maps a WRONG_PASSWORD-prefixed error to the wrongPasswordHint", () => {
    const err = new Error(`${WRONG_PASSWORD_PREFIX}: invalid password`);
    const res = getErrorMessage(err, { copy, wrongPasswordHint: "비밀번호가 틀렸습니다." });
    expect(res.code).toBe(ToolErrorCode.INVALID_FILE);
    expect(res.message).toBe("비밀번호가 틀렸습니다.");
  });

  it("falls back to the page's invalid-file copy without a hint", () => {
    const err = new Error(`${WRONG_PASSWORD_PREFIX}: nope`);
    const res = getErrorMessage(err, { copy });
    expect(res.code).toBe(ToolErrorCode.INVALID_FILE);
    expect(res.message).toBe("INVALID");
  });
});

describe("getErrorMessage — CORRUPT_OUTPUT still works (regression)", () => {
  it("maps CORRUPT_OUTPUT to corruptOutputHint", () => {
    const err = new Error("CORRUPT_OUTPUT: header check failed");
    const res = getErrorMessage(err, { copy, corruptOutputHint: "출력이 손상되었습니다." });
    expect(res.code).toBe(ToolErrorCode.INVALID_FILE);
    expect(res.message).toBe("출력이 손상되었습니다.");
  });

  it("does not confuse WRONG_PASSWORD with CORRUPT_OUTPUT", () => {
    const wrong = getErrorMessage(new Error(`${WRONG_PASSWORD_PREFIX}: x`), {
      copy,
      wrongPasswordHint: "PW",
      corruptOutputHint: "CORRUPT",
    });
    expect(wrong.message).toBe("PW");
  });
});

describe("getErrorMessage INVALID_INPUT", () => {
  it("maps an INVALID_INPUT-prefixed error to the provided hint", () => {
    const err = new Error(`${INVALID_INPUT_PREFIX}: broken`);
    expect(getErrorMessage(err, { copy, invalidInputHint: "Couldn't open this PDF." }).message).toBe("Couldn't open this PDF.");
  });
  it("falls back to the page's invalid-file copy when no hint is given", () => {
    const err = new Error(`${INVALID_INPUT_PREFIX}: broken`);
    expect(getErrorMessage(err, { copy }).message).toBe("INVALID");
  });
});

describe("getErrorMessage — other branches", () => {
  it("maps memory errors to the memory hint, else the page's memory copy", () => {
    const res = getErrorMessage(new Error("out of memory"), { copy, memoryHint: "메모리 부족" });
    expect(res.code).toBe(ToolErrorCode.MEMORY);
    expect(res.message).toBe("메모리 부족");
    expect(getErrorMessage(new Error("OOM"), { copy }).message).toBe("MEMORY");
  });

  it("shows a message the tool wrote for the user as it is", () => {
    const res = getErrorMessage(new UserFacingError("Format not supported"), { copy });
    expect(res.code).toBe(ToolErrorCode.PROCESSING_FAILED);
    expect(res.message).toBe("Format not supported");
  });

  it("shows a user message as it is even when it mentions memory", () => {
    const res = getErrorMessage(new UserFacingError("Not enough memory for 600 DPI"), { copy });
    expect(res.message).toBe("Not enough memory for 600 DPI");
  });

  it("hides an engine's own message behind the unexpected-error copy (#83)", () => {
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    const err = new Error("Canvas 2D 컨텍스트를 만들 수 없습니다.");
    const res = getErrorMessage(err, { copy });
    expect(res.code).toBe(ToolErrorCode.PROCESSING_FAILED);
    expect(res.message).toBe("UNEXPECTED");
    // the raw text stays in the developer log
    expect(log).toHaveBeenCalledWith(expect.anything(), err);
    log.mockRestore();
  });

  it("uses the caller's fallback for an unexpected error where it has one", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = getErrorMessage(new Error("decoder blew up"), {
      copy,
      fallbackMessage: "Couldn't read the file.",
    });
    expect(res.message).toBe("Couldn't read the file.");
    vi.restoreAllMocks();
  });

  it("falls back to the unexpected-error copy for a non-Error throw", () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    const res = getErrorMessage("plain string", { copy });
    expect(res.code).toBe(ToolErrorCode.UNKNOWN);
    expect(res.message).toBe("UNEXPECTED");
    vi.restoreAllMocks();
  });
});
