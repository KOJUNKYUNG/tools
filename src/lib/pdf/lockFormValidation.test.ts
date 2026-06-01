import { describe, it, expect } from "vitest";
import { validateLockForm, validateUnlockForm, MIN_PASSWORD_LENGTH } from "./lockFormValidation";

describe("validateLockForm", () => {
  // Derive from the constant so the suite survives future length changes.
  const minPw = "a".repeat(MIN_PASSWORD_LENGTH);
  const ok = { password: minPw, confirm: minPw };

  it("accepts a matching password at/above the minimum length", () => {
    expect(validateLockForm(ok)).toEqual({ ok: true });
  });

  it("rejects an empty password", () => {
    expect(validateLockForm({ password: "", confirm: "" })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects a whitespace-only password as empty", () => {
    expect(validateLockForm({ password: "   ", confirm: "   " })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects a password shorter than the minimum", () => {
    const short = "a".repeat(MIN_PASSWORD_LENGTH - 1);
    expect(validateLockForm({ password: short, confirm: short })).toEqual({
      ok: false,
      reason: "tooShort",
    });
  });

  it("rejects when confirmation does not match", () => {
    expect(validateLockForm({ password: minPw, confirm: minPw + "x" })).toEqual({
      ok: false,
      reason: "mismatch",
    });
  });

  it("checks emptiness before length and mismatch", () => {
    // An empty password with a non-empty confirm is still 'empty', not 'mismatch'.
    expect(validateLockForm({ password: "", confirm: "x" })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("does not trim the password itself (spaces are valid chars)", () => {
    const pw = "ab cd ef";
    expect(validateLockForm({ password: pw, confirm: pw })).toEqual({ ok: true });
  });
});

describe("validateUnlockForm", () => {
  it("accepts any non-empty password (no length/confirm rules)", () => {
    expect(validateUnlockForm({ password: "x" })).toEqual({ ok: true });
  });

  it("rejects an empty password", () => {
    expect(validateUnlockForm({ password: "" })).toEqual({
      ok: false,
      reason: "empty",
    });
  });

  it("rejects a whitespace-only password", () => {
    expect(validateUnlockForm({ password: "  " })).toEqual({
      ok: false,
      reason: "empty",
    });
  });
});
