import type { TracePoint, TraceStroke } from "./traceStrokes";

export type TraceViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

export type TraceBounds = {
  left: number;
  top: number;
  right: number;
  bottom: number;
};

export type TraceFitOptions = {
  paddingPx?: number;
  targetFill?: number;
};

export function shouldAutoFitViewport(state: { pending: boolean; userModified: boolean }) {
  return state.pending && !state.userModified;
}

export const DEFAULT_TRACE_VIEWPORT: TraceViewport = {
  zoom: 1,
  panX: 0,
  panY: 0
};

export function screenToTracePoint(
  screenPoint: TracePoint,
  viewport: TraceViewport,
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number }
): TracePoint {
  const fitted = fittedTraceSize(canvasSize, viewportSize);
  const left = (viewportSize.width - fitted.width * viewport.zoom) / 2 + viewport.panX;
  const top = (viewportSize.height - fitted.height * viewport.zoom) / 2 + viewport.panY;
  return {
    x: ((screenPoint.x - left) / (fitted.width * viewport.zoom)) * canvasSize.width,
    y: ((screenPoint.y - top) / (fitted.height * viewport.zoom)) * canvasSize.height
  };
}

export function zoomViewport(
  viewport: TraceViewport,
  nextZoom: number,
  focus: TracePoint,
  viewportSize: { width: number; height: number }
): TraceViewport {
  const boundedZoom = clamp(nextZoom, 0.35, 4);
  const ratio = boundedZoom / viewport.zoom;
  return {
    zoom: boundedZoom,
    panX: focus.x - (focus.x - viewportSize.width / 2 - viewport.panX) * ratio - viewportSize.width / 2,
    panY: focus.y - (focus.y - viewportSize.height / 2 - viewport.panY) * ratio - viewportSize.height / 2
  };
}

export function panViewport(viewport: TraceViewport, delta: TracePoint): TraceViewport {
  return {
    ...viewport,
    panX: viewport.panX + delta.x,
    panY: viewport.panY + delta.y
  };
}

export function resetViewport(): TraceViewport {
  return DEFAULT_TRACE_VIEWPORT;
}

export function fitBoundsToViewport(
  bounds: TraceBounds,
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  options: TraceFitOptions = {}
): TraceViewport {
  const paddingPx = Math.max(0, options.paddingPx ?? 48);
  const targetFill = clamp(options.targetFill ?? 0.8, 0.01, 1);
  const normalized = normalizeBounds(bounds, canvasSize);
  const fitted = fittedTraceSize(canvasSize, viewportSize);
  const displayWidth = Math.max(1, ((normalized.right - normalized.left) / canvasSize.width) * fitted.width);
  const displayHeight = Math.max(1, ((normalized.bottom - normalized.top) / canvasSize.height) * fitted.height);
  const availableWidth = Math.max(1, Math.min(viewportSize.width - paddingPx * 2, viewportSize.width * targetFill));
  const availableHeight = Math.max(1, Math.min(viewportSize.height - paddingPx * 2, viewportSize.height * targetFill));
  const zoom = clamp(Math.min(availableWidth / displayWidth, availableHeight / displayHeight), 0.35, 4);
  return centerBoundsInViewport(normalized, canvasSize, viewportSize, zoom);
}

export function centerBoundsInViewport(
  bounds: TraceBounds,
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number },
  zoom: number
): TraceViewport {
  const normalized = normalizeBounds(bounds, canvasSize);
  const fitted = fittedTraceSize(canvasSize, viewportSize);
  const centerX = (normalized.left + normalized.right) / 2;
  const centerY = (normalized.top + normalized.bottom) / 2;
  const boundedZoom = clamp(zoom, 0.35, 4);
  return {
    zoom: boundedZoom,
    panX: (0.5 - centerX / canvasSize.width) * fitted.width * boundedZoom,
    panY: (0.5 - centerY / canvasSize.height) * fitted.height * boundedZoom
  };
}

export function mergeTraceBounds(bounds: Array<TraceBounds | null | undefined>): TraceBounds | null {
  const validBounds = bounds.filter((item): item is TraceBounds => Boolean(item));
  if (validBounds.length === 0) return null;
  return validBounds.reduce((merged, item) => ({
    left: Math.min(merged.left, item.left),
    top: Math.min(merged.top, item.top),
    right: Math.max(merged.right, item.right),
    bottom: Math.max(merged.bottom, item.bottom)
  }));
}

export function boundsFromTraceStrokes(strokes: TraceStroke[]): TraceBounds | null {
  const points = strokes.flatMap((stroke) => stroke.points);
  if (points.length === 0) return null;
  return points.reduce<TraceBounds>((bounds, point) => ({
    left: Math.min(bounds.left, point.x),
    top: Math.min(bounds.top, point.y),
    right: Math.max(bounds.right, point.x),
    bottom: Math.max(bounds.bottom, point.y)
  }), {
    left: points[0].x,
    top: points[0].y,
    right: points[0].x,
    bottom: points[0].y
  });
}

export function fullCanvasBounds(canvasSize: { width: number; height: number }): TraceBounds {
  return {
    left: 0,
    top: 0,
    right: canvasSize.width,
    bottom: canvasSize.height
  };
}

export function fittedTraceSize(
  canvasSize: { width: number; height: number },
  viewportSize: { width: number; height: number }
) {
  const scale = Math.min(viewportSize.width / canvasSize.width, viewportSize.height / canvasSize.height);
  return {
    width: canvasSize.width * scale,
    height: canvasSize.height * scale
  };
}

function normalizeBounds(bounds: TraceBounds, canvasSize: { width: number; height: number }): TraceBounds {
  const left = clamp(Math.min(bounds.left, bounds.right), 0, canvasSize.width);
  const right = clamp(Math.max(bounds.left, bounds.right), 0, canvasSize.width);
  const top = clamp(Math.min(bounds.top, bounds.bottom), 0, canvasSize.height);
  const bottom = clamp(Math.max(bounds.top, bounds.bottom), 0, canvasSize.height);
  return {
    left,
    top,
    right: right > left ? right : Math.min(canvasSize.width, left + 1),
    bottom: bottom > top ? bottom : Math.min(canvasSize.height, top + 1)
  };
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
