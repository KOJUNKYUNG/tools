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
    expect(css).toMatch(/--motion-settle:\s*600ms/);
  });

  it("defines the drop-settle keyframe with the 9 / -4 / 0 stops", () => {
    expect(css).toMatch(/@keyframes\s+drop-settle/);
    expect(css).toMatch(/translateY\(9px\)/);
    expect(css).toMatch(/translateY\(-4px\)/);
  });

  it("honours prefers-reduced-motion", () => {
    expect(css).toMatch(/@media\s*\(prefers-reduced-motion:\s*reduce\)/);
  });
});
