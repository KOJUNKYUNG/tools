import JSZip from "jszip";
import { runOutputCheck } from "@/lib/output-check/core";
import { zipCompressionMethods } from "@/lib/output-check/zipReader";
import { checkPptBackground } from "./changeBackgroundCheck";

export type BgMode = "all-slides" | "master" | "specific-slides";

export interface ChangeBackgroundOptions {
  pptxFile: File;
  bgImage: File;
  mode: BgMode;
  /** 1-based slide indices. Required when mode === "specific-slides". */
  targetSlides?: number[];
  onProgress?: (pct: number) => void;
}

/**
 * Pick a `ppt/media/background_custom*.ext` name that does not already exist in
 * the deck. A fixed name (`background_custom.png`) would OVERWRITE the media a
 * previous run embedded, so re-applying a background silently changed every
 * slide that still referenced the old file — not just the newly targeted ones.
 * A collision-free name keeps earlier backgrounds intact. Exported for testing.
 */
export function uniqueMediaName(zip: JSZip, ext: string): string {
  const base = "background_custom";
  let candidate = `${base}.${ext}`;
  let i = 1;
  while (zip.file(`ppt/media/${candidate}`)) {
    candidate = `${base}_${i}.${ext}`;
    i++;
  }
  return candidate;
}

function getExtension(file: File): string {
  const name = file.name.toLowerCase();
  if (name.endsWith(".png")) return "png";
  if (name.endsWith(".jpg") || name.endsWith(".jpeg")) return "jpeg";
  return "png";
}

function getContentType(ext: string): string {
  if (ext === "jpeg") return "image/jpeg";
  return "image/png";
}

/**
 * Generate a relationship ID that doesn't conflict with existing ones.
 */
function nextRelId(relsXml: string): string {
  const matches = relsXml.matchAll(/Id="rId(\d+)"/g);
  let max = 0;
  for (const m of matches) {
    const n = parseInt(m[1], 10);
    if (n > max) max = n;
  }
  return `rId${max + 1}`;
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/**
 * Every attribute value in the part's declared `<p:bg>`: the candidates for
 * the relationship ids it uses (`r:embed`, `r:link`, an SVG blip's id), under
 * whatever prefix the part binds. Values that are not relationship ids match
 * no relationship and are ignored.
 */
function backgroundValues(partXml: string): Set<string> {
  const bg = partXml.match(/<p:bg[\s>][\s\S]*?<\/p:bg>/)?.[0] ?? "";
  return new Set([...bg.matchAll(/=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => m[1] ?? m[2]));
}

/** Whether any attribute in the part names this relationship id. */
function namesRelId(partXml: string, id: string): boolean {
  return new RegExp(`=\\s*["']${escapeRegExp(id)}["']`).test(partXml);
}

const RELATIONSHIP = /<Relationship\b[^>]*?(?:\/>|>[\s\S]*?<\/Relationship>)/g;

function relAttr(rel: string, name: string): string | undefined {
  const m = rel.match(new RegExp(`\\b${name}\\s*=\\s*(?:"([^"]*)"|'([^']*)')`));
  return m ? (m[1] ?? m[2]) : undefined;
}

/**
 * Resolve an internal relationship target against the directory of its
 * source part, as a zip part name. Null for an external target, or one that
 * escapes the package.
 */
function relTargetPart(rel: string, sourceDir: string): string | null {
  const target = relAttr(rel, "Target");
  if (!target || relAttr(rel, "TargetMode") === "External") return null;
  let bare = target.split("#")[0];
  try {
    bare = decodeURIComponent(bare);
  } catch {
    // Keep the raw name: a part may legitimately contain a stray "%".
  }
  const segments = bare.startsWith("/") || sourceDir === "" ? [] : sourceDir.split("/");
  for (const seg of bare.replace(/^\/+/, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(seg);
    }
  }
  return segments.join("/");
}

/**
 * Remove the relationship with this id; returns the new XML and the part it
 * pointed at (null when internal resolution fails or the id is absent).
 */
function removeRelationship(
  relsXml: string,
  id: string,
  sourceDir: string,
): { xml: string; target: string | null } {
  let target: string | null = null;
  const xml = relsXml.replace(RELATIONSHIP, (rel) => {
    if (relAttr(rel, "Id") !== id) return rel;
    target = relTargetPart(rel, sourceDir);
    return "";
  });
  return { xml, target };
}

function addRelationship(
  relsXml: string,
  id: string,
  target: string,
): string {
  const rel =
    `<Relationship Id="${id}" ` +
    `Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
    `Target="${target}"/>`;

  return relsXml.replace("</Relationships>", `${rel}\n</Relationships>`);
}

function ensureRelsFile(
  zip: JSZip,
  slideDir: string,
  slideFileName: string,
): { path: string; xml: string } {
  const relsPath = `${slideDir}/_rels/${slideFileName}.rels`;
  const existing = zip.file(relsPath);

  if (existing) {
    return { path: relsPath, xml: "" };
  }

  const emptyRels =
    '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
    '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
    "</Relationships>";
  return { path: relsPath, xml: emptyRels };
}

interface FillRectOffsets {
  l: number;
  t: number;
  r: number;
  b: number;
}

/**
 * Calculate fillRect offsets for "cover" behavior (aspect-ratio preserving).
 * Offsets are in OOXML percentage units (100000 = 100%).
 * Negative values extend the fill beyond the shape boundary → crop effect.
 */
function calcCoverOffsets(
  imgW: number,
  imgH: number,
  slideW: number,
  slideH: number,
): FillRectOffsets {
  const imgRatio = imgW / imgH;
  const slideRatio = slideW / slideH;

  if (Math.abs(imgRatio - slideRatio) < 0.001) {
    return { l: 0, t: 0, r: 0, b: 0 };
  }

  if (imgRatio > slideRatio) {
    const offset = Math.round(((imgRatio / slideRatio - 1) / 2) * 100000);
    return { l: -offset, t: 0, r: -offset, b: 0 };
  }

  const offset = Math.round(((slideRatio / imgRatio - 1) / 2) * 100000);
  return { l: 0, t: -offset, r: 0, b: -offset };
}

function buildFillRectAttr(offsets: FillRectOffsets): string {
  const parts: string[] = [];
  if (offsets.l !== 0) parts.push(`l="${offsets.l}"`);
  if (offsets.t !== 0) parts.push(`t="${offsets.t}"`);
  if (offsets.r !== 0) parts.push(`r="${offsets.r}"`);
  if (offsets.b !== 0) parts.push(`b="${offsets.b}"`);
  if (parts.length === 0) return "<a:fillRect/>";
  return `<a:fillRect ${parts.join(" ")}/>`;
}

/**
 * Insert or replace <p:bg> inside <p:cSld>.
 */
function setBackground(
  slideXml: string,
  relId: string,
  fillOffsets: FillRectOffsets,
): string {
  const fillRect = buildFillRectAttr(fillOffsets);
  const bgXml =
    `<p:bg><p:bgPr>` +
    `<a:blipFill dpi="0" rotWithShape="1">` +
    `<a:blip r:embed="${relId}"/>` +
    `<a:stretch>${fillRect}</a:stretch>` +
    `</a:blipFill>` +
    `<a:effectLst/>` +
    `</p:bgPr></p:bg>`;

  const bgPattern = /<p:bg[\s>][\s\S]*?<\/p:bg>/;
  if (bgPattern.test(slideXml)) {
    return slideXml.replace(bgPattern, bgXml);
  }

  const cSldMatch = slideXml.match(/<p:cSld[^>]*>/);
  if (!cSldMatch) {
    throw new Error("슬라이드에서 <p:cSld> 요소를 찾을 수 없습니다.");
  }
  const insertPos = (cSldMatch.index ?? 0) + cSldMatch[0].length;
  return (
    slideXml.slice(0, insertPos) + bgXml + slideXml.slice(insertPos)
  );
}

function ensureNamespaces(xml: string): string {
  const rootMatch = xml.match(/<[a-zA-Z0-9:]+/);
  if (!rootMatch) return xml;

  const rootTagEnd = xml.indexOf(">", rootMatch.index!);
  const rootSection = xml.slice(rootMatch.index!, rootTagEnd);

  let result = xml;

  if (!rootSection.includes('xmlns:a=')) {
    result = result.replace(
      rootMatch[0],
      `${rootMatch[0]} xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"`,
    );
  }
  if (!rootSection.includes('xmlns:r=')) {
    result = result.replace(
      rootMatch[0],
      `${rootMatch[0]} xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`,
    );
  }

  return result;
}

/**
 * Extract the trailing integer from a slide-like filename
 * (e.g. "ppt/slides/slide12.xml" → 12, "ppt/slideMasters/slideMaster3.xml" → 3).
 * Falls back to 0 if no match — sorted-stable for non-conforming names.
 */
function slideOrdinal(path: string): number {
  const m = path.match(/(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 0;
}

async function processSlideGroup(
  zip: JSZip,
  dir: string,
  mediaTarget: string,
  fillOffsets: FillRectOffsets,
  onEach?: (done: number, total: number) => void,
  /** 1-based whitelist over the slide order (sorted by trailing integer in the
   *  filename — matches extractCurrentBackgrounds). Undefined = all. */
  targetIndices1Based?: ReadonlySet<number>,
): Promise<Set<string>> {
  /** Parts the replaced backgrounds pointed at, to delete once unreferenced. */
  const replaced = new Set<string>();
  const pattern = new RegExp(`^${dir}/[^/]+\\.xml$`);
  const slideFiles: string[] = [];

  zip.forEach((path) => {
    if (pattern.test(path)) slideFiles.push(path);
  });

  slideFiles.sort((a, b) => slideOrdinal(a) - slideOrdinal(b));

  const filtered = targetIndices1Based
    ? slideFiles
        .map((p, i) => ({ p, ord: i + 1 }))
        .filter((entry) => targetIndices1Based.has(entry.ord))
        .map((entry) => entry.p)
    : slideFiles;

  for (let i = 0; i < filtered.length; i++) {
    const slidePath = filtered[i];
    const slideFileName = slidePath.split("/").pop()!;
    let slideXml = await zip.file(slidePath)!.async("text");

    slideXml = ensureNamespaces(slideXml);

    const { path: relsPath, xml: emptyRels } = ensureRelsFile(
      zip,
      dir,
      slideFileName,
    );
    let relsXml =
      emptyRels || (await zip.file(relsPath)!.async("text"));

    // Taken before the old relationship is removed, so an id is never reused.
    const relId = nextRelId(relsXml);
    relsXml = addRelationship(relsXml, relId, mediaTarget);

    const oldIds = backgroundValues(slideXml);
    slideXml = setBackground(slideXml, relId, fillOffsets);

    // Drop the replaced background's relationships (its picture, plus any
    // SVG or linked variant), or their images stay embedded and the deck
    // grows on every re-application. A part that still names an id elsewhere
    // (the same image as a picture) keeps it.
    for (const oldId of oldIds) {
      if (oldId === relId || namesRelId(slideXml, oldId)) continue;
      const removed = removeRelationship(relsXml, oldId, dir);
      relsXml = removed.xml;
      if (removed.target) replaced.add(removed.target);
    }

    zip.file(relsPath, relsXml);
    zip.file(slidePath, slideXml);

    onEach?.(i + 1, filtered.length);
  }
  return replaced;
}

/**
 * Delete each replaced background part that no relationship anywhere in the
 * package still targets (untargeted slides, layouts or the master may share
 * it), along with any `[Content_Types]` override naming it.
 */
async function removeUnreferencedParts(
  zip: JSZip,
  candidates: ReadonlySet<string>,
): Promise<void> {
  if (candidates.size === 0) return;
  const relsPattern = /^(?:(.*)\/)?_rels\/[^/]*\.rels$/;
  const relsFiles = zip.file(relsPattern);
  const referenced = new Set<string>();
  const texts = await Promise.all(relsFiles.map((f) => f.async("text")));
  relsFiles.forEach((file, i) => {
    const sourceDir = file.name.match(relsPattern)?.[1] ?? "";
    for (const rel of texts[i].match(RELATIONSHIP) ?? []) {
      const target = relTargetPart(rel, sourceDir);
      if (target) referenced.add(target.toLowerCase());
    }
  });

  // OPC part names compare case-insensitively.
  const byLowerName = new Map<string, string>();
  zip.forEach((path, file) => {
    if (!file.dir) byLowerName.set(path.toLowerCase(), path);
  });
  const deleted: string[] = [];
  for (const candidate of candidates) {
    const lower = candidate.toLowerCase();
    const name = byLowerName.get(lower);
    if (!name || referenced.has(lower)) continue;
    zip.remove(name);
    deleted.push(lower);
  }
  if (deleted.length === 0) return;

  const ctFile = zip.file("[Content_Types].xml");
  if (!ctFile) return;
  const ctXml = await ctFile.async("text");
  const updated = ctXml.replace(/<Override\b[^>]*\/>/g, (override) => {
    const partName = relAttr(override, "PartName");
    return partName && deleted.includes(partName.replace(/^\/+/, "").toLowerCase())
      ? ""
      : override;
  });
  if (updated !== ctXml) zip.file("[Content_Types].xml", updated);
}

/**
 * Insert a `<Default Extension=… ContentType=…/>` into a [Content_Types].xml
 * body, immediately after the root `<Types …>` opening tag so its namespace
 * declaration stays intact. No-op when the extension is already declared
 * (attribute-order agnostic). Pure + exported for testing.
 */
export function insertDefaultContentType(
  xml: string,
  ext: string,
  mimeType: string,
): string {
  const safeExt = ext.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  if (new RegExp(`<Default[^>]*\\bExtension="${safeExt}"`, "i").test(xml)) {
    return xml;
  }
  const override = `<Default Extension="${ext}" ContentType="${mimeType}"/>`;
  return xml.replace(/(<Types\b[^>]*>)/, `$1${override}`);
}

async function ensureContentType(zip: JSZip, ext: string): Promise<void> {
  const ctPath = "[Content_Types].xml";
  const ctFile = zip.file(ctPath);
  if (!ctFile) return;

  const xml = await ctFile.async("text");
  const updated = insertDefaultContentType(xml, ext, getContentType(ext));
  if (updated !== xml) zip.file(ctPath, updated);
}

function loadImageSize(file: File): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      resolve({ w: img.naturalWidth, h: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("이미지 크기를 읽을 수 없습니다."));
    };
    img.src = url;
  });
}

async function getSlideSize(
  zip: JSZip,
): Promise<{ w: number; h: number }> {
  const presFile = zip.file("ppt/presentation.xml");
  if (!presFile) return { w: 12192000, h: 6858000 };

  const xml = await presFile.async("text");
  const match = xml.match(/<p:sldSz[^>]*cx="(\d+)"[^>]*cy="(\d+)"/);
  if (!match) return { w: 12192000, h: 6858000 };

  return { w: parseInt(match[1], 10), h: parseInt(match[2], 10) };
}

export async function changeBackground({
  pptxFile,
  bgImage,
  mode,
  targetSlides,
  onProgress,
}: ChangeBackgroundOptions): Promise<Uint8Array> {
  const arrayBuffer = await pptxFile.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const ext = getExtension(bgImage);
  const mediaName = uniqueMediaName(zip, ext);
  const mediaPath = `ppt/media/${mediaName}`;
  const bgImageData = new Uint8Array(await bgImage.arrayBuffer());
  // PNG and JPEG are already compressed; deflating them again buys little.
  zip.file(mediaPath, bgImageData, { compression: "STORE" });

  await ensureContentType(zip, ext);

  const [imgSize, slideSize] = await Promise.all([
    loadImageSize(bgImage),
    getSlideSize(zip),
  ]);
  const fillOffsets = calcCoverOffsets(
    imgSize.w,
    imgSize.h,
    slideSize.w,
    slideSize.h,
  );

  let replaced: Set<string>;
  if (mode === "master") {
    const mediaTarget = `../media/${mediaName}`;
    replaced = await processSlideGroup(
      zip,
      "ppt/slideMasters",
      mediaTarget,
      fillOffsets,
      (done, total) => {
        onProgress?.(Math.round((done / total) * 100));
      },
    );
  } else {
    const mediaTarget = `../media/${mediaName}`;
    let whitelist: Set<number> | undefined;
    if (mode === "specific-slides") {
      if (!targetSlides || targetSlides.length === 0) {
        throw new Error("적용할 슬라이드를 선택해 주세요.");
      }
      whitelist = new Set(targetSlides);
    }
    replaced = await processSlideGroup(
      zip,
      "ppt/slides",
      mediaTarget,
      fillOffsets,
      (done, total) => {
        onProgress?.(Math.round((done / total) * 100));
      },
      whitelist,
    );
  }

  await removeUnreferencedParts(zip, replaced);

  // Keep each part stored the way the input stored it. JSZip's default
  // (STORE) inflated every deflated part of a PowerPoint deck, growing it by
  // up to ~46%; a global DEFLATE would instead recompress stored media,
  // ~100x slower. Matching the input lets JSZip copy untouched parts' bytes.
  const input = new Uint8Array(arrayBuffer);
  const methods = zipCompressionMethods(input);
  if (methods) {
    zip.forEach((path, file) => {
      const method = methods.get(path);
      if (method) file.options.compression = method;
    });
  }
  const output = await zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });

  // Output check: the deck must be structurally sound and actually carry the
  // new background before it is offered. No recovery exists, so a violation
  // blocks with the corrupt-output error.
  return runOutputCheck({
    tool: "ppt-background",
    output,
    check: (out) =>
      checkPptBackground(
        input,
        { bgImage: bgImageData, mode, targetSlides },
        out,
        "quick",
      ),
  });
}
