import type { GalleryImage } from "./types";

export const MOCK_IMAGES: GalleryImage[] = [
  {
    id: "green-01",
    url: "/gallery/green.jpg",
    thumbnailUrl: "/gallery/green-thumb.jpg",
    category: "Nature",
    tags: ["green", "calm"],
    title: "그린",
    width: 1920,
    height: 1080,
  },
  {
    id: "red-01",
    url: "/gallery/red.jpg",
    thumbnailUrl: "/gallery/red-thumb.jpg",
    category: "Abstract",
    tags: ["red", "warm"],
    title: "레드",
    width: 1920,
    height: 1080,
  },
  {
    id: "yellow-01",
    url: "/gallery/yellow.jpg",
    thumbnailUrl: "/gallery/yellow-thumb.jpg",
    category: "Gradient",
    tags: ["yellow", "warm"],
    title: "옐로우",
    width: 1920,
    height: 1080,
  },
];

export function getAllTags(): string[] {
  const tagSet = new Set<string>();
  for (const img of MOCK_IMAGES) {
    for (const tag of img.tags) {
      tagSet.add(tag);
    }
  }
  return Array.from(tagSet).sort();
}
