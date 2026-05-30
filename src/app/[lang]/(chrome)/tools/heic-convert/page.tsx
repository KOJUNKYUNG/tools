// heic-convert is an SEO/sharing alias of image-compress. The slug stays live
// and renders the same tool (see ToolInfo.aliasOf in constants).
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { ImageCompressTool } from "@/components/tools/image-compress/ImageCompressTool";
import { getImageCompressLabels } from "@/components/tools/image-compress/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function HeicConvertPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getImageCompressLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <ImageCompressTool labels={labels} />
    </div>
  );
}
