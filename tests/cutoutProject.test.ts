import {
  CUTOUT_PROJECT_SCHEMA_VERSION,
  createCutoutProjectSnapshot,
  projectFileName,
  restoreCutoutProject,
  serializeCutoutProject
} from "../src/cutoutProject.ts";
import { createTraceStroke } from "../src/traceStrokes.ts";
import { DEFAULT_TRACE_VIEWPORT } from "../src/traceViewport.ts";
import type { Settings } from "../src/traceWorkflow.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const settings: Settings = {
  finishedHeightIn: 36,
  threshold: 42,
  smoothing: 4,
  speckArea: 60,
  holeArea: 220,
  detailLines: false,
  detailCleanup: 100,
  templateStyle: "manual",
  paletteSize: 6
};

const analysis = {
  finishedWidthIn: 14.25,
  finishedHeightIn: 36,
  tileCols: 2,
  tileRows: 4,
  tileCount: 8,
  previewPngDataUrl: "data:image/png;base64,preview",
  outerLinePngDataUrl: "data:image/png;base64,outer",
  detailLinePngDataUrl: "data:image/png;base64,detail",
  paintGuidePngDataUrl: "data:image/png;base64,paint",
  previewWidthPx: 400,
  previewHeightPx: 1000,
  palette: [
    {
      hex: "#f1ce2d",
      coverage: 0.22,
      matches: [{ brand: "Apple Barrel", name: "Bright Yellow", hex: "#f1ce2d", distance: 2, source: "catalog" }]
    }
  ]
};

{
  const strokes = [
    createTraceStroke("face-line", [{ x: 10, y: 12 }, { x: 40, y: 20 }], 12),
    createTraceStroke("coat-line", [{ x: 30, y: 90 }, { x: 60, y: 140 }], 20)
  ];

  const project = createCutoutProjectSnapshot({
    projectName: "Coraline test",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:05:00.000Z",
    sourceImage: {
      name: "coraline.png",
      type: "image/png",
      dataUrl: "data:image/png;base64,source"
    },
    settings,
    traceMode: "manual",
    analysis,
    manualStrokes: strokes,
    referenceOpacity: 42,
    layerVisibility: {
      showReference: true,
      showCutline: true,
      showManualLines: true,
      showSuggestions: false,
      printPreview: false
    },
    traceViewport: { zoom: 1.35, panX: 12, panY: -8 }
  });

  assertEqual(project.schemaVersion, CUTOUT_PROJECT_SCHEMA_VERSION, "project should be versioned");
  assertEqual(project.manualStrokes.length, 2, "project serialization should include manual strokes");
  assertEqual(project.manualStrokes[1].width, 20, "project serialization should include stroke widths");
  assertEqual(project.analysis.outerLinePngDataUrl, analysis.outerLinePngDataUrl, "project should keep the cutline image");
  assertEqual(project.analysis.detailLinePngDataUrl, analysis.detailLinePngDataUrl, "project should keep the suggestion layer image");

  const serialized = serializeCutoutProject(project);
  assert(!serialized.includes("selectedStrokeId"), "project autosave should not include transient selected stroke state");
  assert(!serialized.includes("dimUnselectedStrokes"), "project autosave should not include transient dimming state");
  assert(!serialized.includes("selectionFeedback"), "project autosave should not include transient selection feedback");

  const restored = restoreCutoutProject(serialized);
  assertEqual(restored.manualStrokes[0].points[0].x, 10, "round trip should preserve stroke x coordinate");
  assertEqual(restored.manualStrokes[0].points[1].y, 20, "round trip should preserve stroke y coordinate");
  assertEqual(restored.manualStrokes[1].width, 20, "round trip should preserve stroke width");
  assertEqual(restored.referenceOpacity, 42, "round trip should preserve underlay opacity");
  assertEqual(restored.layerVisibility.showReference, true, "round trip should preserve underlay visibility");
  assertEqual(restored.traceViewport.panY, -8, "round trip should preserve viewport");
}

{
  const restored = restoreCutoutProject({
    schemaVersion: CUTOUT_PROJECT_SCHEMA_VERSION,
    projectName: "Minimal",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    sourceImage: { name: "source.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,source" },
    settings,
    traceMode: "manual",
    analysis,
    manualStrokes: [],
    referenceOpacity: 35,
    layerVisibility: {
      showReference: false,
      showCutline: true,
      showManualLines: true,
      showSuggestions: false,
      printPreview: true
    },
    traceViewport: DEFAULT_TRACE_VIEWPORT
  });

  assertEqual(restored.layerVisibility.printPreview, false, "project import should leave printable preview off for editing");
}

{
  let failed = false;
  try {
    restoreCutoutProject({ schemaVersion: 999 });
  } catch {
    failed = true;
  }
  assert(failed, "import should reject unknown project schema versions");
}

{
  assertEqual(projectFileName("Coraline test"), "coraline-test.cutout.json", "project filename should use cutout extension");
  assertEqual(projectFileName(""), "cutout-project.cutout.json", "empty project names should use a safe fallback");
}
