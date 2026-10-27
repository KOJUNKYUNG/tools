import type { GalleryCategory, GalleryImage, GallerySource } from "./types";

/**
 * The background gallery: local files under `public/gallery/{category}/`, so
 * picking one never reaches another host (the gallery is local-only, see
 * CONTEXT.md non-goals). `pnpm gallery:build` makes the files from
 * `scripts/gallery/` sources; `catalog.test.ts` holds every entry to the
 * quality bar. Gradients and patterns are drawn with Paper Shaders from the
 * recipes in `scripts/gallery/shaders.json` (same name), with no effect baked
 * in that stands apart from the style (no blur, grain or veil).
 */

const OWN: GallerySource = { kind: "own" };
const PAPER: GallerySource = { kind: "paper" };

function cc0(url: string, author: string): GallerySource {
  return { kind: "cc0", url, author, license: "CC0 1.0", retrieved: "2026-10-26" };
}

function image(
  category: GalleryCategory,
  name: string,
  fields: { format?: "jpeg" | "png"; width?: number; height?: number; source: GallerySource },
): GalleryImage {
  const { format = "jpeg", width = 3840, height = 2160, ...rest } = fields;
  return {
    id: `${category}-${name}`,
    category,
    name,
    format,
    url: `/gallery/${category}/${name}.${format === "png" ? "png" : "jpg"}`,
    thumbnailUrl: `/gallery/${category}/${name}-thumb.jpg`,
    width,
    height,
    ...rest,
  };
}

/**
 * Originals are 4K (3840 × 2160) so a crop of half the width still fills a
 * Full HD screen. Pictures whose source is smaller keep the source's size,
 * never enlarged.
 */

/** Made before the gallery spec at 1920 × 1080; kept at that size. */
const LEGACY_SIZE = { width: 1920, height: 1080 };

/** Pixel art: lossless PNG is both exact and smaller than JPEG here. */
const PNG = { format: "png" } as const;

const COMMONS = "https://commons.wikimedia.org/wiki/File:";

export const GALLERY_IMAGES: GalleryImage[] = [
  // ── gradient ────────────────────────────────────────────────
  image("gradient", "green", { ...LEGACY_SIZE, source: OWN }),
  image("gradient", "red", { ...LEGACY_SIZE, source: OWN }),
  image("gradient", "yellow", { ...LEGACY_SIZE, source: OWN }),
  image("gradient", "mesh-3c", { source: PAPER }),
  image("gradient", "mesh-4c", { source: PAPER }),
  image("gradient", "staticmesh-4c", { source: PAPER }),
  image("gradient", "staticmesh-5c", { source: PAPER }),
  image("gradient", "staticmesh-2c", { source: PAPER }),
  image("gradient", "staticradial-1", { source: PAPER }),
  image("gradient", "staticradial-2", { source: PAPER }),
  image("gradient", "godrays", { source: PAPER }),
  image("gradient", "warp-2", { source: PAPER }),
  image("gradient", "grain-2", { source: PAPER }),
  image("gradient", "simplex", { source: PAPER }),
  image("gradient", "cloud", { source: PAPER }),
  image("gradient", "solar", { source: PAPER }),
  image("gradient", "spiral-1", { source: PAPER }),
  image("gradient", "spiral-2", { source: PAPER }),

  // ── nature ──────────────────────────────────────────────────
  image("nature", "kosciuszko-ridge", { source: cc0(`${COMMONS}Main_Range_Track,_Kosciuszko_National_Park_35.jpg`, "Dhx1") }),
  image("nature", "chepino-valley", { source: cc0(`${COMMONS}Chepino_Valley_Landscape.jpg`, "Nannoyani") }),
  image("nature", "herradura-sea", { source: cc0(`${COMMONS}La_Herradura,_horizon_hobbie_cat,_Andalusia,_Spain.jpg`, "Jebulon") }),
  image("nature", "dordogne-meadow", { width: 3008, height: 1692, source: cc0(`${COMMONS}Prairie_fleurie_Dordogne.jpg`, "Jebulon") }),
  image("nature", "kalkense-dusk", {
    source: cc0(`${COMMONS}Spontaneous_gathering_of_solar_eclipse_watchers,_Kalkense_Meersen,_Laarne,_August_12,_2026.jpg`, "DimiTalen"),
  }),
  image("nature", "balkhash-lake", { source: cc0(`${COMMONS}Lake_Balkhash._Mynaral_village._16.jpg`, "AALLMMAATT") }),
  image("nature", "gardner-lake", { source: cc0(`${COMMONS}Gadner_lake;_Maine.jpg`, "Inaki Irazabalbeitia") }),
  image("nature", "wheat-chamomile", { source: cc0(`${COMMONS}Wheat_and_chamomille,_Kalkense_Meersen,_Wetteren,_2026.jpg`, "DimiTalen") }),

  // ── texture ─────────────────────────────────────────────────
  image("texture", "white-fabric", {
    source: cc0(`${COMMONS}Denim_fabric_03_ao_8k_(Rico_Cilliers_and_colormass_via_Poly_Haven).jpg`, "Rico Cilliers, colormass (Poly Haven)"),
  }),
  image("texture", "grey-concrete", {
    width: 2656,
    height: 1494,
    source: cc0(
      `${COMMONS}Eroded_top_edge_light_grey_painted_bumpy_moderately_discolored_grubby_grungy_concrete_building_wall_texture.jpg`,
      "Sisters.seamless",
    ),
  }),
  image("texture", "kymi-marble", { source: cc0(`${COMMONS}Marble_Kymi_Euboea_Greece.jpg`, "Jebulon") }),
  image("texture", "grey-plaster", {
    source: cc0(`${COMMONS}Blue_plaster_weathered_disp_16k_(Amal_Kumar_via_Poly_Haven).jpg`, "Amal Kumar (Poly Haven)"),
  }),

  // ── pattern ─────────────────────────────────────────────────
  image("pattern", "dithering-1", { ...PNG, source: PAPER }),
  image("pattern", "dithering-2", { ...PNG, source: PAPER }),
  image("pattern", "warp-1", { source: PAPER }),
  image("pattern", "warp-3", { source: PAPER }),
  image("pattern", "grain-1", { source: PAPER }),
  image("pattern", "voronoi-1", { source: PAPER }),
  image("pattern", "voronoi-2", { source: PAPER }),
  image("pattern", "waves-1", { source: PAPER }),
  image("pattern", "waves-2", { source: PAPER }),
  image("pattern", "dot-1", { ...PNG, source: PAPER }),
  image("pattern", "dot-2", { source: PAPER }),
  image("pattern", "dot-3", { source: PAPER }),
  image("pattern", "perlin-1", { source: PAPER }),
  image("pattern", "perlin-2", { source: PAPER }),
  image("pattern", "swirl-1", { source: PAPER }),
  image("pattern", "swirl-2", { source: PAPER }),
];
