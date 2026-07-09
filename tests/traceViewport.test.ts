import {
  DEFAULT_TRACE_VIEWPORT,
  boundsFromTraceStrokes,
  centerBoundsInViewport,
  fitBoundsToViewport,
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

{
  const viewport = fitBoundsToViewport(
    { left: 200, top: 200, right: 400, bottom: 400 },
    { width: 1000, height: 1000 },
    { width: 500, height: 500 },
    50
  );
  const center = screenToTracePoint({ x: 250, y: 250 }, viewport, { width: 1000, height: 1000 }, { width: 500, height: 500 });

  assertEqual(Math.round(center.x), 300, "fit should center content bounds x");
  assertEqual(Math.round(center.y), 300, "fit should center content bounds y");
}

{
  const loose = fitBoundsToViewport(
    { left: 200, top: 200, right: 400, bottom: 400 },
    { width: 1000, height: 1000 },
    { width: 500, height: 500 },
    50
  );
  const padded = fitBoundsToViewport(
    { left: 200, top: 200, right: 400, bottom: 400 },
    { width: 1000, height: 1000 },
    { width: 500, height: 500 },
    100
  );

  assert(padded.zoom < loose.zoom, "larger padding should reduce fit zoom");
}

{
  const viewport = fitBoundsToViewport(
    { left: 250, top: 60, right: 430, bottom: 1140 },
    { width: 800, height: 1200 },
    { width: 620, height: 520 },
    56
  );
  const center = screenToTracePoint({ x: 310, y: 260 }, viewport, { width: 800, height: 1200 }, { width: 620, height: 520 });

  assertEqual(Math.round(center.x), 340, "fit should center tall narrow content x");
  assertEqual(Math.round(center.y), 600, "fit should center tall narrow content y");
  assert(viewport.zoom > 0.35, "tall narrow fit should keep usable zoom");
}

{
  const fullCanvasFit = fitBoundsToViewport(
    { left: 0, top: 0, right: 1000, bottom: 1000 },
    { width: 1000, height: 1000 },
    { width: 500, height: 500 },
    56
  );
  const cutlineFit = fitBoundsToViewport(
    { left: 250, top: 250, right: 750, bottom: 750 },
    { width: 1000, height: 1000 },
    { width: 500, height: 500 },
    56
  );

  assert(cutlineFit.zoom > fullCanvasFit.zoom, "fit should use content bounds instead of full canvas bounds");
}

{
  const strokes = [{
    id: "stroke-1",
    color: "#000000" as const,
    tool: "draw" as const,
    width: 20,
    points: [{ x: 10, y: 20 }, { x: 40, y: 80 }]
  }];
  const before = JSON.stringify(strokes);
  const bounds = boundsFromTraceStrokes(strokes);
  if (!bounds) throw new Error("stroke bounds should exist");
  centerBoundsInViewport(bounds, { width: 100, height: 100 }, { width: 200, height: 200 }, 1.5);

  assertEqual(JSON.stringify(strokes), before, "viewport fitting should not mutate stroke coordinates");
}
