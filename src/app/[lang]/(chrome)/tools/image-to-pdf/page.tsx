import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { ImageToPdf } from "@/components/tools/image-to-pdf/ImageToPdf";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function ImageToPdfPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getImageToPdfLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <ImageToPdf labels={labels} lang={lang} />
    </div>
  );
}
