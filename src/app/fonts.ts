import localFont from "next/font/local";

// Display + Headline — Clash Display (variable 200–700; Medium 500 / Light 300 via weight).
export const clashDisplay = localFont({
  src: "../fonts/ClashDisplay-Variable.woff2",
  variable: "--font-clash",
  display: "swap",
  weight: "200 700",
});

// Title + Body (Korean + Latin) — IBM Plex Sans KR (Regular 400, Medium 500).
export const ibmPlexSansKR = localFont({
  src: [
    { path: "../fonts/IBMPlexSansKR-Regular.ttf", weight: "400", style: "normal" },
    { path: "../fonts/IBMPlexSansKR-Medium.ttf", weight: "500", style: "normal" },
  ],
  variable: "--font-ibm-plex-kr",
  display: "swap",
});

// Label + Mono — Nanum Gothic Coding (local; includes Korean, so mono Korean renders).
export const nanumGothicCoding = localFont({
  src: "../fonts/NanumGothicCoding-Regular.ttf",
  variable: "--font-nanum-coding",
  display: "swap",
  weight: "400",
});

// Pretendard — retained because canvas text rasterisation (renderTextToPng /
// pdf-watermark) reads --font-pretendard directly; also a Korean fallback.
export const pretendard = localFont({
  src: "../fonts/PretendardVariable.woff2",
  variable: "--font-pretendard",
  display: "swap",
  weight: "45 920",
});
