import JSZip from "jszip";
import type { SlideSize } from "@/lib/image/slideImage";
import { parseRelationships } from "@/lib/output-check/pptxPackage";
import { coveringGroupKey, findCoveringBackgrounds } from "./coveringBackgrounds";
import { slideSizeFromXml } from "./getSlideAspect";

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
   * covering backgrounds, the bottom-most one's (first) picture, the
   * thumbnail. null when source==="none".
   */
  imagePath: string | null;
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

/** The first part `partPath` relates to by this relationship type (the URI's last segment). */
async function relatedPart(zip: JSZip, partPath: string, type: string): Promise<string | null> {
  return (await relationshipsOf(zip, partPath)).find((r) => r.type.endsWith(`/${type}`))?.part ?? null;
}

/** The slide's covering backgrounds as its visible background; null when it has none. */
async function coveringBackground(
  zip: JSZip,
  slidePath: string,
  slideXml: string,
  slide: SlideSize,
): Promise<Pick<SlideBackground, "imageBlob" | "imagePath" | "coveringKey"> | null> {
  const covering = findCoveringBackgrounds(slideXml, slide);
  if (covering.length === 0) return null;
  const targets = await relationshipTargets(zip, slidePath);
  const thumbnail = covering[0].pictures.flatMap((id) => targets.get(id) ?? [])[0] ?? null;
  return {
    imageBlob: thumbnail === null ? null : await mediaBlob(zip, thumbnail),
    imagePath: thumbnail,
    coveringKey: coveringGroupKey(covering, (id) => targets.get(id)),
  };
}

/** The picture of a part's own background; null when it declares none, or no picture. */
async function backgroundPicture(
  zip: JSZip,
  partPath: string,
  partXml: string,
): Promise<{ blob: Blob; path: string } | null> {
  const bg = partXml.match(/<p:bg[\s>][\s\S]*?<\/p:bg>/)?.[0];
  const relId = bg?.match(/r:embed="([^"]+)"/)?.[1];
  if (!relId) return null;
  const path = (await relationshipTargets(zip, partPath)).get(relId);
  if (!path) return null;
  const blob = await mediaBlob(zip, path);
  return blob && { blob, path };
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

    const covering = await coveringBackground(zip, slidePath, slideXml, slideSize);
    if (covering) {
      results.push({ ...bg, ...covering, source: "covering" });
      continue;
    }

    // Its own background, else the layout's, else the master's.
    const layoutPath = await relatedPart(zip, slidePath, "slideLayout");
    const masterPath = layoutPath && (await relatedPart(zip, layoutPath, "slideMaster"));
    const chain: [SlideBackground["source"], string | null][] = [
      ["slide", slidePath],
      ["layout", layoutPath],
      ["master", masterPath],
    ];
    for (const [source, partPath] of chain) {
      const partXml = partPath && (await zip.file(partPath)?.async("text"));
      const picture = partXml && (await backgroundPicture(zip, partPath, partXml));
      if (picture) {
        Object.assign(bg, { imageBlob: picture.blob, imagePath: picture.path, source });
        break;
      }
    }

    results.push(bg);
  }

  return results;
}
