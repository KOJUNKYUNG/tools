import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { openPptxPackage, relsPartOf } from "@/lib/output-check/pptxPackage";
import type { BgMode } from "./changeBackground";

export interface PptBackgroundRequest {
  bgImage: Uint8Array;
  mode: BgMode;
  /** 1-based slide indices, for `specific-slides`. */
  targetSlides?: number[];
}

function sameBytes(a: Uint8Array | null, b: Uint8Array | null): boolean {
  if (a === null || b === null) return a === b;
  if (a.byteLength !== b.byteLength) return false;
  for (let i = 0; i < a.byteLength; i++) if (a[i] !== b[i]) return false;
  return true;
}

/**
 * ppt-background output properties (spec #51). ⚡ = also at `quick` depth.
 *
 * - ⚡ package structurally valid: readable zip and XML parts, well-formed
 *   XML, `[Content_Types]` coverage, relationship targets resolve
 * - ⚡ `slide-count`: same number of slides as the input
 * - ⚡ `target-background`: each target slide (or the master) declares the
 *   new image as its background
 * - `non-target-unchanged`: every slide and master the user did not target,
 *   and its relationships, are byte-identical to the input
 *
 * Structural defects the input already had are not the tool's doing and are
 * not reported: the user's deck opened before, so blocking it would be a
 * false positive. Slide N means the N-th slide part by file number, the
 * order the engine and the slide picker use.
 */
export const checkPptBackground: OutputChecker<
  Uint8Array,
  PptBackgroundRequest,
  Uint8Array
> = async (input, request, output, depth) => {
  const [before, after] = await Promise.all([
    openPptxPackage(input),
    openPptxPackage(output),
  ]);
  if (!after) return [{ property: "zip", detail: "output is not a readable zip" }];
  if (!before) return [];

  const violations: Violation[] = [];

  const defects = await after.structuralDefects(before);
  if (defects.length > 0) {
    const key = (v: Violation) => `${v.property}|${v.detail}`;
    const inherited = new Set((await before.structuralDefects()).map(key));
    violations.push(...defects.filter((d) => !inherited.has(key(d))));
  }

  if (before.slideParts.length !== after.slideParts.length) {
    violations.push({
      property: "slide-count",
      detail: `${before.slideParts.length} → ${after.slideParts.length}`,
    });
  }

  // Targets are re-derived from the request here, not shared with the engine:
  // a checker that reused the engine's selection would agree with its bugs.
  const targets =
    request.mode === "master"
      ? before.masterParts
      : request.mode === "all-slides"
        ? before.slideParts
        : before.slideParts.filter((_, i) => request.targetSlides?.includes(i + 1));

  const backgrounds = await after.backgroundMedia(targets);
  const isNewImage = new Map<string, boolean>();
  for (const part of targets) {
    const media = backgrounds.get(part) ?? null;
    if (media !== null && !isNewImage.has(media)) {
      isNewImage.set(media, sameBytes(await after.read(media), request.bgImage));
    }
    if (media === null || !isNewImage.get(media)) {
      violations.push({ property: "target-background", detail: part });
    }
  }

  if (depth === "full") {
    const targetSet = new Set(targets);
    const untouched = [...before.slideParts, ...before.masterParts].filter(
      (p) => !targetSet.has(p),
    );
    for (const part of untouched) {
      for (const p of [part, relsPartOf(part)]) {
        if (!sameBytes(await before.read(p), await after.read(p))) {
          violations.push({ property: "non-target-unchanged", detail: p });
        }
      }
    }
  }

  return violations;
};
