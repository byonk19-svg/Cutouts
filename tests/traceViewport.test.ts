import {
  DEFAULT_TRACE_VIEWPORT,
  boundsFromTraceStrokes,
  centerBoundsInViewport,
  fitBoundsToViewport,
  fittedTraceSize,
  mergeTraceBounds,
  panViewport,
  screenToTracePoint,
  shouldAutoFitViewport,
  zoomViewport
} from "../src/traceViewport.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function occupiedHeightRatio(
  bounds: { left: number; top: number; right: number; bottom: number },
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  viewport: { zoom: number; panX: number; panY: number }
) {
  const fitted = fittedTraceSize(canvasSize, viewportSize);
  const screenTop = (viewportSize.height - fitted.height * viewport.zoom) / 2
    + viewport.panY
    + (bounds.top / canvasSize.height) * fitted.height * viewport.zoom;
  const screenBottom = (viewportSize.height - fitted.height * viewport.zoom) / 2
    + viewport.panY
    + (bounds.bottom / canvasSize.height) * fitted.height * viewport.zoom;
  return {
    ratio: (screenBottom - screenTop) / viewportSize.height,
    centerY: (screenTop + screenBottom) / 2
  };
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
    { paddingPx: 50 }
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
    { paddingPx: 50 }
  );
  const padded = fitBoundsToViewport(
    { left: 200, top: 200, right: 400, bottom: 400 },
    { width: 1000, height: 1000 },
    { width: 500, height: 500 },
    { paddingPx: 100 }
  );

  assert(padded.zoom < loose.zoom, "larger padding should reduce fit zoom");
}

{
  const viewport = fitBoundsToViewport(
    { left: 250, top: 60, right: 430, bottom: 1140 },
    { width: 800, height: 1200 },
    { width: 620, height: 520 },
    { paddingPx: 56 }
  );
  const center = screenToTracePoint({ x: 310, y: 260 }, viewport, { width: 800, height: 1200 }, { width: 620, height: 520 });

  assertEqual(Math.round(center.x), 340, "fit should center tall narrow content x");
  assertEqual(Math.round(center.y), 600, "fit should center tall narrow content y");
  assert(viewport.zoom > 0.35, "tall narrow fit should keep usable zoom");
}

{
  const bounds = { left: 250, top: 60, right: 430, bottom: 1140 };
  const canvasSize = { width: 800, height: 1200 };
  const viewportSize = { width: 620, height: 520 };
  const compact = fitBoundsToViewport(bounds, canvasSize, viewportSize, { paddingPx: 0, targetFill: 0.6 });
  const full = fitBoundsToViewport(bounds, canvasSize, viewportSize, { paddingPx: 0, targetFill: 1 });
  const compactMetrics = occupiedHeightRatio(bounds, canvasSize, viewportSize, compact);
  const fullMetrics = occupiedHeightRatio(bounds, canvasSize, viewportSize, full);

  assert(compactMetrics.ratio >= 0.55 && compactMetrics.ratio <= 0.65, "explicit smaller targetFill should reduce occupied height");
  assert(fullMetrics.ratio >= 0.95, "explicit full targetFill should allow content to nearly fill the viewport height");
  assert(compact.zoom < full.zoom, "smaller explicit targetFill should reduce fit zoom");
}

{
  const bounds = { left: 250, top: 60, right: 430, bottom: 1140 };
  const canvasSize = { width: 800, height: 1200 };
  const viewportSize = { width: 620, height: 520 };
  const viewport = fitBoundsToViewport(bounds, canvasSize, viewportSize, { targetFill: 0.8 });
  const metrics = occupiedHeightRatio(bounds, canvasSize, viewportSize, viewport);

  assert(metrics.ratio >= 0.7 && metrics.ratio <= 0.85, "targetFill should keep tall content within the editor height band");
  assert(Math.abs(metrics.centerY - viewportSize.height / 2) < 1, "targetFill fit should center tall content vertically");
}

{
  const bounds = { left: 40, top: 220, right: 1160, bottom: 620 };
  const canvasSize = { width: 1200, height: 800 };
  const viewportSize = { width: 700, height: 520 };
  const viewport = fitBoundsToViewport(bounds, canvasSize, viewportSize, { paddingPx: 32, targetFill: 0.8 });
  const center = screenToTracePoint(
    { x: viewportSize.width / 2, y: viewportSize.height / 2 },
    viewport,
    canvasSize,
    viewportSize
  );
  const fitted = fittedTraceSize(canvasSize, viewportSize);
  const occupiedWidth = ((bounds.right - bounds.left) / canvasSize.width) * fitted.width * viewport.zoom;

  assertEqual(Math.round(center.x), 600, "wide content should remain horizontally centered");
  assertEqual(Math.round(center.y), 420, "wide content should remain vertically centered");
  assert(occupiedWidth <= viewportSize.width * 0.8 + 1, "wide content should fit without horizontal clipping");
}

{
  const fullCanvasFit = fitBoundsToViewport(
    { left: 0, top: 0, right: 1000, bottom: 1000 },
    { width: 1000, height: 1000 },
    { width: 500, height: 500 },
    { paddingPx: 56 }
  );
  const cutlineFit = fitBoundsToViewport(
    { left: 250, top: 250, right: 750, bottom: 750 },
    { width: 1000, height: 1000 },
    { width: 500, height: 500 },
    { paddingPx: 56 }
  );

  assert(cutlineFit.zoom > fullCanvasFit.zoom, "fit should use content bounds instead of full canvas bounds");
}

{
  const merged = mergeTraceBounds([
    { left: 240, top: 80, right: 560, bottom: 1120 },
    { left: 180, top: 210, right: 620, bottom: 980 },
    { left: 150, top: 140, right: 650, bottom: 1040 }
  ]);

  assertEqual(merged?.left, 150, "merged fit should include manual strokes left of the cutline");
  assertEqual(merged?.top, 80, "merged fit should include the cutline top");
  assertEqual(merged?.right, 650, "merged fit should include manual strokes right of starter lines");
  assertEqual(merged?.bottom, 1120, "merged fit should include the cutline bottom");
}

{
  assert(shouldAutoFitViewport({ pending: true, userModified: false }), "pending default viewport should auto-fit");
  assert(!shouldAutoFitViewport({ pending: true, userModified: true }), "user-modified viewport must not be overwritten");
  assert(!shouldAutoFitViewport({ pending: false, userModified: false }), "ordinary renders should not trigger fitting");
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
