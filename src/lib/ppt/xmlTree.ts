/**
 * The shared slide XML tree reader for the ppt tools: slides, layouts and
 * masters read into an element tree. Hand-rolled (no DOMParser) so it runs in
 * Node as in the browser.
 *
 * Each element also carries its source range in the raw XML, so a caller can
 * cut it out exactly, and whether it holds text a viewer sees: a text run
 * (`a:t`, in a run or a field) with anything but whitespace, in the element
 * or anywhere inside it.
 */

const ATTR = /([^\s=/>]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const TOKEN =
  /<!--[\s\S]*?-->|<\?[\s\S]*?\?>|<!\[CDATA\[([\s\S]*?)\]\]>|<!DOCTYPE[^>]*>|<(\/?)([^\s/>]+)((?:\s+[^\s=/>]+\s*=\s*(?:"[^"]*"|'[^']*'))*)\s*(\/?)>/g;
/** A character reference, or any other entity reference (never whitespace). */
const REFERENCE = /&#(\d+);|&#x([0-9a-f]+);|&[^;\s]*;/gi;

export interface XmlElement {
  name: string;
  attrs: Record<string, string>;
  children: XmlElement[];
  /** Where the element starts and ends in the raw XML: `xml.slice(start, end)` is its text. */
  start: number;
  end: number;
  /** Whether it, or anything inside it, holds a text run with more than whitespace. */
  hasText: boolean;
}

/** Whether raw character data holds anything but whitespace once its references are read. */
const showsText = (data: string) =>
  /\S/.test(
    data.replace(REFERENCE, (_, dec?: string, hex?: string) => {
      const code = dec ? Number(dec) : hex ? parseInt(hex, 16) : NaN;
      // Out-of-range references are not whitespace either.
      return code <= 0x10ffff ? String.fromCodePoint(code) : "&";
    }),
  );

/** The root element, or null for XML whose tags do not nest. */
export function parseXml(xml: string): XmlElement | null {
  const top: XmlElement = { name: "", attrs: {}, children: [], start: 0, end: xml.length, hasText: false };
  const stack = [top];
  let dataStart = 0;
  for (const m of xml.matchAll(TOKEN)) {
    const [token, cdata, closing, name, attrText, selfClosing] = m;
    // Character data between tokens, or a CDATA section, belongs to the open element.
    const data = (cdata ?? "") + xml.slice(dataStart, m.index);
    dataStart = m.index + token.length;
    if (stack[stack.length - 1].name === "a:t" && showsText(data)) {
      for (const open of stack) open.hasText = true;
    }
    if (name === undefined) continue; // comment, declaration, CDATA
    const parent = stack[stack.length - 1];
    if (closing) {
      if (stack.length === 1 || parent.name !== name) return null;
      parent.end = m.index + token.length;
      stack.pop();
      continue;
    }
    const attrs: Record<string, string> = {};
    for (const a of attrText.matchAll(ATTR)) attrs[a[1]] = a[2] ?? a[3];
    const element: XmlElement = {
      name,
      attrs,
      children: [],
      start: m.index,
      end: m.index + token.length,
      hasText: false,
    };
    parent.children.push(element);
    if (!selfClosing) stack.push(element);
  }
  return stack.length === 1 && top.children.length === 1 ? top.children[0] : null;
}

export const child = (el: XmlElement | undefined, name: string) =>
  el?.children.find((c) => c.name === name);
