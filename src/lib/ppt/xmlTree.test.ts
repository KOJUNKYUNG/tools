import { describe, it, expect } from "vitest";
import { parseXml, type XmlElement } from "./xmlTree";

/** Every element in the tree, depth first. */
const all = (el: XmlElement): XmlElement[] => [el, ...el.children.flatMap(all)];

describe("parseXml source ranges", () => {
  it("slices each element back out of the raw XML exactly", () => {
    const xml =
      `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n` +
      `<p:spTree><!-- a <p:sp/> in a comment -->\n` +
      `  <p:sp><p:nvSpPr><p:cNvPr id="2" name='a > b'/></p:nvSpPr>` +
      `<p:txBody><a:p><a:r><a:t><![CDATA[<a:t>]]></a:t></a:r></a:p></p:txBody></p:sp>\n` +
      `  <p:pic  attr = "x" />\n` +
      `</p:spTree>`;
    const root = parseXml(xml);
    expect(root).not.toBeNull();
    const slices = all(root!).map((el) => xml.slice(el.start, el.end));
    expect(slices).toEqual([
      xml.slice(xml.indexOf("<p:spTree>")),
      `<p:sp><p:nvSpPr><p:cNvPr id="2" name='a > b'/></p:nvSpPr>` +
        `<p:txBody><a:p><a:r><a:t><![CDATA[<a:t>]]></a:t></a:r></a:p></p:txBody></p:sp>`,
      `<p:nvSpPr><p:cNvPr id="2" name='a > b'/></p:nvSpPr>`,
      `<p:cNvPr id="2" name='a > b'/>`,
      `<p:txBody><a:p><a:r><a:t><![CDATA[<a:t>]]></a:t></a:r></a:p></p:txBody>`,
      `<a:p><a:r><a:t><![CDATA[<a:t>]]></a:t></a:r></a:p>`,
      `<a:r><a:t><![CDATA[<a:t>]]></a:t></a:r>`,
      `<a:t><![CDATA[<a:t>]]></a:t>`,
      `<p:pic  attr = "x" />`,
    ]);
  });
});

describe("parseXml text", () => {
  /** A shape whose text body holds `runs`. */
  const sp = (runs: string) =>
    `<p:sp><p:spPr/><p:txBody><a:bodyPr/><a:p>${runs}</a:p></p:txBody></p:sp>`;
  /** Whether the only shape in a shape tree holding `shape` reports text. */
  const shapeHasText = (shape: string) => parseXml(`<p:spTree>${shape}</p:spTree>`)!.children[0].hasText;

  it("reports text for a non-empty run, on the element and everything around it", () => {
    const root = parseXml(`<p:spTree><p:grpSp>${sp("<a:r><a:rPr/><a:t>주 하나님</a:t></a:r>")}</p:grpSp><p:pic/></p:spTree>`)!;
    const [group, pic] = root.children;
    expect([root.hasText, group.hasText, group.children[0].hasText, pic.hasText]).toEqual([true, true, true, false]);
    expect(group.children[0].children[0].hasText).toBe(false); // p:spPr
  });

  it.each([
    ["an empty run", "<a:r><a:t></a:t></a:r>"],
    ["a self-closing run", "<a:r><a:t/></a:r>"],
    ["a whitespace-only run", "<a:r><a:t> \t\n </a:t></a:r>"],
    ["a run of whitespace character references", "<a:r><a:t>&#32;&#x20;&#10;</a:t></a:r>"],
    ["a run of empty CDATA", "<a:r><a:t><![CDATA[]]></a:t></a:r>"],
    ["a line break only", "<a:br/>"],
    ["no runs", ""],
  ])("reports no text for %s", (_, runs) => {
    expect(shapeHasText(sp(runs))).toBe(false);
  });

  it.each([
    ["a run of an entity", "<a:r><a:t>&amp;</a:t></a:r>"],
    ["a run of an out-of-range reference", "<a:r><a:t>&#x110000;</a:t></a:r>"],
    ["a run of CDATA text", "<a:r><a:t><![CDATA[x]]></a:t></a:r>"],
    ["a field", '<a:fld id="{1}" type="slidenum"><a:t>3</a:t></a:fld>'],
    ["one non-empty run among empty ones", "<a:r><a:t> </a:t></a:r><a:r><a:t>.</a:t></a:r>"],
  ])("reports text for %s", (_, runs) => {
    expect(shapeHasText(sp(runs))).toBe(true);
  });

  it("does not count text outside a run or in a comment", () => {
    expect(shapeHasText(`<p:sp><p:nvSpPr>name</p:nvSpPr><!-- <a:t>x</a:t> --></p:sp>`)).toBe(false);
  });
});

describe("parseXml unreadable XML", () => {
  it.each([
    ["a tag closed by another name", "<a><b></a></b>"],
    ["an unclosed tag", "<a><b></b>"],
    ["a stray closing tag", "<a></a></b>"],
    ["two roots", "<a/><b/>"],
    ["no element", "<!-- only a comment -->"],
  ])("returns no tree for %s", (_, xml) => {
    expect(parseXml(xml)).toBeNull();
  });
});
