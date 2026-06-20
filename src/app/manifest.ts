import type { MetadataRoute } from "next";

// Web app manifest (served at /manifest.webmanifest; Next injects the <link>).
// Icons live in /public; the favicon/apple-icon/icon files use the app/ file
// conventions instead. Colors track the monochrome brand (Paper background).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Ontab",
    short_name: "Ontab",
    description:
      "PDF · PPT · 이미지 변환·편집을 브라우저 내에서 바로. 업로드 없음, 로그인 불필요.",
    start_url: "/",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: "#ffffff",
    icons: [
      {
        src: "/web-app-manifest-192x192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "maskable",
      },
      {
        src: "/web-app-manifest-512x512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
