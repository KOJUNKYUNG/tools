import { getDictionary, type Locale } from "@/i18n/config";
import { InteractiveLanding } from "@/components/landing/InteractiveLanding";

export default async function LandingPage({
  params,
}: {
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  const dict = await getDictionary(lang as Locale);
  return <InteractiveLanding locale={lang as "ko" | "en"} dict={dict} />;
}
