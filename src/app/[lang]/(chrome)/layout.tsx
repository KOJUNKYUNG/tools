import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { getDictionary, type Locale } from "@/i18n/config";

export default async function ChromeLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return (
    <>
      <Header locale={lang} />
      <main className="flex-1">{children}</main>
      <Footer
        copyright={dict.footer.copyright}
        version={dict.footer.version}
        license={dict.footer.license}
      />
    </>
  );
}
