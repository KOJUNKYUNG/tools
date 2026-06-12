"use client";

import { useEffect, useRef, useState } from "react";
import { Screen1Landing } from "./Screen1Landing";
import { Screen2Opened } from "./Screen2Opened";
import { Screen3Workspace } from "./Screen3Workspace";
import type { Dictionary } from "@/i18n/config";
import { TOOLS, type ToolInfo } from "@/lib/constants";

type Category = "presentation" | "document" | "image";
type Stage = "closed" | "opened" | "workspace";

interface InteractiveLandingProps {
  locale: "ko" | "en";
  dict: Dictionary;
}

export function InteractiveLanding({ locale, dict }: InteractiveLandingProps) {
  const [stage, setStage] = useState<Stage>("closed");
  const [lidState, setLidState] = useState<"closed" | "opening" | "open">("closed");
  const [activeCategory, setActiveCategory] = useState<Category>("document");
  const [tool, setTool] = useState<ToolInfo | null>(null);
  const [zoomingToolSlug, setZoomingSlug] = useState<string | null>(null);
  const [wsZoom, setWsZoom] = useState<"entering" | "expanded">("entering");
  const timers = useRef<ReturnType<typeof setTimeout>[]>([]);

  useEffect(() => {
    const list = timers.current;
    return () => list.forEach(clearTimeout);
  }, []);
  const wait = (ms: number) =>
    new Promise<void>((r) => timers.current.push(setTimeout(r, ms)));

  async function handleOpen(category: Category) {
    setActiveCategory(category);
    setLidState("opening");
    await wait(280);
    setStage("opened");
    setLidState("open");
  }

  function handleCategoryChange(cat: Category) {
    setActiveCategory(cat);
  }

  async function handleClose() {
    setStage("closed");
    setLidState("opening");
    await wait(40);
    setLidState("closed");
  }

  async function handleToolOpen(slug: string) {
    const found = TOOLS.find((t) => t.slug === slug) ?? null;
    setTool(found);
    setZoomingSlug(slug);
    await wait(280);
    setStage("workspace");
    setWsZoom("expanded");
    setZoomingSlug(null);
  }

  async function handleWorkspaceClose() {
    setStage("opened");
  }

  if (stage === "workspace" && tool) {
    return (
      <Screen3Workspace
        locale={locale}
        dict={dict}
        tool={tool}
        zoomState={wsZoom}
        onClose={handleWorkspaceClose}
        onCategoryChange={(cat) => {
          setActiveCategory(cat);
          setStage("opened");
        }}
      />
    );
  }

  if (stage === "opened") {
    return (
      <Screen2Opened
        locale={locale}
        dict={dict}
        activeCategory={activeCategory}
        onCategoryChange={handleCategoryChange}
        onClose={handleClose}
        onToolOpen={handleToolOpen}
        zoomingToolSlug={zoomingToolSlug}
      />
    );
  }

  return (
    <Screen1Landing
      locale={locale}
      dict={dict}
      lidState={lidState}
      onOpen={handleOpen}
    />
  );
}
