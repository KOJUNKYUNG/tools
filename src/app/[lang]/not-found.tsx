"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const COPY = {
  ko: {
    title: "페이지를 찾을 수 없어요",
    body: "주소가 바뀌었거나 존재하지 않는 페이지입니다.",
    home: "처음으로",
  },
  en: {
    title: "Page not found",
    body: "This page was moved or never existed.",
    home: "Home",
  },
} as const;

/**
 * Localized 404. Placed at the locale root so it covers every `/[lang]/*` path
 * (mistyped tool slugs included). Locale is read from the pathname.
 */
export default function NotFound() {
  const pathname = usePathname();
  const lang = pathname?.split("/")[1] === "en" ? "en" : "ko";
  const t = COPY[lang];

  return (
    <div className="flex min-h-[70vh] flex-col items-center justify-center gap-5 px-6 text-center">
      <div
        className="font-display tabular-nums"
        style={{ color: "var(--ink-soft)", fontSize: 72, fontWeight: 520, lineHeight: 1 }}
      >
        404
      </div>
      <h1 className="font-ko text-[20px] font-medium" style={{ color: "var(--headline)" }}>
        {t.title}
      </h1>
      <p className="max-w-[42ch] font-body text-[13px] leading-[1.6]" style={{ color: "var(--ink-soft)" }}>
        {t.body}
      </p>
      <Link
        href={`/${lang}`}
        className="btn-primary inline-flex h-9 items-center justify-center rounded-[9px] px-4 font-body text-[13px] font-semibold"
      >
        {t.home}
      </Link>
    </div>
  );
}
