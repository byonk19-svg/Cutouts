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
  context.restore();
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
