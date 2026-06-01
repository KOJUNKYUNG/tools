import { getDictionary, type Locale } from "@/i18n/config";
import { locales } from "@/i18n/locales";
import { PdfLock } from "@/components/tools/pdf-lock/PdfLock";
import { getPdfLockLabels } from "@/components/tools/pdf-lock/labels";

interface PageProps {
  params: Promise<{ lang: string }>;
}

function asLocale(lang: string): Locale {
  return (locales as readonly string[]).includes(lang) ? (lang as Locale) : "ko";
}

export default async function PdfLockPage({ params }: PageProps) {
  const { lang } = await params;
  const dict = await getDictionary(asLocale(lang));
  const labels = getPdfLockLabels(dict);

  return (
    <div
      className="mx-auto px-4 py-8"
      style={{
        width: "min(var(--tweak-workspace-width, 980px), calc(100vw - 32px))",
      }}
    >
      <PdfLock labels={labels} />
    </div>
  );
}
