"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

const COPY = {
  ko: {
    title: "문제가 발생했어요",
    body: "처리 중 오류가 났습니다. 다시 시도하거나 처음으로 돌아가세요.",
    retry: "다시 시도",
    home: "처음으로",
  },
  en: {
    title: "Something went wrong",
    body: "An error occurred. Try again or head back home.",
    retry: "Try again",
    home: "Home",
  },
} as const;

/**
 * Tool error boundary — renders inside the chrome (Header/Footer stay), so a
 * tool that throws never blanks the page. Locale is read from the pathname
 * (error components don't receive route params).
 */
export default function ChromeError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Surfaced in the console for debugging; no remote logging (0-server).
    console.error(error);
  }, [error]);

  const pathname = usePathname();
  const lang = pathname?.split("/")[1] === "en" ? "en" : "ko";
  const t = COPY[lang];

  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-5 px-6 py-24 text-center">
      <h1 className="font-ko text-[20px] font-medium" style={{ color: "var(--headline)" }}>
        {t.title}
      </h1>
      <p className="max-w-[42ch] font-body text-[13px] leading-[1.6]" style={{ color: "var(--ink-soft)" }}>
        {t.body}
      </p>
      <div className="flex flex-wrap items-center justify-center gap-2">
        <button
          type="button"
          onClick={reset}
          className="btn-primary inline-flex h-9 items-center justify-center rounded-[9px] px-4 font-body text-[13px] font-semibold"
        >
          {t.retry}
        </button>
        <Link
          href={`/${lang}`}
          className="nameplate inline-flex h-9 items-center justify-center rounded-[9px] px-4 font-body text-[13px]"
          style={{ color: "var(--ink-strong)" }}
        >
          {t.home}
        </Link>
      </div>
    </div>
  );
}
