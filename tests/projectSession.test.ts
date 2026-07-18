import {
  createProjectSession,
  executeProjectSessionEffects,
  projectSessionView,
  transitionProjectSession
} from "../src/projectSession.ts";
import { buildTraceLineworkSvg } from "../src/traceLineworkSvg.ts";
import type { Settings } from "../src/traceWorkflow.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

function assertDeepEqual(actual: unknown, expected: unknown, message: string) {
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
  }
}

const settings: Settings = {
  finishedHeightIn: 36,
  threshold: 42,
  smoothing: 4,
  speckArea: 60,
  holeArea: 220,
  detailLines: true,
  detailCleanup: 88,
  templateStyle: "paint",
  detailExtractionMode: "auto",
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
  palette: []
};

const preservedProjectFields = {
  sourceImage: {
    name: "coraline.png",
    type: "image/png",
    dataUrl: "data:image/png;base64,source"
  },
  editedDetailPngDataUrl: "data:image/png;base64,accepted-detail",
  manualStrokes: [{ id: "eye", points: [{ x: 12, y: 18 }, { x: 20, y: 24 }] }],
  projectPalette: [{ id: "yellow", hex: "#facc15", label: "Raincoat" }],
  workflowProgress: { activeStep: "colors", lineworkReviewed: true, colorsOutcome: "reviewed" },
  cleanupChecks: { cutline: true, remove: true, draw: true, export: false },
  referenceOpacity: 42,
  layerVisibility: {
    showReference: true,
    showCutline: true,
    showManualLines: true,
    showSuggestions: false,
    printPreview: false
  },
  traceViewport: { zoom: 1.25, panX: 12, panY: -8 }
};

{
  const session = createProjectSession({
    projectName: "Coraline",
    settings,
    analysis,
    ...preservedProjectFields
  });

  const transition = transitionProjectSession(session, {
    type: "rename-project",
    projectName: "Coraline Yard Cutout"
  });
  const view = projectSessionView(transition.session);

  assertEqual(view.project.projectName, "Coraline Yard Cutout", "project name should change");
  assertEqual(view.revision, 1, "project name should advance the Project Revision once");
  assertEqual(transition.outcome.status, "applied", "project name should expose an applied outcome");
  assertEqual(transition.effects.length, 1, "project name should request one external effect");
  assertEqual(transition.effects[0]?.type, "request-autosave", "project name should request Autosave");
  assertEqual(transition.effects[0]?.revision, 1, "Autosave should target the changed revision");
  assert(view.capabilities.renameProject, "project name capability should be available");
  assert(view.capabilities.changeFinishedSize, "Finished Size capability should be available");
  assertDeepEqual(
    { ...view.project, projectName: "Coraline", settings, analysis },
    { projectName: "Coraline", settings, analysis, ...preservedProjectFields },
    "project name should preserve every other durable field"
  );
  assertEqual(view.project.analysis.outerCutPath, analysis.outerCutPath, "Cut Line should be preserved");
}

{
  const session = createProjectSession({ projectName: "Coraline", settings, analysis });
  const transition = transitionProjectSession(session, {
    type: "rename-project",
    projectName: "Coraline"
  });

  assertEqual(transition.session.revision, 0, "an unchanged project name should not advance the Project Revision");
  assertEqual(transition.outcome.status, "unchanged", "an unchanged project name should expose its outcome");
  assertEqual(transition.effects.length, 0, "an unchanged project name should not request Autosave");
}

{
  const session = createProjectSession({
    projectName: "Coraline",
    settings,
    analysis,
    ...preservedProjectFields
  });

  const transition = transitionProjectSession(session, {
    type: "change-finished-size",
    finishedHeightIn: 48
  });
  const view = projectSessionView(transition.session);

  assertEqual(view.revision, 1, "Finished Size should advance the Project Revision once");
  assertEqual(transition.outcome.status, "applied", "Finished Size should expose an applied outcome");
  assertEqual(view.project.settings.finishedHeightIn, 48, "Finished Size should update settings");
  assertEqual(view.project.analysis.finishedHeightIn, 48, "Finished Size should update analysis geometry atomically");
  assertEqual(view.project.analysis.finishedWidthIn, 19, "Finished Size should preserve the analyzed aspect ratio");
  assertEqual(view.project.analysis.tileCols, 3, "Finished Size should recalculate tile columns");
  assertEqual(view.project.analysis.tileRows, 5, "Finished Size should recalculate tile rows");
  assertEqual(view.project.analysis.tileCount, 15, "Finished Size should recalculate tile count");
  assertEqual(view.project.settings.threshold, settings.threshold, "trace settings should be preserved");
  assertEqual(view.project.analysis.outerCutPath, analysis.outerCutPath, "Cut Line should be preserved");
  assertEqual(view.project.analysis.detailLinePngDataUrl, analysis.detailLinePngDataUrl, "accepted Detail Lines should be preserved");
  for (const [key, value] of Object.entries(preservedProjectFields)) {
    assertDeepEqual(view.project[key as keyof typeof view.project], value, `Finished Size should preserve ${key}`);
  }
  assertEqual(transition.effects[0]?.type, "request-autosave", "Finished Size should request Autosave");
  assertEqual(transition.effects[0]?.revision, 1, "Autosave should target the changed revision");
  const printableSvg = buildTraceLineworkSvg({
    projectName: view.project.projectName,
    analysis: view.project.analysis,
    manualStrokes: []
  });
  assert(printableSvg.includes('width="19in" height="48in"'), "Finished Size should reach print output at actual size");
  assert(printableSvg.includes(`d="${analysis.outerCutPath}"`), "Finished Size should not alter protected Cut Line geometry");
}

{
  const session = createProjectSession({ projectName: "Coraline", settings, analysis });
  const transition = transitionProjectSession(session, {
    type: "change-finished-size",
    finishedHeightIn: 36
  });

  assertEqual(transition.session.revision, 0, "an unchanged Finished Size should not advance the Project Revision");
  assertEqual(transition.outcome.status, "unchanged", "an unchanged Finished Size should expose its outcome");
  assertEqual(transition.effects.length, 0, "an unchanged Finished Size should not request Autosave");
}

for (const finishedHeightIn of [Number.NaN, -1, 5, 97]) {
  const session = createProjectSession({ projectName: "Coraline", settings, analysis });
  const transition = transitionProjectSession(session, { type: "change-finished-size", finishedHeightIn });

  assertEqual(transition.outcome.status, "rejected", `invalid Finished Size ${finishedHeightIn} should be rejected`);
  assertEqual(transition.session, session, "a rejected Finished Size should preserve the current session");
  assertEqual(transition.effects.length, 0, "a rejected Finished Size should not request Autosave");
}

{
  const session = createProjectSession({ projectName: "Coraline", settings, analysis });
  const transition = transitionProjectSession(session, { type: "rename-project", projectName: "   " });

  assertEqual(transition.outcome.status, "rejected", "a blank project name should be rejected");
  assertEqual(transition.session, session, "a rejected project name should preserve the current session");
}

{
  const session = createProjectSession({ projectName: "Coraline", settings, analysis });
  const transition = transitionProjectSession(session, { type: "rename-project", projectName: "  Coraline Revised  " });

  assertEqual(transition.outcome.status, "applied", "a valid project name should be applied");
  assertEqual(transition.session.project.projectName, "Coraline Revised", "project name should be normalized at the seam");
}

{
  const session = createProjectSession({ projectName: "Coraline", settings, analysis });
  const applied = transitionProjectSession(session, { type: "rename-project", projectName: "Coraline Revised" });
  const unchanged = transitionProjectSession(session, { type: "rename-project", projectName: "Coraline" });
  const requestedRevisions: number[] = [];

  executeProjectSessionEffects(applied.effects, {
    requestAutosave: (revision) => requestedRevisions.push(revision)
  });
  executeProjectSessionEffects(unchanged.effects, {
    requestAutosave: (revision) => requestedRevisions.push(revision)
  });

  assertDeepEqual(requestedRevisions, [1], "only an applied action should reach the Autosave adapter");
}

{
  const session = createProjectSession({ projectName: "Coraline", settings, analysis });
  const capabilities = projectSessionView(session).capabilities;
  assert(Object.isFrozen(capabilities), "Project Capabilities should be immutable at runtime");
}

console.log("project session tests passed");
