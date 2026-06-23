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

        {/* Landing tray — the tool workspace surface, brought to the first screen.
            Same width as the live tool tray (--tweak-workspace-width). The "Ontab"
            wordmark sits tossed at the top (slightly tilted, echoing the brand
            mark's document-on-a-desk); the value layer (headline + benefit blocks)
            is centered and quiet — supporting cast for anyone who pauses to read.
            Tuned at 1440×900 via docs/landing-explore.html (variant B). */}
        <div
          aria-hidden={!heroVisible}
          style={{
            position: "absolute",
            left: "50%",
            top: 150,
            bottom: 120,
            width: "min(var(--tweak-workspace-width), calc(100vw - 32px))",
            transform: `translateX(-50%) scale(${heroVisible ? 1 : 0.94})`,
            transformOrigin: "center center",
            opacity: heroVisible ? 1 : 0,
            transition:
              "transform var(--motion-base) var(--ease-standard), opacity var(--motion-base) var(--ease-standard)",
            background: "var(--surface)",
            border: "1px solid var(--border)",
            borderRadius: 14,
            boxShadow: "var(--shadow-lg)",
            overflow: "hidden",
            pointerEvents: "none",
          }}
        >
          {/* "Ontab" — tossed top-center, slightly tilted. */}
          <div
            className="font-display"
            style={{
              position: "absolute",
              top: 80,
              left: "50%",
              transform: "translateX(-50%) rotate(2.5deg)",
              transformOrigin: "center center",
              fontSize: 112,
              fontWeight: 520,
              letterSpacing: "-0.02em",
              lineHeight: 1,
              color: "var(--headline)",
              whiteSpace: "nowrap",
            }}
          >
            Ontab
          </div>

          {/* Value layer — headline + benefit blocks, centered (slightly below
              the tray's vertical center). Hangul in the display role falls back
              to IBM Plex via .font-display. */}
          <div
            style={{
              position: "absolute",
              left: "50%",
              top: "calc(50% + 65px)",
              transform: "translate(-50%, -50%)",
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              width: "100%",
              padding: "0 24px",
            }}
          >
            <div
              className="font-display text-center"
              style={{
                fontSize: 21,
                fontWeight: 450,
                letterSpacing: "-0.02em",
                lineHeight: 1.2,
                color: "var(--ink-strong)",
              }}
            >
              {dict.landing.headline}
            </div>

            <div style={{ display: "flex", marginTop: 15 }}>
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
