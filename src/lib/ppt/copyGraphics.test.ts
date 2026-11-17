import { describe, expect, it } from "vitest";
import type { StackElement } from "./coveringBackgrounds";
import { readCopies, withCopies } from "./copyGraphics";
import { parseXml, findAll } from "./xmlTree";

const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const IMAGE = "http://schemas.openxmlformats.org/officeDocument/2006/relationships/image";

const rels = (...entries: string[]) =>
  `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${entries.join("")}</Relationships>`;

/** A master holding `elements` after its root group, its namespaces declared where `nsOn` says. */
function master(elements: string, nsOn: "root" | "spTree" = "root"): string {
  const ns = `xmlns:a="${A}" xmlns:r="${R}"`;
  return (
    `<?xml version="1.0" encoding="UTF-8"?>\n<p:sldMaster xmlns:p="${P}"${nsOn === "root" ? ` ${ns}` : ""}><p:cSld>` +
    `<p:spTree${nsOn === "spTree" ? ` ${ns}` : ""}><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
    `${elements}</p:spTree></p:cSld></p:sldMaster>`
  );
}

/** The span of the first element named `name` in `xml`, as the plan hands it over. */
function spanOf(xml: string, name: string, part = "ppt/slideMasters/slideMaster1.xml"): StackElement {
  const el = findAll(parseXml(xml)!, (e) => e.name === name)[0];
  return { start: el.start, end: el.end, part, holder: "master", shapeIds: [], pictures: [], fills: [] };
}

const LOGO = (q: '"' | "'" = '"') =>
  `<p:pic><p:nvPicPr><p:cNvPr id="4" name="Logo"/><p:cNvPicPr/><p:nvPr/></p:nvPicPr>` +
  `<p:blipFill><a:blip r:embed=${q}rId2${q}/></p:blipFill><p:spPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="10" cy="10"/></a:xfrm></p:spPr></p:pic>`;

/** A slide with one text box, its shape tree opened as `spTreeOpen` and its root group's properties as `grpSpPr`. */
const slide = (spTreeOpen: string, grpSpPr: string) =>
  `<?xml version="1.0" encoding="UTF-8"?>\n<p:sld xmlns:p="${P}" xmlns:a="${A}"><p:cSld>${spTreeOpen}` +
  `<p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr>${grpSpPr}` +
  `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="2" name="Group"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm/></p:grpSpPr>` +
  `<p:sp><p:nvSpPr><p:cNvPr id="3" name="Text"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp></p:grpSp>` +
  `</p:spTree></p:cSld></p:sld>`;

const SLIDE = "ppt/slides/slide1.xml";
const MASTER = "ppt/slideMasters/slideMaster1.xml";

function copyLogo(slideXml: string, masterXml = master(LOGO())) {
  const copies = readCopies(MASTER, masterXml, rels(`<Relationship Id="rId2" Type="${IMAGE}" Target="../media/image1.png"/>`), [
    spanOf(masterXml, "p:pic"),
  ]);
  return withCopies(SLIDE, slideXml, rels(), copies);
}

/** The names of the slide's root shape tree's children, in order. */
const rootChildren = (xml: string) =>
  findAll(parseXml(xml)!, (e) => e.name === "p:spTree")[0].children.map((c) => c.name);

describe("withCopies", () => {
  it.each([
    ["a plain shape tree", "<p:spTree>", '<p:grpSpPr><a:xfrm/></p:grpSpPr>'],
    ["a shape tree declaring namespaces", `<p:spTree xmlns:r="${R}">`, '<p:grpSpPr><a:xfrm/></p:grpSpPr>'],
    ["self-closing root group properties", "<p:spTree>", "<p:grpSpPr/>"],
  ])("lays the copy at the bottom of the root shape tree with %s", (_, open, grpSpPr) => {
    const { slideXml } = copyLogo(slide(open, grpSpPr));
    expect(parseXml(slideXml)).not.toBeNull();
    expect(rootChildren(slideXml)).toEqual(["p:nvGrpSpPr", "p:grpSpPr", "p:pic", "p:grpSp"]);
  });

  it("names the picture by a new relationship of the slide, whatever quotes the master used", () => {
    const masterXml = master(LOGO("'"));
    const { slideXml, relsXml } = copyLogo(slide("<p:spTree>", "<p:grpSpPr/>"), masterXml);
    const blip = findAll(parseXml(slideXml)!, (e) => e.name === "a:blip")[0];
    expect(blip.attrs["r:embed"]).toBe("rId1");
    expect(relsXml).toContain(`Id="rId1" Type="${IMAGE}" Target="../media/image1.png"`);
  });

  it("declares the prefixes the master declared on its shape tree", () => {
    const masterXml = master(LOGO(), "spTree");
    const { slideXml } = copyLogo(slide("<p:spTree>", "<p:grpSpPr/>"), masterXml);
    // Well-formed XML with every prefix declared: the root carries r:.
    expect(slideXml).toMatch(new RegExp(`<p:sld [^>]*xmlns:r="${R}"`));
  });

  it("points a copied connector at the copied shapes' new ids", () => {
    const group =
      `<p:grpSp><p:nvGrpSpPr><p:cNvPr id="5" name="Deco"/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr/>` +
      `<p:sp><p:nvSpPr><p:cNvPr id="6" name="A"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>` +
      `<p:sp><p:nvSpPr><p:cNvPr id="7" name="B"/><p:cNvSpPr/><p:nvPr/></p:nvSpPr><p:spPr/></p:sp>` +
      `<p:cxnSp><p:nvCxnSpPr><p:cNvPr id="8" name="Line"/><p:cNvCxnSpPr><a:stCxn id="6" idx="0"/><a:endCxn id='7' idx="2"/></p:cNvCxnSpPr><p:nvPr/></p:nvCxnSpPr><p:spPr/></p:cxnSp>` +
      `</p:grpSp>`;
    const masterXml = master(group);
    const copies = readCopies(MASTER, masterXml, null, [spanOf(masterXml, "p:grpSp")]);
    const { slideXml } = withCopies(SLIDE, slide("<p:spTree>", "<p:grpSpPr/>"), null, copies);
    const root = parseXml(slideXml)!;
    const idOf = (name: string) => findAll(root, (e) => e.name === "p:cNvPr" && e.attrs.name === name)[0].attrs.id;
    // The slide's own ids reach 3: the copy's start at 4.
    expect([idOf("Deco"), idOf("A"), idOf("B"), idOf("Line")]).toEqual(["4", "5", "6", "7"]);
    expect(findAll(root, (e) => e.name === "a:stCxn")[0].attrs.id).toBe(idOf("A"));
    expect(findAll(root, (e) => e.name === "a:endCxn")[0].attrs.id).toBe(idOf("B"));
  });
});
