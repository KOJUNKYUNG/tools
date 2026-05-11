"use client";

import { useRouter, usePathname } from "next/navigation";
import { locales } from "@/i18n/locales";

interface Props {
  currentLocale: string;
}

export function LanguageToggle({ currentLocale }: Props) {
  const router = useRouter();
  const pathname = usePathname();

  const switchTo = (target: string) => {
    const segments = pathname.split("/");
    if (locales.includes(segments[1] as (typeof locales)[number])) {
      segments[1] = target;
    } else {
      segments.splice(1, 0, target);
    }
    router.push(segments.join("/") || `/${target}`);
  };

  return (
    <div
      className="flex items-center rounded-[4px] overflow-hidden border mr-1"
      style={{ borderColor: "var(--border)", height: 28 }}
    >
      {locales.map((lc) => (
        <button
          key={lc}
          onClick={() => switchTo(lc)}
          className="px-2.5 h-full font-display text-[10.5px] font-semibold tracking-[0.08em] uppercase transition-colors"
          style={{
            background: currentLocale === lc ? "var(--ink-strong)" : "transparent",
            color: currentLocale === lc ? "var(--bg)" : "var(--ink)",
            cursor: currentLocale === lc ? "default" : "pointer",
          }}
        >
          {lc}
        </button>
      ))}
    </div>
  );
}
