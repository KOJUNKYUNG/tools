// Test-only deck builder (never imported by the app): a pptxgenjs deck whose
// slides' shape trees, pictures and animations are written by hand, for the
// slide structures pptxgenjs cannot make (picture-filled shapes, groups,
// timing trees).
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { testPng } from "@/lib/image/testPng";

/** The slide of every test deck: pptxgenjs's 16:9, in EMU. */
export const SLIDE = { w: 9144000, h: 5143500 };

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The whole slide. */
export const FULL: Box = { x: 0, y: 0, w: SLIDE.w, h: SLIDE.h };
/** A lyrics box in the middle of the slide. */
export const LYRICS_BOX: Box = { x: 914400, y: 914400, w: 3657600, h: 914400 };

const xfrm = ({ x, y, w, h }: Box, rot = 0) =>
  `<a:xfrm${rot ? ` rot="${rot}"` : ""}><a:off x="${x}" y="${y}"/><a:ext cx="${w}" cy="${h}"/></a:xfrm>`;
const rect = `<a:prstGeom prst="rect"><a:avLst/></a:prstGeom>`;
const blipFill = (relId: string) =>
  `<a:blip r:embed="${relId}"/><a:stretch><a:fillRect/></a:stretch>`;
const textBody = (text: string) =>
  `<p:txBody><a:bodyPr/><a:lstStyle/><a:p><a:r><a:rPr lang="ko-KR"/><a:t>${text}</a:t></a:r></a:p></p:txBody>`;

/** A picture element (`p:pic`) showing relationship `relId`. */
export function picture(id: number, relId: string, box: Box = FULL, rot = 0): string {
  return (
    `<p:pic><p:nvPicPr><p:cNvPr id="${id}" name="Picture ${id}"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>` +
    `<p:blipFill>${blipFill(relId)}</p:blipFill><p:spPr>${xfrm(box, rot)}${rect}</p:spPr></p:pic>`
  );
}

/** A shape filled with the picture of relationship `relId`, holding `text` when given. */
export function pictureShape(id: number, relId: string, box: Box = FULL, text?: string): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Freeform ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(box)}${rect}<a:blipFill>${blipFill(relId)}</a:blipFill></p:spPr>` +
    `${text === undefined ? "" : textBody(text)}</p:sp>`
  );
}

/** A text box: the slide's content (lyrics, a title). */
export function textBox(id: number, text: string, box: Box = LYRICS_BOX): string {
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="TextBox ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(box)}${rect}<a:noFill/></p:spPr>${textBody(text)}</p:sp>`
  );
}

/** A group at `box`, its members laid out in `childBox` (default: the same space). */
export function group(id: number, box: Box, members: string[], childBox: Box = box): string {
  return (
    `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="${id}" name="Group ${id}"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
    `<p:grpSpPr><a:xfrm><a:off x="${box.x}" y="${box.y}"/><a:ext cx="${box.w}" cy="${box.h}"/>` +
    `<a:chOff x="${childBox.x}" y="${childBox.y}"/><a:chExt cx="${childBox.w}" cy="${childBox.h}"/></a:xfrm></p:grpSpPr>` +
    `${members.join("")}</p:grpSp>`
  );
}

/** One click effect in PowerPoint's main sequence: shape `spid` appears. */
function clickEffect(spid: number, ids: () => number): string {
  const node = (inner: string, attrs = 'fill="hold"', delay = "0") =>
    `<p:par><p:cTn id="${ids()}" ${attrs}><p:stCondLst><p:cond delay="${delay}"/></p:stCondLst>` +
    `<p:childTnLst>${inner}</p:childTnLst></p:cTn></p:par>`;
  const set =
    `<p:set><p:cBhvr><p:cTn id="${ids()}" dur="1" fill="hold"><p:stCondLst><p:cond delay="0"/></p:stCondLst></p:cTn>` +
    `<p:tgtEl><p:spTgt spid="${spid}"/></p:tgtEl><p:attrNameLst><p:attrName>style.visibility</p:attrName></p:attrNameLst>` +
    `</p:cBhvr><p:to><p:strVal val="visible"/></p:to></p:set>`;
  return node(
    node(node(set, 'presetID="1" presetClass="entr" presetSubtype="0" fill="hold" grpId="0" nodeType="clickEffect"')),
    'fill="hold"',
    "indefinite",
  );
}

/**
 * A slide's `p:timing` as PowerPoint writes it: one click effect (appear) per
 * shape id, in order, and their build entries.
 */
export function clickAnimations(spids: number[]): string {
  let next = 3;
  const ids = () => next++;
  return (
    `<p:timing><p:tnLst><p:par><p:cTn id="1" dur="indefinite" restart="never" nodeType="tmRoot"><p:childTnLst>` +
    `<p:seq concurrent="1" nextAc="seek"><p:cTn id="2" dur="indefinite" nodeType="mainSeq"><p:childTnLst>` +
    spids.map((spid) => clickEffect(spid, ids)).join("") +
    `</p:childTnLst></p:cTn>` +
    `<p:prevCondLst><p:cond evt="onPrev" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:prevCondLst>` +
    `<p:nextCondLst><p:cond evt="onNext" delay="0"><p:tgtEl><p:sldTgt/></p:tgtEl></p:cond></p:nextCondLst></p:seq>` +
    `</p:childTnLst></p:cTn></p:par></p:tnLst>` +
    `<p:bldLst>${spids.map((spid) => `<p:bldP spid="${spid}" grpId="0"/>`).join("")}</p:bldLst></p:timing>`
  );
}

/** A slide's or layout's own background: a solid colour (hex RGB). */
export const solidBackground = (rgb: string) =>
  `<p:bg><p:bgPr><a:solidFill><a:srgbClr val="${rgb}"/></a:solidFill><a:effectLst/></p:bgPr></p:bg>`;

/** A slide's or layout's own background: the picture of relationship `relId`. */
export const pictureBackground = (relId: string) =>
  `<p:bg><p:bgPr><a:blipFill dpi="0" rotWithShape="1">${blipFill(relId)}</a:blipFill><a:effectLst/></p:bgPr></p:bg>`;

export interface TestSlide {
  /** Top-level elements, bottom of the stack first. */
  shapes: string[];
  /** Relationship id → media file name under `ppt/media/`; one name, one picture. */
  pictures?: Record<string, string>;
  /** A `p:timing` element. */
  timing?: string;
  /** Its own `p:bg` (e.g. `solidBackground`); none when absent. */
  background?: string;
}

/** The deck's one layout: its own background (pptxgenjs writes a theme reference when absent). */
export interface TestLayout {
  background: string;
  pictures?: Record<string, string>;
}

/** A small, distinct PNG for each media name. */
function mediaBytes(name: string): Uint8Array {
  const tag = [...name].reduce((h, c) => (h * 31 + c.charCodeAt(0)) & 0xff, 7);
  return testPng({ width: 4, height: 3, colorType: 2, pixel: (x, y) => [tag, x * 40, y * 60] });
}

/** Relate `pictures` (relationship id → media name) from the part whose `.rels` is `relsPath`. */
async function addPictures(zip: JSZip, relsPath: string, pictures: Record<string, string> = {}) {
  const rels = Object.entries(pictures).map(([id, name]) => {
    zip.file(`ppt/media/${name}`, mediaBytes(name));
    return (
      `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/image" ` +
      `Target="../media/${name}"/>`
    );
  });
  const relsXml = await zip.file(relsPath)!.async("text");
  zip.file(relsPath, relsXml.replace("</Relationships>", `${rels.join("")}</Relationships>`));
}

/** A 16:9 deck with these slides, in order, and optionally its layout's own background. */
export async function testDeck(slides: TestSlide[], layout?: TestLayout): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  for (let i = 0; i < slides.length; i++) pptx.addSlide();
  // write() returns a union over every outputType; "uint8array" yields this one.
  const zip = await JSZip.loadAsync((await pptx.write({ outputType: "uint8array" })) as Uint8Array);

  for (const [i, slide] of slides.entries()) {
    const slidePath = `ppt/slides/slide${i + 1}.xml`;
    const relsPath = `ppt/slides/_rels/slide${i + 1}.xml.rels`;
    const xml = await zip.file(slidePath)!.async("text");
    const spTree =
      `<p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
      `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>` +
      `${slide.shapes.join("")}</p:spTree>`;
    zip.file(
      slidePath,
      xml
        .replace(/<p:spTree>[\s\S]*<\/p:spTree>/, `${slide.background ?? ""}${spTree}`)
        .replace("</p:sld>", `${slide.timing ?? ""}</p:sld>`),
    );
    await addPictures(zip, relsPath, slide.pictures);
  }

  if (layout) {
    const layoutPath = "ppt/slideLayouts/slideLayout1.xml";
    const xml = await zip.file(layoutPath)!.async("text");
    zip.file(layoutPath, xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, layout.background));
    await addPictures(zip, "ppt/slideLayouts/_rels/slideLayout1.xml.rels", layout.pictures);
  }
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
