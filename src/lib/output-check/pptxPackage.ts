import type { Violation } from "./core";
import { xmlWellFormedError } from "./xmlWellFormed";
import { indexZip, openZip, storedIdentically, type ZipReader } from "./zipReader";

/**
 * PPTX package inspector: opens a .pptx as an OPC package and answers the
 * structural questions tool checkers ask. Shared by every PPTX tool; works in
 * the browser and in Node.
 *
 * Structural defects use these property ids:
 * - `part-readable`: an XML or .rels part whose zip data cannot be read
 *   (corrupt compressed data); a damaged file, not a checker failure
 * - `xml-well-formed`: an XML or .rels part a reader would reject
 * - `content-type`: a part `[Content_Types].xml` does not cover
 * - `relationship-target`: an internal relationship whose target part is missing
 *
 * Package-wide reference checks, separate from `structuralDefects` because
 * they never skip a part (a part copied unchanged can still lose its last
 * reference elsewhere):
 * - `relationship-unused`: an image relationship its own part never names
 * - `media-unreferenced`: a `ppt/media/` part no relationship points at
 *
 * A defect's `detail` names the part (and target), so the same defect in two
 * packages compares equal by `property` + `detail`.
 */
export interface PptxPackage {
  /** Every file part, as named in the zip. */
  parts: string[];
  /** `ppt/slides/*.xml`, in slide order (trailing number of the file name). */
  slideParts: string[];
  /** `ppt/slideMasters/*.xml`, same ordering. */
  masterParts: string[];
  /** `ppt/slideLayouts/*.xml`, same ordering. */
  layoutParts: string[];
  /** Raw bytes of a part (null when absent or unreadable). */
  read(part: string): Promise<Uint8Array | null>;
  /** A part's text (null when absent or unreadable). */
  text(part: string): Promise<string | null>;
  /** The relationships `part` declares, in `.rels` order (none without a `.rels`); shared, so read-only. */
  relationships(part: string): Promise<readonly Relationship[]>;
  /** A part's size as stored in the zip (null when absent or not indexable). */
  storedSize(part: string): number | null;
  /**
   * True when `part` is stored byte-identically here and in `baseline`, so it
   * reads the same from both without inflating either. False when it cannot
   * tell cheaply (an archive read through JSZip); the caller then compares
   * the bytes.
   */
  storedAsIn(baseline: PptxPackage, part: string): boolean;
  /**
   * With `baseline` (the package this one was made from), a part stored
   * byte-identically in both is not re-read: its own defects (readable,
   * well-formed) would be the baseline's too, inherited by definition.
   * Package-wide checks (content types, relationship targets) still cover
   * every part.
   */
  structuralDefects(baseline?: PptxPackage): Promise<Violation[]>;
  /**
   * For each given slide/master part, the media part its declared background
   * (`<p:bg>` picture fill) points at, or null when it declares none.
   */
  backgroundMedia(parts: readonly string[]): Promise<Map<string, string | null>>;
  /**
   * The parts `part` relates to by relationship type, named by the type URI's
   * last segment (e.g. `slideLayout`), in `.rels` order. Internal targets only.
   */
  relatedParts(part: string, type: string): Promise<string[]>;
  /**
   * The media parts of the image relationships whose id `part` names, i.e.
   * the images it shows (pictures and a declared background), in `.rels`
   * order. Null for an external or unresolvable target.
   */
  shownImages(part: string): Promise<(string | null)[]>;
  /**
   * Image relationships whose source part never names their id. Only image
   * relationships are checked: a part must name them (`r:embed`, `r:link`,
   * `r:id`) to use them, while layout, theme or notes relationships are used
   * implicitly by type. Covers every part, or only the given source parts.
   */
  unusedRelationships(parts?: readonly string[]): Promise<Violation[]>;
  /** `ppt/media/` parts that no relationship anywhere in the package targets. */
  unreferencedMedia(): Promise<Violation[]>;
}

const XML_PART = /\.(xml|rels)$/i;
const RELS_PART = /^(?:(.*)\/)?_rels\/([^/]*)\.rels$/;
const TAG_ATTRS = /([\w:]+)\s*=\s*(?:"([^"]*)"|'([^']*)')/g;
const ATTR_VALUES = /=\s*(?:"([^"]*)"|'([^']*)')/g;
const IMAGE_REL_TYPE = /\/relationships\/image$/;

function ordinal(path: string): number {
  const m = path.match(/(\d+)\.xml$/);
  return m ? parseInt(m[1], 10) : 0;
}

function partsIn(parts: string[], dir: string): string[] {
  const pattern = new RegExp(`^${dir}/[^/]+\\.xml$`);
  return parts.filter((p) => pattern.test(p)).sort((a, b) => ordinal(a) - ordinal(b));
}

function attrs(tag: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const m of tag.matchAll(TAG_ATTRS)) out[m[1]] = m[2] ?? m[3];
  return out;
}

/** Every attribute value in a part: a relationship is used when one names its id. */
function namedValues(xml: string): Set<string> {
  const named = new Set<string>();
  for (const m of xml.matchAll(ATTR_VALUES)) named.add(m[1] ?? m[2]);
  return named;
}

function decodePartName(name: string): string {
  try {
    return decodeURIComponent(name);
  } catch {
    return name;
  }
}

/** Resolve a relationship target against its source directory. Null if it escapes the package. */
export function resolveTarget(sourceDir: string, target: string): string | null {
  const bare = decodePartName(target.split("#")[0]);
  const segments = bare.startsWith("/")
    ? []
    : sourceDir === ""
      ? []
      : sourceDir.split("/");
  for (const seg of bare.replace(/^\/+/, "").split("/")) {
    if (seg === "" || seg === ".") continue;
    if (seg === "..") {
      if (segments.length === 0) return null;
      segments.pop();
    } else {
      segments.push(seg);
    }
  }
  return segments.join("/");
}

/** `load` computed once per key: the package's parts never change once opened. */
function memo<T>(load: (key: string) => Promise<T>): (key: string) => Promise<T> {
  const byKey = new Map<string, Promise<T>>();
  return (key) => {
    let found = byKey.get(key);
    if (!found) byKey.set(key, (found = load(key)));
    return found;
  };
}

/** The `.rels` part that holds a part's relationships. */
export function relsPartOf(part: string): string {
  const slash = part.lastIndexOf("/");
  return `${part.slice(0, slash + 1)}_rels/${part.slice(slash + 1)}.rels`;
}

export interface Relationship {
  readonly id: string;
  readonly type: string;
  /** Resolved part name, or null for an external or unresolvable target. */
  readonly part: string | null;
  readonly external: boolean;
}

/**
 * The relationships a `.rels` part's XML declares, in order, their targets
 * resolved against `sourceDir` (the source part's directory), whatever order
 * and quotes their attributes take. One parser for every reader, so keys
 * built from targets (covering-background groups) agree everywhere.
 */
export function parseRelationships(relsXml: string, sourceDir: string): Relationship[] {
  return [...relsXml.matchAll(/<Relationship\b[^>]*>/g)].map((m) => {
    const a = attrs(m[0]);
    const external = a.TargetMode === "External";
    return {
      id: a.Id ?? "",
      type: a.Type ?? "",
      external,
      part: external || !a.Target ? null : resolveTarget(sourceDir, a.Target),
    };
  });
}

const zipOf = new WeakMap<PptxPackage, ZipReader>();

/** Opens the bytes as a zip; null when they are not one. */
export async function openPptxPackage(bytes: Uint8Array): Promise<PptxPackage | null> {
  const zip = await openZip(bytes);
  if (!zip) return null;
  const parts = zip.names;
  // OPC part names compare case-insensitively.
  const byLowerName = new Map(parts.map((p) => [p.toLowerCase(), p]));
  /** A part's text; null when absent or its zip data is corrupt. */
  const text = memo((part: string): Promise<string | null> => zip.text(part));

  // Parsed once per `.rels` part: checks ask for a slide's relationships
  // several times, and design-tool slides carry hundreds of them.
  const relationshipsOf = memo(async (relsPart: string): Promise<readonly Relationship[]> => {
    const xml = await text(relsPart);
    if (xml === null) return [];
    const sourceDir = relsPart.match(RELS_PART)?.[1] ?? "";
    return parseRelationships(xml, sourceDir).map((rel) =>
      rel.part === null ? rel : { ...rel, part: byLowerName.get(rel.part.toLowerCase()) ?? rel.part },
    );
  });

  const relsParts = parts.filter((p) => RELS_PART.test(p));
  let index: ReturnType<typeof indexZip> | undefined;

  /** The part a `.rels` part describes; null for the package's own `_rels/.rels`. */
  const sourceOf = (relsPart: string): string | null => {
    const m = relsPart.match(RELS_PART);
    if (!m || m[2] === "") return null;
    return m[1] ? `${m[1]}/${m[2]}` : m[2];
  };

  const pkg: PptxPackage = {
    parts,
    slideParts: partsIn(parts, "ppt/slides"),
    masterParts: partsIn(parts, "ppt/slideMasters"),
    layoutParts: partsIn(parts, "ppt/slideLayouts"),

    read(part) {
      return zip.bytes(part);
    },

    text,

    relationships(part) {
      return relationshipsOf(relsPartOf(part));
    },

    storedSize(part) {
      index ??= indexZip(bytes);
      return index?.get(part)?.compressedSize ?? null;
    },

    storedAsIn(baseline, part) {
      const base = zipOf.get(baseline);
      return base !== undefined && storedIdentically(zip, base, part);
    },

    async structuralDefects(baseline) {
      const defects: Violation[] = [];
      const base = baseline && zipOf.get(baseline);
      const toCheck = parts.filter(
        (p) => XML_PART.test(p) && !(base && storedIdentically(zip, base, p)),
      );
      // Inflate in parallel: one await per part serialises the stream round trips.
      await Promise.all([...toCheck, ...relsParts, "[Content_Types].xml"].map(text));

      for (const part of toCheck) {
        const xml = await text(part);
        if (xml === null) {
          defects.push({ property: "part-readable", detail: part });
          continue;
        }
        const reason = xmlWellFormedError(xml);
        if (reason) defects.push({ property: "xml-well-formed", detail: `${part}: ${reason}` });
      }

      const ctXml = await text("[Content_Types].xml");
      if (ctXml === null) {
        defects.push({ property: "content-type", detail: "[Content_Types].xml missing" });
      } else {
        const defaults = new Set<string>();
        const overrides = new Set<string>();
        for (const m of ctXml.matchAll(/<(Default|Override)\b[^>]*>/g)) {
          const a = attrs(m[0]);
          if (m[1] === "Default" && a.Extension) defaults.add(a.Extension.toLowerCase());
          if (m[1] === "Override" && a.PartName) {
            overrides.add(decodePartName(a.PartName).replace(/^\//, "").toLowerCase());
          }
        }
        for (const part of parts) {
          if (part === "[Content_Types].xml") continue;
          const lower = part.toLowerCase();
          const ext = lower.includes(".") ? lower.slice(lower.lastIndexOf(".") + 1) : "";
          if (!overrides.has(lower) && !defaults.has(ext)) {
            defects.push({ property: "content-type", detail: part });
          }
        }
      }

      for (const relsPart of relsParts) {
        for (const rel of await relationshipsOf(relsPart)) {
          if (rel.external) continue;
          if (rel.part === null || !byLowerName.has(rel.part.toLowerCase())) {
            defects.push({
              property: "relationship-target",
              detail: `${relsPart} ${rel.id} → ${rel.part ?? "outside the package"}`,
            });
          }
        }
      }
      return defects;
    },

    async backgroundMedia(targets) {
      const result = new Map<string, string | null>();
      for (const part of targets) {
        const xml = await text(part);
        const bg = xml?.match(/<p:bg[\s>][\s\S]*?<\/p:bg>/)?.[0];
        const embed = bg?.match(/<a:blip\b[^>]*\br:embed="([^"]+)"/)?.[1];
        if (!embed) {
          result.set(part, null);
          continue;
        }
        const rel = (await relationshipsOf(relsPartOf(part))).find((r) => r.id === embed);
        result.set(part, rel?.part ?? null);
      }
      return result;
    },

    async relatedParts(part, type) {
      const suffix = `/${type}`;
      return (await relationshipsOf(relsPartOf(part))).flatMap((r) =>
        !r.external && r.part !== null && r.type.endsWith(suffix) ? [r.part] : [],
      );
    },

    async shownImages(part) {
      const [rels, xml] = await Promise.all([relationshipsOf(relsPartOf(part)), text(part)]);
      if (xml === null) return [];
      const named = namedValues(xml);
      return rels
        .filter((r) => IMAGE_REL_TYPE.test(r.type) && named.has(r.id))
        .map((r) => r.part);
    },

    async unusedRelationships(sources) {
      const wanted = sources && new Set(sources);
      const pairs: { relsPart: string; source: string }[] = [];
      for (const relsPart of relsParts) {
        const named = sourceOf(relsPart);
        // The zip's own spelling of the part: OPC names compare case-insensitively.
        const source = named === null ? undefined : byLowerName.get(named.toLowerCase());
        if (source && XML_PART.test(source) && (!wanted || wanted.has(source))) {
          pairs.push({ relsPart, source });
        }
      }
      await Promise.all(pairs.flatMap((x) => [text(x.relsPart), text(x.source)]));

      const unused: Violation[] = [];
      for (const { relsPart, source } of pairs) {
        const images = (await relationshipsOf(relsPart)).filter((r) =>
          IMAGE_REL_TYPE.test(r.type),
        );
        if (images.length === 0) continue;
        const xml = await text(source);
        // Unreadable parts are reported by structuralDefects, not here.
        if (xml === null) continue;
        const named = namedValues(xml);
        for (const rel of images) {
          if (!named.has(rel.id)) {
            unused.push({
              property: "relationship-unused",
              detail: `${relsPart} ${rel.id} → ${rel.part ?? "external"}`,
            });
          }
        }
      }
      return unused;
    },

    async unreferencedMedia() {
      await Promise.all(relsParts.map(text));
      const referenced = new Set<string>();
      for (const relsPart of relsParts) {
        for (const rel of await relationshipsOf(relsPart)) {
          if (rel.part !== null) referenced.add(rel.part.toLowerCase());
        }
      }
      return parts
        .filter((p) => /^ppt\/media\/[^/]+$/i.test(p) && !referenced.has(p.toLowerCase()))
        .map((p) => ({ property: "media-unreferenced", detail: p }));
    },
  };
  zipOf.set(pkg, zip);
  return pkg;
}
