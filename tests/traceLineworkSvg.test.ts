import { createCutoutProjectSnapshot, restoreCutoutProject, serializeCutoutProject } from "../src/cutoutProject.ts";
import { buildTraceLineworkSvg, svgLineworkFileName } from "../src/traceLineworkSvg.ts";
import { changeTraceStrokeWidth, createTraceStroke, moveTraceStroke } from "../src/traceStrokes.ts";
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
  paletteSize: 6,
  includeInstructionCoverPage: true
};

const analysis = {
  finishedWidthIn: 14,
  finishedHeightIn: 36,
  tileCols: 2,
  tileRows: 4,
  tileCount: 8,
  previewPngDataUrl: "data:image/png;base64,preview",
  outerLinePngDataUrl: "data:image/png;base64,outer-cutline",
  detailLinePngDataUrl: "data:image/png;base64,suggestion-lines",
  paintGuidePngDataUrl: "data:image/png;base64,original-underlay",
  previewWidthPx: 280,
  previewHeightPx: 720,
  palette: []
};

{
  const strokes = [
    createTraceStroke("mouth", [{ x: 10, y: 20 }, { x: 30, y: 45 }, { x: 60, y: 45 }], 12),
    createTraceStroke("coat", [{ x: 80, y: 120 }, { x: 110, y: 160 }], 20)
  ];

  const svg = buildTraceLineworkSvg({
    projectName: "Coraline",
    analysis,
    manualStrokes: strokes,
    includeCutline: true,
    includeSuggestions: false,
    includeWhiteBackground: true,
    includeCalibration: true
  });

  assert(svg.startsWith("<svg"), "SVG export should produce an SVG document");
  assert(svg.includes('width="14in"'), "SVG export should set finished physical width");
  assert(svg.includes('height="36in"'), "SVG export should set finished physical height");
  assert(svg.includes("data:image/png;base64,outer-cutline"), "SVG export should include the locked cutline layer");
  assert(svg.includes('id="manual-strokes"'), "SVG export should include a manual stroke layer");
  assert(svg.includes('stroke-width="12"'), "SVG export should preserve thin manual stroke widths");
  assert(svg.includes('stroke-width="20"'), "SVG export should preserve normal manual stroke widths");
  assert(svg.includes('stroke-linecap="round"'), "SVG export should keep round line caps");
  assert(svg.includes('stroke-linejoin="round"'), "SVG export should keep round line joins");
  assert(svg.includes('id="calibration-square"'), "SVG export should include a print calibration square");
  assert(svg.includes("Print at 100% / actual size"), "SVG export should include print scale guidance");
  assert(!svg.includes("original-underlay"), "SVG export should not include the original underlay image");
  assert(!svg.includes("#1d7a70"), "SVG export should not include selection highlight styling");
  assert(!svg.includes("selectedStrokeId"), "SVG export should not include transient selection state");
  assert(!svg.includes("dimUnselected"), "SVG export should not include editor dimming state");
  assert(!svg.includes("Selection Inspector"), "SVG export should not include selection inspector UI");
  assert(!svg.includes("Duplicated stroke"), "SVG export should not include selection feedback text");
}

{
  const strokes = [createTraceStroke("eye", [{ x: 5, y: 8 }, { x: 20, y: 8 }], 10)];
  const moved = moveTraceStroke(strokes, "eye", { x: 7, y: 3 });
  const widened = changeTraceStrokeWidth(moved.strokes, "eye", 34);
  const project = createCutoutProjectSnapshot({
    projectName: "Round Trip",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:05:00.000Z",
    sourceImage: { name: "source.png", type: "image/png", dataUrl: "data:image/png;base64,source" },
    settings,
    traceMode: "manual",
    analysis,
    manualStrokes: widened.strokes,
    referenceOpacity: 35,
    layerVisibility: {
      showReference: true,
      showCutline: true,
      showManualLines: true,
      showSuggestions: false,
      printPreview: false
    },
    traceViewport: DEFAULT_TRACE_VIEWPORT
  });
  const restored = restoreCutoutProject(serializeCutoutProject(project));

  const before = buildTraceLineworkSvg({
    projectName: project.projectName,
    analysis: project.analysis,
    manualStrokes: project.manualStrokes,
    includeCutline: true,
    includeSuggestions: false
  });
  const after = buildTraceLineworkSvg({
    projectName: restored.projectName,
    analysis: restored.analysis,
    manualStrokes: restored.manualStrokes,
    includeCutline: true,
    includeSuggestions: false
  });

  assertEqual(after, before, "save/load project then SVG export should preserve stroke data");
  assert(after.includes("M 12 11"), "edited stroke should appear in SVG export with moved geometry");
  assert(after.includes('stroke-width="34"'), "edited stroke width should persist through save/load into SVG export");
}

{
  const svg = buildTraceLineworkSvg({
    projectName: "Suggestions",
    analysis,
    manualStrokes: [],
    includeCutline: true,
    includeSuggestions: true
  });

  assert(svg.includes("data:image/png;base64,suggestion-lines"), "SVG export should include suggestions when explicitly enabled");
}

{
  assertEqual(svgLineworkFileName("Coraline test"), "coraline-test-linework.svg", "SVG filename should use linework suffix");
  assertEqual(svgLineworkFileName(""), "cutout-linework.svg", "empty project names should use a safe SVG filename");
}
