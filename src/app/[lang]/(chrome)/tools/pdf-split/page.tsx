// pdf-split is an SEO/sharing alias of the unified pdf-arrange tool. The slug
// stays live and renders the same editor (see ToolInfo.aliasOf in constants).
import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PdfArrange } from "@/components/tools/pdf-arrange/PdfArrange";
import { getPdfArrangeLabels } from "@/components/tools/pdf-arrange/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PdfSplitPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPdfArrangeLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PdfArrange labels={labels} />
    </div>
  );
}
