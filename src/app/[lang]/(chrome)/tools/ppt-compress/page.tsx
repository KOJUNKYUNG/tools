import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PptCompress } from "@/components/tools/ppt-compress/PptCompress";
import { getPptCompressLabels } from "@/components/tools/ppt-compress/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PptCompressPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPptCompressLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PptCompress labels={labels} />
    </div>
  );
}
