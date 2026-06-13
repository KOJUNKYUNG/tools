"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { CategoryStrip } from "@/components/brand/CategoryStrip";
import type { Dictionary } from "@/i18n/config";

interface Screen1LandingProps {
  locale: "ko" | "en";
  dict: Dictionary;
  lidState: "closed" | "opening" | "open";
  onOpen: (cat: "presentation" | "document" | "image") => void;
}

export function Screen1Landing({ locale, dict, lidState, onOpen }: Screen1LandingProps) {
  const heroVisible = lidState === "closed";
  return (
    <div
      className="flex flex-col h-screen relative overflow-hidden"
      style={{ background: "var(--bg)" }}
    >
      <Header locale={locale} />

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-8 relative">
        <div style={{ pointerEvents: heroVisible ? "auto" : "none" }}>
          <CategoryStrip
            eyebrow={dict.landing.selectCategory}
            labels={{
              presentation: dict.nav.presentation,
              document: dict.nav.document,
              image: dict.nav.image,
            }}
            onSelect={onOpen}
          />
        </div>

        <div
          className="absolute left-1/2 flex flex-col items-center"
          style={{
            top: "50%",
            transform: `translate(-50%, calc(-50% - 10px + var(--tweak-title-y, 0px))) scale(${heroVisible ? 1 : 0.94})`,
            opacity: heroVisible ? 1 : 0,
            transition: "transform 320ms cubic-bezier(.4,0,.2,1), opacity 240ms ease",
          }}
        >
          {/* Landing hero — tuned via docs/design-preview.html §12
              (DESIGN.md → Components → Landing hero). */}
          <div
            className="font-display text-center"
            style={{
              color: "var(--headline)",
              fontSize: 88,
              fontWeight: 520,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            Ontab
          </div>
          {/* Subhead — Clash Display Light (Hangul falls back to IBM Plex
              via the font-display stack). */}
          <div
            className="mt-1 font-display text-center"
            style={{
              color: "var(--ink)",
              fontSize: 14,
              fontWeight: 300,
              letterSpacing: "-0.03em",
              lineHeight: 1.12,
            }}
          >
            {dict.landing.descriptor}
          </div>
        </div>
      </main>

      <Footer
        copyright={dict.footer.copyright}
        version={dict.footer.version}
        license={dict.footer.license}
      />
    </div>
  );
}
