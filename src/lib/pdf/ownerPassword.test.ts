import { describe, it, expect } from "vitest";
import { generateOwnerPassword } from "./ownerPassword";

describe("generateOwnerPassword", () => {
  it("produces a non-empty string", () => {
    expect(generateOwnerPassword().length).toBeGreaterThan(0);
  });

  it("produces a long, high-entropy password (>= 32 chars)", () => {
    // Must be effectively unguessable: the whole point is that the user's open
    // password is NOT the owner password, so viewers enforce the permission
    // bits instead of granting owner (full) access.
    expect(generateOwnerPassword().length).toBeGreaterThanOrEqual(32);
  });

  it("differs every call (random, not constant)", () => {
    const a = generateOwnerPassword();
    const b = generateOwnerPassword();
    expect(a).not.toBe(b);
  });

  it("never equals a given user password", () => {
    // Defensive: even if a user picked a 'random-looking' password, the
    // generated owner password is independent and astronomically unlikely
    // to collide.
    const user = "hunter2";
    for (let i = 0; i < 20; i++) {
      expect(generateOwnerPassword()).not.toBe(user);
    }
  });

  it("contains only qpdf-CLI-safe ASCII (no spaces, no control chars)", () => {
    // The owner password is passed as a positional CLI arg; keep it to a safe
    // URL-base64-ish alphabet so no shell/argv quoting surprises.
    expect(generateOwnerPassword()).toMatch(/^[A-Za-z0-9_-]+$/);
  });
});
