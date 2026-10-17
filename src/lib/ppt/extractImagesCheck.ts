import type { OutputChecker, Violation } from "@/lib/output-check/core";
import { type PictureFormat, readPictureFormat } from "@/lib/output-check/pictureFormat";
import { sameBytes } from "@/lib/output-check/sameBytes";
import { openZip, type ZipReader } from "@/lib/output-check/zipReader";
import type { ExtractedImage } from "./extractImages";
import { getExt, isImageMediaPath } from "./pptImageFormats";

/** A compound file (the binary .ppt container) starts with this signature. */
const CFB_SIGNATURE = [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1];

/**
 * Whether the input is a binary .ppt. The engine picks its reader by file
 * name, but each reader fails on the other container, so whenever the
 * engine produced a result the signature agrees with its pick.
 */
const isBinaryPpt = (input: Uint8Array) => CFB_SIGNATURE.every((b, i) => input[i] === b);

const baseName = (path: string) => path.slice(path.lastIndexOf("/") + 1);

/**
 * The input deck, read with the checker's own zip reader rather than the
 * JSZip instance the engine used. Throws when it cannot be read: the engine
 * just read it, so that is a checker gap, not a defect of the result.
 */
async function openDeck(input: Uint8Array): Promise<ZipReader> {
  const zip = await openZip(input);
  if (!zip) throw new Error("cannot read the input deck as a zip");
  return zip;
}

/**
 * Each extracted file against the part it was copied from, matched by name
 * (the engine names a file after its part) in archive order.
 */
async function checkCopies(
  deck: ZipReader,
  sourceParts: string[],
  images: ExtractedImage[],
): Promise<Violation[]> {
  const partsByName = new Map<string, string[]>();
  for (const part of sourceParts) {
    const name = baseName(part);
    partsByName.set(name, [...(partsByName.get(name) ?? []), part]);
  }
  const violations: Violation[] = [];
  for (const image of images) {
    if (!image) continue; // counted at quick depth
    const part = partsByName.get(image.name)?.shift();
    const source = part ? await deck.bytes(part) : null;
    if (!source) {
      violations.push({ property: "bytes-identical", detail: `${image.name}: no source part` });
    } else if (!sameBytes(image.data, source)) {
      violations.push({
        property: "bytes-identical",
        detail: `${image.name}: ${image.data.length} bytes differ from ${part} (${source.length} bytes)`,
      });
    }
  }
  return violations;
}

/**
 * The format each extension the .ppt reader names its files with stands
 * for: one per picture type the .ppt format stores (the reader does not
 * carve WMF out today, but the property covers it).
 */
const FORMAT_OF_EXTENSION: Record<string, PictureFormat> = {
  jpg: "jpeg",
  png: "png",
  emf: "emf",
  wmf: "wmf",
  bmp: "bmp",
  tiff: "tiff",
};

/**
 * Each file carved out of a .ppt holds the format its extension names.
 * Throws on an extension with no rule: the .ppt reader writes none, so
 * that is a checker gap.
 */
function checkHeaders(images: ExtractedImage[]): Violation[] {
  const violations: Violation[] = [];
  for (const image of images) {
    const expected = FORMAT_OF_EXTENSION[getExt(image.name)];
    if (!expected) throw new Error(`no header rule for ${image.name}`);
    const found = readPictureFormat(image.data);
    if (found !== expected) {
      violations.push({
        property: "image-header",
        detail: `${image.name}: expected ${expected}, got ${found ?? "unreadable bytes"}`,
      });
    }
  }
  return violations;
}

/**
 * ppt-extract output properties (spec #51, confirmed in #60). ⚡ = also at
 * `quick`.
 *
 * .pptx, whose parts are copied as they are:
 * - ⚡ `image-count`: one file per image part under `ppt/media/`. "Image
 *   part" is the tool's own rule (`isImageMediaPath`): a part type the tool
 *   does not offer is out of its scope, not a defect of the result, so an
 *   independent rule would block decks that extract correctly today. What
 *   the count catches is a part lost between selecting and reading it.
 * - `bytes-identical`: each file is byte-identical to its part. No header
 *   check: a part whose bytes do not match its extension came that way in
 *   the deck (an input defect), and the copy keeps it.
 *
 * .ppt, whose pictures the tool carves out of the binary:
 * - ⚡ `image-header`: each file's header is the format its extension names
 *   (EMF, WMF, JPEG, PNG, BMP, TIFF). At least one file is the engine's own
 *   guarantee (it reports "no images" otherwise); the confirmed .ppt
 *   properties hold no count.
 *
 * No size bound: each file is a copy or a slice of the input's bytes.
 */
export const checkPptExtract: OutputChecker<Uint8Array, void, ExtractedImage[]> = async (
  input,
  _request,
  images,
  depth,
) => {
  if (isBinaryPpt(input)) return checkHeaders(images);

  const deck = await openDeck(input);
  const sourceParts = deck.names.filter(isImageMediaPath);
  const violations: Violation[] = [];

  // A sparse array's holes are files the engine never produced.
  const present = images.filter(Boolean).length;
  if (present !== sourceParts.length) {
    violations.push({
      property: "image-count",
      detail: `${sourceParts.length} image parts → ${present} files`,
    });
  }
  if (depth === "full") violations.push(...(await checkCopies(deck, sourceParts, images)));
  return violations;
};
