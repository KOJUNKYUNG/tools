export type GalleryCategory = "gradient" | "nature" | "texture" | "pattern";

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  "gradient",
  "nature",
  "texture",
  "pattern",
];

export interface GalleryImage {
  id: string;
  category: GalleryCategory;
  /** Display title. Not i18n'd at the mock stage; revisit when Supabase lands. */
  title: string;
  url: string;
  thumbnailUrl: string;
  width: number;
  height: number;
  /** Future search. Not surfaced in UI in this PR. */
  tags?: string[];
}
