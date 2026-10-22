import { notInherited, type OutputChecker, type Violation } from "@/lib/output-check/core";
import { displayedSize, readImageHeader } from "@/lib/output-check/imageHeader";
import { openPptxPackage, relsPartOf, type PptxPackage } from "@/lib/output-check/pptxPackage";
import { pngAlphaUsed } from "@/lib/output-check/pngAlpha";
import { sameBytes } from "@/lib/output-check/sameBytes";
import type { CropRect } from "@/lib/image/maxFitCrop";
import type { SlideSize } from "@/lib/image/slideImage";
import type { BgMode } from "./changeBackground";
import { coveringIn, findCoveringBackgrounds, shapeIdsIn, topLevelElements } from "./coveringBackgrounds";
import { animationTargets } from "./slideAnimations";
import { parseXml, type XmlElement } from "./xmlTree";

export interface PptBackgroundRequest {
  /** The picture the user picked, as uploaded. */
  source: Uint8Array;
  /** The Background crop in the source's upright pixels; absent = centred, as large as possible. */
  crop?: CropRect;
  /** The prepared picture the engine embedded. */
  background: Uint8Array;
  mode: BgMode;
  /** 1-based slide indices, for `specific-slides`. */
  targetSlides?: number[];
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
 * - `non-target-unchanged`: every slide, layout and master the tool does not
 *   rewrite, and its relationships, are byte-identical to the input
 * - `relationship-unused` / `media-unreferenced`: no part anywhere keeps an
 *   unused image relationship, and no media part is left that nothing
 *   references, so a replaced background's image is deleted once unused.
 *   Media something still references must stay, which `relationship-target`
 *   already enforces.
 * - `size-bound`: output ≤ input + new image − removed parts + a margin for
 *   the rewritten XML, so re-applying never grows the deck
 *
 * Master mode (spec #105) clears what would hide the master's background:
 *
 * - ⚡ `own-background-kept`: a slide or layout still declares its own
 *   background
 * - `only-background-cleared`: each layout, and each slide without covering
 *   backgrounds, is its input with its own background removed and nothing
 *   else changed (slides with covering backgrounds are held by the element
 *   properties below)
 *
 * Covering backgrounds (spec #105), on each target slide (every slide in
 * master mode), re-detected on the input with the shared rule. The rule is
 * the spec: these prove the engine applied it, not that it is right (the
 * regression set covers the rule itself). Elements are matched by their XML text: the
 * engine copies the ones it keeps verbatim, while shape ids may repeat.
 *
 * - ⚡ `covering-background-kept`: a covering background is still there
 * - ⚡ `element-missing`: another top-level element is gone
 * - ⚡ `animation-target-missing`: an animation or build entry names a shape
 *   the slide does not have (the deck would need repair)
 *
 * The prepared picture (spec #98), re-derived from the source picture, the
 * crop and the input's slide size, never from the engine's numbers:
 *
 * - ⚡ `background-aspect`: the slide's aspect, within 1 px on both sides
 * - ⚡ `background-cap`: within a 4K screen in the slide's orientation,
 *   3840 × 2160 (landscape or square) or 2160 × 3840 (portrait)
 * - ⚡ `background-not-upscaled`: no larger than the crop on either side
 * - ⚡ `background-format`: PNG or JPEG only, and JPEG only when no pixel
 *   of the source is less than fully opaque (its transparency would be lost).
 *   The source's pixels are read at `quick` depth too: only a PNG with an
 *   alpha channel or tRNS is scanned (a JPEG never), ~150 ms for a 12 MP
 *   picture against seconds of decoding, re-encoding and zipping (#102).
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

  const violations: Violation[] = await preparationViolations(before, request);

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
      isNewImage.set(media, sameBytes(await after.read(media), request.background));
    }
    if (media === null || !isNewImage.get(media)) {
      violations.push({ property: "target-background", detail: part });
    }
  }

  // Master mode also rewrites every slide (covering backgrounds deleted, own
  // background cleared) and every layout (own background cleared).
  const coveringChecked = request.mode === "master" ? before.slideParts : targets;
  const rewritten =
    request.mode === "master" ? [...targets, ...coveringChecked, ...before.layoutParts] : targets;

  if (request.mode === "master") {
    for (const part of [...after.slideParts, ...after.layoutParts]) {
      if (OWN_BACKGROUND.test((await after.text(part)) ?? "")) {
        violations.push({ property: "own-background-kept", detail: part });
      }
    }
  }

  violations.push(...(await coveringViolations(before, after, coveringChecked, await slideSize(before))));

  const kept = await after.unusedRelationships(rewritten);
  if (kept.length > 0) {
    const replaced = notInherited(kept, await before.unusedRelationships(rewritten));
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
    const bound = input.byteLength + request.background.byteLength - removed + margin;
    if (output.byteLength > bound) {
      violations.push({
        property: "size-bound",
        detail: `${output.byteLength} > ${Math.round(bound)} bytes (input ${input.byteLength}, removed ${removed})`,
      });
    }

    if (request.mode === "master") {
      const slide = await slideSize(before);
      for (const part of [...before.layoutParts, ...before.slideParts]) {
        const [inXml, outXml] = await Promise.all([before.text(part), after.text(part)]);
        if (inXml === null || outXml === null) continue;
        if (findCoveringBackgrounds(inXml, slide).length > 0) continue;
        if (outXml !== inXml.replace(OWN_BACKGROUND, "")) {
          violations.push({ property: "only-background-cleared", detail: part });
        }
      }
    }

    const rewrittenSet = new Set(rewritten);
    const untouched = [...before.slideParts, ...before.layoutParts, ...before.masterParts].filter(
      (p) => !rewrittenSet.has(p),
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

/** A part's own background, as the part declares it. */
const OWN_BACKGROUND = /<p:bg[\s>][\s\S]*?<\/p:bg>/;

/** PowerPoint's default slide (16:9) when the deck does not declare one. */
const DEFAULT_SLIDE = { w: 12192000, h: 6858000 };

async function slideSize(pkg: PptxPackage): Promise<{ w: number; h: number }> {
  const bytes = await pkg.read("ppt/presentation.xml");
  const xml = bytes ? new TextDecoder().decode(bytes) : "";
  const sldSz = xml.match(/<p:sldSz\b[^>]*>/)?.[0] ?? "";
  const attr = (name: string) => Number(sldSz.match(new RegExp(`\\b${name}="(\\d+)"`))?.[1]);
  const [w, h] = [attr("cx"), attr("cy")];
  return w > 0 && h > 0 ? { w, h } : DEFAULT_SLIDE;
}

/** The covering-background properties of the given slides. */
async function coveringViolations(
  before: PptxPackage,
  after: PptxPackage,
  targets: readonly string[],
  slide: SlideSize,
): Promise<Violation[]> {
  const violations: Violation[] = [];
  for (const part of targets) {
    const [inXml, outXml] = await Promise.all([before.text(part), after.text(part)]);
    // Unreadable or malformed parts are structural defects, reported above.
    if (inXml === null || outXml === null) continue;
    const [inRoot, outRoot] = [parseXml(inXml), parseXml(outXml)];
    const [inEls, outEls] = [topLevelElements(inRoot), topLevelElements(outRoot)];
    if (!inRoot || !outRoot || !inEls || !outEls) continue;

    const covering = new Set(coveringIn(inEls, slide).map((c) => c.start));
    /** How many of the output's top-level elements have each XML text, not yet matched. */
    const unmatched = new Map<string, number>();
    for (const el of outEls) {
      const text = outXml.slice(el.start, el.end);
      unmatched.set(text, (unmatched.get(text) ?? 0) + 1);
    }
    /** Matches an input element to an equal output one; false when none is left. */
    const match = (el: XmlElement) => {
      const text = inXml.slice(el.start, el.end);
      const n = unmatched.get(text) ?? 0;
      if (n > 0) unmatched.set(text, n - 1);
      return n > 0;
    };
    const detail = (el: XmlElement) => `${part} #${ownId(el) ?? el.name}`;
    // Elements that stay first, so one equal to a covering background is never taken for it.
    for (const el of inEls.filter((e) => !covering.has(e.start))) {
      if (!match(el)) violations.push({ property: "element-missing", detail: detail(el) });
    }
    for (const el of inEls.filter((e) => covering.has(e.start))) {
      if (match(el)) violations.push({ property: "covering-background-kept", detail: detail(el) });
    }

    const missingTargets = (root: XmlElement, els: XmlElement[]) => {
      const shapes = new Set(els.flatMap(shapeIdsIn));
      return [...new Set(animationTargets(root))]
        .filter((id) => !shapes.has(id))
        .map((id) => ({ property: "animation-target-missing", detail: `${part} spid ${id}` }));
    };
    violations.push(...notInherited(missingTargets(outRoot, outEls), missingTargets(inRoot, inEls)));
  }
  return violations;
}

/** An element's own shape id. */
const ownId = (el: XmlElement): string | undefined => shapeIdsIn(el)[0];

async function preparationViolations(
  before: PptxPackage,
  request: PptBackgroundRequest,
): Promise<Violation[]> {
  const header = readImageHeader(request.background);
  if (!header || header.format === "webp") {
    return [{ property: "background-format", detail: header ? header.format : "unreadable" }];
  }
  const [width, height] = displayedSize(header);
  const slide = await slideSize(before);
  const ratio = slide.w / slide.h;
  const violations: Violation[] = [];

  // Unknown (a source that is not a readable PNG) proves nothing, so only a
  // source certainly using alpha counts.
  if (header.format === "jpeg" && (await pngAlphaUsed(request.source)) === true) {
    violations.push({ property: "background-format", detail: "JPEG from a source whose alpha is used" });
  }

  if (Math.abs(width - height * ratio) > 1 || Math.abs(height - width / ratio) > 1) {
    violations.push({
      property: "background-aspect",
      detail: `${width} × ${height} for a ${slide.w} × ${slide.h} slide`,
    });
  }

  const [maxW, maxH] = slide.h > slide.w ? [2160, 3840] : [3840, 2160];
  if (width > maxW || height > maxH) {
    violations.push({ property: "background-cap", detail: `${width} × ${height} > ${maxW} × ${maxH}` });
  }

  // The crop the picture came from: the one given, or the centred, largest
  // rectangle of the slide's aspect, which may round by half a pixel.
  let crop: { width: number; height: number } | null = request.crop ?? null;
  let roundingSlack = 0;
  if (!crop) {
    const source = readImageHeader(request.source);
    if (source) {
      const [w, h] = displayedSize(source);
      crop = { width: Math.min(w, h * ratio), height: Math.min(h, w / ratio) };
      roundingSlack = 0.5;
    }
  }
  if (!crop) {
    violations.push({ property: "background-not-upscaled", detail: "source size unreadable" });
  } else if (width > crop.width + roundingSlack || height > crop.height + roundingSlack) {
    violations.push({
      property: "background-not-upscaled",
      detail: `${width} × ${height} > crop ${crop.width} × ${crop.height}`,
    });
  }
  return violations;
}
