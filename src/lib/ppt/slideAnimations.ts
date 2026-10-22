/**
 * A slide's animations (`p:timing`) as they name its shapes: which shape ids
 * they target, and what to cut when shapes are deleted, so the deck still
 * opens without a repair prompt.
 *
 * Every element with a `spid` names a shape: a behaviour's target
 * (`p:spTgt`), a trigger's, a build entry (`p:bldP` and its kin). Cutting a
 * shape's animations removes each behaviour or build entry naming it, then
 * each time node (`p:par`, `p:seq`, `p:excl`) left with nothing to run, or
 * whose own conditions name it (a sequence triggered by clicking the shape),
 * upwards to the whole `p:timing` once nothing in it remains.
 */

import type { XmlElement } from "./xmlTree";

/** A span of the raw XML. */
export interface Span {
  start: number;
  end: number;
}

const TIME_CONTAINERS = new Set(["p:par", "p:seq", "p:excl"]);

/** Every element in `el` (itself included) that passes `test`, in document order. */
function find(el: XmlElement, test: (e: XmlElement) => boolean, out: XmlElement[] = []): XmlElement[] {
  if (test(el)) out.push(el);
  for (const c of el.children) find(c, test, out);
  return out;
}

const timings = (root: XmlElement) => find(root, (e) => e.name === "p:timing");
const namesAny = (el: XmlElement, ids: ReadonlySet<string>) =>
  find(el, (e) => e.attrs.spid !== undefined && ids.has(e.attrs.spid)).length > 0;

/** The shape ids the slide's animations name, in document order. */
export function animationTargets(root: XmlElement): string[] {
  return timings(root).flatMap((t) =>
    find(t, (e) => e.attrs.spid !== undefined).map((e) => e.attrs.spid),
  );
}

/**
 * Whether time node `node` goes once the shapes `ids` are deleted; the parts
 * of a node that stays which go are added to `cuts`.
 */
function prune(node: XmlElement, ids: ReadonlySet<string>, cuts: Span[]): boolean {
  if (!namesAny(node, ids)) return false;
  if (!TIME_CONTAINERS.has(node.name)) return true;
  const cTn = node.children.find((c) => c.name === "p:cTn");
  const list = cTn?.children.find((c) => c.name === "p:childTnLst");
  const conditions = [
    ...node.children.filter((c) => c !== cTn),
    ...(cTn?.children.filter((c) => c !== list) ?? []),
  ];
  if (!list || conditions.some((c) => namesAny(c, ids))) return true;
  const gone = list.children.filter((c) => prune(c, ids, cuts));
  // An empty child list is not allowed: the node goes with its children.
  if (gone.length === list.children.length) return true;
  cuts.push(...gone);
  return false;
}

/** What to cut from the slide's animations once the shapes `ids` are deleted. */
export function animationCuts(root: XmlElement, ids: ReadonlySet<string>): Span[] {
  const affected = timings(root).filter((t) => namesAny(t, ids));
  const cuts: Span[] = [];
  for (const timing of affected) {
    const tnLst = timing.children.find((c) => c.name === "p:tnLst");
    const bldLst = timing.children.find((c) => c.name === "p:bldLst");
    const nodeCuts: Span[] = [];
    const roots = tnLst?.children ?? [];
    const goneRoots = roots.filter((r) => prune(r, ids, nodeCuts));
    if (goneRoots.length === roots.length) {
      cuts.push(timing);
      continue;
    }
    cuts.push(...goneRoots, ...nodeCuts);
    const goneBuilds = bldLst?.children.filter((b) => namesAny(b, ids)) ?? [];
    if (bldLst && goneBuilds.length === bldLst.children.length) cuts.push(bldLst);
    else cuts.push(...goneBuilds);
  }
  // A structure this does not know would keep naming a deleted shape: drop
  // those animations whole rather than leave a deck that needs repair.
  const inCut = (e: XmlElement) => cuts.some((c) => c.start <= e.start && e.end <= c.end);
  const left = affected.some((t) => find(t, (e) => e.attrs.spid !== undefined && ids.has(e.attrs.spid) && !inCut(e)).length > 0);
  return left ? affected : cuts;
}

/** `xml` without the given spans, which must not overlap. */
export function cutSpans(xml: string, spans: Span[]): string {
  let out = xml;
  for (const s of [...spans].sort((a, b) => b.start - a.start)) {
    out = out.slice(0, s.start) + out.slice(s.end);
  }
  return out;
}
