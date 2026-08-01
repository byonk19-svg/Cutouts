import { hasSubstantialChromaticArtwork, isSvgFile, validateSvgMarkup } from "../src/svgFastPath.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

assert(isSvgFile(new File(["<svg/>"] as BlobPart[], "character.svg", { type: "image/svg+xml" })), "SVG MIME uploads should use the SVG fast path");
assert(isSvgFile(new File(["<svg/>"] as BlobPart[], "character.SVG", { type: "application/octet-stream" })), "SVG filename uploads should use the SVG fast path when the browser omits a MIME type");
assert(!isSvgFile(new File(["png"] as BlobPart[], "character.png", { type: "image/png" })), "PNG uploads should keep the existing image path");

const colorfulArtwork = solidPixels(100, 100, [255, 255, 255, 255]);
paintRect(colorfulArtwork, 100, { left: 10, top: 10, right: 48, bottom: 90 }, [220, 45, 45, 255]);
paintRect(colorfulArtwork, 100, { left: 52, top: 10, right: 90, bottom: 90 }, [35, 150, 210, 255]);
paintRect(colorfulArtwork, 100, { left: 48, top: 10, right: 52, bottom: 90 }, [15, 15, 15, 255]);
assert(
  hasSubstantialChromaticArtwork(colorfulArtwork, 100, 100),
  "Multi-color filled artwork must avoid the authored-ink fast path"
);

const blackLineArt = solidPixels(100, 100, [255, 255, 255, 255]);
paintRect(blackLineArt, 100, { left: 48, top: 10, right: 52, bottom: 90 }, [15, 15, 15, 255]);
assert(
  !hasSubstantialChromaticArtwork(blackLineArt, 100, 100),
  "Black line art must retain the authored-ink fast path"
);

const lineArtWithSmallAccent = solidPixels(100, 100, [255, 255, 255, 255]);
paintRect(lineArtWithSmallAccent, 100, { left: 48, top: 10, right: 52, bottom: 90 }, [15, 15, 15, 255]);
paintRect(lineArtWithSmallAccent, 100, { left: 10, top: 10, right: 18, bottom: 18 }, [220, 45, 45, 255]);
assert(
  !hasSubstantialChromaticArtwork(lineArtWithSmallAccent, 100, 100),
  "A small colored accent must not reroute otherwise genuine line art"
);

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

function assertThrowsWithMessage(action: () => void, expectedMessage: string, message: string) {
  try {
    action();
  } catch (error) {
    assert(error instanceof Error && error.message.includes(expectedMessage), `${message}: received ${error instanceof Error ? error.message : String(error)}`);
    return;
  }
  throw new Error(message);
}

function solidPixels(width: number, height: number, color: [number, number, number, number]) {
  const pixels = new Uint8ClampedArray(width * height * 4);
  for (let index = 0; index < pixels.length; index += 4) pixels.set(color, index);
  return pixels;
}

function paintRect(
  pixels: Uint8ClampedArray,
  width: number,
  bounds: { left: number; top: number; right: number; bottom: number },
  color: [number, number, number, number]
) {
  for (let y = bounds.top; y < bounds.bottom; y += 1) {
    for (let x = bounds.left; x < bounds.right; x += 1) pixels.set(color, (y * width + x) * 4);
  }
}
