"use client";

import Link from "next/link";
import { useState } from "react";
import { FileTextIcon, MenuIcon, XIcon } from "lucide-react";
import { Button } from "@/components/ui/button";

const NAV_LINKS = [
  { href: "/tools/image-to-pdf", label: "이미지→PDF" },
  { href: "/tools/pdf-to-image", label: "PDF→이미지" },
  { href: "/tools/pdf-merge", label: "PDF 합치기" },
  { href: "/tools/ppt-extract", label: "PPT 추출" },
  { href: "/tools/ppt-background", label: "PPT 배경" },
  { href: "/gallery", label: "갤러리" },
];

export function Header() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <header className="sticky top-0 z-50 border-b bg-background/80 backdrop-blur-md">
      <div className="mx-auto flex h-14 max-w-6xl items-center justify-between px-4">
        <Link href="/" className="flex items-center gap-2 font-heading text-lg font-semibold">
          <FileTextIcon className="size-5 text-primary" />
          <span>DocuFlow</span>
        </Link>

        <nav className="hidden items-center gap-1 md:flex">
          {NAV_LINKS.map((link) => (
            <Button key={link.href} variant="ghost" size="sm" asChild>
              <Link href={link.href}>{link.label}</Link>
            </Button>
          ))}
        </nav>

        <Button
          variant="ghost"
          size="icon"
          className="md:hidden"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="메뉴 토글"
        >
          {mobileOpen ? <XIcon className="size-5" /> : <MenuIcon className="size-5" />}
        </Button>
      </div>

      {mobileOpen && (
        <nav className="flex flex-col gap-1 border-t px-4 py-3 md:hidden">
          {NAV_LINKS.map((link) => (
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
