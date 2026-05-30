import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { ImageToPptx } from "@/components/tools/image-to-pptx/ImageToPptx";
import { getImageToPptxLabels } from "@/components/tools/image-to-pptx/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function ImageToPptxPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getImageToPptxLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <ImageToPptx labels={labels} lang={lang} />
    </div>
  );
}
