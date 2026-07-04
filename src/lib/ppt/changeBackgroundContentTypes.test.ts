import { describe, it, expect } from "vitest";
import { insertDefaultContentType } from "./changeBackground";

const NS = "http://schemas.openxmlformats.org/package/2006/content-types";

describe("insertDefaultContentType", () => {
  const base =
    `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>` +
    `<Types xmlns="${NS}">` +
    `<Default ContentType="image/jpeg" Extension="jpeg"/>` +
    `</Types>`;

  it("inserts the new Default WITHOUT breaking the <Types> root tag", () => {
    const out = insertDefaultContentType(base, "png", "image/png");
    // Root tag keeps its namespace attribute intact.
    expect(out).toContain(`<Types xmlns="${NS}">`);
    // The new default is present…
    expect(out).toContain(`<Default Extension="png" ContentType="image/png"/>`);
    // …and the corruption signature never appears.
    expect(out).not.toContain(`<Types>`);
    expect(out).not.toContain(`/> xmlns=`);
  });

  it("is idempotent when the extension is already declared (attr order agnostic)", () => {
    // base already declares jpeg as `ContentType=... Extension="jpeg"`.
    const out = insertDefaultContentType(base, "jpeg", "image/jpeg");
    expect(out).toBe(base);
  });

  it("produces output whose <Types> children all sit inside the root element", () => {
    const out = insertDefaultContentType(base, "png", "image/png");
    // Everything between the opening <Types ...> and </Types> — no stray text
    // after a self-closed tag before the namespace.
    const inner = out.slice(out.indexOf(">", out.indexOf("<Types")) + 1, out.indexOf("</Types>"));
    expect(inner).toContain(`<Default Extension="png" ContentType="image/png"/>`);
    expect(inner).not.toContain("xmlns=");
  });
});
