/**
 * XML well-formedness scan for package parts (OOXML, never HTML).
 *
 * Hand-rolled rather than DOMParser so the run-time check (browser) and the
 * regression set (Node, which has no DOMParser) run the exact same code. It
 * checks what makes a reader reject a part: unbalanced or crossed tags,
 * unterminated markup, unquoted or duplicate attributes, a raw `<` in an
 * attribute value, a bad `&` reference, text or a second element outside the
 * root. Anything it cannot judge with certainty it accepts.
 *
 * Returns null when well-formed, else a short reason (developer-facing).
 */

const PREDEFINED_ENTITIES = new Set(["amp", "lt", "gt", "quot", "apos"]);
const NAME = /[^\s/>=<"']+/y;
const END_TAG = /<\/([^\s>]+)\s*>/y;
const REFERENCE = /&(?:#[0-9]+|#x[0-9a-fA-F]+|([A-Za-z_:][\w.:-]*));/y;

function badReference(text: string, allowNamed: boolean): boolean {
  let amp = text.indexOf("&");
  while (amp !== -1) {
    REFERENCE.lastIndex = amp;
    const m = REFERENCE.exec(text);
    if (!m) return true;
    if (m[1] !== undefined && !allowNamed && !PREDEFINED_ENTITIES.has(m[1])) {
      return true;
    }
    amp = text.indexOf("&", amp + m[0].length);
  }
  return false;
}

export function xmlWellFormedError(source: string): string | null {
  const xml = source.charCodeAt(0) === 0xfeff ? source.slice(1) : source;
  const stack: string[] = [];
  let rootClosed = false;
  let rootSeen = false;
  // Without a DTD only the five predefined entities exist.
  let hasDoctype = false;
  let i = 0;

  while (i < xml.length) {
    const lt = xml.indexOf("<", i);
    const text = xml.slice(i, lt === -1 ? xml.length : lt);
    if (text.length > 0) {
      if (stack.length === 0) {
        if (text.trim() !== "") return "text outside the root element";
      } else if (badReference(text, hasDoctype)) {
        return "bad & reference in text";
      }
    }
    if (lt === -1) break;

    if (xml.startsWith("<?", lt)) {
      const end = xml.indexOf("?>", lt + 2);
      if (end === -1) return "unterminated processing instruction";
      i = end + 2;
    } else if (xml.startsWith("<!--", lt)) {
      const end = xml.indexOf("-->", lt + 4);
      if (end === -1) return "unterminated comment";
      i = end + 3;
    } else if (xml.startsWith("<![CDATA[", lt)) {
      if (stack.length === 0) return "CDATA outside the root element";
      const end = xml.indexOf("]]>", lt + 9);
      if (end === -1) return "unterminated CDATA";
      i = end + 3;
    } else if (xml.startsWith("<!DOCTYPE", lt)) {
      if (rootSeen) return "DOCTYPE after the root element";
      hasDoctype = true;
      const close = xml.indexOf(">", lt);
      const subset = xml.indexOf("[", lt);
      const end =
        subset !== -1 && (close === -1 || subset < close)
          ? xml.indexOf("]>", subset)
          : close;
      if (end === -1) return "unterminated DOCTYPE";
      i = end + (xml[end] === "]" ? 2 : 1);
    } else if (xml.startsWith("</", lt)) {
      END_TAG.lastIndex = lt;
      const m = END_TAG.exec(xml);
      if (!m) return "malformed end tag";
      const open = stack.pop();
      if (open !== m[1]) {
        return open === undefined
          ? `stray </${m[1]}>`
          : `<${open}> closed by </${m[1]}>`;
      }
      if (stack.length === 0) rootClosed = true;
      i = lt + m[0].length;
    } else {
      NAME.lastIndex = lt + 1;
      const nameMatch = NAME.exec(xml);
      if (!nameMatch) return "malformed start tag";
      if (rootClosed && stack.length === 0) return "second root element";
      const name = nameMatch[0];
      const seen = new Set<string>();
      let p = lt + 1 + name.length;
      let selfClosing = false;
      for (;;) {
        while (p < xml.length && /\s/.test(xml[p])) p++;
        if (p >= xml.length) return `unterminated <${name}>`;
        if (xml.startsWith("/>", p)) {
          selfClosing = true;
          p += 2;
          break;
        }
        if (xml[p] === ">") {
          p += 1;
          break;
        }
        NAME.lastIndex = p;
        const attr = NAME.exec(xml);
        if (!attr) return `malformed attribute in <${name}>`;
        if (seen.has(attr[0])) return `duplicate attribute ${attr[0]} in <${name}>`;
        seen.add(attr[0]);
        p += attr[0].length;
        while (p < xml.length && /\s/.test(xml[p])) p++;
        if (xml[p] !== "=") return `attribute ${attr[0]} without a value`;
        p++;
        while (p < xml.length && /\s/.test(xml[p])) p++;
        const quote = xml[p];
        if (quote !== '"' && quote !== "'") return `unquoted attribute ${attr[0]}`;
        const close = xml.indexOf(quote, p + 1);
        if (close === -1) return `unterminated attribute ${attr[0]}`;
        const value = xml.slice(p + 1, close);
        if (value.includes("<")) return `raw < in attribute ${attr[0]}`;
        if (badReference(value, hasDoctype)) {
          return `bad & reference in attribute ${attr[0]}`;
        }
        p = close + 1;
      }
      rootSeen = true;
      if (selfClosing) {
        if (stack.length === 0) rootClosed = true;
      } else {
        stack.push(name);
      }
      i = p;
    }
  }

  if (stack.length > 0) return `<${stack[stack.length - 1]}> never closed`;
  if (!rootSeen) return "no root element";
  return null;
}
