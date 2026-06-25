import type { Metadata } from "next";
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { buildToolMetadata } from "@/lib/seo/toolMetadata";
import { PdfWatermark } from "@/components/tools/pdf-watermark/PdfWatermark";
import { getPdfWatermarkLabels } from "@/components/tools/pdf-watermark/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { lang } = await params;
  return buildToolMetadata("pdf-watermark", lang);
}

export default async function PdfWatermarkPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPdfWatermarkLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PdfWatermark labels={labels} />
    </div>
  );
}
