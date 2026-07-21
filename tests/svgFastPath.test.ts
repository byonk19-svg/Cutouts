import { isSvgFile, validateSvgMarkup } from "../src/svgFastPath.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(isSvgFile(new File(["<svg/>"] as BlobPart[], "character.svg", { type: "image/svg+xml" })), "SVG MIME uploads should use the SVG fast path");
assert(isSvgFile(new File(["<svg/>"] as BlobPart[], "character.SVG", { type: "application/octet-stream" })), "SVG filename uploads should use the SVG fast path when the browser omits a MIME type");
assert(!isSvgFile(new File(["png"] as BlobPart[], "character.png", { type: "image/png" })), "PNG uploads should keep the existing image path");

assertThrowsWithMessage(
  () => validateSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><style>path { fill: url(https://example.com/ink.svg); }</style></svg>'),
  "references external content",
  "External CSS resources must be rejected before browser rasterization"
);
assertThrowsWithMessage(
  () => validateSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg" onload="fetch(\'https://example.com/ink\')"><path d="M0 0"/></svg>'),
  "interactive behavior",
  "Event handler attributes must be rejected before browser rasterization"
);
assertThrowsWithMessage(
  () => validateSvgMarkup('<!DOCTYPE svg [<!ENTITY remote SYSTEM "https://example.com/ink.svg">]><svg xmlns="http://www.w3.org/2000/svg"><text>&remote;</text></svg>'),
  "document declarations",
  "Document type and entity declarations must be rejected before browser rasterization"
);
assertThrowsWithMessage(
  () => validateSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><use href="javascript:alert(1)"/></svg>'),
  "interactive behavior",
  "Non-local href values must be rejected before browser rasterization"
);
validateSvgMarkup(`
  <svg xmlns="http://www.w3.org/2000/svg">
    <defs><linearGradient id="ink"><stop stop-color="#111"/></linearGradient></defs>
    <path d="M0 0" stroke="url(#ink)"/>
    <use href="#local-shape"/>
  </svg>
`);

console.log("svg fast path tests passed");

function assertThrows(action: () => void, message: string) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}

function assertThrowsWithMessage(action: () => void, expectedMessage: string, message: string) {
  try {
    action();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(expectedMessage), `${message}: received ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  throw new Error(message);
}
