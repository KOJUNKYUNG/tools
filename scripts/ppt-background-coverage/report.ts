// Real-file coverage report for ppt-background (#111): what the local decks
// in the real-fixture folder show of the covering-background rule, so the
// maintainer knows which kinds of decks to collect next. Dev-only; reads the
// folder and prints, writes nothing.
//
// Run: pnpm report:ppt-background   (REAL_FIXTURES_DIR overrides the folder)
//
// Purposes, and producers the deck's properties misreport, come from an
// optional `coverage-tags.json` in the same folder: see docs/agents/workflow.md
// ("ppt-background coverage report").

import { readFile } from "node:fs/promises";
import path from "node:path";
import type { SlideSize } from "@/lib/image/slideImage";
import { findRealFixtures, realFixtureDir } from "@/lib/output-check/realFixtures";
import { openPptxPackage, type PptxPackage } from "@/lib/output-check/pptxPackage";
import {
  coveringGroupKey,
  coveringRun,
  topLevelElements,
  type CoveringBackground,
} from "@/lib/ppt/coveringBackgrounds";
import { fillChild } from "@/lib/ppt/fills";
import { slideSizeFromXml } from "@/lib/ppt/getSlideAspect";
import { animationTargets } from "@/lib/ppt/slideAnimations";
import { packagePartReader, slideColours } from "@/lib/ppt/slideColours";
import { child, parseXml, type XmlElement } from "@/lib/ppt/xmlTree";

// Each list is every case of its kind, in report order; the summary marks
// those no deck shows yet. `as const` keeps the names as literal types.
const FORMS = [
  "picture",
  "picture-filled shape",
  "opaque fill",
  "group (picture)",
  "group (opaque fill)",
  "group (picture + opaque fill)",
] as const;
const NEAR_MISSES = ["text", "transparent fill", "no fill", "nothing above"] as const;
/** Spec #105's collection matrix: the producers and purposes to cover. */
const PRODUCERS = ["PowerPoint", "Google Slides", "Keynote", "Canva", "미리캔버스", "한쇼", "LibreOffice", "image-to-pptx"];
// Sermons read as presentations (template, report); retreat games are an event.
const PURPOSES = ["sheet-music", "lyrics", "event", "lesson", "report", "template"];
/** A background's kind by its fill element; `bgRef` names a theme style. */
const BACKGROUND_KINDS = new Map([
  ["a:blipFill", "picture"],
  ["a:solidFill", "solid"],
  ["a:gradFill", "gradient"],
  ["a:pattFill", "pattern"],
  ["a:noFill", "no fill"],
]);
const SHOWN_KINDS = ["picture", "solid", "gradient", "pattern", "theme style"];

type Form = (typeof FORMS)[number];
type NearMiss = (typeof NEAR_MISSES)[number];

interface CoveringGroup {
  key: string;
  forms: Form[];
  slides: number[];
  animatedOn: number[];
}

interface DeckReport {
  file: string;
  /** What the deck's properties say made it. */
  reportedProducer: string;
  slideCount: number;
  slide: SlideSize;
  covering: CoveringGroup[];
  nearMisses: Map<NearMiss, number[]>;
  /** Slides by the kind of their own background. */
  slideBackgrounds: Map<string, number[]>;
  /** Layout file names by the kind of their own background. */
  layoutBackgrounds: Map<string, string[]>;
  layoutCount: number;
  /** Whether ppt-background already ran on it: a re-run input. */
  rerun: boolean;
}

interface Tag {
  producer?: string;
  purpose?: string;
}

/** The value of the first `<name>` element in `xml`. */
const property = (xml: string | null, name: string) =>
  xml?.match(new RegExp(`<${name}>([^<]*)</${name}>`))?.[1]?.trim() || null;

/** What the deck's `docProps` say made it. */
async function producerOf(pkg: PptxPackage): Promise<string> {
  const [app, core] = await Promise.all([pkg.text("docProps/app.xml"), pkg.text("docProps/core.xml")]);
  if (app === null) return "(no properties)";
  if ([property(app, "Company"), property(core, "dc:creator")].includes("PptxGenJS")) return "PptxGenJS";
  return [property(app, "Application") ?? "?", property(app, "AppVersion")].filter(Boolean).join(" ");
}

/** The kind of a part's own background; null when it declares none. */
function backgroundKind(root: XmlElement | null): string | null {
  const bg = child(child(root ?? undefined, "p:cSld"), "p:bg");
  if (!bg) return null;
  if (child(bg, "p:bgRef")) return "theme style";
  return BACKGROUND_KINDS.get(fillChild(child(bg, "p:bgPr"))?.name ?? "") ?? "other";
}

/** The form of a covering background; a group's by what its members show. */
function formOf(el: XmlElement | undefined, covering: CoveringBackground): Form {
  const [pictures, fills] = [covering.pictures.length > 0, covering.fills.length > 0];
  if (el?.name === "p:grpSp") {
    return pictures && fills ? "group (picture + opaque fill)" : pictures ? "group (picture)" : "group (opaque fill)";
  }
  if (el?.name === "p:pic") return "picture";
  return pictures ? "picture-filled shape" : "opaque fill";
}

function push<K, V>(map: Map<K, V[]>, key: K, value: V) {
  map.set(key, [...(map.get(key) ?? []), value]);
}

async function analyse(file: string): Promise<DeckReport> {
  const pkg = await openPptxPackage(new Uint8Array(await readFile(file)));
  if (!pkg) throw new Error(`not a readable deck: ${file}`);
  const presentation = await pkg.text("ppt/presentation.xml");
  const slide = (presentation && slideSizeFromXml(presentation)) || { w: 12192000, h: 6858000 };
  const coloursOf = slideColours(packagePartReader(pkg));
  const groups = new Map<string, CoveringGroup>();
  const report: DeckReport = {
    file: path.basename(file),
    reportedProducer: await producerOf(pkg),
    slideCount: pkg.slideParts.length,
    slide,
    covering: [],
    nearMisses: new Map(),
    slideBackgrounds: new Map(),
    layoutBackgrounds: new Map(),
    layoutCount: pkg.layoutParts.length,
    // The engine names its pictures so (`uniqueMediaName`).
    rerun: pkg.parts.some((p) => p.startsWith("ppt/media/background_custom")),
  };

  for (const [i, part] of pkg.slideParts.entries()) {
    const n = i + 1;
    const xml = (await pkg.text(part)) ?? "";
    const root = parseXml(xml);
    push(report.slideBackgrounds, backgroundKind(root) ?? "none", n);
    const elements = topLevelElements(root);
    if (!root || !elements) continue;
    const { qualifying: run, missed, somethingAbove } = coveringRun(elements, slide, await coloursOf(part, xml));
    if (missed) push(report.nearMisses, missed.reason, n);
    if (run.length === 0) continue;
    if (!somethingAbove) {
      push(report.nearMisses, "nothing above", n);
      continue;
    }
    const targets = new Map((await pkg.relationships(part)).map((r) => [r.id, r.part]));
    const key = coveringGroupKey(run, (id) => targets.get(id));
    const group = groups.get(key) ?? { key, forms: [], slides: [], animatedOn: [] };
    for (const c of run) {
      const form = formOf(elements.find((e) => e.start === c.start), c);
      if (!group.forms.includes(form)) group.forms.push(form);
    }
    group.slides.push(n);
    const animated = new Set(animationTargets(root));
    if (run.some((c) => c.shapeIds.some((id) => animated.has(id)))) group.animatedOn.push(n);
    groups.set(key, group);
  }

  for (const part of pkg.layoutParts) {
    const kind = backgroundKind(parseXml((await pkg.text(part)) ?? ""));
    if (kind) push(report.layoutBackgrounds, kind, path.posix.basename(part));
  }
  report.covering = [...groups.values()];
  return report;
}

/** Slide numbers as ranges: 1–3, 5. */
function ranges(slides: number[]): string {
  const out: string[] = [];
  for (let i = 0; i < slides.length; i++) {
    let j = i;
    while (j + 1 < slides.length && slides[j + 1] === slides[j] + 1) j++;
    out.push(j > i ? `${slides[i]}–${slides[j]}` : `${slides[i]}`);
    i = j;
  }
  return out.join(", ");
}

const slidesText = (slides: number[]) => `${slides.length} (${ranges(slides)})`;

function aspect({ w, h }: SlideSize): string {
  const r = w / h;
  const named = [
    ["16:9", 16 / 9],
    ["16:10", 16 / 10],
    ["4:3", 4 / 3],
  ] as const;
  const name = named.find(([, v]) => Math.abs(v - r) < 0.01)?.[0] ?? r.toFixed(3);
  const cm = (emu: number) => (emu / 360000).toFixed(2);
  return `${name}, ${cm(w)} × ${cm(h)} cm`;
}

function printDeck(d: DeckReport, tag: Tag | undefined) {
  const line = (label: string, text: string) => console.log(`  ${label.padEnd(12)}${text}`);
  console.log(`\n${d.file}`);
  line("producer", `${d.reportedProducer}${tag?.producer ? `  → tagged ${tag.producer}` : ""}`);
  line("purpose", tag?.purpose ?? "? (untagged)");
  line("slides", `${d.slideCount} · ${aspect(d.slide)}${d.rerun ? " · ppt-background output (re-run input)" : ""}`);
  if (d.covering.length === 0) line("covering", "none");
  for (const g of d.covering) {
    line("covering", `${g.forms.join(" + ")}: slides ${slidesText(g.slides)}`);
    line("", `  key ${g.key}`);
    if (g.animatedOn.length > 0) line("", `  animated on slides ${ranges(g.animatedOn)}`);
  }
  if (d.nearMisses.size === 0) line("near miss", "none");
  for (const [reason, slides] of d.nearMisses) line("near miss", `${reason}: slides ${slidesText(slides)}`);
  for (const [kind, slides] of d.slideBackgrounds) line("own bg", `${kind}: slides ${slidesText(slides)}`);
  if (d.layoutBackgrounds.size === 0) line("layout bg", `none of ${d.layoutCount} layouts`);
  for (const [kind, layouts] of d.layoutBackgrounds) {
    line("layout bg", `${kind}: ${layouts.length} of ${d.layoutCount} (${layouts.join(", ")})`);
  }
}

/** The cases a deck shows, as the summary counts them. */
function casesOf(d: DeckReport): string[] {
  return [
    ...new Set([
      ...(d.rerun ? ["input: ppt-background output"] : []),
      ...d.covering.flatMap((g) => g.forms.map((f) => `covering: ${f}`)),
      ...(d.covering.some((g) => g.animatedOn.length > 0) ? ["covering: animated"] : []),
      ...[...d.nearMisses.keys()].map((r) => `near miss: ${r}`),
      ...[...d.slideBackgrounds.keys()].filter((k) => k !== "none").map((k) => `slide's own bg: ${k}`),
      ...[...d.layoutBackgrounds.keys()].map((k) => `layout's own bg: ${k}`),
    ]),
  ];
}

const ALL_CASES = [
  "input: ppt-background output",
  ...[...FORMS, "animated"].map((f) => `covering: ${f}`),
  ...NEAR_MISSES.map((r) => `near miss: ${r}`),
  ...SHOWN_KINDS.map((k) => `slide's own bg: ${k}`),
  ...SHOWN_KINDS.map((k) => `layout's own bg: ${k}`),
];

function printSummary(decks: { report: DeckReport; producer: string; purpose: string }[]) {
  // The matrix's cells, then whatever else the decks show (untagged producers, "?").
  const producers = [...new Set([...PRODUCERS, ...decks.map((d) => d.producer)])];
  const purposes = [...new Set([...PURPOSES, ...decks.map((d) => d.purpose)])];
  const width = Math.max(...producers.map((p) => p.length)) + 2;
  const col = Math.max(...purposes.map((p) => p.length)) + 2;
  console.log("\n== Decks by producer × purpose (· = none yet)");
  console.log("".padEnd(width) + purposes.map((p) => p.padStart(col)).join(""));
  for (const producer of producers) {
    const cells = purposes.map((purpose) => {
      const n = decks.filter((d) => d.producer === producer && d.purpose === purpose).length;
      return (n ? String(n) : "·").padStart(col);
    });
    console.log(producer.padEnd(width) + cells.join(""));
  }

  console.log("\n== Cases by producer");
  const byCase = new Map<string, Set<string>>();
  for (const d of decks) for (const c of casesOf(d.report)) byCase.set(c, (byCase.get(c) ?? new Set()).add(d.producer));
  for (const c of [...new Set([...ALL_CASES, ...byCase.keys()])]) {
    const seen = byCase.get(c);
    console.log(`  ${c.padEnd(42)}${seen ? [...seen].sort().join(", ") : "— not seen yet"}`);
  }
}

async function readTags(dir: string): Promise<Record<string, Tag>> {
  try {
    // The maintainer's own hand-written file: trusted to have this shape.
    return JSON.parse(await readFile(path.join(dir, "coverage-tags.json"), "utf8")) as Record<string, Tag>;
  } catch (e) {
    // Node's fs errors carry a `code`; anything else rethrows below.
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return {};
    throw e;
  }
}

const dir = realFixtureDir();
const tags = await readTags(dir);
const decks = [];
for (const file of findRealFixtures(dir, [".pptx"])) {
  const report = await analyse(file);
  const tag = tags[report.file];
  printDeck(report, tag);
  decks.push({ report, producer: tag?.producer ?? report.reportedProducer, purpose: tag?.purpose ?? "?" });
}
printSummary(decks);
const untagged = decks.filter((d) => d.purpose === "?").map((d) => d.report.file);
if (untagged.length > 0) console.log(`\n${untagged.length} deck(s) without a purpose in coverage-tags.json.`);
