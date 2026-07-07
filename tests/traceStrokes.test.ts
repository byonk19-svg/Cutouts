import {
  compactTracePoints,
  createTraceStroke,
  deleteTraceStroke,
  eraseTraceStrokes,
  selectTraceStroke,
  smoothTracePoints,
  strokeHitTest,
  type TraceStroke
} from "../src/traceStrokes.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

{
  const stroke = createTraceStroke("face-line", [{ x: 10, y: 12 }, { x: 20, y: 18 }], 14);

  assertEqual(stroke.id, "face-line", "trace stroke should preserve its stable id");
  assertEqual(stroke.width, 14, "trace stroke should preserve its export width");
  assertEqual(stroke.color, "#000000", "trace stroke should export black linework");
  assertEqual(stroke.tool, "draw", "trace stroke should be stored as a draw action");
}

{
  const compacted = compactTracePoints([
    { x: 0, y: 0 },
    { x: 0.2, y: 0.2 },
    { x: 6, y: 0 }
  ], 2);

  assertEqual(compacted.length, 2, "trace strokes should compact duplicate nearby pointer samples");
}

{
  const strokes: TraceStroke[] = [
    createTraceStroke("mouth", [{ x: 5, y: 20 }, { x: 50, y: 20 }], 8),
    createTraceStroke("boot", [{ x: 5, y: 80 }, { x: 50, y: 80 }], 8)
  ];

  const result = eraseTraceStrokes(strokes, { x: 25, y: 22 }, 6);

  assert(result.changed, "eraser should remove a manual vector stroke near the pointer");
  assertEqual(result.removedStrokeIds.join(","), "mouth", "eraser should report the removed manual stroke id");
  assertEqual(result.strokes.length, 1, "eraser should keep unrelated manual strokes");
  assertEqual(result.strokes[0].id, "boot", "eraser should not remove distant manual strokes");
}

{
  const stroke = createTraceStroke("hairline", [{ x: 10, y: 10 }, { x: 60, y: 10 }], 10);

  assert(strokeHitTest(stroke, { x: 35, y: 14 }, 2), "hit test should account for stroke width");
  assert(!strokeHitTest(stroke, { x: 35, y: 30 }, 2), "hit test should ignore distant points");
}

{
  const smoothed = smoothTracePoints([
    { x: 0, y: 0 },
    { x: 10, y: 20 },
    { x: 20, y: 0 }
  ]);

  assertEqual(smoothed[0].y, 0, "smoothing should preserve the first point");
  assertEqual(smoothed[2].y, 0, "smoothing should preserve the last point");
  assert(smoothed[1].y < 20, "smoothing should reduce middle-point jitter");
}

{
  const strokes: TraceStroke[] = [
    createTraceStroke("first", [{ x: 0, y: 0 }, { x: 50, y: 0 }], 8),
    createTraceStroke("topmost", [{ x: 0, y: 0 }, { x: 50, y: 0 }], 8)
  ];

  const selected = selectTraceStroke(strokes, { x: 25, y: 2 }, 4);
  assertEqual(selected?.id, "topmost", "selection should prefer the topmost matching manual stroke");

  const deleted = deleteTraceStroke(strokes, "topmost");
  assert(deleted.changed, "delete should remove a selected manual stroke");
  assertEqual(deleted.strokes.length, 1, "delete should leave unselected manual strokes");
  assertEqual(deleted.strokes[0].id, "first", "delete should not affect other manual strokes");
}
