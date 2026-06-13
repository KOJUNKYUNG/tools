"use client";

import { useEffect, useState } from "react";
import { useTheme } from "next-themes";
import { Sun, Moon } from "lucide-react";
import { Wordmark } from "@/components/brand/Wordmark";
import { LanguageToggle } from "@/components/layout/LanguageToggle";

interface HeaderProps {
  locale: string;
}

export function Header({ locale }: HeaderProps) {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const theme = mounted && resolvedTheme === "dark" ? "dark" : "light";

  return (
    <header
      className="flex items-center justify-between px-8 py-5 border-b relative"
      style={{
        borderColor: "var(--border)",
        height: "60px",
        fontWeight: 400,
      }}
    >
      <Wordmark locale={locale} />
      <div className="flex items-center gap-1 relative">
        <LanguageToggle currentLocale={locale} />
        <button
          onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
          className="w-8 h-8 flex items-center justify-center rounded-[4px] transition-colors focus-ring"
          style={{ color: "var(--ink-strong)" }}
          title="Toggle theme"
          aria-label="Toggle theme"
        >
          {theme === "dark" ? <Sun size={14} /> : <Moon size={14} />}
        </button>
      </div>
    </header>
  );
}
