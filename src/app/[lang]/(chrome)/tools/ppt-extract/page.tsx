import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PptExtract } from "@/components/tools/ppt-extract/PptExtract";
import { getPptExtractLabels } from "@/components/tools/ppt-extract/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PptExtractPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPptExtractLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PptExtract labels={labels} />
    </div>
  );
}
