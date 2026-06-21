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

  it("defines the drop-settle keyframe with the 9 / -3 / 0 stops", () => {
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

  it("declares the result-pop reveal (token, keyframe, reduced-motion fallback)", () => {
    // back-out overshoot easing token
    expect(css).toMatch(/--ease-pop:\s*cubic-bezier\(\.34,\s*1\.40,\s*\.64,\s*1\)/);
    // keyframe scales up from 0.90
    expect(css).toMatch(/@keyframes\s+result-pop/);
    expect(css).toMatch(/scale\(0\.90\)/);
    // reduced-motion downgrades .result-pop to the opacity-only fade (both fill,
    // not backwards — backwards would flash the card invisible before the fade).
    expect(css).toMatch(/prefers-reduced-motion[\s\S]*?\.result-pop[\s\S]*?ob-fade[^;]*both/);
  });
});
