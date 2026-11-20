// Test-only: the shared sized picture preparation run on real pixels in Node,
// through sharp (a dev dependency; never imported by the app).
import sharp from "sharp";
import { readImageHeader } from "@/lib/output-check/imageHeader";
import { standInSizedPreparation } from "./slideImageStandIn";
import { keptFormat, preparedFormat, takenWhole, type PreparedImage, type SizedImagePreparation } from "./slideImage";

/** sharp's JPEG quality for the browser's 0.85 and 0.95. */
const SMALLEST_QUALITY = 85;
const OWN_QUALITY = 95;

/**
 * Stands in for `sizedImagePreparation` where the output must hold real
 * pixels (a PDF the assembler embeds and pdf.js decodes): the browser
 * preparer's rules for what goes in as uploaded and which format a picture
 * is saved in, with sharp cutting, turning upright (EXIF orientation) and
 * resizing. Encoders differ from the browser's, so sizes do not carry over.
 * Steps need a canvas and are refused.
 */
export const nodeSizedPreparation: SizedImagePreparation = {
  measure: standInSizedPreparation.measure,
  async prepare(source, crop, size, step, encoding = "smallest") {
    if (step) throw new Error("the Node preparation takes no step");
    const bytes = new Uint8Array(await source.arrayBuffer());
    const sourceFormat = readImageHeader(bytes)?.format;
    const ownFormat = keptFormat(sourceFormat, encoding);
    const whole = takenWhole(bytes, crop, size);
    if (whole && (sourceFormat === "jpeg" || ownFormat)) {
      return { bytes, format: sourceFormat === "jpeg" ? "jpeg" : "png", ...size };
    }

    const fitted = sharp(bytes)
      .rotate() // upright by its EXIF orientation, before the cut
      .extract({ left: crop.x, top: crop.y, width: crop.width, height: crop.height })
      .resize(size.width, size.height, { fit: "fill" });
    const encoded = async (format: PreparedImage["format"], quality: number) =>
      new Uint8Array(
        await (format === "jpeg" ? fitted.clone().jpeg({ quality }) : fitted.clone().png()).toBuffer(),
      );
    if (ownFormat) return { bytes: await encoded(ownFormat, OWN_QUALITY), format: ownFormat, ...size };

    const alphaUsed = !(await fitted.clone().stats()).isOpaque;
    const png = await encoded("png", 0);
    const jpeg = alphaUsed ? null : await encoded("jpeg", SMALLEST_QUALITY);
    if (jpeg && preparedFormat({ alphaUsed, jpegBytes: jpeg.length, pngBytes: png.length }) === "jpeg") {
      return { bytes: jpeg, format: "jpeg", ...size };
    }
    return { bytes: whole ? bytes : png, format: "png", ...size };
  },
};
