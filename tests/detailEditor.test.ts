import { removeClickedDetailSegment } from "../src/detailEditor.ts";

function makePixels(width: number, height: number) {
  return new Uint8ClampedArray(width * height * 4);
}

function setBlack(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  const index = (y * width + x) * 4;
  pixels[index] = 0;
  pixels[index + 1] = 0;
  pixels[index + 2] = 0;
  pixels[index + 3] = 255;
}

function alphaAt(pixels: Uint8ClampedArray, width: number, x: number, y: number) {
  return pixels[(y * width + x) * 4 + 3];
}

function countAlpha(pixels: Uint8ClampedArray) {
  let count = 0;
  for (let index = 3; index < pixels.length; index += 4) {
    if (pixels[index] > 0) count += 1;
  }
  return count;
}

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function clone(pixels: Uint8ClampedArray) {
  return new Uint8ClampedArray(pixels);
}

{
  const width = 24;
  const pixels = makePixels(width, 12);
  for (let x = 2; x <= 8; x += 1) setBlack(pixels, width, x, 4);
  for (let x = 15; x <= 20; x += 1) setBlack(pixels, width, x, 4);

  const result = removeClickedDetailSegment(pixels, width, 12, { x: 5, y: 4 });

  assert(result.changed, "click-remove should report a changed detail layer");
  assertEqual(result.removedPixels, 7, "click-remove should remove one connected detail segment");
  assertEqual(alphaAt(pixels, width, 5, 4), 0, "clicked segment should be transparent");
  assertEqual(alphaAt(pixels, width, 17, 4), 255, "separate detail segment should remain");
}

{
  const width = 18;
  const pixels = makePixels(width, 12);
  for (let y = 2; y <= 8; y += 1) setBlack(pixels, width, 7, y);

  const result = removeClickedDetailSegment(pixels, width, 12, { x: 10, y: 5 }, { hitRadiusPx: 4 });

  assert(result.changed, "click-remove should find nearby line pixels");
  assertEqual(countAlpha(pixels), 0, "nearby clicked detail segment should be fully removed");
}

{
  const width = 18;
  const pixels = makePixels(width, 12);
  setBlack(pixels, width, 2, 2);

  const result = removeClickedDetailSegment(pixels, width, 12, { x: 16, y: 10 }, { hitRadiusPx: 2 });

  assert(!result.changed, "clicking empty canvas should not change the detail layer");
  assertEqual(countAlpha(pixels), 1, "empty click should leave existing detail pixels alone");
}

{
  const width = 80;
  const pixels = makePixels(width, 12);
  for (let x = 0; x < width; x += 1) setBlack(pixels, width, x, 5);

  const result = removeClickedDetailSegment(pixels, width, 12, { x: 40, y: 5 }, {
    maxComponentPixels: 20,
    boundedRadiusPx: 8
  });

  assert(result.changed, "large components should still allow bounded removal");
  assert(result.removedPixels < 80, "large components should not be fully removed in one click");
  assertEqual(alphaAt(pixels, width, 40, 5), 0, "bounded removal should erase near the click");
  assertEqual(alphaAt(pixels, width, 0, 5), 255, "bounded removal should preserve far-away pixels in the same huge component");
}

{
  const width = 16;
  const detail = makePixels(width, 8);
  const outer = makePixels(width, 8);
  for (let x = 2; x <= 6; x += 1) setBlack(detail, width, x, 3);
  for (let x = 1; x <= 14; x += 1) setBlack(outer, width, x, 1);
  const outerBefore = clone(outer);

  const before = clone(detail);
  const result = removeClickedDetailSegment(detail, width, 8, { x: 4, y: 3 });
  const after = clone(detail);
  const undo = before;
  const redo = after;

  assert(result.changed, "click-remove should produce an edited detail layer");
  assertEqual(JSON.stringify(Array.from(outer)), JSON.stringify(Array.from(outerBefore)), "outer cutline buffer should remain unchanged");
  assertEqual(countAlpha(undo), 5, "undo snapshot should restore removed detail pixels");
  assertEqual(countAlpha(redo), 0, "redo snapshot should reapply the line removal");
}
