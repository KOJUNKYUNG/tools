import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Toaster } from "@/components/ui/sonner";
import { getDictionary, type Locale } from "@/i18n/config";
import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "DocuFlow — 문서 도구 모음",
    template: "%s | DocuFlow",
  },
  description:
    "PDF 변환/병합, PPT 이미지 추출 및 배경 변경을 브라우저에서 바로 처리하세요. 파일이 서버에 저장되지 않습니다.",
};

export default async function RootLayout({
  children,
  params,
}: Readonly<{
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}>) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  const copyright = dict.footer.copyright.replace("{year}", String(new Date().getFullYear()));
  return (
    <html
      lang={lang}
      suppressHydrationWarning
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <Header locale={lang} labels={dict.nav} />
        <main className="flex-1">{children}</main>
        <Footer copyright={copyright} />
        <Toaster position="bottom-right" />
      </body>
    </html>
  );
}
