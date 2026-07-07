import type { TracePoint } from "./traceStrokes";

export type TraceViewport = {
  zoom: number;
  panX: number;
  panY: number;
};

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

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}
