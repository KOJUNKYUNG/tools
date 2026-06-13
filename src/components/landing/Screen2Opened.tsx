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
  dict: Dictionary;
  activeCategory: Category;
  onCategoryChange: (cat: Category) => void;
  onClose: () => void;
  onToolOpen: (slug: string) => void;
  zoomingToolSlug: string | null;
}

// Alias tools (aliasOf set) stay routable but are hidden from the desk so only
// the canonical card shows.
const TOOLS_BY_CATEGORY = {
  presentation: TOOLS.filter((t) => t.category === "ppt" && !t.aliasOf),
  document: TOOLS.filter((t) => t.category === "pdf" && !t.aliasOf),
  image: TOOLS.filter((t) => t.category === "image" && !t.aliasOf),
};

type ToolSlugKey = keyof Dictionary["tools"];

export function Screen2Opened({
  locale,
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
      <Header locale={locale} />

      <main className="flex-1 flex flex-col items-center justify-center px-8 py-8 relative">
        <CategoryStrip
          active={activeCategory}
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
              width: "min(520px, calc(100vw - 32px))",
              transition: "top 200ms ease",
            }}
          >
            <div
              className="grid grid-cols-2 gap-3 max-[480px]:grid-cols-1"
              style={{ textAlign: "left" }}
            >
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

      <Footer
        copyright={dict.footer.copyright}
        version={dict.footer.version}
        license={dict.footer.license}
      />
    </div>
  );
}
