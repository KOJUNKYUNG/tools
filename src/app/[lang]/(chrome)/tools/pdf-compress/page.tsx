import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PdfCompress } from "@/components/tools/pdf-compress/PdfCompress";
import { getPdfCompressLabels } from "@/components/tools/pdf-compress/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PdfCompressPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPdfCompressLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PdfCompress labels={labels} />
    </div>
  );
}
