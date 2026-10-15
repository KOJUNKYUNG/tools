// Vitest setup: PDF checks run on pdfjs's Node build (see pdfjsNode.ts).
import { setPdfjsAdapter } from "./pdfInspector";
import { nodePdfjsAdapter } from "./pdfjsNode";

setPdfjsAdapter(nodePdfjsAdapter);
