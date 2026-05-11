import type { Metadata } from "next";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/sonner";
import { pretendard, spaceGrotesk, inter, jetbrainsMono } from "@/app/fonts";
import "../globals.css";

export const metadata: Metadata = {
  title: {
    default: "Ontab — 브라우저 탭 위의 문서 도구 책상",
    template: "%s | Ontab",
  },
  description:
    "PDF · PPT · 이미지 변환·편집을 브라우저 내에서 바로 처리하세요. 업로드 없음, 일일 제한 없음, 로그인 불필요.",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${pretendard.variable} ${spaceGrotesk.variable} ${inter.variable} ${jetbrainsMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
          {children}
          <Toaster position="bottom-right" />
        </ThemeProvider>
      </body>
    </html>
  );
}
