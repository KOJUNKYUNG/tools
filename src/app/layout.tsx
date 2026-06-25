import type { Metadata } from "next";
import { Toaster } from "@/components/ui/sonner";
import { Providers } from "@/app/providers";
import { clashDisplay, ibmPlexSansKR, nanumGothicCoding, pretendard } from "@/app/fonts";
import { siteUrl } from "@/lib/seo/site";
import "./globals.css";

export const metadata: Metadata = {
  // Resolves every relative canonical / alternate / og:url across the app.
  metadataBase: new URL(siteUrl),
  title: {
    default: "Ontab — 브라우저 탭 위의 문서 도구 책상",
    template: "%s | Ontab",
  },
  description:
    "PDF · PPT · 이미지 변환·편집을 브라우저 내에서 바로 처리하세요. 업로드 없음, 일일 제한 없음, 로그인 불필요.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${clashDisplay.variable} ${ibmPlexSansKR.variable} ${nanumGothicCoding.variable} ${pretendard.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Providers>
          {children}
          <Toaster position="bottom-right" />
        </Providers>
      </body>
    </html>
  );
}
