export type TracePoint = {
  x: number;
  y: number;
};

export type TraceStroke = {
  id: string;
  points: TracePoint[];
  width: number;
  color: "#000000";
  tool: "draw";
};

export type StrokeEraseResult = {
  changed: boolean;
  removedStrokeIds: string[];
  strokes: TraceStroke[];
};

export type StrokeEditResult = {
  changed: boolean;
  strokes: TraceStroke[];
  selectedStrokeId?: string | null;
};

export function createTraceStroke(id: string, points: TracePoint[], width: number): TraceStroke {
  return {
    id,
    points: smoothTracePoints(compactTracePoints(points)),
    width,
    color: "#000000",
    tool: "draw"
  };
}

export function compactTracePoints(points: TracePoint[], minDistancePx = 1.5): TracePoint[] {
  const compacted: TracePoint[] = [];
  for (const point of points) {
    const previous = compacted[compacted.length - 1];
    if (!previous || distance(previous, point) >= minDistancePx) {
      compacted.push(point);
    }
  }
  return compacted;
}

export function smoothTracePoints(points: TracePoint[]): TracePoint[] {
  if (points.length <= 2) return points;
  return points.map((point, index) => {
    if (index === 0 || index === points.length - 1) return point;
    const previous = points[index - 1];
    const next = points[index + 1];
    return {
      x: (previous.x + point.x * 2 + next.x) / 4,
      y: (previous.y + point.y * 2 + next.y) / 4
    };
  });
}

export function moveTraceStroke(strokes: TraceStroke[], strokeId: string, delta: TracePoint): StrokeEditResult {
  if (delta.x === 0 && delta.y === 0) return { changed: false, strokes };
  return replaceTraceStroke(strokes, strokeId, (stroke) => ({
    ...stroke,
    points: stroke.points.map((point) => ({
      x: point.x + delta.x,
      y: point.y + delta.y
    }))
  }));
}

export function updateTraceStrokePoint(strokes: TraceStroke[], strokeId: string, pointIndex: number, point: TracePoint): StrokeEditResult {
  return replaceTraceStroke(strokes, strokeId, (stroke) => {
    if (pointIndex < 0 || pointIndex >= stroke.points.length) return stroke;
    const current = stroke.points[pointIndex];
    if (current.x === point.x && current.y === point.y) return stroke;
    return {
      ...stroke,
      points: stroke.points.map((existing, index) => index === pointIndex ? { ...point } : { ...existing })
    };
  });
}

export function changeTraceStrokeWidth(strokes: TraceStroke[], strokeId: string, width: number): StrokeEditResult {
  return replaceTraceStroke(strokes, strokeId, (stroke) => {
    if (stroke.width === width) return stroke;
    return { ...stroke, width };
  });
}

export function duplicateTraceStroke(strokes: TraceStroke[], strokeId: string, nextStrokeId: string, offset: TracePoint): StrokeEditResult {
  const source = strokes.find((stroke) => stroke.id === strokeId);
  if (!source) return { changed: false, strokes };
  const copy: TraceStroke = {
    ...source,
    id: nextStrokeId,
    points: source.points.map((point) => ({
      x: point.x + offset.x,
      y: point.y + offset.y
    }))
  };
  return {
    changed: true,
    strokes: [...strokes.map(cloneTraceStroke), copy],
    selectedStrokeId: nextStrokeId
  };
}

export function smoothTraceStrokeById(strokes: TraceStroke[], strokeId: string): StrokeEditResult {
  return replaceTraceStroke(strokes, strokeId, (stroke) => ({
    ...stroke,
    points: smoothTracePoints(stroke.points)
  }));
}

export function simplifyTraceStrokeById(strokes: TraceStroke[], strokeId: string, tolerancePx = 2): StrokeEditResult {
  return replaceTraceStroke(strokes, strokeId, (stroke) => ({
    ...stroke,
    points: simplifyTracePoints(stroke.points, tolerancePx)
  }));
}

export function simplifyTracePoints(points: TracePoint[], tolerancePx = 2): TracePoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  return ramerDouglasPeucker(points, tolerancePx);
}

export function eraseTraceStrokes(strokes: TraceStroke[], point: TracePoint, radiusPx: number): StrokeEraseResult {
  const removedStrokeIds: string[] = [];
  const kept = strokes.filter((stroke) => {
    const hit = strokeHitTest(stroke, point, radiusPx);
    if (hit) removedStrokeIds.push(stroke.id);
    return !hit;
  });

  return {
    changed: removedStrokeIds.length > 0,
    removedStrokeIds,
    strokes: kept
  };
}

export function selectTraceStroke(strokes: TraceStroke[], point: TracePoint, radiusPx: number): TraceStroke | null {
  for (let index = strokes.length - 1; index >= 0; index -= 1) {
    if (strokeHitTest(strokes[index], point, radiusPx)) {
      return strokes[index];
    }
  }
  return null;
}

export function selectTracePointIndex(stroke: TraceStroke, point: TracePoint, radiusPx: number): number | null {
  for (let index = stroke.points.length - 1; index >= 0; index -= 1) {
    if (distance(stroke.points[index], point) <= radiusPx) {
      return index;
    }
  }
  return null;
}

export function deleteTraceStroke(strokes: TraceStroke[], strokeId: string): StrokeEraseResult {
  const kept = strokes.filter((stroke) => stroke.id !== strokeId);
  return {
    changed: kept.length !== strokes.length,
    removedStrokeIds: kept.length !== strokes.length ? [strokeId] : [],
    strokes: kept
  };
}

export function strokeHitTest(stroke: TraceStroke, point: TracePoint, radiusPx: number) {
  const hitRadius = radiusPx + stroke.width / 2;
  if (stroke.points.length === 0) return false;
  if (stroke.points.length === 1) return distance(stroke.points[0], point) <= hitRadius;

  for (let index = 1; index < stroke.points.length; index += 1) {
    if (distanceToSegment(point, stroke.points[index - 1], stroke.points[index]) <= hitRadius) {
      return true;
    }
  }
  return false;
}

export function drawTraceStrokes(
  context: CanvasRenderingContext2D,
  strokes: TraceStroke[],
  draftStroke?: TraceStroke,
  selectedStrokeId?: string | null
) {
  context.save();
  context.clearRect(0, 0, context.canvas.width, context.canvas.height);
  for (const stroke of draftStroke ? [...strokes, draftStroke] : strokes) {
    drawTraceStroke(context, stroke, stroke.id === selectedStrokeId);
  }
  context.restore();
}

function drawTraceStroke(context: CanvasRenderingContext2D, stroke: TraceStroke, selected: boolean) {
  if (stroke.points.length === 0) return;
  context.save();
  context.globalCompositeOperation = "source-over";
  context.strokeStyle = selected ? "#1d7a70" : stroke.color;
  context.lineWidth = selected ? stroke.width + 4 : stroke.width;
  context.lineCap = "round";
  context.lineJoin = "round";
  context.beginPath();
  context.moveTo(stroke.points[0].x, stroke.points[0].y);
  if (stroke.points.length === 1) {
    context.lineTo(stroke.points[0].x + 0.01, stroke.points[0].y + 0.01);
  } else {
    for (let index = 1; index < stroke.points.length; index += 1) {
      context.lineTo(stroke.points[index].x, stroke.points[index].y);
    }
  }
  context.stroke();
  if (selected) drawTracePointHandles(context, stroke);
  context.restore();
}

function drawTracePointHandles(context: CanvasRenderingContext2D, stroke: TraceStroke) {
  context.save();
  context.fillStyle = "#ffffff";
  context.strokeStyle = "#1d7a70";
  context.lineWidth = Math.max(2, stroke.width * 0.16);
  const radius = Math.max(4, stroke.width * 0.42);
  for (const point of stroke.points) {
    context.beginPath();
    context.arc(point.x, point.y, radius, 0, Math.PI * 2);
    context.fill();
    context.stroke();
  }
  context.restore();
}

function replaceTraceStroke(strokes: TraceStroke[], strokeId: string, edit: (stroke: TraceStroke) => TraceStroke): StrokeEditResult {
  let changed = false;
  const next = strokes.map((stroke) => {
    if (stroke.id !== strokeId) return cloneTraceStroke(stroke);
    const edited = edit(cloneTraceStroke(stroke));
    changed = !sameStroke(stroke, edited);
    return edited;
  });
  return { changed, strokes: changed ? next : strokes };
}

function cloneTraceStroke(stroke: TraceStroke): TraceStroke {
  return {
    ...stroke,
    points: stroke.points.map((point) => ({ ...point }))
  };
}

function sameStroke(a: TraceStroke, b: TraceStroke) {
  if (a.id !== b.id || a.width !== b.width || a.color !== b.color || a.tool !== b.tool) return false;
  if (a.points.length !== b.points.length) return false;
  return a.points.every((point, index) => point.x === b.points[index].x && point.y === b.points[index].y);
}

function ramerDouglasPeucker(points: TracePoint[], tolerancePx: number): TracePoint[] {
  if (points.length <= 2) return points.map((point) => ({ ...point }));
  let farthestDistance = 0;
  let farthestIndex = 0;
  const start = points[0];
  const end = points[points.length - 1];
  for (let index = 1; index < points.length - 1; index += 1) {
    const currentDistance = distanceToSegment(points[index], start, end);
    if (currentDistance > farthestDistance) {
      farthestDistance = currentDistance;
      farthestIndex = index;
    }
  }
  if (farthestDistance <= tolerancePx) {
    return [{ ...start }, { ...end }];
  }
  const before = ramerDouglasPeucker(points.slice(0, farthestIndex + 1), tolerancePx);
  const after = ramerDouglasPeucker(points.slice(farthestIndex), tolerancePx);
  return [...before.slice(0, -1), ...after];
}

function distanceToSegment(point: TracePoint, start: TracePoint, end: TracePoint) {
  const dx = end.x - start.x;
  const dy = end.y - start.y;
  if (dx === 0 && dy === 0) return distance(point, start);
  const t = Math.max(0, Math.min(1, ((point.x - start.x) * dx + (point.y - start.y) * dy) / (dx * dx + dy * dy)));
  return distance(point, {
    x: start.x + t * dx,
    y: start.y + t * dy
  });
}

function distance(a: TracePoint, b: TracePoint) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
