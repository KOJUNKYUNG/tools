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

/** A solid fill of colour `rgb` (hex), `alpha` per 100000 opaque when given. */
export const solidFill = (rgb: string, alpha?: number) =>
  `<a:solidFill><a:srgbClr val="${rgb}">${alpha === undefined ? "" : `<a:alpha val="${alpha}"/>`}</a:srgbClr></a:solidFill>`;

/** A linear gradient through these colour elements (e.g. `<a:srgbClr val="FFFFFF"/>`). */
export const gradientFill = (stops: string[]) =>
  `<a:gradFill rotWithShape="1"><a:gsLst>` +
  stops.map((clr, i) => `<a:gs pos="${Math.round((i * 100000) / Math.max(1, stops.length - 1))}">${clr}</a:gs>`).join("") +
  `</a:gsLst><a:lin ang="5400000" scaled="0"/></a:gradFill>`;

/**
 * A rectangle with this fill (`solidFill`, `gradientFill`, `<a:noFill/>`),
 * holding `text` when given. Without a fill it takes the one its style
 * reference names, as PowerPoint's default rectangle does: the theme's first
 * fill style in Accent 1.
 */
export function filledShape(id: number, fill: string | null, box: Box = FULL, text?: string): string {
  const style =
    fill === null
      ? `<p:style><a:lnRef idx="2"><a:schemeClr val="accent1"><a:shade val="50000"/></a:schemeClr></a:lnRef>` +
        `<a:fillRef idx="1"><a:schemeClr val="accent1"/></a:fillRef>` +
        `<a:effectRef idx="0"><a:schemeClr val="accent1"/></a:effectRef>` +
        `<a:fontRef idx="minor"><a:schemeClr val="lt1"/></a:fontRef></p:style>`
      : "";
  return (
    `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Rectangle ${id}"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
    `<p:spPr>${xfrm(box)}${rect}${fill ?? ""}</p:spPr>${style}` +
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
  /** PowerPoint's "Hide background graphics" (`showMasterSp="0"`). */
  hidesBackgroundGraphics?: boolean;
}

/** A layout: its own background (pptxgenjs writes a theme reference when absent) and background graphics. */
export interface TestLayout {
  background?: string;
  /** Elements for its shape tree, bottom first (pptxgenjs writes none there). */
  shapes?: string[];
  pictures?: Record<string, string>;
  /** PowerPoint's "Hide background graphics": the master's do not show on it. */
  hidesBackgroundGraphics?: boolean;
}

/** Elements placed on the slide master: its background graphics, bottom first. */
export interface TestMaster {
  shapes: string[];
  /** Relationship id → media file name, as on a slide (pptxgenjs's master takes rId1 and rId2). */
  pictures?: Record<string, string>;
  /** A `p:timing` element. */
  timing?: string;
}

export interface TestDeckOptions {
  /** Elements for the master's shape tree (pptxgenjs writes none there). */
  master?: TestMaster;
  /**
   * The presentation's slide list (`p:sldIdLst`): the slides' file numbers in
   * the order PowerPoint shows them (`[2, 3, 1]` shows `slide2.xml` first);
   * `"missing"` drops the list, `"dangling"` names a relationship that does
   * not exist. File order when absent.
   */
  slideList?: readonly number[] | "missing" | "dangling";
  /** Layouts under the master that no slide uses (`slideLayout2.xml` on), in order. */
  unusedLayouts?: readonly TestLayout[];
  /**
   * More masters (`slideMaster2.xml` on), in order, each with its own theme
   * and one layout, which the slides with these file numbers use. Each
   * theme's light colour (`lt1`, what "no background" shows under the default
   * colour map) is `lightColour` (hex RGB).
   */
  extraMasters?: readonly TestExtraMaster[];
}

export interface TestExtraMaster {
  lightColour: string;
  slides: readonly number[];
}

/**
 * Write `master` as master part `n` (2 on): a copy of the deck's master,
 * theme and first layout (as layout part `layoutNumber`), before either is
 * edited.
 */
async function writeExtraMaster(zip: JSZip, { lightColour, slides }: TestExtraMaster, n: number, layoutNumber: number) {
  const text = (part: string) => zip.file(part)!.async("text");
  const rel = (id: string, type: string, target: string) =>
    `<Relationship Id="${id}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/${type}" Target="${target}"/>`;
  const rels = (...entries: string[]) =>
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.join("")}</Relationships>`;
  const master = `slideMaster${n}.xml`;
  const theme = `theme${n}.xml`;
  const layout = `slideLayout${layoutNumber}.xml`;
  // Master and layout ids share one space across the deck, above the first master's.
  const masterId = 2147484000 + 2 * n;

  zip.file(
    `ppt/theme/${theme}`,
    (await text("ppt/theme/theme1.xml")).replace(/<a:lt1>[\s\S]*?<\/a:lt1>/, `<a:lt1><a:srgbClr val="${lightColour}"/></a:lt1>`),
  );
  zip.file(
    `ppt/slideMasters/${master}`,
    (await text("ppt/slideMasters/slideMaster1.xml")).replace(
      /<p:sldLayoutIdLst>[\s\S]*?<\/p:sldLayoutIdLst>/,
      `<p:sldLayoutIdLst><p:sldLayoutId id="${masterId + 1}" r:id="rId1"/></p:sldLayoutIdLst>`,
    ),
  );
  zip.file(
    `ppt/slideMasters/_rels/${master}.rels`,
    rels(rel("rId1", "slideLayout", `../slideLayouts/${layout}`), rel("rId2", "theme", `../theme/${theme}`)),
  );
  zip.file(`ppt/slideLayouts/${layout}`, await text("ppt/slideLayouts/slideLayout1.xml"));
  zip.file(`ppt/slideLayouts/_rels/${layout}.rels`, rels(rel("rId1", "slideMaster", `../slideMasters/${master}`)));
  for (const slide of slides) {
    const part = `ppt/slides/_rels/slide${slide}.xml.rels`;
    zip.file(part, (await text(part)).replace("../slideLayouts/slideLayout1.xml", `../slideLayouts/${layout}`));
  }

  const relId = `rIdMaster${n}`;
  const presentation = "ppt/presentation.xml";
  zip.file(
    presentation,
    (await text(presentation)).replace("</p:sldMasterIdLst>", `<p:sldMasterId id="${masterId}" r:id="${relId}"/></p:sldMasterIdLst>`),
  );
  const presentationRels = "ppt/_rels/presentation.xml.rels";
  zip.file(
    presentationRels,
    (await text(presentationRels)).replace("</Relationships>", `${rel(relId, "slideMaster", `slideMasters/${master}`)}</Relationships>`),
  );
  const override = (part: string, type: string) =>
    `<Override PartName="/${part}" ContentType="application/vnd.openxmlformats-officedocument.${type}+xml"/>`;
  const types = await text("[Content_Types].xml");
  // pptxgenjs already declares a `slideMaster2.xml` it does not write.
  zip.file(
    "[Content_Types].xml",
    types.replace(
      "</Types>",
      (types.includes(`/ppt/slideMasters/${master}`) ? "" : override(`ppt/slideMasters/${master}`, "presentationml.slideMaster")) +
        override(`ppt/theme/${theme}`, "theme") +
        override(`ppt/slideLayouts/${layout}`, "presentationml.slideLayout") +
        "</Types>",
    ),
  );
}

/** Rewrite the presentation's slide list as `slideList` asks. */
async function writeSlideList(zip: JSZip, slideList: NonNullable<TestDeckOptions["slideList"]>) {
  const part = "ppt/presentation.xml";
  const xml = await zip.file(part)!.async("text");
  const list = /<p:sldIdLst>([\s\S]*?)<\/p:sldIdLst>/;
  // pptxgenjs writes one entry per slide, in file order.
  const entries = xml.match(list)![1].match(/<p:sldId\b[^>]*\/>/g)!;
  const rewritten =
    slideList === "missing"
      ? ""
      : slideList === "dangling"
        ? `<p:sldIdLst>${entries.map((e, i) => (i === 0 ? e.replace(/r:id="[^"]*"/, 'r:id="rId999"') : e)).join("")}</p:sldIdLst>`
        : `<p:sldIdLst>${slideList.map((n) => entries[n - 1]).join("")}</p:sldIdLst>`;
  zip.file(part, xml.replace(list, rewritten));
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

/** Set the root's "Hide background graphics" (`showMasterSp="0"`). */
const hidingBackgroundGraphics = (xml: string, root: string) => xml.replace(`<${root} `, `<${root} showMasterSp="0" `);

/** Write `layout` into the layout part `n` (`slideLayout{n}.xml`). */
async function writeLayout(zip: JSZip, n: number, layout: TestLayout) {
  const layoutPath = `ppt/slideLayouts/slideLayout${n}.xml`;
  let xml = await zip.file(layoutPath)!.async("text");
  if (layout.background !== undefined) xml = xml.replace(/<p:bg>[\s\S]*?<\/p:bg>/, layout.background);
  if (layout.shapes) xml = xml.replace("</p:spTree>", `${layout.shapes.join("")}</p:spTree>`);
  if (layout.hidesBackgroundGraphics) xml = hidingBackgroundGraphics(xml, "p:sldLayout");
  zip.file(layoutPath, xml);
  await addPictures(zip, `ppt/slideLayouts/_rels/slideLayout${n}.xml.rels`, layout.pictures);
}

/** A 16:9 deck with these slides, in order, and optionally its layout's own background. */
export async function testDeck(
  slides: TestSlide[],
  layout?: TestLayout,
  { slideList, master, unusedLayouts = [], extraMasters = [] }: TestDeckOptions = {},
): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  // Each defined master is written as one more layout under the deck's one master.
  unusedLayouts.forEach((_, i) => pptx.defineSlideMaster({ title: `UNUSED_${i + 1}` }));
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
    const written = xml
      .replace(/<p:spTree>[\s\S]*<\/p:spTree>/, `${slide.background ?? ""}${spTree}`)
      .replace("</p:sld>", `${slide.timing ?? ""}</p:sld>`);
    zip.file(slidePath, slide.hidesBackgroundGraphics ? hidingBackgroundGraphics(written, "p:sld") : written);
    await addPictures(zip, relsPath, slide.pictures);
  }

  for (const [i, extra] of extraMasters.entries()) {
    await writeExtraMaster(zip, extra, i + 2, unusedLayouts.length + i + 2);
  }
  if (layout) await writeLayout(zip, 1, layout);
  for (const [i, unused] of unusedLayouts.entries()) await writeLayout(zip, i + 2, unused);
  if (master) {
    const masterPath = "ppt/slideMasters/slideMaster1.xml";
    const xml = await zip.file(masterPath)!.async("text");
    zip.file(
      masterPath,
      xml
        .replace("</p:spTree>", `${master.shapes.join("")}</p:spTree>`)
        // A master's timing comes before its header/footer settings.
        .replace("<p:hf ", `${master.timing ?? ""}<p:hf `),
    );
    await addPictures(zip, "ppt/slideMasters/_rels/slideMaster1.xml.rels", master.pictures);
  }
  if (slideList) await writeSlideList(zip, slideList);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}
