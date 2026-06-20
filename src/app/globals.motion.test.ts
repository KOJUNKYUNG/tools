import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";
import { describe, it, expect } from "vitest";

const css = readFileSync(
  join(dirname(fileURLToPath(import.meta.url)), "globals.css"),
  "utf8",
);

describe("motion tokens (single source of truth)", () => {
  it("declares the five motion tokens with locked values", () => {
    expect(css).toMatch(/--ease-standard:\s*cubic-bezier\(\.4,\s*0,\s*\.2,\s*1\)/);
    expect(css).toMatch(/--ease-settle:\s*cubic-bezier\(\.25,\s*\.8,\s*\.25,\s*1\)/);
    expect(css).toMatch(/--motion-fast:\s*250ms/);
    expect(css).toMatch(/--motion-base:\s*300ms/);
    expect(css).toMatch(/--motion-settle:\s*500ms/);
  });

  it("defines the drop-settle keyframe with the 9 / -4 / 0 stops", () => {
    expect(css).toMatch(/@keyframes\s+drop-settle/);
    expect(css).toMatch(/translateY\(9px\)/);
    expect(css).toMatch(/translateY\(-3px\)/);
    // The settle must return to rest — a missing 100% stop would snap, not settle.
    expect(css).toMatch(/100%[\s\S]*?translateY\(0\)/);
  });

  it("honours prefers-reduced-motion — fade fallback + transform suppression", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
    // The entrance must fall back to an opacity-only fade (no transform)…
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.animate-drop-settle[\s\S]*?ob-fade/);
    // …and hover lifts must be suppressed.
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?transform:\s*none/);
  });
});
