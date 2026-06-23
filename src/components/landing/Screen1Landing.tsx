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

        {/* Landing hero — centered stack: "Ontab" wordmark, then a quiet value
            layer (headline + benefit blocks) for anyone who pauses to read. The
            category tabs above stay the lead. Tuned at 1440×900 via
            docs/landing-explore.html (variant A). */}
        <div
          className="absolute left-1/2 flex flex-col items-center"
          style={{
            top: "50%",
            transform: `translate(-50%, calc(-50% + 10px + var(--tweak-title-y, 0px))) scale(${heroVisible ? 1 : 0.94})`,
            opacity: heroVisible ? 1 : 0,
            transition:
              "transform var(--motion-base) var(--ease-standard), opacity var(--motion-base) var(--ease-standard)",
          }}
        >
          <div
            className="font-display text-center"
            style={{
              color: "var(--headline)",
              fontSize: 94,
              fontWeight: 520,
              letterSpacing: "-0.02em",
              lineHeight: 1,
            }}
          >
            Ontab
          </div>

          {/* Value headline — Clash Display (Hangul falls back to IBM Plex).
              Sits close under "Ontab" (7px) so it reads as its subtitle. */}
          <div
            className="font-display text-center"
            style={{
              marginTop: 7,
              color: "var(--ink-strong)",
              fontSize: 16,
              fontWeight: 400,
              letterSpacing: "-0.02em",
              lineHeight: 1.2,
            }}
          >
            {dict.landing.headline}
          </div>

          {/* Benefit blocks — supporting cast; one sentence per line. */}
          <div className="flex" style={{ marginTop: 43 }}>
            {dict.landing.benefits.map((b, i) => (
              <div
                key={b.label}
                style={{
                  padding: "0 20px",
                  maxWidth: 215,
                  textAlign: "center",
                  borderLeft:
                    i > 0
                      ? "1px solid color-mix(in srgb, var(--ink-soft) 28%, transparent)"
                      : undefined,
                }}
              >
                <div
                  className="font-mono uppercase"
                  style={{
                    fontSize: 12,
                    letterSpacing: "0.12em",
                    color: "var(--ink-strong)",
                  }}
                >
                  {b.label}
                </div>
                <div
                  className="font-ko"
                  style={{ marginTop: 6, fontSize: 11, lineHeight: 1.5, color: "var(--ink-soft)" }}
                >
                  {b.desc.map((line, j) => (
                    <span key={j} style={{ display: "block" }}>
                      {line}
                    </span>
                  ))}
                </div>
              </div>
            ))}
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
