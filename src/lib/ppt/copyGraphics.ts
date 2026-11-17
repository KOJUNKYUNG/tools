/**
 * Background graphics copied onto a slide that hides its background graphics
 * (CONTEXT.md → Background graphics): when only some of the slides showing a
 * master or layout change, they hide all of it, and the elements that stay on
 * them (a kept logo, a kept covering background) come back as the slide's own,
 * under its own elements, exactly where they were. A copy names its own
 * relationships (the same pictures, links) and takes fresh shape ids, so it
 * reads the same on the slide as on its master.
 */

import { parseRelationships, type Relationship } from "@/lib/output-check/pptxPackage";
import type { StackElement } from "./coveringBackgrounds";
import { child, findAll, parseXml, type XmlElement } from "./xmlTree";

/** A background graphic to copy, read from its part before anything changes. */
export interface GraphicCopy {
  /** The element's XML, as its part holds it. */
  xml: string;
  /** The relationships of its part, by id: the ones it names come with it. */
  rels: ReadonlyMap<string, Relationship>;
  /** The namespace declarations in scope where it sits in its part (its root, its shape tree…), by attribute name (`xmlns:a`). */
  namespaces: ReadonlyMap<string, string>;
}

/** A shape id as an element's `cNvPr` declares it. */
export const SHAPE_ID = /(<(?:\w+:)?cNvPr\b[^>]*\sid\s*=\s*["'])(\d+)(["'])/g;
/** A connector's end, naming the shape it joins. */
export const CONNECTION = /(<(?:\w+:)?(?:stCxn|endCxn)\b[^>]*\sid\s*=\s*["'])(\d+)(["'])/g;
/** An attribute and its value, in double or single quotes. */
export const ATTRIBUTE = /(\s[\w:]+\s*=\s*)(?:"([^"]*)"|'([^']*)')/g;

const isDeclaration = (name: string) => name === "xmlns" || name.startsWith("xmlns:");

/** The namespace declarations on a part's root start tag, by attribute name (`xmlns:a`). */
function rootNamespaces(partXml: string): Map<string, string> {
  const root = partXml.match(/<(?!\?)[A-Za-z][^>]*>/)?.[0] ?? "";
  return new Map([...root.matchAll(/\s(xmlns(?::[\w.-]+)?)\s*=\s*(?:"([^"]*)"|'([^']*)')/g)].map((m) => [m[1], m[2] ?? m[3]]));
}

/**
 * The namespace declarations in scope at `at` in a part: on every element
 * enclosing it, the innermost winning. Some producers declare prefixes on the
 * shape tree, not the root (미리캔버스 declares `r:` there).
 */
function namespacesAt(root: XmlElement | null, at: number): Map<string, string> {
  const found = new Map<string, string>();
  for (let el = root ?? undefined; el && el.start <= at; el = el.children.find((c) => c.start <= at && at < c.end)) {
    for (const [name, uri] of Object.entries(el.attrs)) if (isDeclaration(name)) found.set(name, uri);
    if (el.start === at) break;
  }
  return found;
}

/** The elements of `part` (its XML and `.rels`) as copies, in the order given. */
export function readCopies(
  part: string,
  partXml: string,
  relsXml: string | null,
  elements: readonly StackElement[],
): GraphicCopy[] {
  const rels = new Map(parseRelationships(relsXml ?? "", part.slice(0, part.lastIndexOf("/"))).map((r) => [r.id, r]));
  const root = parseXml(partXml);
  return elements.map((e) => ({ xml: partXml.slice(e.start, e.end), rels, namespaces: namespacesAt(root, e.start) }));
}

const EMPTY_RELS =
  '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n' +
  '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">\n' +
  "</Relationships>";

/** The highest number among `rId<n>` relationship ids. */
const highestRelId = (relsXml: string) =>
  Math.max(0, ...[...relsXml.matchAll(/\bId\s*=\s*["']rId(\d+)["']/g)].map((m) => Number(m[1])));

/** `part` as a relationship target from `fromDir`. */
function relativeTarget(fromDir: string, part: string): string {
  const [from, to] = [fromDir.split("/").filter(Boolean), part.split("/")];
  let shared = 0;
  while (shared < from.length && shared < to.length - 1 && from[shared] === to[shared]) shared++;
  return [...from.slice(shared).map(() => ".."), ...to.slice(shared)].join("/");
}

const escapeXml = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;");

/**
 * Where copies go in a slide: right after its shape tree's own group
 * properties (self-closing or not), at the bottom of the stack; null when the
 * slide has no shape tree or does not parse.
 */
function bottomOfStack(slideXml: string): number | null {
  const root = parseXml(slideXml);
  const tree = root ? findAll(root, (e) => e.name === "p:spTree")[0] : undefined;
  if (!tree) return null;
  const after = child(tree, "p:grpSpPr") ?? child(tree, "p:nvGrpSpPr");
  return after ? after.end : slideXml.indexOf(">", tree.start) + 1;
}

/**
 * The slide with `copies` laid at the bottom of its shape tree, bottom first,
 * and its `.rels` naming what they name. Unchanged when there are none, or
 * when the slide has no shape tree to lay them in.
 */
export function withCopies(
  slidePart: string,
  slideXml: string,
  relsXml: string | null,
  copies: readonly GraphicCopy[],
): { slideXml: string; relsXml: string | null } {
  const at = copies.length === 0 ? null : bottomOfStack(slideXml);
  if (at === null) return { slideXml, relsXml };
  const slideDir = slidePart.slice(0, slidePart.lastIndexOf("/"));
  let rels = relsXml ?? EMPTY_RELS;
  let nextRel = highestRelId(rels) + 1;
  let nextId = Math.max(0, ...[...slideXml.matchAll(SHAPE_ID)].map((m) => Number(m[2]))) + 1;
  const declared = rootNamespaces(slideXml);
  const missing = new Map<string, string>();

  const laid = copies.map(({ xml, rels: theirs, namespaces }) => {
    // Every attribute naming one of its part's relationships names a new one of the slide's, to the same target.
    const renamed = new Map<string, string>();
    let copy = xml.replace(ATTRIBUTE, (attr, before: string, double?: string, single?: string) => {
      const [value, quote] = double !== undefined ? [double, '"'] : [single ?? "", "'"];
      const rel = theirs.get(value);
      if (!rel || /^\s*id\s*=/.test(before)) return attr;
      let id = renamed.get(value);
      if (!id) {
        id = `rId${nextRel++}`;
        renamed.set(value, id);
        const target = rel.external || rel.part === null ? rel.target : relativeTarget(slideDir, rel.part);
        rels = rels.replace(
          "</Relationships>",
          `<Relationship Id="${id}" Type="${escapeXml(rel.type)}" Target="${escapeXml(target)}"${rel.external ? ' TargetMode="External"' : ""}/>\n</Relationships>`,
        );
      }
      return `${before}${quote}${id}${quote}`;
    });
    // Fresh shape ids: the slide's own may already use the master's. A
    // connector in the copy follows the shapes it joins.
    const ids = new Map<string, number>();
    copy = copy.replace(SHAPE_ID, (_, a: string, old: string, b: string) => {
      ids.set(old, nextId);
      return `${a}${nextId++}${b}`;
    });
    copy = copy.replace(CONNECTION, (link, a: string, old: string, b: string) => (ids.has(old) ? `${a}${ids.get(old)}${b}` : link));
    // Prefixes it uses (on elements and attributes) that the slide's root does
    // not declare come from where it sat in its part, unless the copy declares them itself.
    for (const m of copy.matchAll(/<\/?([\w.-]+):|\s([\w.-]+):[\w.-]+\s*=/g)) {
      const prefix = m[1] ?? m[2];
      const name = `xmlns:${prefix}`;
      const uri = namespaces.get(name);
      if (prefix !== "xmlns" && uri && !declared.has(name) && !copy.includes(`${name}=`)) missing.set(name, uri);
    }
    return copy;
  });

  let out = slideXml.slice(0, at) + laid.join("") + slideXml.slice(at);
  if (missing.size > 0) {
    const decls = [...missing].map(([name, uri]) => ` ${name}="${escapeXml(uri)}"`).join("");
    out = out.replace(/<(?!\?)([A-Za-z][\w:.-]*)/, `<$1${decls}`);
  }
  return { slideXml: out, relsXml: rels };
}
