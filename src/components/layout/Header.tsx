"use client";

import Link from "next/link";
import { useState } from "react";
import { MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Logo } from "@/components/brand/Logo";
import { LanguageToggle } from "@/components/layout/LanguageToggle";

interface HeaderProps {
  locale: string;
  labels: {
    presentation: string;
    document: string;
    image: string;
  };
}

export function Header({ locale, labels }: HeaderProps) {
  const [mobileOpen, setMobileOpen] = useState(false);

  const navLinks = [
    { href: `/${locale}#shelf-presentation`, label: labels.presentation },
    { href: `/${locale}#shelf-document`, label: labels.document },
    { href: `/${locale}#shelf-image`, label: labels.image },
  ];

  return (
    <header className="sticky top-0 z-50 border-b border-silver-200 bg-silver-50/85 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Logo locale={locale} />

        <nav className="hidden items-center gap-1 md:flex">
          {navLinks.map((link) => (
            <Button key={link.href} variant="ghost" size="sm" asChild>
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <LanguageToggle currentLocale={locale} />
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setMobileOpen(!mobileOpen)}
            aria-label="menu"
          >
            {mobileOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
          </Button>
        </div>
      </div>

      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t border-silver-200 px-4 py-3 md:hidden">
          {navLinks.map((link) => (
            <Button
              key={link.href}
              variant="ghost"
              size="sm"
              className="justify-start"
              asChild
              onClick={() => setMobileOpen(false)}
            >
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>
      )}
    </header>
  );
}
