import type { Dictionary } from "@/i18n/config";
import { getBackgroundEditorLabels } from "@/components/background-editor/labels";
import type { PptBackgroundToolLabels } from "./PptBackgroundTool";

type PptBgPageDict = Dictionary["tools"]["ppt-background"]["page"];

export function getPptBackgroundLabels(
  dict: Dictionary,
): PptBackgroundToolLabels {
  const p: PptBgPageDict = dict.tools["ppt-background"].page;

  return {
    errors: dict.common.errors,
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
    editor: getBackgroundEditorLabels(dict),
    recipeEdit: p.recipeEdit,
    solid: p.solid,
    action: p.action,
    processing: p.processing,
    preview: p.preview,
    fileUpload: dict.common.fileUpload,
  };
}
