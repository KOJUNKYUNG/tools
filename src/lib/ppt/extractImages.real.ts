// Real-file regression set entry for ppt-extract (`pnpm test:real`).
import { realFileSuite } from "@/lib/output-check/realFileSuite";
import { extractPptImages } from "./extractImages";
import { checkPptExtract } from "./extractImagesCheck";

realFileSuite({
  tool: "ppt-extract",
  extensions: [".pptx", ".ppt"],
  // The tool takes no options: one request.
  requests: async () => [{ label: "extract (default)", request: undefined }],
  run: (input, _request, fileName) =>
    extractPptImages({ file: new File([new Uint8Array(input)], fileName) }),
  check: checkPptExtract,
});
