"use client";

import { useState } from "react";
import { UploadCloud, ShieldCheck, Infinity as InfinityIcon, Zap } from "lucide-react";
import { Header } from "@/components/layout/Header";
import { Footer } from "@/components/layout/Footer";
import { FadeInCenter } from "@/components/brand/FadeInCenter";
import { CategoryStrip } from "@/components/brand/CategoryStrip";
import { TOOLS, type ToolInfo } from "@/lib/constants";
import type { Dictionary } from "@/i18n/config";

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
  const [files, setFiles] = useState<string[]>([]);
  const [dragOver, setDragOver] = useState(false);
  const Icon = tool.icon;
  const toolDict = dict.tools[tool.slug as ToolSlugKey];

  // zoomState reserved for future use (keep design parity)
  void zoomState;

  const activeCategory = inferCategory(tool);

  // Touch TOOLS to keep the import meaningful (also useful for future expansion)
  void TOOLS;

  return (
    <div className="flex flex-col h-screen relative overflow-hidden" style={{ background: "var(--bg)" }}>
      {theme === "dark" && (
        <div className="absolute inset-0 dark-tray-surface pointer-events-none" style={{ zIndex: 0 }} />
      )}
      <img
        src="/brand/tray-bg.png"
        alt=""
        className="absolute inset-0 w-full h-full select-none pointer-events-none"
        style={{
          objectFit: "contain",
          objectPosition: "center",
          transform: `scale(var(--tweak-bg-scale, 1))`,
          transformOrigin: "50% 50%",
          opacity: theme === "dark" ? 0.18 : 1,
          mixBlendMode: theme === "dark" ? "screen" : "normal",
          transition: "transform 280ms cubic-bezier(.2,.8,.2,1)",
          filter: theme === "dark" ? "brightness(0.85) contrast(0.9) saturate(0.6)" : "none",
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
              width: "var(--tweak-workspace-width, 620px)",
              transform: "translateX(-50%)",
              transition: "top 200ms ease",
            }}
          >
            <div
              className="rounded-[14px] border overflow-hidden"
              style={{
                background: "color-mix(in oklch, var(--surface) 92%, transparent)",
                backdropFilter: "blur(10px) saturate(1.1)",
                WebkitBackdropFilter: "blur(10px) saturate(1.1)",
                borderColor: "var(--border)",
                boxShadow:
                  "0 1px 0 rgba(255,255,255,0.7) inset, 0 24px 48px -16px rgba(20,30,60,0.28), 0 8px 20px -6px rgba(20,30,60,0.16)",
              }}
            >
              <div
                className="px-6 pt-5 pb-4 flex items-start gap-3 border-b"
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

              <div className="px-6 py-5">
                <div
                  onDragEnter={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setDragOver(true);
                  }}
                  onDragLeave={() => setDragOver(false)}
                  onDrop={(e) => {
                    e.preventDefault();
                    setDragOver(false);
                    const f = [...e.dataTransfer.files];
                    setFiles((prev) => [...prev, ...f.map((x) => x.name)]);
                  }}
                  className="rounded-[8px] border-2 border-dashed px-6 py-7 flex flex-col items-center justify-center text-center transition-colors"
                  style={{
                    borderColor: dragOver ? "var(--accent-electric)" : "var(--hairline)",
                    background: dragOver
                      ? "color-mix(in oklch, var(--accent-electric) 6%, var(--surface))"
                      : "var(--surface-2)",
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

                  <label
                    className="mt-4 inline-flex items-center gap-2 px-6 h-11 rounded-[5px] font-display text-[13.5px] font-medium tracking-[0.02em] cursor-pointer focus-ring glint"
                    style={{
                      background: "var(--accent-electric)",
                      color: "#fff",
                      boxShadow:
                        "0 1px 0 rgba(255,255,255,0.2) inset, 0 1px 2px rgba(20,30,60,0.15), 0 6px 16px -6px color-mix(in oklch, var(--accent-electric) 60%, transparent)",
                    }}
                  >
                    <UploadCloud size={14} />
                    <span>{dict.common.browse}</span>
                    <input
                      type="file"
                      multiple
                      className="sr-only"
                      onChange={(e) =>
                        setFiles([...(e.target.files ?? [])].map((x) => x.name))
                      }
                    />
                  </label>

                  {files.length > 0 && (
                    <div className="mt-4 w-full max-w-[400px]">
                      <div
                        className="font-body text-[9.5px] tracking-[0.18em] uppercase mb-1.5 text-left"
                        style={{ color: "var(--ink-soft)" }}
                      >
                        {dict.status.queued} · {files.length}
                      </div>
                      <div
                        className="rounded-[4px] border overflow-hidden"
                        style={{ borderColor: "var(--border)", background: "var(--surface)" }}
                      >
                        {files.slice(0, 3).map((f, i) => (
                          <div
                            key={i}
                            className="flex items-center justify-between px-3 py-1.5 border-b font-body text-[10.5px]"
                            style={{ borderColor: "var(--border)", color: "var(--ink-strong)" }}
                          >
                            <span className="truncate">{f}</span>
                            <span
                              className="font-mono text-[9px] tracking-[0.1em] uppercase"
                              style={{ color: "var(--ink-soft)" }}
                            >
                              ready
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>

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
              </div>
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
