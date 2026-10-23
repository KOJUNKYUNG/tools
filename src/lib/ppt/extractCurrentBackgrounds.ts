import JSZip from "jszip";
import type { SlideSize } from "@/lib/image/slideImage";
import { parseRelationships } from "@/lib/output-check/pptxPackage";
import { coveringGroupKey, findCoveringBackgrounds } from "./coveringBackgrounds";
import { fillChild, shownFill, type Colours, type Swatch } from "./fills";
import { slideSizeFromXml } from "./getSlideAspect";
import { slideColours, zipPartReader, type PartReader } from "./slideColours";
import { child, parseXml } from "./xmlTree";

/**
 * A slide's visible background (CONTEXT.md): its covering backgrounds when it
 * has any, else its own background, its layout's or its master's.
 */
export interface SlideBackground {
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

/** The slide's covering backgrounds as its visible background; null when it has none. */
async function coveringBackground(
  zip: JSZip,
  slidePath: string,
  slideXml: string,
  slide: SlideSize,
  colours: Colours,
): Promise<Pick<SlideBackground, "imageBlob" | "imagePath" | "swatch" | "coveringKey"> | null> {
  const covering = findCoveringBackgrounds(slideXml, slide, colours);
  if (covering.length === 0) return null;
  const targets = await relationshipTargets(zip, slidePath);
  const pictures = covering.flatMap((c) => c.pictures);
  const thumbnail = pictures.flatMap((id) => targets.get(id) ?? [])[0] ?? null;
  return {
    imageBlob: thumbnail === null ? null : await mediaBlob(zip, thumbnail),
    imagePath: thumbnail,
    // A fill under a covering picture is hidden by it: the picture shows.
    ...(pictures.length === 0 && { swatch: covering[0].fills[0] }),
    coveringKey: coveringGroupKey(covering, (id) => targets.get(id)),
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

export async function extractCurrentBackgrounds(
  file: File,
): Promise<SlideBackground[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
      slideFiles.push(path);
    }
  });

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
    return numA - numB;
  });

  const presXml = await zip.file("ppt/presentation.xml")?.async("text");
  const slideSize = (presXml && slideSizeFromXml(presXml)) || { w: 12192000, h: 6858000 };
  const results: SlideBackground[] = [];
  const reader: PartReader = zipPartReader(zip);
  const coloursOf = slideColours(reader);

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideXml = await zip.file(slidePath)!.async("text");
    const slideNum = parseInt(slidePath.match(/slide(\d+)/)?.[1] ?? `${i + 1}`);

    const bg: SlideBackground = {
      slideIndex: i + 1,
      slideName: `슬라이드 ${slideNum}`,
      imageBlob: null,
      source: "none",
      imagePath: null,
    };

    // The slide's colours resolve its layout's and master's backgrounds too: they show on it.
    const colours = await coloursOf(slidePath, slideXml);
    const covering = await coveringBackground(zip, slidePath, slideXml, slideSize, colours);
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
