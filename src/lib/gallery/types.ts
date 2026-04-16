export interface GalleryImage {
  id: string;
  url: string;
  thumbnailUrl: string;
  category: GalleryCategory;
  tags: string[];
  title: string;
  width: number;
  height: number;
}

export type GalleryCategory =
  | "Nature"
  | "Gradient"
  | "Abstract";

export const GALLERY_CATEGORIES: GalleryCategory[] = [
  "Nature",
  "Gradient",
  "Abstract",
];

export const CATEGORY_LABEL: Record<GalleryCategory, string> = {
  Nature: "자연",
  Gradient: "그라디언트",
  Abstract: "추상",
};
