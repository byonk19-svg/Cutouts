import {
  changeTraceStrokeWidth,
  compactTracePoints,
  createTraceStroke,
  deleteTraceStroke,
  duplicateTraceStroke,
  eraseTraceStrokes,
  moveTraceStroke,
  selectTracePointIndex,
  selectTraceStroke,
  simplifyTraceStrokeById,
  smoothTraceStrokeById,
  smoothTracePoints,
  strokeHitTest,
  updateTraceStrokePoint,
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

{
  const strokes = [createTraceStroke("mouth", [{ x: 10, y: 10 }, { x: 30, y: 20 }], 8)];
  const moved = moveTraceStroke(strokes, "mouth", { x: 5, y: -3 });

  assert(moved.changed, "moving a selected stroke should report a changed edit");
  assertEqual(moved.strokes[0].points[0].x, 15, "moving a stroke should update point x coordinates");
  assertEqual(moved.strokes[0].points[1].y, 17, "moving a stroke should update point y coordinates");
  assertEqual(strokes[0].points[0].x, 10, "moving a stroke should not mutate the original stroke array");
}

{
  const strokes = [createTraceStroke("eye", [{ x: 10, y: 10 }, { x: 30, y: 10 }], 8)];
  const wider = changeTraceStrokeWidth(strokes, "eye", 34);

  assert(wider.changed, "changing selected stroke width should report a changed edit");
  assertEqual(wider.strokes[0].width, 34, "changing selected stroke width should persist export width");
}

{
  const strokes = [createTraceStroke("eye", [{ x: 10, y: 10 }, { x: 30, y: 10 }], 8)];
  const duplicated = duplicateTraceStroke(strokes, "eye", "eye-copy", { x: 12, y: 6 });

  assert(duplicated.changed, "duplicate should report a changed edit");
  assertEqual(duplicated.strokes.length, 2, "duplicate should append an independent stroke");
  assertEqual(duplicated.selectedStrokeId, "eye-copy", "duplicate should select the copied stroke");
  assertEqual(duplicated.strokes[1].points[0].x, 22, "duplicate should offset copied point x coordinates");
  assertEqual(duplicated.strokes[0].points[0].x, 10, "duplicate should not mutate the source stroke");
}

{
  const stroke = createTraceStroke("curve", [{ x: 0, y: 0 }, { x: 10, y: 10 }, { x: 20, y: 0 }], 8);
  const selectedPoint = selectTracePointIndex(stroke, stroke.points[1], 3);
  assertEqual(selectedPoint, 1, "point hit testing should find an editable stroke point");

  const edited = updateTraceStrokePoint([stroke], "curve", 1, { x: 12, y: 4 });
  assert(edited.changed, "point edit should report a changed edit");
  assertEqual(edited.strokes[0].points[1].x, 12, "point edit should update selected point x coordinate");
  assertEqual(edited.strokes[0].points[1].y, 4, "point edit should update selected point y coordinate");
}

{
  const jittery = {
    id: "line",
    color: "#000000",
    tool: "draw",
    width: 10,
    points: [
      { x: 0, y: 0 },
      { x: 3, y: 1 },
      { x: 6, y: -1 },
      { x: 9, y: 1 },
      { x: 12, y: 0 }
    ]
  } satisfies TraceStroke;

  const smoothed = smoothTraceStrokeById([jittery], "line");
  assert(smoothed.changed, "smooth selected stroke should report a changed edit");
  assertEqual(smoothed.strokes[0].id, "line", "smooth should preserve the selected stroke id");
  assertEqual(smoothed.strokes[0].points.length, 5, "smooth should not delete the selected stroke points");

  const simplified = simplifyTraceStrokeById([jittery], "line", 2);
  assert(simplified.changed, "simplify selected stroke should report a changed edit");
  assertEqual(simplified.strokes[0].id, "line", "simplify should preserve the selected stroke id");
  assert(simplified.strokes[0].points.length < jittery.points.length, "simplify should remove excess jitter points");
}
