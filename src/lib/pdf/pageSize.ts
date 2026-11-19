// image-to-pdf's page size setting (CONTEXT "Page size"): a preset, image fit
// or a custom size in millimetres, and the page box each picture gets from
// it. Pure, so the engine and the editor cards share one rule.

export const PT_PER_MM = 72 / 25.4;
const PT_PER_IN = 72;

/** PDF's largest page side, 200 in (PDF 1.7, Annex C). */
export const MAX_PAGE_PT = 200 * PT_PER_IN;
export const MAX_PAGE_MM = MAX_PAGE_PT / PT_PER_MM;
/** The smallest custom side the tool takes. */
export const MIN_PAGE_MM = 1;

export const PRINT_PRESETS = ["a3", "a4", "a5", "b4", "b5", "letter"] as const;
export const SCREEN_PRESETS = ["16:9", "4:3"] as const;
export const PAGE_PRESETS = [...PRINT_PRESETS, ...SCREEN_PRESETS] as const;
export type PagePreset = (typeof PAGE_PRESETS)[number];

export type PageSize =
  | { kind: "preset"; preset: PagePreset }
  | { kind: "image-fit" }
  | { kind: "custom"; widthMm: number; heightMm: number };

/**
 * Each preset's size in points, as it is listed: paper portrait, screens
 * landscape. B sizes are the JIS ones Korean copiers use; the screens are
 * PowerPoint's default slides (13.333 × 7.5 in and 10 × 7.5 in), whose
 * 12192000 EMU width is 960 pt exactly.
 */
const PRESET_PT: Record<PagePreset, { width: number; height: number }> = {
  a3: { width: 297 * PT_PER_MM, height: 420 * PT_PER_MM },
  a4: { width: 210 * PT_PER_MM, height: 297 * PT_PER_MM },
  a5: { width: 148 * PT_PER_MM, height: 210 * PT_PER_MM },
  b4: { width: 257 * PT_PER_MM, height: 364 * PT_PER_MM },
  b5: { width: 182 * PT_PER_MM, height: 257 * PT_PER_MM },
  letter: { width: 8.5 * PT_PER_IN, height: 11 * PT_PER_IN },
  "16:9": { width: 960, height: 7.5 * PT_PER_IN },
  "4:3": { width: 10 * PT_PER_IN, height: 7.5 * PT_PER_IN },
};

/** A preset's size in millimetres, as listed (paper portrait, screens landscape). */
export function presetSizeMm(preset: PagePreset): { widthMm: number; heightMm: number } {
  const { width, height } = PRESET_PT[preset];
  return { widthMm: width / PT_PER_MM, heightMm: height / PT_PER_MM };
}

/** A custom side in millimetres, held within what the tool and a PDF allow. */
export function clampPageMm(mm: number): number {
  if (!Number.isFinite(mm)) return MIN_PAGE_MM;
  return Math.min(MAX_PAGE_MM, Math.max(MIN_PAGE_MM, mm));
}

/**
 * The page box, in points, a picture shown `shownW`×`shownH` gets under a
 * preset or custom size (null under image fit, where the page is the
 * picture). "Shown" is after its EXIF orientation and the user's turn. The
 * page turns to the picture: a landscape picture gets the long side across,
 * a portrait one the long side up; a square one keeps the size as listed.
 */
export function pageBoxPt(
  pageSize: PageSize,
  shownW: number,
  shownH: number,
): { width: number; height: number } | null {
  if (pageSize.kind === "image-fit") return null;
  const listed =
    pageSize.kind === "preset"
      ? PRESET_PT[pageSize.preset]
      : {
          width: clampPageMm(pageSize.widthMm) * PT_PER_MM,
          height: clampPageMm(pageSize.heightMm) * PT_PER_MM,
        };
  const long = Math.max(listed.width, listed.height);
  const short = Math.min(listed.width, listed.height);
  if (shownW > shownH) return { width: long, height: short };
  if (shownW < shownH) return { width: short, height: long };
  return listed;
}
