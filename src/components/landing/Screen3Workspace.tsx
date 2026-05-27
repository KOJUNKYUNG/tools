"use client";

import { useState } from "react";
import Link from "next/link";
import { UploadCloud, ShieldCheck, Infinity as InfinityIcon, Zap, RotateCcw as RotateCcwIcon } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FadeInCenter } from "@/components/brand/FadeInCenter";
import { CategoryStrip } from "@/components/brand/CategoryStrip";
import { TOOLS, type ToolInfo } from "@/lib/constants";
import type { Dictionary } from "@/i18n/config";
import { PptBackgroundTool } from "@/components/tools/ppt-background/PptBackgroundTool";
import { getPptBackgroundLabels } from "@/components/tools/ppt-background/labels";
import { ImageResizeTool } from "@/components/tools/image-resize/ImageResizeTool";
import { getImageResizeLabels } from "@/components/tools/image-resize/labels";
import { ImageCompressTool } from "@/components/tools/image-compress/ImageCompressTool";
import { getImageCompressLabels } from "@/components/tools/image-compress/labels";
import { PdfArrange } from "@/components/tools/pdf-arrange/PdfArrange";
import { getPdfArrangeLabels } from "@/components/tools/pdf-arrange/labels";
import { ImageToPdf } from "@/components/tools/image-to-pdf/ImageToPdf";
import { getImageToPdfLabels } from "@/components/tools/image-to-pdf/labels";
import { PdfToImage } from "@/components/tools/pdf-to-image/PdfToImage";
import { getPdfToImageLabels } from "@/components/tools/pdf-to-image/labels";
import { PdfCompress } from "@/components/tools/pdf-compress/PdfCompress";
import { getPdfCompressLabels } from "@/components/tools/pdf-compress/labels";
import { PptExtract } from "@/components/tools/ppt-extract/PptExtract";
import { getPptExtractLabels } from "@/components/tools/ppt-extract/labels";

type Category = "presentation" | "document" | "image";

interface Screen3WorkspaceProps {
  locale: "ko" | "en";
  theme: "light" | "dark";
  dict: Dictionary;
  tool: ToolInfo;
  zoomState: "entering" | "expanded";
  onClose: () => void;
  onCategoryChange: (cat: Category) => void;
}

type ToolSlugKey = keyof Dictionary["tools"];

function inferCategory(tool: ToolInfo): Category {
  if (tool.category === "ppt") return "presentation";
  if (tool.category === "pdf") return "document";
  return "image";
}

export function Screen3Workspace({
  locale,
  theme,
  dict,
  tool,
  zoomState,
  onClose,
  onCategoryChange,
}: Screen3WorkspaceProps) {
  const Icon = tool.icon;
  const toolDict = dict.tools[tool.slug as ToolSlugKey];
  const toolHref = `/${locale}/tools/${tool.slug}`;
  const [pptBgResetKey, setPptBgResetKey] = useState(0);

  // zoomState reserved for future use (keep design parity)
  void zoomState;

  const activeCategory = inferCategory(tool);

  // Touch TOOLS to keep the import meaningful (also useful for future expansion)
  void TOOLS;

  const renderToolBody = () => {
    switch (tool.slug) {
      case "ppt-background":
        return (
          <PptBackgroundTool key={pptBgResetKey} inline labels={getPptBackgroundLabels(dict)} />
        );
      case "image-resize":
        return (
          <ImageResizeTool inline labels={getImageResizeLabels(dict)} lang={locale} />
        );
      case "image-compress":
        return <ImageCompressTool inline labels={getImageCompressLabels(dict)} />;
      case "image-to-pdf":
        return <ImageToPdf inline labels={getImageToPdfLabels(dict)} lang={locale} />;
      case "pdf-to-image":
        return <PdfToImage inline labels={getPdfToImageLabels(dict)} lang={locale} />;
      case "pdf-compress":
        return <PdfCompress inline labels={getPdfCompressLabels(dict)} />;
      case "ppt-extract":
        return <PptExtract inline labels={getPptExtractLabels(dict)} />;
      case "pdf-arrange":
      case "pdf-merge":
      case "pdf-split":
      case "pdf-pages":
        return <PdfArrange inline labels={getPdfArrangeLabels(dict)} />;
      default:
        return (
          <>
            <Link
              href={toolHref}
              className="rounded-[8px] border-2 border-dashed px-6 py-7 flex flex-col items-center justify-center text-center transition-colors hover:border-[color:var(--accent-electric)]"
              style={{
                borderColor: "var(--hairline)",
                background: "var(--surface-2)",
              }}
            >
              <div
                className="w-10 h-10 rounded-[4px] flex items-center justify-center mb-2.5"
                style={{
                  background: "var(--surface)",
                  border: "1px solid var(--border)",
                  color: "var(--ink-strong)",
                }}
              >
                <UploadCloud size={16} />
              </div>
              <div
                className="font-display text-[14px] font-semibold leading-[1.2] font-ko"
                style={{ color: "var(--headline)" }}
              >
                {dict.common.drop}
              </div>
              <div
                className="mt-0.5 font-body text-[11px]"
                style={{ color: "var(--ink-soft)" }}
              >
                {dict.common.click}
              </div>

              <span
                className="mt-4 inline-flex items-center gap-2 px-6 h-11 rounded-[5px] font-display text-[13.5px] font-medium tracking-[0.02em] focus-ring glint"
                style={{
                  background: "var(--accent-electric)",
                  color: "#fff",
                  boxShadow:
                    "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                }}
              >
                <UploadCloud size={14} />
                <span>{dict.common.openTool}</span>
              </span>
            </Link>

            <div
              className="mt-4 flex items-center justify-center gap-4 font-body text-[9.5px] tracking-[0.15em] uppercase"
              style={{ color: "var(--ink-soft)" }}
            >
              <span className="flex items-center gap-1.5">
                <ShieldCheck size={10} /> {dict.status.inBrowser}
              </span>
              <span style={{ background: "var(--border)" }} className="w-px h-3" />
              <span className="flex items-center gap-1.5">
                <InfinityIcon size={10} /> {dict.status.unlimited}
              </span>
              <span style={{ background: "var(--border)" }} className="w-px h-3" />
              <span className="flex items-center gap-1.5">
                <Zap size={10} /> {dict.status.noUpload}
              </span>
            </div>
          </>
        );
    }
  };

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
          onSelect={(cat) => {
            if (cat === activeCategory) {
              onClose();
            } else {
              onCategoryChange(cat);
            }
          }}
          onBack={onClose}
        />

        <FadeInCenter>
          <div
            className="absolute left-1/2"
            style={{
              top: "calc(50% - 200px + var(--tweak-title-y, 0px))",
              width: "min(var(--tweak-workspace-width, 620px), calc(100vw - 32px))",
              transform: "translateX(-50%)",
              transition: "top 200ms ease",
            }}
          >
            <div
              className="relative rounded-[14px] border overflow-hidden"
              style={{
                background: "color-mix(in oklch, var(--surface) 92%, transparent)",
                backdropFilter: "blur(10px) saturate(1.1)",
                WebkitBackdropFilter: "blur(10px) saturate(1.1)",
                borderColor: "var(--border)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)",
              }}
            >
              {tool.slug === "ppt-background" && (
                <button
                  type="button"
                  onClick={() => setPptBgResetKey((k) => k + 1)}
                  aria-label={dict.common.reset}
                  title={dict.common.reset}
                  className="absolute right-6 top-4 z-10 rounded-md p-1.5 transition-colors hover:text-[color:var(--ink-strong)]"
                  style={{ color: "var(--ink-soft)" }}
                >
                  <RotateCcwIcon className="size-4" />
                </button>
              )}
              <div
                className="px-6 pt-3 pb-3 flex items-start gap-3 border-b"
                style={{ borderColor: "var(--border)" }}
              >
                <div
                  className="shrink-0 w-10 h-10 rounded-[5px] flex items-center justify-center"
                  style={{
                    background: "var(--surface-2)",
                    border: "1px solid var(--border)",
                    color: "var(--ink-strong)",
                  }}
                >
                  <Icon size={18} />
                </div>
                <div className="flex-1 min-w-0">
                  <div
                    className="font-display text-[16px] font-semibold leading-[1.2] tracking-[0.005em] font-ko"
                    style={{ color: "var(--headline)" }}
                  >
                    {toolDict.title}
                  </div>
                  <div
                    className="mt-1 font-body text-[12px] leading-[1.45]"
                    style={{ color: "var(--ink)" }}
                  >
                    {toolDict.description}
                  </div>
                </div>
                <span
                  className="shrink-0 font-body text-[9px] tracking-[0.18em] uppercase font-mono pt-1"
                  style={{ color: "var(--ink-soft)", display: "none" }}
                >
                  {tool.slug}
                </span>
              </div>

              <div className="px-6 py-3">{renderToolBody()}</div>
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
