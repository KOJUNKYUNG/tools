import type { Dictionary } from "@/i18n/config";
import type { GalleryCategory } from "@/lib/gallery/types";
import type { PptBackgroundToolLabels } from "./PptBackgroundTool";

type PptBgPageDict = Dictionary["tools"]["ppt-background"]["page"];

export function getPptBackgroundLabels(
  dict: Dictionary,
): PptBackgroundToolLabels {
  const p: PptBgPageDict = dict.tools["ppt-background"].page;

  const categoryByKey: Record<GalleryCategory, string> = {
    gradient: p.gallery.categoryGradient,
    nature: p.gallery.categoryNature,
    texture: p.gallery.categoryTexture,
    pattern: p.gallery.categoryPattern,
  };

  return {
    header: p.header,
    upload: p.upload,
    conversion: {
      heading: p.conversion.heading,
      note: p.conversion.note,
      methods: p.conversion.methods.map((m) => ({
        title: m.title,
        steps: m.steps,
        linkLabel: "linkLabel" in m ? m.linkLabel : undefined,
        linkHref: "linkHref" in m ? m.linkHref : undefined,
      })),
    },
    fileStatus: {
      slideCountTemplate: p.fileStatus.slideCountTemplate,
      changeFile: p.fileStatus.changeFile,
      analyzing: p.fileStatus.analyzing,
    },
    mode: p.mode,
    thumbnails: {
      heading: p.thumbnails.heading,
      empty: p.thumbnails.empty,
      sourceByKey: {
        slide: p.thumbnails.sourceSlide,
        layout: p.thumbnails.sourceLayout,
        master: p.thumbnails.sourceMaster,
      },
    },
    background: p.background,
    gallery: {
      heading: p.gallery.heading,
      countSuffixTemplate: p.gallery.countSuffixTemplate,
      categoryAll: p.gallery.categoryAll,
      categoryByKey,
      empty: p.gallery.empty,
    },
    action: p.action,
    processing: p.processing,
    fileUpload: dict.common.fileUpload,
  };
}
