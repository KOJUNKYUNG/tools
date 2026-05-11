"use client";

import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FadeInCenter } from "@/components/brand/FadeInCenter";
import { CategoryStrip } from "@/components/brand/CategoryStrip";
import { ToolCard } from "@/components/brand/ToolCard";
import { TOOLS } from "@/lib/constants";
import type { Dictionary } from "@/i18n/config";

type Category = "presentation" | "document" | "image";

interface Screen2OpenedProps {
  locale: "ko" | "en";
  theme: "light" | "dark";
  dict: Dictionary;
  activeCategory: Category;
  onCategoryChange: (cat: Category) => void;
  onClose: () => void;
  onToolOpen: (slug: string) => void;
  zoomingToolSlug: string | null;
}

const TOOLS_BY_CATEGORY = {
  presentation: TOOLS.filter((t) => t.category === "ppt"),
  document: TOOLS.filter((t) => t.category === "pdf"),
  image: TOOLS.filter((t) => t.category === "image"),
};

type ToolSlugKey = keyof Dictionary["tools"];

export function Screen2Opened({
  locale,
  theme,
  dict,
  activeCategory,
  onCategoryChange,
  onClose,
  onToolOpen,
  zoomingToolSlug,
}: Screen2OpenedProps) {
  const tools = TOOLS_BY_CATEGORY[activeCategory];
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
        }}
      />

      <div className="relative" style={{ zIndex: 2 }}>
        <Header locale={locale} />
      </div>

      <main
        className="flex-1 flex flex-col items-center justify-center px-8 py-8 relative"
        style={{ zIndex: 2 }}
      >
        <CategoryStrip
          active={activeCategory}
          theme={theme}
          labels={{
            presentation: dict.nav.presentation,
            document: dict.nav.document,
            image: dict.nav.image,
          }}
          backLabel={dict.common.back}
          onSelect={onCategoryChange}
          onBack={onClose}
        />

        <FadeInCenter>
          <div
            className="absolute left-1/2"
            style={{
              top: "calc(50% - 150px + var(--tweak-title-y, 0px))",
              transform: "translateX(-50%)",
              width: 520,
              transition: "top 200ms ease",
            }}
          >
            <div className="grid grid-cols-2 gap-3" style={{ textAlign: "left" }}>
              {tools.map((t) => {
                const toolDict = dict.tools[t.slug as ToolSlugKey];
                return (
                  <ToolCard
                    key={t.slug}
                    slug={t.slug}
                    title={toolDict.title}
                    description={toolDict.description}
                    Icon={t.icon}
                    onOpen={onToolOpen}
                    zooming={zoomingToolSlug === t.slug}
                  />
                );
              })}
            </div>
          </div>
        </FadeInCenter>
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
