import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import { relsPartOf } from "@/lib/output-check/pptxPackage";
import { solidPng } from "@/lib/pdf/testImages";
import { readDisplaySizes } from "./displaySize";

const b64 = (bytes: Uint8Array) => Buffer.from(bytes).toString("base64");

// pptxgenjs's default slide: 10 × 5.625 in.
const IN = 914400;
const IMAGE_1 = "ppt/media/image-1-1.png";
const IMAGE_2 = "ppt/media/image-2-1.png";
const LAYOUT = "ppt/slideLayouts/slideLayout1.xml";
const MASTER = "ppt/slideMasters/slideMaster1.xml";
const IMAGE_REL = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

interface PicOptions {
  /** Frame size in inches; omitted for a frame without its own extent. */
  size?: [number, number] | null;
  rot?: number;
  /** Child elements of the fill between the blip and the stretch. */
  srcRect?: string;
  /** The fill mode: stretched into the frame by default. */
  mode?: string;
}

const xfrm = ({ size = [4, 2], rot }: PicOptions) =>
  size === null
    ? ""
    : `<a:xfrm${rot ? ` rot="${rot}"` : ""}><a:off x="0" y="0"/>` +
      `<a:ext cx="${size[0] * IN}" cy="${size[1] * IN}"/></a:xfrm>`;

const fill = (o: PicOptions) =>
  `<a:blip r:embed="rId1"/>${o.srcRect ?? ""}${o.mode ?? "<a:stretch><a:fillRect/></a:stretch>"}`;

/** A picture frame showing the slide's image (rId1). */
const pic = (o: PicOptions = {}) =>
  `<p:pic><p:nvPicPr><p:cNvPr id="2" name="p"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>` +
  `<p:blipFill>${fill(o)}</p:blipFill>` +
  `<p:spPr>${xfrm(o)}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr></p:pic>`;

/** A shape filled with the slide's image (rId1). */
const shape = (o: PicOptions = {}) =>
  `<p:sp><p:nvSpPr><p:cNvPr id="3" name="s"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
  `<p:spPr>${xfrm(o)}<a:prstGeom prst="ellipse"><a:avLst/></a:prstGeom>` +
  `<a:blipFill>${fill(o)}</a:blipFill></p:spPr></p:sp>`;

/** A shape whose text is filled with the slide's image (rId1). */
const textFill =
  `<p:sp><p:nvSpPr><p:cNvPr id="5" name="t"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr>` +
  `<p:spPr>${xfrm({})}<a:prstGeom prst="rect"><a:avLst/></a:prstGeom></p:spPr>` +
  `<p:txBody><a:bodyPr/><a:p><a:r><a:rPr><a:blipFill>${fill({})}</a:blipFill></a:rPr>` +
  `<a:t>x</a:t></a:r></a:p></p:txBody></p:sp>`;

/** A background filled with the image (rId1); `place` moves it ahead of the shapes. */
const background = (o: PicOptions = {}) =>
  `<p:bg><p:bgPr><a:blipFill>${fill(o)}</a:blipFill><a:effectLst/></p:bgPr></p:bg>`;

/**
 * `xml` (a slide, layout or master) with `content` in place of its picture
 * frames: a background in `content` replaces the part's own, the rest goes
 * at the end of its shape tree.
 */
function place(xml: string, content: string): string {
  const bg = content.match(/<p:bg>[\s\S]*<\/p:bg>/)?.[0];
  const shapes = bg ? content.replace(bg, "") : content;
  let next = xml.replace(/<p:pic>[\s\S]*<\/p:pic>/, "").replace("</p:spTree>", () => `${shapes}</p:spTree>`);
  if (bg) next = next.replace(/<p:bg>[\s\S]*?<\/p:bg>/, "").replace("<p:spTree>", () => `${bg}<p:spTree>`);
  return next;
}

/**
 * A group drawing `inner` at `ext` (inches) from a child space of `chExt`
 * (inches; omitted for a group without one).
 */
const group = (inner: string, ext: [number, number] = [4, 2], chExt: [number, number] | null = ext) =>
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${ext[0] * IN}" cy="${ext[1] * IN}"/>` +
  `<a:chOff x="0" y="0"/>` +
  (chExt ? `<a:chExt cx="${chExt[0] * IN}" cy="${chExt[1] * IN}"/>` : "") +
  `</a:xfrm></p:grpSpPr>${inner}</p:grpSp>`;

/**
 * A deck of one slide per entry; each slide holds its own image as rId1 and
 * the entry's XML in place of pptxgenjs's picture frame.
 */
async function deck(slides: string[], edit?: (zip: JSZip) => Promise<void>): Promise<Uint8Array> {
  const pptx = new PptxGenJS();
  for (let i = 0; i < slides.length; i++) {
    pptx
      .addSlide()
      .addImage({ data: `image/png;base64,${b64(solidPng(40, 20))}`, x: 0, y: 0, w: 4, h: 2 });
  }
  // write() returns a union over every outputType; "uint8array" yields this one.
  const zip = await JSZip.loadAsync((await pptx.write({ outputType: "uint8array" })) as Uint8Array);
  for (let i = 0; i < slides.length; i++) {
    const part = `ppt/slides/slide${i + 1}.xml`;
    zip.file(part, place(await zip.file(part)!.async("text"), slides[i]));
  }
  await edit?.(zip);
  return zip.generateAsync({ type: "uint8array" });
}

/** Points slide `n`'s rId1 at the first slide's image. */
const shareFirstImage = (n: number) => async (zip: JSZip) => {
  const rels = `ppt/slides/_rels/slide${n}.xml.rels`;
  const xml = await zip.file(rels)!.async("text");
  zip.file(rels, xml.replace(`image-${n}-1.png`, "image-1-1.png"));
};

/** Gives `part` the relationship rIdX to the first slide's image. */
async function relateFirstImage(zip: JSZip, part: string): Promise<void> {
  const rels = relsPartOf(part);
  const target = "../".repeat(part.split("/").length - 2) + "media/image-1-1.png";
  const relsXml = zip.file(rels) ? await zip.file(rels)!.async("text") : null;
  const rel = `<Relationship Id="rIdX" Type="${IMAGE_REL}" Target="${target}"/>`;
  zip.file(
    rels,
    relsXml?.replace("</Relationships>", `${rel}</Relationships>`) ??
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`,
  );
}

/** Adds `content` to an existing layout or master, showing the first slide's image. */
const placedOn = (part: string, content: string) => async (zip: JSZip) => {
  const xml = await zip.file(part)!.async("text");
  zip.file(part, place(xml, content.replaceAll(`r:embed="rId1"`, `r:embed="rIdX"`)));
  await relateFirstImage(zip, part);
};

/** Adds a part at `part` that shows the first slide's image. */
const alsoShownIn = (part: string) => async (zip: JSZip) => {
  const existing = zip.file(part) ? await zip.file(part)!.async("text") : null;
  const use = `<x r:embed="rIdX"/>`;
  if (existing === null) {
    zip.file(part, `<root xmlns:r="r">${use}</root>`);
  } else {
    const close = existing.lastIndexOf("</");
    zip.file(part, existing.slice(0, close) + use + existing.slice(close));
  }
  await relateFirstImage(zip, part);
};

describe("readDisplaySizes", () => {
  it.each([
    ["a picture frame", pic()],
    ["a picture frame with an empty crop", pic({ srcRect: `<a:srcRect/>` })],
    ["a picture frame stretched without insets", pic({ mode: "<a:stretch/>" })],
    ["a shape filled with the picture", shape()],
  ])("sizes a picture shown in %s by its frame, in slide widths", async (_, xml) => {
    const sizes = await readDisplaySizes(await deck([xml]));
    // 4 × 2 in on a 10 in wide slide.
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.4, height: 0.2 });
  });

  it("takes the largest use on each side of a picture used several times", async () => {
    const sizes = await readDisplaySizes(
      await deck(
        [pic({ size: [4, 2] }) + pic({ size: [1, 3] }), pic({ size: [6, 1] })],
        shareFirstImage(2),
      ),
    );
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.6, height: 0.3 });
  });

  it.each([
    // 4 × 2 in frames showing part of the picture: the whole picture spans more.
    ["cropped", `<a:srcRect l="20000" r="30000" t="50000"/>`, { width: 0.8, height: 0.4 }],
    // A negative crop pads the picture with empty space: it spans less.
    ["padded by a negative crop", `<a:srcRect t="-25000" b="-75000"/>`, { width: 0.4, height: 0.1 }],
  ])("sizes a picture %s by the whole picture's extent", async (_, srcRect, size) => {
    const sizes = await readDisplaySizes(await deck([pic({ srcRect })]));
    expect(sizes.get(IMAGE_1)).toEqual(size);
  });

  it("sizes a picture inset in its frame by the inset rectangle, with the crop applied", async () => {
    // Insets narrow the 4 in width to 2 in and widen the 2 in height to 3 in;
    // the picture's visible half then spans 4 in by 3 in in all.
    const mode = `<a:stretch><a:fillRect l="25000" r="25000" t="-50000"/></a:stretch>`;
    const sizes = await readDisplaySizes(
      await deck([pic({ srcRect: `<a:srcRect l="50000"/>`, mode })]),
    );
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.4, height: 0.3 });
  });

  it("sizes a picture in a rotated frame by the frame's unrotated extent", async () => {
    const sizes = await readDisplaySizes(await deck([pic({ rot: 5400000 })]));
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.4, height: 0.2 });
  });

  it.each([
    // Twice as wide and half as high as its children.
    ["one group", group(pic(), [4, 2], [2, 4]), { width: 0.8, height: 0.1 }],
    // ×1.5 then ×2 across, ×0.5 down.
    ["nested groups", group(group(pic(), [4, 2], [2, 4]), [6, 2], [4, 2]), { width: 1.2, height: 0.1 }],
  ])("sizes a picture in %s by each group's scale", async (_, xml, size) => {
    const sizes = await readDisplaySizes(await deck([xml]));
    expect(sizes.get(IMAGE_1)).toEqual(size);
  });

  it("gives a rotated frame in an unevenly scaled group the larger scale on both sides", async () => {
    // The group's ×2 and ×0.5 may fall on either of the turned frame's sides.
    const sizes = await readDisplaySizes(await deck([group(pic({ rot: 5400000 }), [4, 2], [2, 4])]));
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.8, height: 0.4 });
  });

  it("takes the largest use of a picture shown both in a group and plainly", async () => {
    // 8 × 1 in through the group, 1 × 3 in on its own.
    const sizes = await readDisplaySizes(
      await deck([group(pic(), [4, 2], [2, 4]) + pic({ size: [1, 3] })]),
    );
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.8, height: 0.3 });
  });

  it("sizes a slide's background picture by the full slide", async () => {
    const sizes = await readDisplaySizes(await deck([background()]));
    // 10 × 5.625 in.
    expect(sizes.get(IMAGE_1)).toEqual({ width: 1, height: 0.5625 });
  });

  it.each([
    ["tiled", shape({ mode: `<a:tile sx="100000" sy="100000"/>` })],
    ["in a group without a child extent", group(pic(), [4, 2], null)],
    ["in a frame without its own extent", pic({ size: null })],
    ["as a tiled background", background({ mode: `<a:tile/>` })],
    [
      "inside alternate content",
      `<mc:AlternateContent xmlns:mc="mc"><mc:Choice Requires="x">${pic()}</mc:Choice></mc:AlternateContent>`,
    ],
    ["as a text fill", textFill],
  ])("leaves a picture unknown when it is shown %s", async (_, xml) => {
    const sizes = await readDisplaySizes(await deck([xml]));
    expect(sizes.has(IMAGE_1)).toBe(true);
    expect(sizes.get(IMAGE_1)).toBeNull();
  });

  it("leaves a picture unknown when one of its uses is not interpreted", async () => {
    // Plain on slide 1, tiled on slide 2.
    const sizes = await readDisplaySizes(
      await deck([pic(), pic({ mode: `<a:tile sx="100000" sy="100000"/>` })], shareFirstImage(2)),
    );
    expect(sizes.get(IMAGE_1)).toBeNull();
  });

  it.each([LAYOUT, MASTER])("sizes a background picture on %s by the full slide", async (part) => {
    // The slide itself does not draw its image.
    const sizes = await readDisplaySizes(await deck([""], placedOn(part, background())));
    expect(sizes.get(IMAGE_1)).toEqual({ width: 1, height: 0.5625 });
  });

  it.each([LAYOUT, MASTER])("sizes a picture placed on %s by its frame", async (part) => {
    const sizes = await readDisplaySizes(await deck([""], placedOn(part, pic({ size: [6, 1] }))));
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.6, height: 0.1 });
  });

  it.each([
    LAYOUT,
    MASTER,
    "ppt/notesSlides/notesSlide1.xml",
    "ppt/notesMasters/notesMaster1.xml",
    "ppt/handoutMasters/handoutMaster1.xml",
    "ppt/charts/chart1.xml",
    "ppt/diagrams/drawing1.xml",
  ])("leaves a picture unknown when %s also shows it in an element not interpreted", async (part) => {
    const sizes = await readDisplaySizes(await deck([pic()], alsoShownIn(part)));
    expect(sizes.get(IMAGE_1)).toBeNull();
  });

  it("leaves a picture nothing shows unknown, and keeps sizing the others", async () => {
    const sizes = await readDisplaySizes(await deck([pic(), pic({ size: [5, 5] })], shareFirstImage(2)));
    expect(sizes.get(IMAGE_2)).toBeNull();
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.5, height: 0.5 });
  });
});
