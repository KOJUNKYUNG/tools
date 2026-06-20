import type { ReactNode } from "react";

/**
 * FadeInCenter — the signature brand entrance. Content drops a short distance
 * and settles into place (drop & settle), echoing the brand mark's "tossed
 * folder landing on a desk". The motion lives in globals.css
 * (.animate-drop-settle), which also honours prefers-reduced-motion.
 */
export function FadeInCenter({ children }: { children: ReactNode }) {
  return <div className="animate-drop-settle">{children}</div>;
}
