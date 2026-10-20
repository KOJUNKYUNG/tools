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

/** Marks where `deck` moves a slide's background to, ahead of its shapes. */
const BACKGROUND = "<!--bg-->";

const group = (inner: string) =>
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="4" name="g"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>` +
  `<p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="${4 * IN}" cy="${2 * IN}"/>` +
  `<a:chOff x="0" y="0"/><a:chExt cx="${4 * IN}" cy="${2 * IN}"/></a:xfrm></p:grpSpPr>` +
  `${inner}</p:grpSp>`;

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
    const xml = await zip.file(part)!.async("text");
    const [shapes, bg] = slides[i].includes(BACKGROUND) ? ["", true] : [slides[i], false];
    let next = xml.replace(/<p:pic>[\s\S]*<\/p:pic>/, () => shapes);
    if (bg) {
      next = next.replace(
        "<p:spTree>",
        () => `<p:bg><p:bgPr><a:blipFill>${fill({})}</a:blipFill><a:effectLst/></p:bgPr></p:bg><p:spTree>`,
      );
    }
    zip.file(part, next);
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

/** Adds a part at `part` that shows the first slide's image. */
const alsoShownIn = (part: string) => async (zip: JSZip) => {
  const rels = relsPartOf(part);
  const target = "../".repeat(part.split("/").length - 2) + "media/image-1-1.png";
  const existing = zip.file(part) ? await zip.file(part)!.async("text") : null;
  const use = `<x r:embed="rIdX"/>`;
  if (existing === null) {
    zip.file(part, `<root xmlns:r="r">${use}</root>`);
  } else {
    const close = existing.lastIndexOf("</");
    zip.file(part, existing.slice(0, close) + use + existing.slice(close));
  }
  const relsXml = zip.file(rels) ? await zip.file(rels)!.async("text") : null;
  const rel = `<Relationship Id="rIdX" Type="${IMAGE_REL}" Target="${target}"/>`;
  zip.file(
    rels,
    relsXml?.replace("</Relationships>", `${rel}</Relationships>`) ??
      `<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${rel}</Relationships>`,
  );
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
    ["cropped", pic({ srcRect: `<a:srcRect l="10000"/>` })],
    ["padded by a negative crop", pic({ srcRect: `<a:srcRect b="-5000"/>` })],
    ["inset in its frame", pic({ mode: `<a:stretch><a:fillRect t="2000"/></a:stretch>` })],
    ["tiled", shape({ mode: `<a:tile sx="100000" sy="100000"/>` })],
    ["rotated", pic({ rot: 5400000 })],
    ["in a group", group(pic())],
    ["in a frame without its own extent", pic({ size: null })],
    ["as a slide background", BACKGROUND],
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
    // Plain on slide 1, cropped on slide 2.
    const sizes = await readDisplaySizes(
      await deck([pic(), pic({ srcRect: `<a:srcRect l="10000"/>` })], shareFirstImage(2)),
    );
    expect(sizes.get(IMAGE_1)).toBeNull();
  });

  it.each([
    "ppt/slideLayouts/slideLayout1.xml",
    "ppt/slideMasters/slideMaster1.xml",
    "ppt/notesSlides/notesSlide1.xml",
    "ppt/charts/chart1.xml",
    "ppt/diagrams/drawing1.xml",
  ])("leaves a picture unknown when %s shows it too", async (part) => {
    const sizes = await readDisplaySizes(await deck([pic()], alsoShownIn(part)));
    expect(sizes.get(IMAGE_1)).toBeNull();
  });

  it("leaves a picture no slide shows unknown, and keeps sizing the others", async () => {
    const sizes = await readDisplaySizes(await deck([pic(), pic({ size: [5, 5] })], shareFirstImage(2)));
    expect(sizes.get(IMAGE_2)).toBeNull();
    expect(sizes.get(IMAGE_1)).toEqual({ width: 0.5, height: 0.5 });
  });
});
