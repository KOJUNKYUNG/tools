import { describe, it, expect } from "vitest";
import { getErrorMessage, WRONG_PASSWORD_PREFIX, INVALID_INPUT_PREFIX } from "./errors";
import { ToolErrorCode } from "@/types";

describe("getErrorMessage — WRONG_PASSWORD sentinel", () => {
  it("maps a WRONG_PASSWORD-prefixed error to the wrongPasswordHint", () => {
    const err = new Error(`${WRONG_PASSWORD_PREFIX}: invalid password`);
    const res = getErrorMessage(err, { wrongPasswordHint: "비밀번호가 틀렸습니다." });
    expect(res.code).toBe(ToolErrorCode.INVALID_FILE);
    expect(res.message).toBe("비밀번호가 틀렸습니다.");
  });

  it("falls back to the default invalid-file message without a hint", () => {
    const err = new Error(`${WRONG_PASSWORD_PREFIX}: nope`);
    const res = getErrorMessage(err);
    expect(res.code).toBe(ToolErrorCode.INVALID_FILE);
    expect(res.message.length).toBeGreaterThan(0);
  });
});

describe("getErrorMessage — CORRUPT_OUTPUT still works (regression)", () => {
  it("maps CORRUPT_OUTPUT to corruptOutputHint", () => {
    const err = new Error("CORRUPT_OUTPUT: header check failed");
    const res = getErrorMessage(err, { corruptOutputHint: "출력이 손상되었습니다." });
    expect(res.code).toBe(ToolErrorCode.INVALID_FILE);
    expect(res.message).toBe("출력이 손상되었습니다.");
  });

  it("does not confuse WRONG_PASSWORD with CORRUPT_OUTPUT", () => {
    const wrong = getErrorMessage(new Error(`${WRONG_PASSWORD_PREFIX}: x`), {
      wrongPasswordHint: "PW",
      corruptOutputHint: "CORRUPT",
    });
    expect(wrong.message).toBe("PW");
  });
});

describe("getErrorMessage INVALID_INPUT", () => {
  it("maps an INVALID_INPUT-prefixed error to the provided hint", () => {
    const err = new Error(`${INVALID_INPUT_PREFIX}: broken`);
    expect(getErrorMessage(err, { invalidInputHint: "Couldn't open this PDF." }).message).toBe("Couldn't open this PDF.");
  });
  it("falls back to the default INVALID_FILE message when no hint is given", () => {
    const err = new Error(`${INVALID_INPUT_PREFIX}: broken`);
    expect(getErrorMessage(err).message).toBe("지원하지 않거나 손상된 파일입니다.");
  });
});

describe("getErrorMessage — other branches preserved (regression)", () => {
  it("maps memory errors to the memory hint", () => {
    const res = getErrorMessage(new Error("out of memory"), { memoryHint: "메모리 부족" });
    expect(res.code).toBe(ToolErrorCode.MEMORY);
    expect(res.message).toBe("메모리 부족");
  });

  it("passes through an arbitrary error message", () => {
    const res = getErrorMessage(new Error("something specific"));
    expect(res.code).toBe(ToolErrorCode.PROCESSING_FAILED);
    expect(res.message).toBe("something specific");
  });

  it("falls back to UNKNOWN for a non-Error throw", () => {
    const res = getErrorMessage("plain string");
    expect(res.code).toBe(ToolErrorCode.UNKNOWN);
  });
});
