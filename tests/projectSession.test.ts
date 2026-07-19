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

const lifecycleProject = {
  projectName: "Coraline",
  settings,
  sourceImage: preservedProjectFields.sourceImage,
  analysis,
  editedDetailPngDataUrl: preservedProjectFields.editedDetailPngDataUrl,
  manualStrokes: preservedProjectFields.manualStrokes,
  projectPalette: preservedProjectFields.projectPalette,
  workflowProgress: preservedProjectFields.workflowProgress,
  cleanupChecks: preservedProjectFields.cleanupChecks,
  unacceptedAiProposal: { proposalDetailPngDataUrl: "data:image/png;base64,pending" }
};

{
  const session = createProjectSession(lifecycleProject);
  const preparing = transitionProjectSession(session, { type: "begin-project-preparation", operation: "replace-source" });
  assertEqual(preparing.outcome.status, "preparing", "Source Image replacement should expose preparing status");
  assertEqual(preparing.session.project, session.project, "preparing should not mutate durable project state");
  assertEqual(preparing.session.revision, session.revision, "preparing should not advance the Project Revision");
  assertEqual(preparing.capabilities.analyzeSource, false, "analysis should be unavailable while preparation is active");
  if (preparing.outcome.status !== "preparing") throw new Error("expected a preparation token");

  const read = transitionProjectSession(preparing.session, {
    type: "complete-project-preparation",
    token: preparing.outcome.token
  });
  assertEqual(read.outcome.status, "successful", "successful file reading should expose successful status");
  assertEqual(read.session.project, session.project, "successful file reading should not replace durable state before analysis");
  assertEqual(read.capabilities.analyzeSource, true, "analysis should become available after file reading succeeds");

  const retrying = transitionProjectSession(read.session, { type: "begin-project-preparation", operation: "replace-source" });
  if (retrying.outcome.status !== "preparing") throw new Error("expected a retry preparation token");

  const failed = transitionProjectSession(retrying.session, {
    type: "fail-project-preparation",
    token: retrying.outcome.token,
    error: "Unable to read the selected image."
  });
  assertEqual(failed.outcome.status, "failed", "read failure should expose failed status");
  assertEqual(failed.session.project, session.project, "read failure should preserve the complete durable project");
  assertEqual(failed.session.revision, session.revision, "read failure should preserve the Project Revision");
  assertEqual(failed.effects.length, 0, "read failure should not request persistence");
  assertEqual(failed.capabilities.analyzeSource, true, "analysis should be retryable after failure");
}

{
  const session = createProjectSession(lifecycleProject);
  const preparing = transitionProjectSession(session, { type: "begin-project-preparation", operation: "replace-source" });
  if (preparing.outcome.status !== "preparing") throw new Error("expected a preparation token");
  const replacementAnalysis = {
    ...analysis,
    previewPngDataUrl: "data:image/png;base64,replacement-preview",
    outerCutPath: "M 5 5 L 105 5 L 105 155 L 5 155 Z",
    palette: [{ index: 0, hex: "#2563eb", weight: 1, matches: [] }]
  };
  const replacementPalette = [{ id: "blue", hex: "#2563eb", label: "New source blue" }];
  const completed = transitionProjectSession(preparing.session, {
    type: "complete-source-analysis",
    token: preparing.outcome.token,
    mode: "replace-source",
    projectName: "New Character",
    sourceImage: { name: "new-character.png", type: "image/png", dataUrl: "data:image/png;base64,new-source" },
    settings,
    analysis: replacementAnalysis,
    initialDetailPngDataUrl: null,
    initialProjectPalette: replacementPalette
  });

  assertEqual(completed.outcome.status, "successful", "replacement should expose successful status");
  assertEqual(completed.session.revision, 1, "successful replacement should advance the Project Revision once");
  assertDeepEqual(completed.session.project.sourceImage, {
    name: "new-character.png",
    type: "image/png",
    dataUrl: "data:image/png;base64,new-source"
  }, "replacement should install the prepared Source Image atomically");
  assertEqual(completed.session.project.analysis, replacementAnalysis, "replacement should install prepared analysis atomically");
  assertEqual(completed.session.project.editedDetailPngDataUrl, null, "replacement should reset accepted generated Detail Lines");
  assertDeepEqual(completed.session.project.manualStrokes, [], "replacement should reset source-dependent Feature Lines");
  assertDeepEqual(completed.session.project.projectPalette, replacementPalette, "replacement should install the new detected paint work");
  assertDeepEqual(completed.session.project.workflowProgress, {
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "replacement should reset downstream Review Milestones");
  assertDeepEqual(completed.session.project.cleanupChecks, {
    cutline: false,
    remove: false,
    draw: false,
    export: false
  }, "replacement should reset source-dependent cleanup decisions");
  assertEqual(completed.session.project.unacceptedAiProposal, null, "replacement should discard an unaccepted proposal");
  assertEqual(completed.effects[0]?.type, "request-autosave", "replacement should request one Autosave");
}

{
  const session = createProjectSession(lifecycleProject);
  const preparing = transitionProjectSession(session, { type: "begin-project-preparation", operation: "regenerate-analysis" });
  if (preparing.outcome.status !== "preparing") throw new Error("expected a preparation token");
  const regeneratedAnalysis = { ...analysis, detailLinePngDataUrl: "data:image/png;base64,regenerated-detail" };
  const completed = transitionProjectSession(preparing.session, {
    type: "complete-source-analysis",
    token: preparing.outcome.token,
    mode: "regenerate-analysis",
    settings: { ...settings, detailCleanup: 72 },
    analysis: regeneratedAnalysis,
    initialDetailPngDataUrl: "data:image/png;base64,regenerated-imported-detail",
    initialProjectPalette: [{ id: "yellow-2", hex: "#facc15", label: "Regenerated yellow" }]
  });

  assertEqual(completed.outcome.status, "successful", "same-source regeneration should expose successful status");
  assertEqual(completed.session.project.sourceImage, lifecycleProject.sourceImage, "same-source regeneration should preserve the Source Image");
  assertDeepEqual(completed.session.project.manualStrokes, lifecycleProject.manualStrokes, "same-source regeneration should preserve manual Feature Lines");
  assertEqual(completed.session.project.analysis, regeneratedAnalysis, "same-source regeneration should install the new analysis");
  assertEqual(completed.session.project.editedDetailPngDataUrl, "data:image/png;base64,regenerated-imported-detail", "same-source regeneration should replace generated detail work");
  assertEqual(completed.session.project.workflowProgress.lineworkReviewed, false, "regeneration should invalidate stale linework review");
  assertEqual(completed.session.project.workflowProgress.colorsOutcome, "incomplete", "regeneration should invalidate stale color review");
  assertEqual(completed.session.project.unacceptedAiProposal, null, "regeneration should discard a stale unaccepted proposal");
}

{
  const session = createProjectSession(lifecycleProject);
  const first = transitionProjectSession(session, { type: "begin-project-preparation", operation: "replace-source" });
  if (first.outcome.status !== "preparing") throw new Error("expected first preparation token");
  const second = transitionProjectSession(first.session, { type: "begin-project-preparation", operation: "replace-source" });
  if (second.outcome.status !== "preparing") throw new Error("expected second preparation token");
  const stale = transitionProjectSession(second.session, {
    type: "complete-source-analysis",
    token: first.outcome.token,
    mode: "replace-source",
    projectName: "Older Source",
    sourceImage: { name: "older.png", type: "image/png", dataUrl: "data:image/png;base64,older" },
    settings,
    analysis: { ...analysis, previewPngDataUrl: "data:image/png;base64,older" },
    initialDetailPngDataUrl: null,
    initialProjectPalette: []
  });
  assertEqual(stale.outcome.status, "stale", "an older out-of-order result should be rejected as stale");
  assertEqual(stale.session.project, lifecycleProject, "an older out-of-order result should not overwrite the project");
  assertEqual(stale.session.operation.status, "preparing", "an older result should not hide the newer active preparation");
  assertEqual(stale.effects.length, 0, "a stale result should not request persistence");

  const current = transitionProjectSession(stale.session, {
    type: "complete-source-analysis",
    token: second.outcome.token,
    mode: "replace-source",
    projectName: "Newer Source",
    sourceImage: { name: "newer.png", type: "image/png", dataUrl: "data:image/png;base64,newer" },
    settings,
    analysis: { ...analysis, previewPngDataUrl: "data:image/png;base64,newer" },
    initialDetailPngDataUrl: null,
    initialProjectPalette: []
  });
  assertEqual(current.outcome.status, "successful", "the newest controlled response should apply");
  assertEqual(current.session.project.sourceImage.name, "newer.png", "the newest Source Image should win");
}

{
  const session = createProjectSession(lifecycleProject);
  const preparing = transitionProjectSession(session, { type: "begin-project-preparation", operation: "regenerate-analysis" });
  if (preparing.outcome.status !== "preparing") throw new Error("expected a preparation token");
  const revisedSettings = { ...settings, threshold: 61 };
  const revised = transitionProjectSession(preparing.session, { type: "update-non-size-settings", settings: revisedSettings });
  const stale = transitionProjectSession(revised.session, {
    type: "complete-source-analysis",
    token: preparing.outcome.token,
    mode: "regenerate-analysis",
    settings,
    analysis: { ...analysis, previewPngDataUrl: "data:image/png;base64,late" },
    initialDetailPngDataUrl: null,
    initialProjectPalette: []
  });
  assertEqual(stale.outcome.status, "stale", "a result from an older Project Revision should be rejected");
  assertEqual(stale.session.project.settings.threshold, 61, "a stale result should preserve the newer settings revision");
}

{
  const session = createProjectSession(lifecycleProject);
  const cancelled = transitionProjectSession(session, { type: "cancel-new-project" });
  assertEqual(cancelled.outcome.status, "cancelled", "cancelled new project should expose a cancelled outcome");
  assertEqual(cancelled.session, session, "cancelled new project should preserve the entire Project Session");
  assertEqual(cancelled.effects.length, 0, "cancelled new project should preserve Autosave");

  const emptyProject = {
    projectName: "Cutout Project",
    settings,
    sourceImage: null,
    analysis: null,
    editedDetailPngDataUrl: null,
    manualStrokes: [],
    projectPalette: [],
    workflowProgress: { activeStep: "upload" as const, lineworkReviewed: false, colorsOutcome: "incomplete" as const },
    cleanupChecks: { cutline: false, remove: false, draw: false, export: false },
    unacceptedAiProposal: null
  };
  const confirmed = transitionProjectSession(session, { type: "confirm-new-project", project: emptyProject });
  assertEqual(confirmed.outcome.status, "successful", "confirmed new project should expose successful status");
  assertEqual(confirmed.session.revision, 1, "confirmed new project should advance the Project Revision");
  assertEqual(confirmed.session.project, emptyProject, "confirmed new project should atomically install the empty session");
  assertDeepEqual(confirmed.effects, [{ type: "clear-autosave" }], "confirmed new project should clear only the old Autosave");
}

console.log("project session tests passed");
