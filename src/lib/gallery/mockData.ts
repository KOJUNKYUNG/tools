import type { GalleryImage } from "./types";

/**
 * Mock catalog for the inline background gallery.
 *
 * Image sources:
 * - `nature`, `texture`, `pattern` → picsum.photos with stable seeds.
 * - `gradient` → inline SVG data URLs (picsum is photographic only).
 *
 * Tags are populated for future search (no UI in this PR).
 */
function gradientDataUrl(stops: string[], angle = 135): string {
  const stopStr = stops
    .map((c, i) => `<stop offset="${(i / (stops.length - 1)) * 100}%" stop-color="${c}"/>`)
    .join("");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080"><defs><linearGradient id="g" gradientTransform="rotate(${angle})">${stopStr}</linearGradient></defs><rect width="1920" height="1080" fill="url(#g)"/></svg>`;
  return `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;
}

function picsum(seed: string, w = 1920, h = 1080): string {
  return `https://picsum.photos/seed/${seed}/${w}/${h}`;
}
function picsumThumb(seed: string): string {
  return `https://picsum.photos/seed/${seed}/480/270`;
}

export const MOCK_IMAGES: GalleryImage[] = [
  // ── gradient ────────────────────────────────────────────────
  {
    id: "gradient-aurora",
    category: "gradient",
    title: "Aurora",
    url: gradientDataUrl(["#5b8def", "#a06bff", "#ff6bd6"], 135),
    thumbnailUrl: gradientDataUrl(["#5b8def", "#a06bff", "#ff6bd6"], 135),
    width: 1920,
    height: 1080,
    tags: ["cool", "vibrant", "blue", "purple"],
  },
  {
    id: "gradient-dusk",
    category: "gradient",
    title: "Dusk",
    url: gradientDataUrl(["#1e2a44", "#5e4b8b", "#d97757"], 160),
    thumbnailUrl: gradientDataUrl(["#1e2a44", "#5e4b8b", "#d97757"], 160),
    width: 1920,
    height: 1080,
    tags: ["warm", "sunset", "orange"],
  },
  {
    id: "gradient-mint",
    category: "gradient",
    title: "Mint",
    url: gradientDataUrl(["#cffce6", "#7adfb6", "#2a9a82"], 135),
    thumbnailUrl: gradientDataUrl(["#cffce6", "#7adfb6", "#2a9a82"], 135),
    width: 1920,
    height: 1080,
    tags: ["fresh", "green", "soft"],
  },
  {
    id: "gradient-rose",
    category: "gradient",
    title: "Rose",
    url: gradientDataUrl(["#ffd0dc", "#ff8fae", "#c44b6f"], 145),
    thumbnailUrl: gradientDataUrl(["#ffd0dc", "#ff8fae", "#c44b6f"], 145),
    width: 1920,
    height: 1080,
    tags: ["warm", "pink", "soft"],
  },
  {
    id: "gradient-deep",
    category: "gradient",
    title: "Deep",
    url: gradientDataUrl(["#0a1228", "#1f2a4d", "#3d5183"], 175),
    thumbnailUrl: gradientDataUrl(["#0a1228", "#1f2a4d", "#3d5183"], 175),
    width: 1920,
    height: 1080,
    tags: ["cool", "dark", "navy"],
  },

  // ── nature ──────────────────────────────────────────────────
  {
    id: "nature-forest",
    category: "nature",
    title: "Forest",
    url: picsum("ontab-forest"),
    thumbnailUrl: picsumThumb("ontab-forest"),
    width: 1920,
    height: 1080,
    tags: ["forest", "green", "outdoor"],
  },
  {
    id: "nature-mountain",
    category: "nature",
    title: "Mountain",
    url: picsum("ontab-mountain"),
    thumbnailUrl: picsumThumb("ontab-mountain"),
    width: 1920,
    height: 1080,
    tags: ["mountain", "landscape", "cool"],
  },
  {
    id: "nature-ocean",
    category: "nature",
    title: "Ocean",
    url: picsum("ontab-ocean"),
    thumbnailUrl: picsumThumb("ontab-ocean"),
    width: 1920,
    height: 1080,
    tags: ["ocean", "water", "blue"],
  },
  {
    id: "nature-meadow",
    category: "nature",
    title: "Meadow",
    url: picsum("ontab-meadow"),
    thumbnailUrl: picsumThumb("ontab-meadow"),
    width: 1920,
    height: 1080,
    tags: ["meadow", "green", "soft"],
  },
  {
    id: "nature-sky",
    category: "nature",
    title: "Sky",
    url: picsum("ontab-sky"),
    thumbnailUrl: picsumThumb("ontab-sky"),
    width: 1920,
    height: 1080,
    tags: ["sky", "cloud", "blue"],
  },

  // ── texture ─────────────────────────────────────────────────
  {
    id: "texture-paper",
    category: "texture",
    title: "Paper",
    url: picsum("ontab-paper"),
    thumbnailUrl: picsumThumb("ontab-paper"),
    width: 1920,
    height: 1080,
    tags: ["paper", "neutral", "warm"],
  },
  {
    id: "texture-concrete",
    category: "texture",
    title: "Concrete",
    url: picsum("ontab-concrete"),
    thumbnailUrl: picsumThumb("ontab-concrete"),
    width: 1920,
    height: 1080,
    tags: ["concrete", "neutral", "grey"],
  },
  {
    id: "texture-fabric",
    category: "texture",
    title: "Fabric",
    url: picsum("ontab-fabric"),
    thumbnailUrl: picsumThumb("ontab-fabric"),
    width: 1920,
    height: 1080,
    tags: ["fabric", "soft", "neutral"],
  },
  {
    id: "texture-metal",
    category: "texture",
    title: "Metal",
    url: picsum("ontab-metal"),
    thumbnailUrl: picsumThumb("ontab-metal"),
    width: 1920,
    height: 1080,
    tags: ["metal", "cool", "silver"],
  },
  {
    id: "texture-wood",
    category: "texture",
    title: "Wood",
    url: picsum("ontab-wood"),
    thumbnailUrl: picsumThumb("ontab-wood"),
    width: 1920,
    height: 1080,
    tags: ["wood", "warm", "brown"],
  },

  // ── pattern ─────────────────────────────────────────────────
  {
    id: "pattern-geometric",
    category: "pattern",
    title: "Geometric",
    url: picsum("ontab-geo"),
    thumbnailUrl: picsumThumb("ontab-geo"),
    width: 1920,
    height: 1080,
    tags: ["geometric", "shapes"],
  },
  {
    id: "pattern-grid",
    category: "pattern",
    title: "Grid",
    url: picsum("ontab-grid"),
    thumbnailUrl: picsumThumb("ontab-grid"),
    width: 1920,
    height: 1080,
    tags: ["grid", "lines"],
  },
  {
    id: "pattern-dots",
    category: "pattern",
    title: "Dots",
    url: picsum("ontab-dots"),
    thumbnailUrl: picsumThumb("ontab-dots"),
    width: 1920,
    height: 1080,
    tags: ["dots", "round"],
  },
  {
    id: "pattern-stripes",
    category: "pattern",
    title: "Stripes",
    url: picsum("ontab-stripes"),
    thumbnailUrl: picsumThumb("ontab-stripes"),
    width: 1920,
    height: 1080,
    tags: ["stripes", "lines"],
  },
  {
    id: "pattern-waves",
    category: "pattern",
    title: "Waves",
    url: picsum("ontab-waves"),
    thumbnailUrl: picsumThumb("ontab-waves"),
    width: 1920,
    height: 1080,
    tags: ["waves", "curve"],
  },
];

/** No longer surfaced in UI but kept for potential future search. */
export function getAllTags(): string[] {
  const set = new Set<string>();
  for (const img of MOCK_IMAGES) {
    for (const tag of img.tags ?? []) set.add(tag);
  }
  return [...set].sort();
}
