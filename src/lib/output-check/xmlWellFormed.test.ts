import { describe, it, expect } from "vitest";
import { xmlWellFormedError } from "./xmlWellFormed";

// Deliberately below the checker seam (spec #51 tests at seams only): a false
// positive here blocks a user's good deck, and the checker seam cannot feed
// it valid-but-unusual XML cheaply. So valid-but-unusual XML gets as much
// coverage as broken XML.
const wellFormed: [string, string][] = [
  ["declaration, namespaces, self-closing", '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<p:sld xmlns:p="urn:p"><p:cSld/></p:sld>'],
  ["byte-order mark", "﻿<a/>"],
  ["single-quoted attributes", "<a x='1' y=\"2\"/>"],
  ["> inside an attribute value", '<a t="x > y"/>'],
  ["predefined and numeric references", '<a t="&amp;&lt;&#38;&#x26;">&gt;&quot;&apos;</a>'],
  ["comments and CDATA", "<!-- c --><a><![CDATA[<not a tag> & ]]><!-- <b> --></a>"],
  ["whitespace around attributes", '<a  x = "1"\n\ty="2" ></a >'],
  ["trailing whitespace and comment after root", "<a/>\n<!-- end -->\n"],
  ["non-ASCII text and names", "<가 속성=\"값\">본문</가>"],
];

const malformed: [string, string][] = [
  ["unclosed element", "<a><b></a>"],
  ["crossed tags", "<a><b></a></b>"],
  ["stray end tag", "<a/></b>"],
  ["unterminated start tag", '<a x="1"'],
  ["unquoted attribute", "<a x=1/>"],
  ["duplicate attribute", '<a x="1" x="2"/>'],
  ["raw < in an attribute", '<a x="<"/>'],
  ["bare ampersand", "<a>fish & chips</a>"],
  ["undeclared named entity", "<a>&nbsp;</a>"],
  ["text outside the root", "<a/>junk"],
  ["two roots", "<a/><b/>"],
  ["empty part", ""],
  ["unterminated comment", "<a><!-- </a>"],
];

describe("xmlWellFormedError", () => {
  it.each(wellFormed)("accepts %s", (_, xml) => {
    expect(xmlWellFormedError(xml)).toBeNull();
  });
  it.each(malformed)("rejects %s", (_, xml) => {
    expect(xmlWellFormedError(xml)).not.toBeNull();
  });
});
