import type { Swatch } from "@/lib/ppt/fills";

/**
 * The CSS background a swatch shows: its colour, or neutral hatching for a
 * gradient, a pattern or a colour that could not be resolved.
 */
export const swatchFill = (swatch: Swatch) =>
  swatch === "fill" ? "repeating-linear-gradient(135deg, var(--surface-2) 0 6px, var(--border) 6px 7px)" : swatch;
