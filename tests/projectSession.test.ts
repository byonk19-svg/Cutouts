import {
  createProjectSessionPersistenceCoordinator,
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
  const session = createProjectSession({
    projectName: "Coraline",
    settings,
    analysis,
    sourceImage: { name: "coraline.png", type: "image/png", dataUrl: "data:image/png;base64,source" }
  });
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

{
  const session = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "clean" as const, lineworkReviewed: false, colorsOutcome: "incomplete" as const }
  });
  const workflow = projectSessionView(session).capabilities.guidedWorkflow;

  assertEqual(workflow.progress.activeStep, "clean", "the session should expose normalized current workflow progress");
  assertEqual(workflow.steps.find((item) => item.step === "upload")?.status, "completed", "Upload should be completed after analysis");
  assertEqual(workflow.steps.find((item) => item.step === "clean")?.status, "current", "Clean Lines should be current");
  assertEqual(workflow.steps.find((item) => item.step === "colors")?.status, "locked", "Colors should be locked before linework review");

  const bypassed = transitionProjectSession(session, { type: "navigate-workflow", target: "colors" });
  assertEqual(bypassed.outcome.status, "rejected", "a locked-step request should be rejected at the public seam");
  assertEqual(bypassed.session, session, "a rejected locked-step request should preserve the session");
  assertEqual(bypassed.effects.length, 0, "a rejected locked-step request should not request persistence");
}

{
  const invalidCutLine = createProjectSession({
    ...lifecycleProject,
    analysis: { ...analysis, outerCutPath: "   " },
    workflowProgress: { activeStep: "clean" as const, lineworkReviewed: false, colorsOutcome: "incomplete" as const }
  });
  const rejected = transitionProjectSession(invalidCutLine, { type: "complete-linework-review" });
  assertEqual(rejected.outcome.status, "rejected", "linework review should require a valid Cut Line");
  assertEqual(rejected.session, invalidCutLine, "invalid linework review should not partially record a milestone");

  const valid = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "clean" as const, lineworkReviewed: false, colorsOutcome: "incomplete" as const },
    cleanupChecks: { cutline: false, remove: false, draw: false, export: false }
  });
  const reviewed = transitionProjectSession(valid, { type: "complete-linework-review" });
  assertEqual(reviewed.outcome.status, "applied", "valid linework review should apply");
  assertDeepEqual(reviewed.session.project.workflowProgress, {
    activeStep: "colors",
    lineworkReviewed: true,
    colorsOutcome: "incomplete"
  }, "linework review should record the milestone and navigation atomically");
  assertDeepEqual(reviewed.session.project.cleanupChecks, {
    cutline: true,
    remove: true,
    draw: true,
    export: false
  }, "linework review should retain the existing cleanup decision fields");
}

{
  const blocked = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "clean" as const, lineworkReviewed: false, colorsOutcome: "incomplete" as const }
  });
  const rejected = transitionProjectSession(blocked, { type: "complete-color-review", outcome: "reviewed" });
  assertEqual(rejected.outcome.status, "rejected", "color review should require linework review");
  assertEqual(rejected.session, blocked, "rejected color review should not change paint settings or progress");

  const reviewedLinework = transitionProjectSession(blocked, { type: "complete-linework-review" });
  const skipped = transitionProjectSession(reviewedLinework.session, { type: "complete-color-review", outcome: "skipped" });
  assertEqual(skipped.outcome.status, "applied", "skipping color review should apply after linework review");
  assertEqual(skipped.session.project.workflowProgress?.activeStep, "export", "a color decision should advance to Export");
  assertEqual(skipped.session.project.workflowProgress?.colorsOutcome, "skipped", "the skipped outcome should be durable");
  assertEqual(skipped.session.project.settings.includePaintGuidePage, false, "skipping should disable the Color Guide atomically");

  const bypassedColorGuide = transitionProjectSession(skipped.session, { type: "set-color-guide-included", included: true });
  assertEqual(bypassedColorGuide.outcome.status, "rejected", "a skipped Colors milestone should reject silently re-enabling the Color Guide");
  assertEqual(bypassedColorGuide.session.project.settings.includePaintGuidePage, false, "rejected Color Guide enablement should preserve the skipped export setting");
  const bypassedGenericSettings = transitionProjectSession(skipped.session, {
    type: "update-non-size-settings",
    settings: { ...skipped.session.project.settings, includePaintGuidePage: true }
  });
  assertEqual(bypassedGenericSettings.session.project.settings.includePaintGuidePage, false, "generic settings updates should not bypass the color-review policy");

  const revisited = transitionProjectSession(skipped.session, { type: "navigate-workflow", target: "colors" });
  const completedLater = transitionProjectSession(revisited.session, { type: "complete-color-review", outcome: "reviewed" });
  const ordinaryExportEdit = transitionProjectSession(completedLater.session, { type: "set-color-guide-included", included: false });
  assertEqual(ordinaryExportEdit.outcome.status, "applied", "a reviewed Color Guide should remain an editable export option");
  assertEqual(ordinaryExportEdit.session.project.workflowProgress?.colorsOutcome, "reviewed", "ordinary Color Guide edits should retain completed review");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const paintSelections = reviewed.project.projectPalette;
  const mutated = transitionProjectSession(reviewed, {
    type: "commit-accepted-linework",
    editedDetailPngDataUrl: "data:image/png;base64,changed-detail",
    manualStrokes: [{ id: "mouth", points: [{ x: 30, y: 40 }] }]
  });

  assertEqual(mutated.outcome.status, "applied", "accepted-linework mutation should apply");
  assertDeepEqual(mutated.session.project.workflowProgress, {
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "accepted-linework mutation should revoke both milestones and return to Clean Lines");
  assertEqual(mutated.session.project.projectPalette, paintSelections, "accepted-linework mutation should preserve paint selections");
  assertEqual(mutated.session.project.editedDetailPngDataUrl, "data:image/png;base64,changed-detail", "accepted Detail Lines should update atomically");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const paintSelections = reviewed.project.projectPalette;
  const committed = transitionProjectSession(reviewed, {
    type: "commit-editor-transaction",
    outcome: {
      editedDetailPngDataUrl: "data:image/png;base64,editor-detail",
      manualStrokes: [{ id: "feature-line", points: [{ x: 12, y: 18 }] }]
    }
  });

  assertEqual(committed.outcome.status, "applied", "a committed Editor Transaction outcome should apply through Project Session");
  assertEqual(committed.session.revision, reviewed.revision + 1, "one Editor Transaction should create one Project Revision");
  assertEqual(committed.effects.length, 1, "one Editor Transaction should request one Autosave");
  assertDeepEqual(committed.session.project.workflowProgress, {
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "an Editor Transaction should atomically revoke stale milestones");
  assertEqual(committed.session.project.projectPalette, paintSelections, "an Editor Transaction should preserve paint selections");

  const saved = transitionProjectSession(committed.session, {
    type: "persistence-succeeded",
    revision: committed.session.revision,
    mode: "autosave"
  });
  const proposalPending = transitionProjectSession(saved.session, { type: "set-guided-workflow-blocked", blocked: true });
  const undone = transitionProjectSession(proposalPending.session, {
    type: "commit-editor-transaction",
    outcome: {
      editedDetailPngDataUrl: lifecycleProject.editedDetailPngDataUrl,
      manualStrokes: lifecycleProject.manualStrokes
    }
  });

  assertEqual(undone.session.project.editedDetailPngDataUrl, lifecycleProject.editedDetailPngDataUrl, "Undo outcome should restore the prior editable artifact");
  assertDeepEqual(undone.session.project.workflowProgress, {
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "Undo should not restore revoked Review Milestones or workflow navigation");
  assertEqual(undone.session.guidedWorkflowBlocked, true, "Undo should not restore proposal-review status");
  assertEqual(undone.session.persistence.status, "pending", "Undo should create a new unsaved revision rather than restore saved status");

  const redone = transitionProjectSession(undone.session, {
    type: "commit-editor-transaction",
    outcome: {
      editedDetailPngDataUrl: committed.session.project.editedDetailPngDataUrl,
      manualStrokes: committed.session.project.manualStrokes
    }
  });
  assertEqual(redone.session.project.editedDetailPngDataUrl, "data:image/png;base64,editor-detail", "Redo outcome should reapply the edited artifact");
  assertEqual(redone.session.project.workflowProgress?.lineworkReviewed, false, "Redo should not restore Review Milestones");
}

{
  const empty = createProjectSession({
    ...lifecycleProject,
    editedDetailPngDataUrl: null,
    manualStrokes: [],
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const unchanged = transitionProjectSession(empty, {
    type: "commit-accepted-linework",
    editedDetailPngDataUrl: null,
    manualStrokes: []
  });
  assertEqual(unchanged.outcome.status, "unchanged", "a semantically identical empty linework write should not revoke milestones");
  assertEqual(unchanged.session, empty, "an identical linework write should preserve revision and progress");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const changedColors = transitionProjectSession(reviewed, {
    type: "update-project-palette",
    projectPalette: [{ id: "blue", hex: "#2563eb", label: "Coat" }]
  });
  assertEqual(changedColors.session.project.workflowProgress?.colorsOutcome, "reviewed", "ordinary color edits should retain completed review");
  assertEqual(changedColors.session.project.workflowProgress?.activeStep, "export", "ordinary color edits should retain Export availability");

  const restarted = transitionProjectSession(changedColors.session, { type: "restart-color-review" });
  assertDeepEqual(restarted.session.project.workflowProgress, {
    activeStep: "colors",
    lineworkReviewed: true,
    colorsOutcome: "incomplete"
  }, "explicit restart should revoke only the color milestone and return to Colors");
}

{
  const malformedWithoutCutLine = createProjectSession({
    ...lifecycleProject,
    analysis: { ...analysis, outerCutPath: "" },
    workflowProgress: { activeStep: "export", lineworkReviewed: true, colorsOutcome: "reviewed" }
  });
  assertDeepEqual(malformedWithoutCutLine.project.workflowProgress, {
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "restored progress should be clamped to artifacts when the Cut Line is missing");

  const malformedStep = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "unknown", lineworkReviewed: true, colorsOutcome: "reviewed" } as never
  });
  assertEqual(malformedStep.project.workflowProgress?.activeStep, "export", "a malformed active step should normalize to the furthest artifact-supported step");
}

{
  const session = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "clean" as const, lineworkReviewed: true, colorsOutcome: "incomplete" as const }
  });
  const blocked = transitionProjectSession(session, { type: "set-guided-workflow-blocked", blocked: true });
  const workflow = projectSessionView(blocked.session).capabilities.guidedWorkflow;
  assertEqual(workflow.steps.find((item) => item.step === "colors")?.status, "locked", "a pending proposal should be represented by session capabilities");
  const bypassed = transitionProjectSession(blocked.session, { type: "navigate-workflow", target: "colors" });
  assertEqual(bypassed.outcome.status, "rejected", "pending-proposal navigation should be rejected by the same session policy");
  const bypassedColorReview = transitionProjectSession(blocked.session, { type: "complete-color-review", outcome: "reviewed" });
  assertEqual(bypassedColorReview.outcome.status, "rejected", "pending-proposal color completion should be rejected by the same session policy");
  const bypassedRestart = transitionProjectSession(blocked.session, { type: "restart-color-review" });
  assertEqual(bypassedRestart.outcome.status, "rejected", "pending-proposal color restart should be rejected by the same session policy");
  assertEqual(workflow.canCompleteColorReview, false, "displayed color-review capability should match blocked enforcement");
}

{
  const colors = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "colors" as const, lineworkReviewed: true, colorsOutcome: "incomplete" as const }
  });
  const clean = transitionProjectSession(colors, { type: "navigate-workflow", target: "clean" });
  const availableColors = projectSessionView(clean.session).capabilities.guidedWorkflow.steps.find((item) => item.step === "colors");
  assertEqual(availableColors?.status, "available", "Colors should display as an available forward step after backward navigation");
  assertEqual(availableColors?.clickable, false, "available forward steps should remain disabled in the step header");
  const bypassed = transitionProjectSession(clean.session, { type: "navigate-workflow", target: "colors" });
  assertEqual(bypassed.outcome.status, "rejected", "a disabled available-step request should be rejected at the public seam");
  assertEqual(bypassed.session, clean.session, "available-step bypass should preserve the current Clean Lines state");
}

const persistedWorkspace = {
  createdAt: "2026-07-18T10:00:00.000Z",
  traceMode: "manual" as const,
  referenceOpacity: 57,
  layerVisibility: {
    showReference: true,
    showCutline: true,
    showManualLines: false,
    showSuggestions: true,
    printPreview: false
  },
  traceViewport: { zoom: 1.6, panX: 24, panY: -13 }
};

{
  const session = createProjectSession({ ...lifecycleProject, ...persistedWorkspace });
  const renamed = transitionProjectSession(session, { type: "rename-project", projectName: "Coherent revision" });
  const autosave = renamed.effects.find((effect) => effect.type === "request-autosave");

  assert(autosave?.type === "request-autosave", "a durable transition should request Autosave");
  assertEqual(autosave.revision, renamed.session.revision, "Autosave should capture the resulting Project Revision");
  assertEqual(autosave.project, renamed.session.project, "Autosave should capture one coherent project object");
  assertEqual(autosave.project.projectName, "Coherent revision", "the captured snapshot should contain the applied change");

  const explicit = transitionProjectSession(renamed.session, { type: "request-explicit-save" });
  const save = explicit.effects.find((effect) => effect.type === "request-explicit-save");
  assert(save?.type === "request-explicit-save", "explicit save should emit a persistence effect");
  assertEqual(save.revision, renamed.session.revision, "explicit save should capture the current revision without changing it");
  assertEqual(save.project, renamed.session.project, "explicit save should serialize one coherent project object");

  const incompleteSession = createProjectSession({
    ...persistedWorkspace,
    projectName: "Not ready",
    sourceImage: null,
    analysis: null
  });
  const incompleteRename = transitionProjectSession(incompleteSession, {
    type: "rename-project",
    projectName: "Still not ready"
  });
  assertDeepEqual(incompleteRename.effects, [], "an incomplete workspace should not request an invalid Project File Autosave");
  assertEqual(incompleteRename.session.persistence.status, "idle", "an incomplete workspace should not report a pending save");
}

{
  const session = createProjectSession({ ...lifecycleProject, ...persistedWorkspace });
  const preparing = transitionProjectSession(session, { type: "begin-project-preparation", operation: "restore-project" });
  assertEqual(preparing.outcome.status, "preparing", "project open should begin controlled preparation");
  if (preparing.outcome.status !== "preparing") throw new Error("expected restore token");

  const failed = transitionProjectSession(preparing.session, {
    type: "fail-project-preparation",
    token: preparing.outcome.token,
    error: "Unsupported project schema"
  });
  assertEqual(failed.outcome.status, "failed", "invalid project preparation should report failure");
  assertEqual(failed.session.project, session.project, "invalid project preparation should preserve the active project");
  assertEqual(failed.session.revision, session.revision, "invalid project preparation should preserve the revision");
  assertEqual(failed.effects.length, 0, "invalid project preparation should preserve Autosave");

  const retrying = transitionProjectSession(failed.session, { type: "begin-project-preparation", operation: "restore-project" });
  if (retrying.outcome.status !== "preparing") throw new Error("expected retry restore token");
  const restoredProject = {
    ...lifecycleProject,
    ...persistedWorkspace,
    projectName: "Restored project",
    workflowProgress: { activeStep: "export", lineworkReviewed: false, colorsOutcome: "reviewed" } as never
  };
  const restored = transitionProjectSession(retrying.session, {
    type: "complete-project-restore",
    token: retrying.outcome.token,
    project: restoredProject,
    requestAutosave: true
  });
  assertEqual(restored.outcome.status, "successful", "a validated project should install successfully");
  assertEqual(restored.session.revision, session.revision + 1, "restore should apply one atomic Project Transition");
  assertEqual(restored.session.project.projectName, "Restored project", "restore should install durable project fields");
  assertEqual(restored.session.project.traceMode, "manual", "restore should install saved workspace preferences atomically");
  assertDeepEqual(restored.session.project.workflowProgress, {
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "restore should normalize malformed Workflow Progress against artifacts");
  assertEqual(restored.effects.length, 1, "opening a valid Project File should create one Autosave opportunity");
}

{
  const session = createProjectSession({ ...lifecycleProject, ...persistedWorkspace });
  const first = transitionProjectSession(session, { type: "begin-project-preparation", operation: "restore-project" });
  if (first.outcome.status !== "preparing") throw new Error("expected restore token");
  const changed = transitionProjectSession(first.session, { type: "rename-project", projectName: "Newer active work" });
  const stale = transitionProjectSession(changed.session, {
    type: "complete-project-restore",
    token: first.outcome.token,
    project: { ...lifecycleProject, ...persistedWorkspace, projectName: "Late restore" },
    requestAutosave: true
  });
  assertEqual(stale.outcome.status, "stale", "a late project-open result should be discarded");
  assertEqual(stale.session.project.projectName, "Newer active work", "a late restore should not rewind newer work");
}

{
  type TimerTask = { id: number; callback: () => void | Promise<void>; cancelled: boolean };
  const tasks: TimerTask[] = [];
  const autosaves: string[] = [];
  const downloads: string[] = [];
  const results: unknown[] = [];
  let nextTimerId = 1;
  let failAutosave = false;
  const coordinator = createProjectSessionPersistenceCoordinator({
    debounceMs: 450,
    schedule: (callback) => {
      const task = { id: nextTimerId++, callback, cancelled: false };
      tasks.push(task);
      return task.id;
    },
    cancel: (id) => {
      const task = tasks.find((candidate) => candidate.id === id);
      if (task) task.cancelled = true;
    },
    serialize: ({ revision, project }) => JSON.stringify({ revision, projectName: project.projectName }),
    writeAutosave: (serialized) => {
      if (failAutosave) throw new Error("Storage quota exceeded");
      autosaves.push(serialized);
    },
    downloadProject: (serialized) => downloads.push(serialized),
    clearAutosave: () => autosaves.splice(0)
  });
  const initial = createProjectSession({ ...lifecycleProject, ...persistedWorkspace });
  const first = transitionProjectSession(initial, { type: "rename-project", projectName: "First debounce value" });
  const second = transitionProjectSession(first.session, { type: "rename-project", projectName: "Latest debounce value" });
  const firstEffect = first.effects[0];
  const secondEffect = second.effects[0];
  if (!firstEffect || !secondEffect) throw new Error("expected Autosave effects");

  coordinator.execute(firstEffect, (result) => results.push(result));
  coordinator.execute(secondEffect, (result) => results.push(result));
  assertEqual(tasks.length, 2, "each new Autosave request should replace the debounce timer");
  assertEqual(tasks[0]?.cancelled, true, "the older debounce timer should be cancelled");
  await tasks[1]?.callback();
  assertEqual(autosaves.length, 1, "debouncing should write only the latest coherent revision");
  assert(autosaves[0]?.includes("Latest debounce value"), "Autosave should serialize the latest captured project");
  assertEqual((results[0] as { type?: string }).type, "persistence-succeeded", "successful Autosave should report persistence health");

  failAutosave = true;
  const failing = transitionProjectSession(second.session, { type: "rename-project", projectName: "Fails Autosave" });
  if (!failing.effects[0]) throw new Error("expected failing Autosave effect");
  coordinator.execute(failing.effects[0], (result) => results.push(result));
  await tasks[2]?.callback();
  assertEqual(tasks.length, 3, "Autosave failure should not start an automatic retry timer");
  assertEqual((results[1] as { type?: string }).type, "persistence-failed", "Autosave failure should report persistence health");
  const failedHealth = transitionProjectSession(failing.session, results[1] as never);
  assertEqual(failedHealth.session.project, failing.session.project, "Autosave failure should not roll back in-memory project work");
  assertEqual(failedHealth.session.persistence.status, "failed", "Autosave failure should remain visible on the session");

  const explicitWhileAutosaveFinishes = transitionProjectSession(failing.session, { type: "request-explicit-save" });
  const lateAutosaveResult = transitionProjectSession(explicitWhileAutosaveFinishes.session, {
    type: "persistence-failed",
    revision: failing.session.revision,
    mode: "autosave",
    error: "late Autosave result"
  });
  assertEqual(lateAutosaveResult.outcome.status, "stale", "a late Autosave result should not overwrite newer explicit-save health");
  assertDeepEqual(lateAutosaveResult.session.persistence, explicitWhileAutosaveFinishes.session.persistence, "the current persistence attempt should remain authoritative");

  failAutosave = false;
  const retryOpportunity = transitionProjectSession(failedHealth.session, { type: "rename-project", projectName: "Retry opportunity" });
  if (!retryOpportunity.effects[0]) throw new Error("expected next Autosave opportunity");
  coordinator.execute(retryOpportunity.effects[0], (result) => results.push(result));
  await tasks[3]?.callback();
  assertEqual(autosaves.length, 2, "the next durable transition should create a new save opportunity");

  const explicit = transitionProjectSession(retryOpportunity.session, { type: "request-explicit-save" });
  if (!explicit.effects[0]) throw new Error("expected explicit save effect");
  await coordinator.execute(explicit.effects[0], (result) => results.push(result));
  assertEqual(downloads.length, 1, "explicit save should download exactly once");
  assertEqual(autosaves.length, 3, "explicit save should refresh Autosave with the identical serialization");
  assertEqual(downloads[0], autosaves[2], "explicit save and Autosave should use one coherent serialization");
}

console.log("project session tests passed");
