import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { openPptxPackage, relsPartOf } from "@/lib/output-check/pptxPackage";
import type { BgMode } from "./changeBackground";

export interface PptBackgroundRequest {
  bgImage: Uint8Array;
  mode: BgMode;
  /** 1-based slide indices, for `specific-slides`. */
  targetSlides?: number[];
}

const key = (v: Violation) => `${v.property}|${v.detail}`;

/** Violations in `found` the input did not already have. */
function notInherited(found: Violation[], inherited: Violation[]): Violation[] {
  const had = new Set(inherited.map(key));
  return found.filter((v) => !had.has(key(v)));
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
 * - ⚡ `replaced-background-kept`: no target part keeps an image relationship
 *   it no longer uses, i.e. the replaced background's (a part that still
 *   shows that image elsewhere through the same id keeps it legitimately)
 * - `non-target-unchanged`: every slide and master the user did not target,
 *   and its relationships, are byte-identical to the input
 * - `relationship-unused` / `media-unreferenced`: no part anywhere keeps an
 *   unused image relationship, and no media part is left that nothing
 *   references, so a replaced background's image is deleted once unused.
 *   Media something still references must stay, which `relationship-target`
 *   already enforces.
 * - `size-bound`: output ≤ input + new image − removed parts + a margin for
 *   the rewritten XML, so re-applying never grows the deck
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
    violations.push(...notInherited(defects, await before.structuralDefects()));
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

  const kept = await after.unusedRelationships(targets);
  if (kept.length > 0) {
    const replaced = notInherited(kept, await before.unusedRelationships(targets));
    for (const v of replaced) {
      violations.push({ property: "replaced-background-kept", detail: v.detail });
    }
  }

  if (depth === "full") {
    const [unused, unusedBefore, orphans, orphansBefore] = await Promise.all([
      after.unusedRelationships(),
      before.unusedRelationships(),
      after.unreferencedMedia(),
      before.unreferencedMedia(),
    ]);
    violations.push(...notInherited(unused, unusedBefore), ...notInherited(orphans, orphansBefore));

    // Compressed sizes undercount what a removed part frees (its zip headers
    // too), so the bound only errs toward allowing.
    const remaining = new Set(after.parts);
    let removed = 0;
    for (const part of before.parts) {
      if (!remaining.has(part)) removed += before.storedSize(part) ?? 0;
    }
    // Rewritten XML is recompressed with another deflater and the new image
    // adds zip headers: 4 KiB plus 1% of the input covers both (real decks
    // land within +0.02%), while a replaced image left behind exceeds it.
    const margin = 4096 + input.byteLength / 100;
    const bound = input.byteLength + request.bgImage.byteLength - removed + margin;
    if (output.byteLength > bound) {
      violations.push({
        property: "size-bound",
        detail: `${output.byteLength} > ${Math.round(bound)} bytes (input ${input.byteLength}, removed ${removed})`,
      });
    }

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
