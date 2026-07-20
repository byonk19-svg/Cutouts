import {
  CUTOUT_PROJECT_SCHEMA_VERSION,
  cleanedProjectNameFromFileName,
  createCutoutProjectSnapshot,
  projectFileName,
  resizeAnalysisForFinishedHeight,
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
  detailExtractionMode: "lineArt",
  paletteSize: 6,
  includeInstructionCoverPage: true,
  includePaintGuidePage: true
};

const analysis = {
  finishedWidthIn: 14.25,
  finishedHeightIn: 36,
  tileCols: 2,
  tileRows: 4,
  tileCount: 8,
  previewPngDataUrl: "data:image/png;base64,preview",
  outerLinePngDataUrl: "data:image/png;base64,outer",
  outerCutPath: "M 1 1 L 119 1 L 119 159 L 1 159 Z",
  detailLinePngDataUrl: "data:image/png;base64,detail",
  paintGuidePngDataUrl: "data:image/png;base64,paint",
  previewWidthPx: 400,
  previewHeightPx: 1000,
  palette: [
    {
      hex: "#f1ce2d",
      coverage: 0.22,
      matches: [
        {
          id: "apple-barrel-bright-yellow",
          brand: "Apple Barrel",
          line: "Matte Acrylic",
          colorName: "Bright Yellow",
          hex: "#f1ce2d",
          finish: "matte",
          outdoorRecommended: false,
          retailer: "",
          productUrl: "",
          notes: "",
          distance: 2,
          confidence: "close match"
        }
      ]
    }
  ]
};

{
  const resized = resizeAnalysisForFinishedHeight(analysis, 48);

  assertEqual(resized.finishedHeightIn, 48, "finished height edits should update analysis geometry");
  assertEqual(resized.finishedWidthIn, 19, "finished width should retain the analyzed aspect ratio");
  assertEqual(resized.outerCutPath, analysis.outerCutPath, "finished size edits should preserve vector linework");
  assertEqual(resized.detailLinePngDataUrl, analysis.detailLinePngDataUrl, "finished size edits should preserve detail linework");
}

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
    editedDetailPngDataUrl: "data:image/png;base64,accepted-detail-preserved-for-reuse",
    manualStrokes: strokes,
    paintGuideEdits: [
      { hex: "#f1ce2d", label: "Coat", note: "main raincoat body", included: true, selectedMatchId: "apple-barrel-bright-yellow", manualOverride: "" },
      { hex: "#0c143a", label: "Hair", note: "blue-black hair", included: false, selectedMatchId: null, manualOverride: "custom navy mix" },
      { hex: "#6a5424", label: "Boots", note: "choose in store", included: true, selectedMatchId: null, manualOverride: "" }
    ],
    referenceOpacity: 42,
    layerVisibility: {
      showReference: true,
      showCutline: true,
      showManualLines: true,
      showSuggestions: false,
      printPreview: false
    },
    traceViewport: { zoom: 1.35, panX: 12, panY: -8 },
    cleanupChecks: {
      cutline: true,
      remove: false,
      draw: true,
      export: false
    },
    workflowProgress: {
      activeStep: "export",
      lineworkReviewed: true,
      colorsOutcome: "reviewed"
    }
  });

  assertEqual(project.schemaVersion, CUTOUT_PROJECT_SCHEMA_VERSION, "project should be versioned");
  assertEqual(project.manualStrokes.length, 2, "project serialization should include manual strokes");
  assertEqual(project.manualStrokes[1].width, 20, "project serialization should include stroke widths");
  assertEqual(project.projectPalette.length, 3, "project serialization should seed project paint palette from edits");
  assertEqual(project.projectPalette[1].label, "Hair", "project paint palette should preserve manually tracked paint colors");
  assertEqual(project.paintGuideEdits.length, 3, "project serialization should include paint guide edits");
  assertEqual(project.analysis.outerLinePngDataUrl, analysis.outerLinePngDataUrl, "project should keep the cutline image");
  assertEqual(project.analysis.detailLinePngDataUrl, analysis.detailLinePngDataUrl, "project should keep the suggestion layer image");
  assertEqual(project.editedDetailPngDataUrl, "data:image/png;base64,accepted-detail-preserved-for-reuse", "manual projects should preserve accepted Detail Lines for later reuse");

  project.projectName = "Coraline yard cutout";
  project.settings.finishedHeightIn = 48;
  project.analysis = resizeAnalysisForFinishedHeight(project.analysis, 48);
  project.projectPalette[0].label = "Raincoat yellow";

  const serialized = serializeCutoutProject(project);
  assert(!serialized.includes("selectedStrokeId"), "project autosave should not include transient selected stroke state");
  assert(!serialized.includes("dimUnselectedStrokes"), "project autosave should not include transient dimming state");
  assert(!serialized.includes("selectionFeedback"), "project autosave should not include transient selection feedback");

  const restored = restoreCutoutProject(serialized);
  assertEqual(restored.projectName, "Coraline yard cutout", "project name edits should preserve the saved workflow");
  assertEqual(restored.settings.finishedHeightIn, 48, "finished size edits should preserve the saved workflow");
  assertEqual(restored.analysis.outerCutPath, analysis.outerCutPath, "finished size edits should preserve reviewed linework");
  assertEqual(restored.projectPalette[0].label, "Raincoat yellow", "color edits should round trip without revoking workflow progress");
  assertEqual(restored.manualStrokes[0].points[0].x, 10, "round trip should preserve stroke x coordinate");
  assertEqual(restored.manualStrokes[0].points[1].y, 20, "round trip should preserve stroke y coordinate");
  assertEqual(restored.manualStrokes[1].width, 20, "round trip should preserve stroke width");
  assertEqual(restored.editedDetailPngDataUrl, "data:image/png;base64,accepted-detail-preserved-for-reuse", "manual project round trip should preserve accepted Detail Lines");
  assertEqual(restored.paintGuideEdits[0].label, "Coat", "round trip should preserve paint labels");
  assertEqual(restored.projectPalette[1].label, "Hair", "round trip should preserve project palette labels");
  assertEqual(restored.projectPalette[1].locked, true, "round trip should preserve seeded manual palette locks");
  assertEqual(restored.paintGuideEdits[0].note, "main raincoat body", "round trip should preserve paint notes");
  assertEqual(restored.paintGuideEdits[0].selectedMatchId, "apple-barrel-bright-yellow", "round trip should preserve selected paint match");
  assertEqual(restored.paintGuideEdits[1].included, false, "round trip should preserve hidden shopping-list state");
  assertEqual(restored.paintGuideEdits[1].manualOverride, "custom navy mix", "round trip should preserve manual override");
  assertEqual(restored.paintGuideEdits[2].selectedMatchId, null, "round trip should preserve no-match state");
  assertEqual(restored.paintGuideEdits[2].manualOverride, "", "round trip should preserve no-match without override");
  assertEqual(restored.referenceOpacity, 42, "round trip should preserve underlay opacity");
  assertEqual(restored.layerVisibility.showReference, true, "round trip should preserve underlay visibility");
  assertEqual(restored.traceViewport.panY, -8, "round trip should preserve viewport");
  assertEqual(restored.cleanupChecks.cutline, true, "round trip should preserve cleanup cutline progress");
  assertEqual(restored.cleanupChecks.remove, false, "round trip should preserve cleanup remove progress");
  assertEqual(restored.cleanupChecks.draw, true, "round trip should preserve cleanup draw progress");
  assertEqual(restored.cleanupChecks.export, false, "round trip should preserve cleanup export progress");
  assertEqual(restored.workflowProgress.activeStep, "export", "round trip should preserve active workflow step");
  assertEqual(restored.workflowProgress.lineworkReviewed, true, "round trip should preserve linework review milestone");
  assertEqual(restored.workflowProgress.colorsOutcome, "reviewed", "color edits should preserve the completed Colors milestone");
  assertEqual(restored.settings.includeInstructionCoverPage, true, "round trip should preserve instruction cover setting");
  assertEqual(restored.settings.includePaintGuidePage, true, "round trip should preserve paint guide setting");
  assertEqual(restored.settings.detailExtractionMode, "lineArt", "round trip should preserve the detail extraction override");
}

{
  const editedDetailPngDataUrl = "data:image/png;base64,edited-detail";
  const project = createCutoutProjectSnapshot({
    projectName: "Starter cleanup",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:05:00.000Z",
    sourceImage: {
      name: "starter.png",
      type: "image/png",
      dataUrl: "data:image/png;base64,source"
    },
    settings: { ...settings, detailLines: true, detailCleanup: 88, templateStyle: "paint" },
    traceMode: "paint",
    analysis,
    editedDetailPngDataUrl,
    manualStrokes: [],
    paintGuideEdits: [],
    referenceOpacity: 42,
    layerVisibility: {
      showReference: true,
      showCutline: true,
      showManualLines: true,
      showSuggestions: false,
      printPreview: false
    },
    traceViewport: { zoom: 1.1, panX: 3, panY: 4 }
  });

  const restored = restoreCutoutProject(serializeCutoutProject(project));

  assertEqual(project.editedDetailPngDataUrl, editedDetailPngDataUrl, "starter project should store edited detail layer");
  assertEqual(restored.editedDetailPngDataUrl, editedDetailPngDataUrl, "round trip should preserve edited starter detail layer");
}

{
  const legacySettings = { ...settings };
  delete (legacySettings as Partial<Settings>).includeInstructionCoverPage;
  delete (legacySettings as Partial<Settings>).includePaintGuidePage;
  delete (legacySettings as Partial<Settings>).detailExtractionMode;
  const restored = restoreCutoutProject({
    schemaVersion: CUTOUT_PROJECT_SCHEMA_VERSION,
    projectName: "Minimal",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    sourceImage: { name: "source.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,source" },
    settings: legacySettings,
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
  assertEqual(restored.settings.includeInstructionCoverPage, true, "legacy project import should default instruction cover on");
  assertEqual(restored.settings.includePaintGuidePage, true, "legacy project import should default paint guide on");
  assertEqual(restored.settings.detailExtractionMode, "auto", "legacy project import should default detail extraction to auto");
  assertEqual(restored.paintGuideEdits.length, 0, "legacy project import should default paint guide edits to empty");
  assertEqual(restored.projectPalette.length, 1, "legacy project import should seed project palette from detected colors");
  assertEqual(restored.editedDetailPngDataUrl, null, "legacy project import should default edited starter detail layer to null");
  assertEqual(restored.cleanupChecks.cutline, false, "legacy project import should default cleanup cutline progress off");
  assertEqual(restored.cleanupChecks.remove, false, "legacy project import should default cleanup remove progress off");
  assertEqual(restored.cleanupChecks.draw, false, "legacy project import should default cleanup draw progress off");
  assertEqual(restored.cleanupChecks.export, false, "legacy project import should default cleanup export progress off");
  assertEqual(restored.workflowProgress.activeStep, "clean", "legacy analyzed projects should derive Clean Lines as the active step");
  assertEqual(restored.workflowProgress.lineworkReviewed, false, "legacy projects should derive incomplete linework review");
  assertEqual(restored.workflowProgress.colorsOutcome, "incomplete", "legacy projects should derive an incomplete Colors outcome");
}

{
  const project = createCutoutProjectSnapshot({
    projectName: "Invalid saved progress",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:05:00.000Z",
    sourceImage: { name: "source.png", type: "image/png", dataUrl: "data:image/png;base64,source" },
    settings,
    traceMode: "paint",
    analysis,
    manualStrokes: [],
    paintGuideEdits: [],
    referenceOpacity: 42,
    layerVisibility: {
      showReference: true,
      showCutline: true,
      showManualLines: true,
      showSuggestions: false,
      printPreview: false
    },
    traceViewport: DEFAULT_TRACE_VIEWPORT,
    workflowProgress: {
      activeStep: "clean",
      lineworkReviewed: false,
      colorsOutcome: "incomplete"
    }
  });
  const invalidSavedProject = JSON.parse(serializeCutoutProject(project));
  invalidSavedProject.workflowProgress = {
    activeStep: "export",
    lineworkReviewed: false,
    colorsOutcome: "reviewed"
  };
  const restored = restoreCutoutProject(invalidSavedProject);

  assertEqual(restored.workflowProgress.activeStep, "clean", "restore should clamp unsupported Export progress to Clean Lines");
  assertEqual(restored.workflowProgress.colorsOutcome, "incomplete", "restore should discard a Colors milestone unsupported by linework review");
}

{
  const restored = restoreCutoutProject({
    schemaVersion: CUTOUT_PROJECT_SCHEMA_VERSION,
    projectName: "Paint v1",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    sourceImage: { name: "source.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,source" },
    settings,
    traceMode: "manual",
    analysis,
    manualStrokes: [],
    paintGuideEdits: [{ hex: "#f1ce2d", label: "Coat", note: "raincoat", included: true }],
    referenceOpacity: 35,
    layerVisibility: {
      showReference: false,
      showCutline: true,
      showManualLines: true,
      showSuggestions: false,
      printPreview: false
    },
    traceViewport: DEFAULT_TRACE_VIEWPORT
  });

  assertEqual(restored.paintGuideEdits[0].selectedMatchId, null, "paint v1 project import should default selected match to none");
  assertEqual(restored.paintGuideEdits[0].manualOverride, "", "paint v1 project import should default manual override to empty");
  assertEqual(restored.projectPalette[0].label, "Coat", "paint v1 project import should seed project palette from paint edits");
}

{
  const rawProject = JSON.parse(serializeCutoutProject(createCutoutProjectSnapshot({
    projectName: "Temporary",
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
      printPreview: false
    },
    traceViewport: DEFAULT_TRACE_VIEWPORT
  })));
  delete rawProject.projectName;
  const restored = restoreCutoutProject(rawProject);

  assertEqual(restored.projectName, "Source", "older project imports should generate a safe project name fallback");
}

{
  const rawProject = JSON.parse(serializeCutoutProject(createCutoutProjectSnapshot({
    projectName: "Missing viewport",
    createdAt: "2026-07-07T10:00:00.000Z",
    updatedAt: "2026-07-07T10:00:00.000Z",
    sourceImage: { name: "source.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,source" },
    settings,
    traceMode: "manual",
    analysis,
    manualStrokes: [createTraceStroke("line", [{ x: 10, y: 20 }, { x: 30, y: 40 }], 20)],
    referenceOpacity: 35,
    layerVisibility: {
      showReference: true,
      showCutline: true,
      showManualLines: true,
      showSuggestions: false,
      printPreview: false
    },
    traceViewport: DEFAULT_TRACE_VIEWPORT
  })));
  delete rawProject.traceViewport;
  const restored = restoreCutoutProject(rawProject);

  assertEqual(restored.traceViewport.zoom, DEFAULT_TRACE_VIEWPORT.zoom, "missing viewport should restore to safe default zoom");
  assertEqual(restored.manualStrokes[0].points[0].x, 10, "viewport fallback should not change stroke coordinates");
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
  const duplicatePaletteProject = JSON.parse(serializeCutoutProject(createCutoutProjectSnapshot({
    projectName: "Duplicate ids",
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
      printPreview: false
    },
    traceViewport: DEFAULT_TRACE_VIEWPORT
  })));
  duplicatePaletteProject.projectPalette = [
    { ...duplicatePaletteProject.projectPalette[0], id: "shared-id" },
    {
      ...duplicatePaletteProject.projectPalette[0],
      id: "shared-id",
      hex: "#0c143a",
      label: "Hair",
      selectedMatchId: null,
      manualOverride: "",
      source: "manual"
    }
  ];

  let duplicateRestoreRejected = false;
  try {
    restoreCutoutProject(duplicatePaletteProject);
  } catch {
    duplicateRestoreRejected = true;
  }
  assert(duplicateRestoreRejected, "restore should reject duplicate palette IDs");
}

{
  let blankIdRejected = false;
  try {
    createCutoutProjectSnapshot({
      projectName: "Blank ids",
      createdAt: "2026-07-07T10:00:00.000Z",
      updatedAt: "2026-07-07T10:00:00.000Z",
      sourceImage: { name: "source.jpg", type: "image/jpeg", dataUrl: "data:image/jpeg;base64,source" },
      settings,
      traceMode: "manual",
      analysis,
      manualStrokes: [],
      projectPalette: [
        {
          id: "   ",
          hex: "#f1ce2d",
          label: "Coat",
          note: "",
          included: true,
          selectedMatchId: null,
          manualOverride: "",
          coverage: 0.22,
          matches: [],
          locked: false,
          source: "detected"
        }
      ],
      referenceOpacity: 35,
      layerVisibility: {
        showReference: false,
        showCutline: true,
        showManualLines: true,
        showSuggestions: false,
        printPreview: false
      },
      traceViewport: DEFAULT_TRACE_VIEWPORT
    });
  } catch {
    blankIdRejected = true;
  }
  assert(blankIdRejected, "snapshot creation should reject blank palette IDs");
}

{
  assertEqual(projectFileName("Coraline test"), "coraline-test.cutout.json", "project filename should use cutout extension");
  assertEqual(projectFileName(""), "cutout-project.cutout.json", "empty project names should use a safe fallback");
  assertEqual(
    cleanedProjectNameFromFileName("coraline-jones-wybie-lovat-youtube-other-mother-png-favpng-KtJE4LMVAEBZCVcR067bzMXqu.jpg"),
    "Coraline Jones Wybie Lovat",
    "long noisy source filenames should become readable project names"
  );
}
