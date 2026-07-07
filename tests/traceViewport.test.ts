import {
  DEFAULT_TRACE_VIEWPORT,
  fittedTraceSize,
  panViewport,
  screenToTracePoint,
  zoomViewport
} from "../src/traceViewport.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

{
  const size = fittedTraceSize({ width: 400, height: 800 }, { width: 200, height: 200 });

  assertEqual(size.width, 100, "fit should preserve source aspect ratio by width");
  assertEqual(size.height, 200, "fit should fill available height");
}

{
  const point = screenToTracePoint(
    { x: 100, y: 100 },
    DEFAULT_TRACE_VIEWPORT,
    { width: 400, height: 800 },
    { width: 200, height: 200 }
  );

  assertEqual(Math.round(point.x), 200, "screen center should map to trace center x");
  assertEqual(Math.round(point.y), 400, "screen center should map to trace center y");
}

{
  const panned = panViewport(DEFAULT_TRACE_VIEWPORT, { x: 30, y: -20 });

  assertEqual(panned.panX, 30, "pan should add x delta");
  assertEqual(panned.panY, -20, "pan should add y delta");
}

{
  const zoomed = zoomViewport(DEFAULT_TRACE_VIEWPORT, 2, { x: 100, y: 100 }, { width: 200, height: 200 });

  assertEqual(zoomed.zoom, 2, "zoom should update viewport zoom");
  assert(Math.abs(zoomed.panX) < 0.01, "center-focused zoom should keep x pan stable");
  assert(Math.abs(zoomed.panY) < 0.01, "center-focused zoom should keep y pan stable");
}
