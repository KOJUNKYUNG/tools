"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { Tray } from "@/components/brand/Tray";
import { PhotoLid } from "@/components/brand/PhotoLid";
import type { Dictionary } from "@/i18n/config";

interface Screen1LandingProps {
  locale: "ko" | "en";
  theme: "light" | "dark";
  dict: Dictionary;
  lidState: "closed" | "opening" | "open";
  onOpen: (cat: "presentation" | "document" | "image") => void;
}

function InteriorHint({ locale, dict }: { locale: "ko" | "en"; dict: Dictionary }) {
  return (
    <div className="absolute inset-0 flex items-center justify-center opacity-70">
      <div className="text-center" style={{ color: "var(--ink-soft)" }}>
        <div className="font-body text-[10px] tracking-[0.3em] uppercase">
          {dict.landing.interiorHint}
        </div>
      </div>
    </div>
  );
}

export function Screen1Landing({ locale, theme, dict, lidState, onOpen }: Screen1LandingProps) {
  return (
    <div className="flex flex-col h-screen relative overflow-hidden" style={{ background: "var(--bg)" }}>
      <div
        className="dark-only absolute inset-0 dark-tray-surface pointer-events-none"
        style={{ zIndex: 0 }}
      />
      <img
        src="/brand/tray-bg.png"
        alt=""
        className="tray-photo absolute inset-0 w-full h-full select-none pointer-events-none"
        style={{
          objectFit: "cover",
          objectPosition: "center",
          transform: `scale(var(--tweak-bg-scale, 1))`,
          transformOrigin: "50% 50%",
          transition: "opacity 600ms ease, transform 280ms cubic-bezier(.2,.8,.2,1)",
          zIndex: 0,
          ...(lidState === "open" ? { opacity: 0 } : null),
        }}
      />

      <div className="relative" style={{ zIndex: 2 }}>
        <Header locale={locale} />
      </div>

      <main
        className="flex-1 flex flex-col items-center justify-center px-8 py-8 relative"
        style={{ zIndex: 2 }}
      >
        {lidState !== "closed" && (
          <div
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2"
            style={{
              width: 520,
              height: 600,
              opacity: lidState === "open" ? 1 : 0,
              transition: "opacity 600ms ease 200ms",
            }}
          >
            <Tray className="w-full h-full" style={{ position: "absolute", inset: 0 }}>
              <InteriorHint locale={locale} dict={dict} />
            </Tray>
          </div>
        )}

        <PhotoLid
          state={lidState}
          locale={locale}
          theme={theme}
          labels={{
            presentation: dict.nav.presentation,
            document: dict.nav.document,
            image: dict.nav.image,
            selectCategory: dict.landing.selectCategory,
            descriptor: dict.landing.descriptor,
          }}
          onOpen={onOpen}
        />
      </main>

      <div className="relative" style={{ zIndex: 2 }}>
        <Footer
          copyright={dict.footer.copyright}
          version={dict.footer.version}
          license={dict.footer.license}
        />
      </div>
    </div>
  );
}
