import JSZip from "jszip";
import { parseRelationships } from "@/lib/output-check/pptxPackage";
import type { Bounds, GraphicKind } from "./coveringBackgrounds";
import { plannedSlide, type PlannedSlide } from "./coveringPlan";
import { readSlideStacks, type SlideStack } from "./slideStacks";
import { fillChild, shownFill, type Colours, type Swatch } from "./fills";
import { DEFAULT_SLIDE, slideSizeFromXml } from "./getSlideAspect";
import type { SlideSize } from "@/lib/image/slideImage";
import { zipPartReader, type PartReader } from "./slideColours";
import { noBackgroundSwatch } from "./themeBackground";
import { child, parseXml } from "./xmlTree";
import { slidesInOrder } from "./zipSlides";

/** A background piece (CONTEXT.md → Background piece) as the picker lists it. */
export interface PiecePreview {
  /** What the user picks it by (`pieceKey`): picking it picks it on every slide that has it. */
  key: string;
  /** Its first picture part from the bottom, as a zip path (load it with `deckMedia`); null for a fill. */
  imagePath: string | null;
  /** What a piece without a picture shows: its first fill's colour, or the neutral `fill`. */
  swatch: Swatch | null;
  /** Its box before its turn, as fractions of the slide's width and height (may reach past the slide). */
  box: Bounds;
  /** Its turn about the box's centre, clockwise, in degrees. */
  rotation: number;
  /** The share of the slide's area it covers, 0…1. */
  share: number;
}

/** A background graphic (CONTEXT.md → Background graphics) as the picker lists it: it goes unless the user keeps it. */
export interface GraphicPreview {
  /** What the user keeps it by (`graphicKey`): keeping it keeps it on every slide that shows it. */
  key: string;
  kind: GraphicKind;
  /** Its first picture part from the bottom, as a zip path (load it with `deckMedia`); null without one. */
  imagePath: string | null;
  /** What it shows without a picture: its first fill's colour; null for none. */
  swatch: Swatch | null;
  /** Its box before its turn, as fractions of the slide, its turn in degrees and its share of the slide; null when unknown. */
  place: { box: Bounds; rotation: number; share: number } | null;
  /** Whether it lies under the slide's covering background, so does not show today. */
  underCovering: boolean;
}

/**
 * A slide's visible background (CONTEXT.md): its covering backgrounds when it
 * has any, else its own background, its layout's or its master's.
 */
export interface SlideBackground {
  /** 1-based, in presentation order: the number the user picks the slide by. */
  slideIndex: number;
  slideName: string;
  imageBlob: Blob | null;
  source: "covering" | "slide" | "layout" | "master" | "none";
  /**
   * Resolved zip path of the background image part — the dedup key; for
   * covering backgrounds, their first picture from the bottom, the
   * thumbnail. null when it shows no picture.
   */
  imagePath: string | null;
  /**
   * What a background without a picture shows: a solid background's colour,
   * a neutral swatch for a gradient or pattern; for covering backgrounds
   * without any picture, the bottom-most one's first opaque fill.
   */
  swatch?: Swatch;
  /** For covering backgrounds: their group's key (`coveringGroupKey`), what the user keeps a group by. */
  coveringKey?: string;
  /**
   * For covering backgrounds: where the one shown lies (the thumbnail's, or
   * the bottom one without a picture), as fractions of the slide's width and
   * height, and the share of the slide it covers.
   */
  coveringPlace?: { box: Bounds; share: number };
  /** Its stack as the shared plan (`coveringPlan`) reads it: what the preview promises for the apply scope. */
  stack: PlannedSlide;
  /** The colour "no background" would show on it (`noBackgroundSwatch`): its own master's, not the deck's first. */
  noBackground: Swatch;
  /** Its background pieces, bottom first. */
  pieces: PiecePreview[];
  /** Its background graphics, bottom first: on its master and layout, under its own elements. */
  graphics: GraphicPreview[];
}

const MIME_BY_EXT: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  bmp: "image/bmp",
  svg: "image/svg+xml",
  emf: "image/x-emf",
  wmf: "image/x-wmf",
};

async function mediaBlob(zip: JSZip, path: string): Promise<Blob | null> {
  const file = zip.file(path);
  if (!file) return null;
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return new Blob([await file.async("arraybuffer")], { type: MIME_BY_EXT[ext] ?? "application/octet-stream" });
}

interface PartRelationship {
  id: string;
  type: string;
  /** The target as a zip path. */
  part: string;
}

/** A part's internal relationships, read whatever order their attributes come in. */
async function relationshipsOf(zip: JSZip, partPath: string): Promise<PartRelationship[]> {
  const slash = partPath.lastIndexOf("/");
  const dir = partPath.slice(0, slash);
  const relsXml = await zip.file(`${dir}/_rels/${partPath.slice(slash + 1)}.rels`)?.async("text");
  return parseRelationships(relsXml ?? "", dir).flatMap(({ id, type, part }) =>
    id && part !== null ? [{ id, type, part }] : [],
  );
}

/** The internal relationship targets of a part, by id, as zip paths. */
async function relationshipTargets(zip: JSZip, partPath: string): Promise<Map<string, string>> {
  return new Map((await relationshipsOf(zip, partPath)).map((r) => [r.id, r.part]));
}

/** Bounds as fractions of the slide's width and height. */
const fractionOf = (b: Bounds, slide: SlideSize): Bounds => ({ x: b.x / slide.w, y: b.y / slide.h, w: b.w / slide.w, h: b.h / slide.h });

/**
 * The slide's covering backgrounds as its visible background, wherever in its
 * stack they lie (a master's picture included); null when it has none.
 */
async function coveringBackground(
  zip: JSZip,
  stack: SlideStack,
  slide: SlideSize,
): Promise<Pick<SlideBackground, "imageBlob" | "imagePath" | "swatch" | "coveringKey" | "coveringPlace"> | null> {
  const { covering, coveringKey, coveringPictures } = stack;
  if (covering.length === 0 || coveringKey === null) return null;
  const thumbnail = coveringPictures[0] ?? null;
  const shown = covering.find((c) => c.pictures.length > 0) ?? covering[0];
  return {
    coveringPlace: { box: fractionOf(shown.bounds, slide), share: shown.share },
    imageBlob: thumbnail === null ? null : await mediaBlob(zip, thumbnail),
    imagePath: thumbnail,
    // A fill under a covering background's picture is hidden by it: the picture shows.
    ...(covering.every((c) => c.pictures.length === 0) && { swatch: covering[0].fills[0] }),
    coveringKey,
  };
}

/**
 * What a part's own background shows: its picture, or a swatch of its fill
 * (its own, or the theme's background style it names); neither when it shows
 * nothing readable. null when the part declares no background.
 */
async function ownBackground(
  zip: JSZip,
  partPath: string,
  partXml: string,
  colours: Colours,
): Promise<Pick<SlideBackground, "imageBlob" | "imagePath" | "swatch"> | null> {
  const bg = child(child(parseXml(partXml) ?? undefined, "p:cSld"), "p:bg");
  if (!bg) return null;
  const fill = fillChild(child(bg, "p:bgPr"));
  const relId = fill?.name === "a:blipFill" ? child(fill, "a:blip")?.attrs["r:embed"] : undefined;
  if (relId) {
    const path = (await relationshipTargets(zip, partPath)).get(relId) ?? null;
    const blob = path && (await mediaBlob(zip, path));
    return blob ? { imageBlob: blob, imagePath: path } : { imageBlob: null, imagePath: null };
  }
  const shown = shownFill(child(bg, "p:bgPr"), child(bg, "p:bgRef"), colours);
  return { imageBlob: null, imagePath: null, ...(shown && { swatch: shown.swatch }) };
}

/**
 * The deck's media as blobs, by zip path, the deck read once on the first
 * call: the picker loads a piece's picture only when its slide is shown.
 */
export function deckMedia(file: File): (path: string) => Promise<Blob | null> {
  let zip: Promise<JSZip> | null = null;
  return async (path) => mediaBlob(await (zip ??= file.arrayBuffer().then((b) => JSZip.loadAsync(b))), path);
}

export async function extractCurrentBackgrounds(
  file: File,
): Promise<SlideBackground[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  // Numbered as PowerPoint shows them: the engine reads the user's slide numbers in this order.
  const slideFiles = await slidesInOrder(zip);

  const presXml = await zip.file("ppt/presentation.xml")?.async("text");
  const slideSize = (presXml && slideSizeFromXml(presXml)) || DEFAULT_SLIDE;
  const results: SlideBackground[] = [];
  const reader: PartReader = zipPartReader(zip);
  const stacks = await readSlideStacks(reader, slideFiles, slideSize);

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    // The slide's colours resolve its layout's and master's backgrounds too: they show on it.
    const { colours } = stacks[i];

    const bg: SlideBackground = {
      slideIndex: i + 1,
      slideName: `슬라이드 ${i + 1}`,
      imageBlob: null,
      source: "none",
      imagePath: null,
      stack: plannedSlide(stacks[i]),
      noBackground: noBackgroundSwatch(colours),
      pieces: stacks[i].pieces.map(({ key, pictureParts, fills, bounds, rot, share }) => ({
        key,
        imagePath: pictureParts[0] ?? null,
        swatch: pictureParts.length > 0 ? null : (fills[0] ?? null),
        box: fractionOf(bounds, slideSize),
        rotation: rot / 60000,
        share,
      })),
      graphics: stacks[i].graphics.map(({ key, kind, pictureParts, fills, area, underCovering }) => ({
        key,
        kind,
        imagePath: pictureParts[0] ?? null,
        swatch: pictureParts.length > 0 ? null : (fills[0] ?? null),
        place: area && { box: fractionOf(area.box, slideSize), rotation: area.rot / 60000, share: area.share },
        underCovering,
      })),
    };

    const covering = await coveringBackground(zip, stacks[i], slideSize);
    if (covering) {
      results.push({ ...bg, ...covering, source: "covering" });
      continue;
    }

    // Its own background, else the layout's, else the master's: the first
    // that declares one, whatever it shows.
    const layoutPath = await reader.related(slidePath, "slideLayout");
    const masterPath = layoutPath && (await reader.related(layoutPath, "slideMaster"));
    const chain: [SlideBackground["source"], string | null][] = [
      ["slide", slidePath],
      ["layout", layoutPath],
      ["master", masterPath],
    ];
    for (const [source, partPath] of chain) {
      const partXml = partPath && (await zip.file(partPath)?.async("text"));
      const own = partXml ? await ownBackground(zip, partPath, partXml, colours) : null;
      if (own) {
        if (own.imagePath || own.swatch) Object.assign(bg, own, { source });
        break;
      }
    }

    results.push(bg);
  }

  return results;
}
