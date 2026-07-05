import JSZip from "jszip";

export interface SlideBackground {
  slideIndex: number;
  slideName: string;
  imageBlob: Blob | null;
  source: "slide" | "layout" | "master" | "none";
  /** Resolved zip path of the background image part — the dedup key. null when source==="none". */
  imagePath: string | null;
}

async function resolveBlipImage(
  zip: JSZip,
  xmlDir: string,
  xmlFileName: string,
  slideXml: string,
): Promise<{ blob: Blob; path: string } | null> {
  const bgMatch = slideXml.match(/<p:bg[\s>][\s\S]*?<\/p:bg>/);
  if (!bgMatch) return null;

  const embedMatch = bgMatch[0].match(/r:embed="([^"]+)"/);
  if (!embedMatch) return null;

  const relId = embedMatch[1];
  const relsPath = `${xmlDir}/_rels/${xmlFileName}.rels`;
  const relsFile = zip.file(relsPath);
  if (!relsFile) return null;

  const relsXml = await relsFile.async("text");
  const relPattern = new RegExp(
    `<Relationship[^>]*Id="${relId}"[^>]*Target="([^"]+)"`,
  );
  const relMatch = relsXml.match(relPattern);
  if (!relMatch) return null;

  let targetPath = relMatch[1];
  if (targetPath.startsWith("../")) {
    const parts = xmlDir.split("/");
    parts.pop();
    targetPath = parts.join("/") + "/" + targetPath.replace("../", "");
  } else if (!targetPath.startsWith("ppt/")) {
    targetPath = `${xmlDir}/${targetPath}`;
  }

  const imageFile = zip.file(targetPath);
  if (!imageFile) return null;

  const data = await imageFile.async("arraybuffer");
  const ext = targetPath.split(".").pop()?.toLowerCase() ?? "";
  const mimeMap: Record<string, string> = {
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    bmp: "image/bmp",
    svg: "image/svg+xml",
    emf: "image/x-emf",
    wmf: "image/x-wmf",
  };
  const blob = new Blob([data], { type: mimeMap[ext] ?? "application/octet-stream" });
  return { blob, path: targetPath };
}

export async function extractCurrentBackgrounds(
  file: File,
): Promise<SlideBackground[]> {
  const arrayBuffer = await file.arrayBuffer();
  const zip = await JSZip.loadAsync(arrayBuffer);

  const slideFiles: string[] = [];
  zip.forEach((path) => {
    if (/^ppt\/slides\/slide\d+\.xml$/.test(path)) {
      slideFiles.push(path);
    }
  });

  slideFiles.sort((a, b) => {
    const numA = parseInt(a.match(/slide(\d+)/)?.[1] ?? "0");
    const numB = parseInt(b.match(/slide(\d+)/)?.[1] ?? "0");
    return numA - numB;
  });

  const results: SlideBackground[] = [];

  for (let i = 0; i < slideFiles.length; i++) {
    const slidePath = slideFiles[i];
    const slideXml = await zip.file(slidePath)!.async("text");
    const slideNum = parseInt(slidePath.match(/slide(\d+)/)?.[1] ?? `${i + 1}`);

    const bg: SlideBackground = {
      slideIndex: i + 1,
      slideName: `슬라이드 ${slideNum}`,
      imageBlob: null,
      source: "none",
      imagePath: null,
    };

    const directBg = await resolveBlipImage(zip, "ppt/slides", `slide${slideNum}.xml`, slideXml);
    if (directBg) {
      bg.imageBlob = directBg.blob;
      bg.imagePath = directBg.path;
      bg.source = "slide";
      results.push(bg);
      continue;
    }

    const relsPath = `ppt/slides/_rels/slide${slideNum}.xml.rels`;
    const relsFile = zip.file(relsPath);
    if (relsFile) {
      const relsXml = await relsFile.async("text");
      const layoutRelMatch = relsXml.match(
        /<Relationship[^>]*Type="[^"]*slideLayout"[^>]*Target="([^"]+)"/,
      );
      if (layoutRelMatch) {
        let layoutPath = layoutRelMatch[1];
        if (layoutPath.startsWith("../")) {
          layoutPath = "ppt/" + layoutPath.replace("../", "");
        }
        const layoutFile = zip.file(layoutPath);
        if (layoutFile) {
          const layoutXml = await layoutFile.async("text");
          const layoutDir = layoutPath.substring(0, layoutPath.lastIndexOf("/"));
          const layoutFileName = layoutPath.split("/").pop()!;
          const layoutBg = await resolveBlipImage(zip, layoutDir, layoutFileName, layoutXml);
          if (layoutBg) {
            bg.imageBlob = layoutBg.blob;
            bg.imagePath = layoutBg.path;
            bg.source = "layout";
            results.push(bg);
            continue;
          }

          const layoutRelsPath = `${layoutDir}/_rels/${layoutFileName}.rels`;
          const layoutRelsFile = zip.file(layoutRelsPath);
          if (layoutRelsFile) {
            const layoutRelsXml = await layoutRelsFile.async("text");
            const masterRelMatch = layoutRelsXml.match(
              /<Relationship[^>]*Type="[^"]*slideMaster"[^>]*Target="([^"]+)"/,
            );
            if (masterRelMatch) {
              let masterPath = masterRelMatch[1];
              if (masterPath.startsWith("../")) {
                masterPath = "ppt/" + masterPath.replace("../", "");
              }
              const masterFile = zip.file(masterPath);
              if (masterFile) {
                const masterXml = await masterFile.async("text");
                const masterDir = masterPath.substring(0, masterPath.lastIndexOf("/"));
                const masterFileName = masterPath.split("/").pop()!;
                const masterBg = await resolveBlipImage(zip, masterDir, masterFileName, masterXml);
                if (masterBg) {
                  bg.imageBlob = masterBg.blob;
                  bg.imagePath = masterBg.path;
                  bg.source = "master";
                  results.push(bg);
                  continue;
                }
              }
            }
          }
        }
      }
    }

    results.push(bg);
  }

  return results;
}
