import type { ReactNode } from "react";
import { LangSync } from "./lang-sync";

export default async function LangLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ lang: string }>;
}) {
  const { lang } = await params;
  return (
    <>
      <LangSync lang={lang} />
      {children}
    </>
  );
}
