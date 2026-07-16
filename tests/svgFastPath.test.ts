import { isSvgFile, validateSvgMarkup } from "../src/svgFastPath.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(isSvgFile(new File(["<svg/>"] as BlobPart[], "character.svg", { type: "image/svg+xml" })), "SVG MIME uploads should use the SVG fast path");
assert(isSvgFile(new File(["<svg/>"] as BlobPart[], "character.SVG", { type: "application/octet-stream" })), "SVG filename uploads should use the SVG fast path when the browser omits a MIME type");
assert(!isSvgFile(new File(["png"] as BlobPart[], "character.png", { type: "image/png" })), "PNG uploads should keep the existing image path");

assertThrows(() => validateSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><style>path { fill: url(https://example.com/ink.svg); }</style></svg>'), "External CSS resources must be rejected before browser rasterization");
validateSvgMarkup('<svg xmlns="http://www.w3.org/2000/svg"><path d="M0 0" stroke="#111"/></svg>');

console.log("svg fast path tests passed");

function assertThrows(action: () => void, message: string) {
  try {
    action();
  } catch {
    return;
  }
  throw new Error(message);
}
