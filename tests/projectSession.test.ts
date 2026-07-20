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

function paintMatch(id: string, brand: string, line: string, colorName: string, hex: string) {
  return {
    id,
    brand,
    line,
    colorName,
    hex,
    finish: "matte",
    outdoorRecommended: false,
    retailer: "",
    productUrl: "",
    notes: "",
    distance: 4.2,
    confidence: "close match" as const
  };
}

function projectPaintColor(input: {
  id: string;
  hex: string;
  label: string;
  note?: string;
  included?: boolean;
  selectedMatchId?: string | null;
  manualOverride?: string;
  coverage?: number;
  matches?: ReturnType<typeof paintMatch>[];
  locked?: boolean;
  source?: "detected" | "manual";
}) {
  return {
    id: input.id,
    hex: input.hex,
    label: input.label,
    note: input.note ?? "",
    included: input.included ?? true,
    selectedMatchId: input.selectedMatchId ?? null,
    manualOverride: input.manualOverride ?? "",
    coverage: input.coverage ?? 0,
    matches: input.matches ?? [],
    locked: input.locked ?? false,
    source: input.source ?? "detected"
  };
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
  palette: [],
  traceQuality: {
    subjectCoverage: 0.71,
    fakeCheckerboardBackground: false,
    detailExtractionModeUsed: "rendered" as const,
    warnings: []
  }
};

const navyPaintMatch = paintMatch("folkart-outdoor-navy", "FolkArt", "Outdoor", "Navy", "#1f315d");
const yellowPaintMatch = paintMatch("apple-barrel-bright-yellow", "Apple Barrel", "Matte Acrylic", "Bright Yellow", "#f6cc27");
const bluePaintMatch = paintMatch("folkart-deep-blue", "FolkArt", "Outdoor", "Deep Blue", "#2563eb");
const peachPaintMatch = paintMatch("folkart-skin-tone", "FolkArt", "Multi-Surface", "Portrait Light", "#f0c3a2");
const detectedPalette = [
  { hex: "#0c143a", coverage: 0.32, matches: [navyPaintMatch] },
  { hex: "#f1ce2d", coverage: 0.24, matches: [yellowPaintMatch] }
];
const analysisWithPalette = {
  ...analysis,
  palette: detectedPalette
};
const defaultProjectPalette = [
  projectPaintColor({
    id: "detected-1-0c143a",
    hex: "#0c143a",
    label: "Hair / outline",
    note: "marker outline",
    coverage: 0.32,
    matches: [navyPaintMatch]
  }),
  projectPaintColor({
    id: "detected-2-f1ce2d",
    hex: "#f1ce2d",
    label: "Raincoat",
    note: "main coat",
    selectedMatchId: yellowPaintMatch.id,
    coverage: 0.24,
    matches: [yellowPaintMatch]
  }),
  projectPaintColor({
    id: "manual-3-f1c7a5",
    hex: "#f1c7a5",
    label: "Skin tone",
    note: "face and hands",
    manualOverride: "Choose a peach skin tone",
    matches: [peachPaintMatch],
    locked: true,
    source: "manual"
  })
];

const pendingAiProposal = {
  status: "pending-review" as const,
  validationIssues: [],
  canReplaceAcceptedDetail: false as const,
  proposalPreviewPngDataUrl: "data:image/png;base64,proposal-preview",
  proposalDetailPngDataUrl: "data:image/png;base64,proposal-detail",
  inkCoverage: 0.21,
  suppressedPixelCount: 18,
  previewWidthPx: analysis.previewWidthPx,
  previewHeightPx: analysis.previewHeightPx,
  model: "wayfinder-test",
  provider: "mock-provider",
  estimatedCostUsd: 0.10
};

const reviewOnlyAiProposal = {
  ...pendingAiProposal,
  status: "review-only" as const,
  validationIssues: ["duplicate silhouette"]
};

const preservedProjectFields = {
  sourceImage: {
    name: "coraline.png",
    type: "image/png",
    dataUrl: "data:image/png;base64,source"
  },
  editedDetailPngDataUrl: "data:image/png;base64,accepted-detail",
  manualStrokes: [{ id: "eye", points: [{ x: 12, y: 18 }, { x: 20, y: 24 }] }],
  projectPalette: defaultProjectPalette,
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
  assertEqual(capabilities.saveProject, false, "displayed save availability should reject a project without a Source Image");
  const bypassedSave = transitionProjectSession(session, { type: "request-explicit-save" });
  assertEqual(bypassedSave.outcome.status, "rejected", "save enforcement should share the displayed Project Session authority");
}

const lifecycleProject = {
  projectName: "Coraline",
  settings,
  sourceImage: preservedProjectFields.sourceImage,
  analysis: analysisWithPalette,
  editedDetailPngDataUrl: preservedProjectFields.editedDetailPngDataUrl,
  manualStrokes: preservedProjectFields.manualStrokes,
  projectPalette: defaultProjectPalette,
  workflowProgress: preservedProjectFields.workflowProgress,
  cleanupChecks: preservedProjectFields.cleanupChecks
};

{
  const session = createProjectSession(lifecycleProject);
  assertEqual(projectSessionView(session).capabilities.saveProject, true, "a complete project should expose save availability from Project Session");
  const requested = transitionProjectSession(session, { type: "request-explicit-save" });
  assertEqual(requested.outcome.status, "save-requested", "save enforcement should accept the same complete project");
}

function requestAiProposal(session: ReturnType<typeof createProjectSession>) {
  const confirming = transitionProjectSession(session, { type: "begin-ai-proposal-request" });
  const requesting = transitionProjectSession(confirming.session, {
    type: "confirm-ai-proposal-request",
    estimatedCostUsd: 0.10,
    uploadConfirmed: true
  });
  if (requesting.outcome.status !== "requesting") throw new Error("expected AI proposal request token");
  return requesting;
}

function completePendingAiProposal(session: ReturnType<typeof createProjectSession>) {
  const requesting = requestAiProposal(session);
  const completed = transitionProjectSession(requesting.session, {
    type: "complete-ai-proposal-request",
    token: requesting.outcome.token,
    proposal: pendingAiProposal
  });
  if (completed.outcome.status !== "successful") throw new Error("expected pending AI proposal completion");
  return completed;
}

{
  const readyLineArt = createProjectSession({
    ...lifecycleProject,
    analysis: {
      ...analysis,
      traceQuality: { ...analysis.traceQuality, detailExtractionModeUsed: "rendered" as const }
    },
    inputReadiness: "ready-line-art" as const
  });
  const missingCutLine = createProjectSession({
    ...lifecycleProject,
    analysis: { ...analysis, outerCutPath: "   " }
  });
  const missingSourceImage = createProjectSession({
    ...lifecycleProject,
    sourceImage: null
  });
  const eligible = createProjectSession(lifecycleProject);

  assertDeepEqual(projectSessionView(readyLineArt).project.analysis, {
    ...analysis,
    traceQuality: { ...analysis.traceQuality, detailExtractionModeUsed: "rendered" as const }
  }, "explicit input readiness should not alter the durable analysis shape");
  assertEqual(projectSessionView(readyLineArt).capabilities.aiProposal.canBeginRequest, true, "Ready Line Art should expose an explicit simplification request capability");
  assertEqual(projectSessionView(missingCutLine).capabilities.aiProposal.canBeginRequest, false, "AI proposal request capability should require a valid Cut Line");
  assertEqual(projectSessionView(missingSourceImage).capabilities.aiProposal.canBeginRequest, false, "AI proposal request capability should require a current Source Image");
  assertEqual(projectSessionView(eligible).capabilities.aiProposal.canBeginRequest, true, "Needs Simplification should expose AI proposal request capability");

  const beginReadyLineArt = transitionProjectSession(readyLineArt, { type: "begin-ai-proposal-request" });
  assertEqual(beginReadyLineArt.outcome.status, "applied", "Ready Line Art should begin an explicit simplification request at the public seam");

  const missingSourceBeginRejected = transitionProjectSession(missingSourceImage, { type: "begin-ai-proposal-request" });
  assertEqual(missingSourceBeginRejected.outcome.status, "rejected", "missing Source Image should reject AI proposal request attempts at the public seam");

  const forcedMissingSourceConfirming = {
    ...missingSourceImage,
    aiProposal: { status: "confirming" as const, estimatedCostUsd: 0.10 }
  };
  const missingSourceConfirmRejected = transitionProjectSession(forcedMissingSourceConfirming, {
    type: "confirm-ai-proposal-request",
    estimatedCostUsd: 0.10,
    uploadConfirmed: true
  });
  assertEqual(missingSourceConfirmRejected.outcome.status, "rejected", "missing Source Image should reject AI proposal confirmation even if the view attempts it directly");
}

{
  const session = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "colors" as const, lineworkReviewed: true, colorsOutcome: "incomplete" as const }
  });
  const confirming = transitionProjectSession(session, { type: "begin-ai-proposal-request" });

  assertEqual(confirming.outcome.status, "applied", "beginning an AI proposal request should expose a transient applied outcome");
  assertEqual(confirming.session.revision, session.revision, "beginning AI proposal confirmation should not advance the Project Revision");
  assertEqual(projectSessionView(confirming.session).aiProposal.status, "confirming", "beginning an AI proposal request should enter confirmation state");
  assertEqual(projectSessionView(confirming.session).capabilities.aiProposal.canConfirmRequest, true, "confirmation state should expose request confirmation capability");

  const wrongCost = transitionProjectSession(confirming.session, {
    type: "confirm-ai-proposal-request",
    estimatedCostUsd: 0.11,
    uploadConfirmed: true
  });
  assertEqual(wrongCost.outcome.status, "rejected", "request confirmation should require the exact disclosed cost");

  const missingUploadConfirmation = transitionProjectSession(confirming.session, {
    type: "confirm-ai-proposal-request",
    estimatedCostUsd: 0.10,
    uploadConfirmed: false
  });
  assertEqual(missingUploadConfirmation.outcome.status, "rejected", "request confirmation should require upload confirmation");

  const requesting = transitionProjectSession(confirming.session, {
    type: "confirm-ai-proposal-request",
    estimatedCostUsd: 0.10,
    uploadConfirmed: true
  });
  assertEqual(requesting.outcome.status, "requesting", "a valid confirmation should begin one AI proposal request");
  assertEqual(projectSessionView(requesting.session).aiProposal.status, "requesting", "a valid confirmation should expose requesting state");
  assertEqual(requesting.session.revision, session.revision, "requesting an AI proposal should not advance the Project Revision");
  assertEqual(projectSessionView(requesting.session).capabilities.guidedWorkflow.steps.find((item) => item.step === "colors")?.status, "locked", "a requesting proposal should lock Colors through session capabilities");
  assertEqual(projectSessionView(requesting.session).capabilities.guidedWorkflow.steps.find((item) => item.step === "export")?.status, "locked", "a requesting proposal should lock Export through session capabilities");

  const duplicateRequest = transitionProjectSession(requesting.session, { type: "begin-ai-proposal-request" });
  assertEqual(duplicateRequest.outcome.status, "rejected", "an in-flight proposal request should reject a duplicate request attempt");
}

{
  const session = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "colors" as const, lineworkReviewed: true, colorsOutcome: "incomplete" as const }
  });
  const requesting = requestAiProposal(session);
  const failed = transitionProjectSession(requesting.session, {
    type: "fail-ai-proposal-request",
    token: requesting.outcome.token,
    error: "Unable to generate the AI proposal."
  });

  assertEqual(failed.outcome.status, "failed", "AI proposal request failure should report transient failure");
  assertEqual(failed.session.revision, session.revision, "AI proposal request failure should preserve the Project Revision");
  assertEqual(failed.session.project, session.project, "AI proposal request failure should preserve durable project state");
  assertEqual(projectSessionView(failed.session).aiProposal.status, "failed", "AI proposal request failure should remain visible on the session");
  assertEqual(failed.effects.length, 0, "AI proposal request failure should not request persistence or retries");
}

{
  const session = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const requesting = requestAiProposal(session);
  assertEqual(projectSessionView(requesting.session).capabilities.exportProject, false, "a requesting proposal should remove Export capability even when Export was already active");
  const requestingExport = transitionProjectSession(requesting.session, { type: "request-export" });
  assertEqual(requestingExport.outcome.status, "rejected", "a requesting proposal should reject direct Export requests even when Export was already active");
  const completed = transitionProjectSession(requesting.session, {
    type: "complete-ai-proposal-request",
    token: requesting.outcome.token,
    proposal: pendingAiProposal
  });
  assertEqual(completed.outcome.status, "successful", "AI proposal completion should expose successful transient status");
  assertEqual(projectSessionView(completed.session).aiProposal.status, "ready", "completed AI proposal requests should expose review-ready session state");
  assertEqual(projectSessionView(completed.session).capabilities.exportProject, false, "a pending proposal review should keep Export capability unavailable on the active Export step");
  const pendingExport = transitionProjectSession(completed.session, { type: "request-export" });
  assertEqual(pendingExport.outcome.status, "rejected", "a pending proposal review should reject direct Export requests on the active Export step");
  assertEqual(projectSessionView(completed.session).capabilities.aiProposal.canAccept, false, "acceptance should stay unavailable until all review views are recorded");

  const overlayReviewed = transitionProjectSession(completed.session, { type: "review-ai-proposal-view", view: "original-overlay" });
  const printReviewed = transitionProjectSession(overlayReviewed.session, { type: "review-ai-proposal-view", view: "print-preview" });
  const reviewView = projectSessionView(printReviewed.session);
  const bypassReview = projectSessionView(completed.session).aiProposal;
  const originalReviewedProposalDetail = pendingAiProposal.proposalDetailPngDataUrl;
  if (bypassReview.status !== "ready") throw new Error("expected ready AI proposal state");
  (bypassReview.review.reviewedViews as { add?: (view: unknown) => void }).add?.("original-overlay");
  (bypassReview.review.reviewedViews as { add?: (view: unknown) => void }).add?.("print-preview");
  const bypassedAcceptance = transitionProjectSession(completed.session, { type: "accept-ai-proposal" });
  const proposalMutationTarget = projectSessionView(printReviewed.session).aiProposal;
  if (proposalMutationTarget.status !== "ready") throw new Error("expected ready AI proposal state");
  try {
    (proposalMutationTarget.proposal as { proposalDetailPngDataUrl: string }).proposalDetailPngDataUrl = "data:image/png;base64,injected-detail";
  } catch (error) {
    assert(error instanceof TypeError, "mutating a frozen proposal snapshot should throw a TypeError when strict-mode assignment is attempted");
  }
  const acceptedAfterProposalMutation = transitionProjectSession(printReviewed.session, { type: "accept-ai-proposal" });

  assertEqual(reviewView.capabilities.aiProposal.canAccept, true, "all required review views should unlock proposal acceptance");
  assertEqual(bypassedAcceptance.outcome.status, "rejected", "mutating leaked review state must not unlock direct proposal acceptance");
  assertEqual(acceptedAfterProposalMutation.outcome.status, "applied", "a legitimately reviewed proposal should still be accepted");
  assertEqual(acceptedAfterProposalMutation.session.project.editedDetailPngDataUrl, originalReviewedProposalDetail, "acceptance must use the original reviewed proposal detail snapshot");
  assertEqual(acceptedAfterProposalMutation.editorTransaction?.after.editedDetailPngDataUrl, originalReviewedProposalDetail, "the editor transaction must also record the original reviewed proposal detail snapshot");
  assertEqual(reviewView.capabilities.guidedWorkflow.steps.find((item) => item.step === "colors")?.status, "locked", "pending proposal review should lock Colors");

  const bypassedNavigation = transitionProjectSession(completed.session, { type: "navigate-workflow", target: "colors" });
  assertEqual(bypassedNavigation.outcome.status, "rejected", "pending proposal review should reject Colors navigation through the same session policy");
  const bypassedColorReview = transitionProjectSession(completed.session, { type: "complete-color-review", outcome: "reviewed" });
  assertEqual(bypassedColorReview.outcome.status, "rejected", "pending proposal review should reject color review completion through the same session policy");

  const accepted = transitionProjectSession(printReviewed.session, { type: "accept-ai-proposal" });
  const acceptedView = projectSessionView(accepted.session);
  assertEqual(accepted.outcome.status, "applied", "accepting a fully reviewed proposal should apply");
  assertEqual(accepted.session.revision, session.revision + 1, "accepting a proposal should create one Project Revision");
  assertEqual(accepted.effects.length, 1, "accepting a proposal should request one Autosave");
  assertEqual(accepted.session.project.editedDetailPngDataUrl, pendingAiProposal.proposalDetailPngDataUrl, "accepting a proposal should replace only accepted Detail Lines");
  assertEqual(accepted.session.project.manualStrokes, session.project.manualStrokes, "accepting a proposal should preserve Feature Lines");
  assertEqual(accepted.session.project.projectPalette, session.project.projectPalette, "accepting a proposal should preserve paint work");
  assertDeepEqual(accepted.session.project.workflowProgress, {
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "accepting a proposal should revoke stale milestones and return to Clean Lines");
  assertEqual(acceptedView.aiProposal.status, "ready", "accepting a proposal should preserve accepted review state at runtime");
  if (acceptedView.aiProposal.status !== "ready") throw new Error("expected accepted ready AI proposal state");
  assertEqual(acceptedView.aiProposal.review.decision, "accepted", "accepting a proposal should preserve the accepted review decision at runtime");
  assertEqual(acceptedView.capabilities.aiProposal.canAccept, false, "accepted proposal state must not remain applicable twice");
  assertEqual(acceptedView.capabilities.aiProposal.canBeginRequest, true, "accepted proposal state should allow another explicit attempt");
  assertEqual(acceptedView.capabilities.guidedWorkflow.canCompleteLineworkReview, true, "accepted proposal state should not keep the workflow blocked");
  assertEqual(accepted.editorTransaction?.before.editedDetailPngDataUrl, session.project.editedDetailPngDataUrl, "accepting a proposal should expose one editor transaction before state");
  assertEqual(accepted.editorTransaction?.after.editedDetailPngDataUrl, pendingAiProposal.proposalDetailPngDataUrl, "accepting a proposal should expose one editor transaction after state");
  const secondAccept = transitionProjectSession(accepted.session, { type: "accept-ai-proposal" });
  assertEqual(secondAccept.outcome.status, "rejected", "accepted proposal state must reject a second direct acceptance attempt");
}

{
  const session = createProjectSession({ ...lifecycleProject, editedDetailPngDataUrl: null });
  const completed = completePendingAiProposal(session);
  const overlayReviewed = transitionProjectSession(completed.session, { type: "review-ai-proposal-view", view: "original-overlay" });
  const printReviewed = transitionProjectSession(overlayReviewed.session, { type: "review-ai-proposal-view", view: "print-preview" });
  const accepted = transitionProjectSession(printReviewed.session, { type: "accept-ai-proposal" });

  assertEqual(
    accepted.editorTransaction?.before.editedDetailPngDataUrl,
    analysis.detailLinePngDataUrl,
    "accepting over an unedited starter layer should expose the visible starter Detail Lines as the Undo artifact"
  );
}

{
  const session = createProjectSession({
    ...lifecycleProject,
    traceMode: "paint" as const,
    referenceOpacity: 61,
    layerVisibility: preservedProjectFields.layerVisibility,
    traceViewport: preservedProjectFields.traceViewport
  });
  const requesting = requestAiProposal(session);
  const reviewOnly = transitionProjectSession(requesting.session, {
    type: "complete-ai-proposal-request",
    token: requesting.outcome.token,
    proposal: reviewOnlyAiProposal
  });
  const overlayReviewed = transitionProjectSession(reviewOnly.session, { type: "review-ai-proposal-view", view: "original-overlay" });
  const printReviewed = transitionProjectSession(overlayReviewed.session, { type: "review-ai-proposal-view", view: "print-preview" });

  assertEqual(projectSessionView(printReviewed.session).capabilities.aiProposal.canAccept, false, "review-only proposals must never expose acceptance");
  const bypassedAcceptance = transitionProjectSession(printReviewed.session, { type: "accept-ai-proposal" });
  assertEqual(bypassedAcceptance.outcome.status, "rejected", "review-only proposals should reject direct acceptance attempts");
  assertEqual(bypassedAcceptance.session.project.editedDetailPngDataUrl, session.project.editedDetailPngDataUrl, "rejected review-only acceptance should preserve accepted Detail Lines");
}

{
  const session = createProjectSession(lifecycleProject);
  const pending = completePendingAiProposal(session);
  const rejected = transitionProjectSession(pending.session, { type: "reject-ai-proposal" });

  assertEqual(rejected.outcome.status, "applied", "rejecting a proposal should update only transient session state");
  assertEqual(rejected.session.revision, session.revision, "rejecting a proposal should preserve the Project Revision");
  assertEqual(rejected.session.project, session.project, "rejecting a proposal should preserve durable project state");
  assertEqual(projectSessionView(rejected.session).aiProposal.status, "ready", "rejecting a proposal should remain visible only as transient review state");
}

{
  const session = createProjectSession(lifecycleProject);
  const requesting = requestAiProposal(session);
  const renamed = transitionProjectSession(requesting.session, {
    type: "rename-project",
    projectName: "Coraline renamed"
  });
  const completedAfterRename = transitionProjectSession(renamed.session, {
    type: "complete-ai-proposal-request",
    token: requesting.outcome.token,
    proposal: pendingAiProposal
  });
  assertEqual(completedAfterRename.outcome.status, "successful", "non-conflicting project changes should not stale an AI proposal result");

  const requestingAgain = requestAiProposal(createProjectSession(lifecycleProject));
  const conflictingLinework = transitionProjectSession(requestingAgain.session, {
    type: "commit-editor-transaction",
    outcome: {
      editedDetailPngDataUrl: "data:image/png;base64,changed-before-complete",
      manualStrokes: lifecycleProject.manualStrokes
    }
  });
  const stale = transitionProjectSession(conflictingLinework.session, {
    type: "complete-ai-proposal-request",
    token: requestingAgain.outcome.token,
    proposal: pendingAiProposal
  });
  assertEqual(stale.outcome.status, "stale", "accepted-linework changes should stale older AI proposal results");
  assertEqual(projectSessionView(conflictingLinework.session).aiProposal.status, "idle", "accepted-linework changes should clear transient proposal state");
}

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
  const session = createProjectSession({
    ...lifecycleProject,
    traceMode: "paint" as const,
    referenceOpacity: 61,
    layerVisibility: preservedProjectFields.layerVisibility,
    traceViewport: preservedProjectFields.traceViewport
  });
  const matching = transitionProjectSession(session, {
    type: "begin-project-paint-match",
    id: session.project.projectPalette[0].id
  });
  const preparing = transitionProjectSession(matching.session, { type: "begin-project-preparation", operation: "replace-source" });
  if (preparing.outcome.status !== "preparing") throw new Error("expected a preparation token");
  const replacementAnalysis = {
    ...analysis,
    previewPngDataUrl: "data:image/png;base64,replacement-preview",
    outerCutPath: "M 5 5 L 105 5 L 105 155 L 5 155 Z",
    palette: [{ index: 0, hex: "#2563eb", weight: 1, matches: [] }]
  };
  const replacementPalette = [
    projectPaintColor({
      id: "detected-1-2563eb",
      hex: "#2563eb",
      label: "New source blue",
      coverage: 1,
      matches: [bluePaintMatch]
    })
  ];
  const completed = transitionProjectSession(preparing.session, {
    type: "complete-source-analysis",
    token: preparing.outcome.token,
    mode: "replace-source",
    projectName: "New Character",
    sourceImage: { name: "new-character.png", type: "image/png", dataUrl: "data:image/png;base64,new-source" },
    settings: { ...settings, templateStyle: "manual" },
    analysis: replacementAnalysis,
    initialDetailPngDataUrl: null,
    initialProjectPalette: replacementPalette,
    openEditorAfterCompletion: true
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
  assertEqual(completed.session.project.traceMode, "manual", "replacement should install Trace Mode in the same transition");
  assertEqual(completed.session.project.referenceOpacity, 61, "replacement should preserve underlay opacity atomically");
  assertEqual(completed.session.project.layerVisibility?.showReference, true, "replacement should derive editor visibility inside Project Session");
  assertDeepEqual(completed.session.project.traceViewport, { zoom: 1, panX: 0, panY: 0 }, "replacement should reset the durable viewport atomically");
  assertEqual(projectSessionView(completed.session).aiProposal.status, "idle", "replacement should clear transient proposal state");
  assertEqual(projectSessionView(completed.session).paintMatch.status, "idle", "replacement should clear transient paint match state");
  assertEqual(completed.effects[0]?.type, "request-autosave", "replacement should request one Autosave");
  const installedLabel = completed.session.project.projectPalette[0].label;
  const installedMatchName = completed.session.project.projectPalette[0].matches[0].colorName;
  replacementPalette[0].label = "Mutated after completion";
  replacementPalette[0].matches[0].colorName = "Mutated match after completion";
  assertEqual(completed.session.project.projectPalette[0].label, installedLabel, "source completion should snapshot incoming palette entries");
  assertEqual(completed.session.project.projectPalette[0].matches[0].colorName, installedMatchName, "source completion should snapshot incoming paint matches");
  assertEqual(completed.session.revision, 1, "external mutation after source completion should not create an untracked Project Revision");
}

{
  const session = createProjectSession({
    ...lifecycleProject,
    traceMode: "paint" as const
  });
  const changed = transitionProjectSession(session, {
    type: "update-non-size-settings",
    settings: { ...settings, templateStyle: "manual" }
  });
  assertEqual(changed.outcome.status, "applied", "changing trace settings should apply");
  assertEqual(changed.session.project.traceMode, "manual", "Trace Mode should remain synchronized with template style in one transition");
  assertEqual(changed.session.revision, session.revision + 1, "changing trace settings should advance one Project Revision");
  assertEqual(changed.effects.length, 1, "changing trace settings should request one Autosave");
}

{
  const session = createProjectSession({ ...lifecycleProject, ...preservedProjectFields });
  const opacity = transitionProjectSession(session, { type: "set-reference-opacity", referenceOpacity: 67 });
  assertEqual(opacity.session.project.referenceOpacity, 67, "underlay opacity should cross a named Project Session action");
  const visibility = transitionProjectSession(opacity.session, {
    type: "set-layer-visibility",
    layer: "showSuggestions",
    visible: true
  });
  assertEqual(visibility.session.project.layerVisibility?.showSuggestions, true, "layer visibility should cross a named Project Session action");
  assertEqual(visibility.session.project.layerVisibility?.printPreview, false, "durable visibility should exclude transient Print Preview");
  const viewport = transitionProjectSession(visibility.session, {
    type: "set-trace-viewport",
    traceViewport: { zoom: 2, panX: 5, panY: -4 }
  });
  assertDeepEqual(viewport.session.project.traceViewport, { zoom: 2, panX: 5, panY: -4 }, "viewport gestures should commit through a named Project Session action");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    traceMode: "paint" as const,
    traceViewport: { zoom: 1.8, panX: 22, panY: -11 }
  });
  const invalidated = transitionProjectSession(reviewed, {
    type: "invalidate-analysis-for-detail-settings",
    detailCleanup: 55
  });
  assertEqual(invalidated.outcome.status, "applied", "interior-detail changes should invalidate generated analysis atomically");
  assertEqual(invalidated.session.project.analysis, null, "interior-detail changes should clear stale analysis");
  assertEqual(invalidated.session.project.editedDetailPngDataUrl, null, "interior-detail changes should clear stale accepted Detail Lines");
  assertDeepEqual(invalidated.session.project.manualStrokes, [], "interior-detail changes should clear source-dependent Feature Lines");
  assertEqual(invalidated.session.project.settings.detailCleanup, 55, "interior-detail changes should install the requested setting");
  assertDeepEqual(invalidated.session.project.traceViewport, { zoom: 1, panX: 0, panY: 0 }, "interior-detail changes should reset the durable viewport");
  assertDeepEqual(invalidated.session.project.projectPalette, reviewed.project.projectPalette, "analysis invalidation should preserve paint work");
  assertDeepEqual(invalidated.session.project.workflowProgress, {
    activeStep: "upload",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "analysis invalidation should normalize Workflow Progress once");
  assertEqual(invalidated.session.revision, reviewed.revision + 1, "analysis invalidation should create one Project Revision");
  assertEqual(invalidated.effects.length, 0, "analysis invalidation should not Autosave a project while prepared analysis is absent");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    traceMode: "paint" as const,
    layerVisibility: {
      showReference: false,
      showCutline: true,
      showManualLines: false,
      showSuggestions: true,
      printPreview: false
    }
  });
  const switched = transitionProjectSession(reviewed, {
    type: "switch-to-blank-trace-studio"
  });
  assertEqual(switched.outcome.status, "applied", "switching to blank Trace Studio should apply once");
  assertEqual(switched.session.project.traceMode, "manual", "blank Trace Studio should install manual Trace Mode");
  assertEqual(switched.session.project.settings.templateStyle, "manual", "blank Trace Studio should install manual trace settings");
  assertDeepEqual(switched.session.project.manualStrokes, [], "blank Trace Studio should clear Feature Lines atomically");
  assertEqual(switched.session.project.editedDetailPngDataUrl, reviewed.project.editedDetailPngDataUrl, "blank Trace Studio should preserve accepted generated Detail Lines for later reuse");
  assertDeepEqual(switched.session.project.layerVisibility, {
    showReference: true,
    showCutline: true,
    showManualLines: true,
    showSuggestions: false,
    printPreview: false
  }, "blank Trace Studio should install its saved workspace visibility atomically");
  assertEqual(switched.session.revision, reviewed.revision + 1, "blank Trace Studio should create one Project Revision");
  assertEqual(switched.effects.length, 1, "blank Trace Studio should request one Autosave");
  assertEqual(switched.editorTransaction?.before.manualStrokes, reviewed.project.manualStrokes, "blank Trace Studio should expose the prior Feature Lines for one Undo entry");
  assertDeepEqual(switched.editorTransaction?.after.manualStrokes, [], "blank Trace Studio should expose the cleared Feature Lines for one Undo entry");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    traceMode: "paint" as const,
    manualStrokes: [],
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const switched = transitionProjectSession(reviewed, { type: "switch-to-blank-trace-studio" });
  assertDeepEqual(switched.session.project.workflowProgress, {
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  }, "entering blank Trace Studio should revoke stale review even when there were no Feature Lines to clear");
  assertEqual(switched.editorTransaction, undefined, "mode-only blank Trace Studio should not invent an artifact Undo entry");
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
    openEditorAfterCompletion: false,
    initialProjectPalette: [
      projectPaintColor({
        id: "detected-2-facc15",
        hex: "#facc15",
        label: "Regenerated yellow",
        coverage: 0.24,
        matches: [yellowPaintMatch]
      })
    ]
  });

  assertEqual(completed.outcome.status, "successful", "same-source regeneration should expose successful status");
  assertEqual(completed.session.project.sourceImage, lifecycleProject.sourceImage, "same-source regeneration should preserve the Source Image");
  assertDeepEqual(completed.session.project.manualStrokes, lifecycleProject.manualStrokes, "same-source regeneration should preserve manual Feature Lines");
  assertEqual(completed.session.project.analysis, regeneratedAnalysis, "same-source regeneration should install the new analysis");
  assertEqual(completed.session.project.editedDetailPngDataUrl, "data:image/png;base64,regenerated-imported-detail", "same-source regeneration should replace generated detail work");
  assertEqual(completed.session.project.workflowProgress.lineworkReviewed, false, "regeneration should invalidate stale linework review");
  assertEqual(completed.session.project.workflowProgress.colorsOutcome, "incomplete", "regeneration should invalidate stale color review");
  assertEqual(projectSessionView(completed.session).aiProposal.status, "idle", "regeneration should clear transient proposal state");
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
    initialProjectPalette: [],
    openEditorAfterCompletion: false
  });
  assertEqual(stale.outcome.status, "stale", "an older out-of-order result should be rejected as stale");
  assertEqual(stale.session.project, second.session.project, "an older out-of-order result should not overwrite the project");
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
    initialProjectPalette: [],
    openEditorAfterCompletion: false
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
    initialProjectPalette: [],
    openEditorAfterCompletion: false
  });
  assertEqual(stale.outcome.status, "stale", "the existing preparation token should still reject results from an older Project Revision");
  assertEqual(stale.session.project.settings.threshold, 61, "a stale preparation result should preserve the newer settings revision");
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
    cleanupChecks: { cutline: false, remove: false, draw: false, export: false }
  };
  const confirmed = transitionProjectSession(session, { type: "confirm-new-project", project: emptyProject });
  assertEqual(confirmed.outcome.status, "successful", "confirmed new project should expose successful status");
  assertEqual(confirmed.session.revision, 1, "confirmed new project should advance the Project Revision");
  assertDeepEqual(confirmed.session.project, emptyProject, "confirmed new project should atomically install the empty session");
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
    type: "commit-editor-transaction",
    outcome: {
      editedDetailPngDataUrl: "data:image/png;base64,changed-detail",
      manualStrokes: [{ id: "mouth", points: [{ x: 30, y: 40 }] }]
    }
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
  const proposalPending = completePendingAiProposal(saved.session);
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
  assertEqual(projectSessionView(undone.session).aiProposal.status, "idle", "Undo should not restore cleared proposal-review state after accepted-linework mutation");
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
    type: "commit-editor-transaction",
    outcome: {
      editedDetailPngDataUrl: null,
      manualStrokes: []
    }
  });
  assertEqual(unchanged.outcome.status, "unchanged", "a semantically identical empty linework write should not revoke milestones");
  assertEqual(unchanged.session, empty, "an identical linework write should preserve revision and progress");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const added = transitionProjectSession(reviewed, {
    type: "add-project-paint-color",
    hex: "#123456",
    label: "Trim",
    note: "buttons"
  });
  assertEqual(added.outcome.status, "applied", "adding a manual paint color should apply through Project Session");
  assertEqual(added.session.revision, reviewed.revision + 1, "adding a manual paint color should create one Project Revision");
  assertEqual(added.effects.length, 1, "adding a manual paint color should request one Autosave");
  assertEqual(added.session.project.workflowProgress?.colorsOutcome, "reviewed", "adding a manual paint color after Colors review should retain the milestone");
  const addedColor = added.session.project.projectPalette.at(-1);
  assert(addedColor, "a manual paint color should be appended");
  assertEqual(
    (added.outcome as { createdPaintColorId?: string }).createdPaintColorId,
    addedColor.id,
    "adding a manual paint color should report the created stable color identity"
  );
  assertEqual(addedColor.source, "manual", "added colors should be manual palette entries");
  assertEqual(addedColor.hex, "#123456", "added colors should normalize their hex");

  const removed = transitionProjectSession(added.session, {
    type: "remove-project-paint-color",
    id: addedColor.id
  });
  assertEqual(removed.outcome.status, "applied", "removing a paint color should apply");
  assertEqual(removed.session.project.workflowProgress?.colorsOutcome, "reviewed", "removing a paint color after Colors review should retain the milestone");
  assert(!removed.session.project.projectPalette.some((color) => color.id === addedColor.id), "removed colors should leave the palette");

  const readded = transitionProjectSession(removed.session, {
    type: "add-project-paint-color",
    hex: "#123456",
    label: "Trim",
    note: "buttons"
  });
  const readdedColor = readded.session.project.projectPalette.at(-1);
  assert(readdedColor, "re-adding should append a new color");
  assert(readdedColor.id !== addedColor.id, "removing and re-adding a manual color should not reuse palette identity");

  const invalidAdd = transitionProjectSession(reviewed, {
    type: "add-project-paint-color",
    hex: "#12",
    label: "Broken"
  });
  assertEqual(invalidAdd.outcome.status, "rejected", "invalid manual paint hex should reject at the session seam");
  if (invalidAdd.outcome.status !== "rejected") throw new Error("expected invalid add rejection");
  assertEqual(invalidAdd.outcome.error.code, "invalid-paint-hex", "invalid manual paint hex should report a clear rejection code");
  assertEqual(invalidAdd.outcome.error.message, "Enter a valid 3- or 6-digit hex color.", "invalid manual paint hex should report a clear rejection message");
  assertEqual(invalidAdd.session, reviewed, "invalid manual paint hex should preserve the current session");
  assertEqual(invalidAdd.effects.length, 0, "invalid manual paint hex should not request Autosave");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const updateTarget = reviewed.project.projectPalette[1];
  const updated = transitionProjectSession(reviewed, {
    type: "update-project-paint-color",
    id: updateTarget.id,
    patch: {
      included: false,
      label: "Blue coat",
      hex: "#2563EB",
      note: "trim and hood",
      selectedMatchId: null,
      manualOverride: "Choose in store",
      locked: true
    }
  });
  assertEqual(updated.outcome.status, "applied", "updating a targeted paint color should apply");
  assertEqual(updated.session.project.projectPalette[1].included, false, "targeted updates should patch inclusion only on the requested color");
  assertEqual(updated.session.project.projectPalette[1].label, "Blue coat", "targeted updates should patch label only on the requested color");
  assertEqual(updated.session.project.projectPalette[1].hex, "#2563eb", "targeted updates should normalize the requested hex");
  assertEqual(updated.session.project.projectPalette[1].manualOverride, "Choose in store", "targeted updates should patch manual override only on the requested color");
  assertEqual(updated.session.project.projectPalette[1].locked, true, "targeted updates should patch lock state only on the requested color");
  assertEqual(updated.session.project.projectPalette[0], reviewed.project.projectPalette[0], "targeted updates should preserve other palette entries");

  const invalidUpdate = transitionProjectSession(reviewed, {
    type: "update-project-paint-color",
    id: updateTarget.id,
    patch: { hex: "#1" }
  });
  assertEqual(invalidUpdate.outcome.status, "rejected", "invalid targeted paint hex should reject at the session seam");
  if (invalidUpdate.outcome.status !== "rejected") throw new Error("expected invalid update rejection");
  assertEqual(invalidUpdate.outcome.error.code, "invalid-paint-hex", "invalid targeted paint hex should report a clear rejection code");
  assertEqual(invalidUpdate.outcome.error.message, "Enter a valid 3- or 6-digit hex color.", "invalid targeted paint hex should report a clear rejection message");
  assertEqual(invalidUpdate.session, reviewed, "invalid targeted paint hex should preserve the current session");
  assertEqual(invalidUpdate.effects.length, 0, "invalid targeted paint hex should not request Autosave");

  const missingUpdate = transitionProjectSession(reviewed, {
    type: "update-project-paint-color",
    id: "missing-color",
    patch: { label: "Missing" }
  });
  assertEqual(missingUpdate.outcome.status, "rejected", "missing paint color updates should reject instead of mutating a different color");
  assertEqual(missingUpdate.session, reviewed, "rejected updates should preserve the whole session");

  const missingRemove = transitionProjectSession(reviewed, {
    type: "remove-project-paint-color",
    id: "missing-color"
  });
  assertEqual(missingRemove.outcome.status, "rejected", "missing paint color removals should reject");
  assertEqual(missingRemove.session, reviewed, "rejected removals should preserve the whole session");

  const ambiguousMerge = transitionProjectSession(reviewed, {
    type: "merge-project-paint-colors",
    ids: [reviewed.project.projectPalette[0].id, reviewed.project.projectPalette[0].id]
  });
  assertEqual(ambiguousMerge.outcome.status, "rejected", "ambiguous merge requests should reject instead of mutating a different color");
  assertEqual(ambiguousMerge.session, reviewed, "rejected merges should preserve the whole session");
}

{
  const duplicateAnalysis = {
    ...analysisWithPalette,
    palette: [
      ...detectedPalette,
      { hex: "#e4cc24", coverage: 0.18, matches: [yellowPaintMatch] }
    ]
  };
  const duplicatePalette = [
    projectPaintColor({
      id: "detected-1-0c143a",
      hex: "#0c143a",
      label: "Hair / outline",
      note: "marker outline",
      coverage: 0.32,
      matches: [navyPaintMatch]
    }),
    projectPaintColor({
      id: "detected-2-f1ce2d",
      hex: "#f1ce2d",
      label: "Raincoat yellow",
      note: "main coat",
      selectedMatchId: yellowPaintMatch.id,
      coverage: 0.24,
      matches: [yellowPaintMatch]
    }),
    projectPaintColor({
      id: "detected-3-e4cc24",
      hex: "#e4cc24",
      label: "Raincoat yellow",
      note: "hood",
      selectedMatchId: yellowPaintMatch.id,
      coverage: 0.18,
      matches: [yellowPaintMatch]
    }),
    defaultProjectPalette[2]
  ];
  const reviewed = createProjectSession({
    ...lifecycleProject,
    analysis: duplicateAnalysis,
    projectPalette: duplicatePalette,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const merged = transitionProjectSession(reviewed, {
    type: "merge-project-paint-colors",
    ids: [duplicatePalette[1].id, duplicatePalette[2].id]
  });
  assertEqual(merged.outcome.status, "applied", "merging palette colors should apply");
  assertEqual(merged.session.project.projectPalette.length, 3, "merging should collapse the selected colors into one durable entry");
  assertEqual(merged.session.project.projectPalette[1].coverage, 0.42, "merging should preserve combined coverage");
  assertEqual(merged.session.project.workflowProgress?.colorsOutcome, "reviewed", "merging after Colors review should retain the milestone");

  const reset = transitionProjectSession(merged.session, { type: "reset-project-palette-from-analysis" });
  assertEqual(reset.outcome.status, "applied", "resetting the palette from current detected analysis should apply");
  assertEqual(reset.session.project.projectPalette.length, duplicateAnalysis.palette.length, "palette reset should restore the current detected colors");
  assert(reset.session.project.projectPalette.every((color) => color.source === "detected"), "palette reset should clear manual colors");
  assertEqual(reset.session.project.workflowProgress?.colorsOutcome, "reviewed", "palette reset after Colors review should retain the milestone");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const begin = transitionProjectSession(reviewed, {
    type: "begin-project-paint-match",
    id: reviewed.project.projectPalette[0].id
  });
  assertEqual(begin.outcome.status, "requesting-paint-match", "beginning a paint match should expose a transient request outcome");
  assertEqual(begin.session.revision, reviewed.revision, "beginning a paint match should not advance the Project Revision");
  assertEqual(projectSessionView(begin.session).paintMatch.status, "requesting", "beginning a paint match should expose transient requesting state");
  assertEqual(projectSessionView(begin.session).paintMatch.token.revision, reviewed.revision, "paint match tokens should carry the originating Project Revision");
  assertEqual(projectSessionView(begin.session).paintMatch.token.colorId, reviewed.project.projectPalette[0].id, "paint match tokens should carry the targeted color identity");
  assertEqual(projectSessionView(begin.session).paintMatch.token.expectedHex, "#0c143a", "paint match tokens should carry the normalized expected hex");

  const failed = transitionProjectSession(begin.session, {
    type: "fail-project-paint-match",
    token: projectSessionView(begin.session).paintMatch.token,
    error: "Unable to match paint colors."
  });
  assertEqual(failed.outcome.status, "failed", "paint match failure should report transient failure");
  assertEqual(failed.session.revision, reviewed.revision, "paint match failure should preserve the Project Revision");
  assertEqual(failed.session.project, reviewed.project, "paint match failure should preserve the durable project state");
  assertEqual(projectSessionView(failed.session).paintMatch.status, "failed", "paint match failure should remain visible only as transient session state");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const begin = transitionProjectSession(reviewed, {
    type: "begin-project-paint-match",
    id: reviewed.project.projectPalette[1].id
  });
  assert(begin.outcome.status === "requesting-paint-match", "paint match begin should return a request token");
  const outOfOrder = transitionProjectSession(begin.session, {
    type: "begin-project-paint-match",
    id: reviewed.project.projectPalette[1].id
  });
  assert(outOfOrder.outcome.status === "requesting-paint-match", "a later paint match request should replace the older in-flight request");
  const olderComplete = transitionProjectSession(outOfOrder.session, {
    type: "complete-project-paint-match",
    token: begin.outcome.token,
    matches: [bluePaintMatch]
  });
  assertEqual(olderComplete.outcome.status, "stale", "older out-of-order paint match results should not win");

  const completed = transitionProjectSession(outOfOrder.session, {
    type: "complete-project-paint-match",
    token: outOfOrder.outcome.token,
    matches: [bluePaintMatch]
  });
  assertEqual(completed.outcome.status, "applied", "the current paint match result should apply as one durable transition");
  assertEqual(completed.session.revision, reviewed.revision + 1, "the current paint match result should advance the Project Revision once");
  assertEqual(completed.effects.length, 1, "the current paint match result should request one Autosave");
  assertEqual(completed.session.project.projectPalette[1].matches[0].id, bluePaintMatch.id, "paint match completion should update only the targeted color suggestions");
  assertEqual(completed.session.project.projectPalette[1].selectedMatchId, null, "paint match completion should clear stale selected matches that no longer exist");
  assertEqual(projectSessionView(completed.session).paintMatch.status, "idle", "successful paint match completion should clear transient paint match state");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const begin = transitionProjectSession(reviewed, {
    type: "begin-project-paint-match",
    id: reviewed.project.projectPalette[0].id
  });
  assert(begin.outcome.status === "requesting-paint-match", "paint match begin should return a request token");
  const malformed = transitionProjectSession(begin.session, {
    type: "complete-project-paint-match",
    token: begin.outcome.token,
    matches: [
      {
        id: "broken-match",
        brand: "Broken",
        line: "Broken",
        colorName: "Broken",
        hex: "#0c143a",
        finish: "matte",
        outdoorRecommended: false,
        retailer: "",
        productUrl: "",
        notes: "",
        distance: 3,
        confidence: "close match"
      },
      {
        id: 42,
        brand: "Broken",
        line: "Broken",
        colorName: "Broken",
        hex: "#ffffff",
        finish: "matte",
        outdoorRecommended: false,
        distance: 3,
        confidence: "close match"
      }
    ] as never
  });
  assertEqual(malformed.outcome.status, "failed", "malformed paint match payloads should be treated as recoverable match failures");
  assertEqual(malformed.session.revision, reviewed.revision, "malformed paint match payloads should not advance the revision");
  assertEqual(malformed.session.project, reviewed.project, "malformed paint match payloads should preserve the durable palette state");
  assertEqual(malformed.effects.length, 0, "malformed paint match payloads should not request Autosave");
  assertEqual(projectSessionView(malformed.session).paintMatch.status, "failed", "malformed paint match payloads should remain transient failure state only");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const begin = transitionProjectSession(reviewed, {
    type: "begin-project-paint-match",
    id: reviewed.project.projectPalette[0].id
  });
  assert(begin.outcome.status === "requesting-paint-match", "paint match begin should return a request token");
  const renamed = transitionProjectSession(begin.session, { type: "rename-project", projectName: "Coraline Revised" });
  assertEqual(projectSessionView(renamed.session).paintMatch.status, "idle", "later durable revisions should clear stale in-flight paint match state");
  const staleAfterRename = transitionProjectSession(renamed.session, {
    type: "complete-project-paint-match",
    token: begin.outcome.token,
    matches: [bluePaintMatch]
  });
  assertEqual(staleAfterRename.outcome.status, "stale", "later unrelated durable revisions should stale older paint match results");

  const beginAgain = transitionProjectSession(reviewed, {
    type: "begin-project-paint-match",
    id: reviewed.project.projectPalette[0].id
  });
  assert(beginAgain.outcome.status === "requesting-paint-match", "paint match begin should return a request token");
  const recolored = transitionProjectSession(beginAgain.session, {
    type: "update-project-paint-color",
    id: reviewed.project.projectPalette[0].id,
    patch: { hex: "#123456" }
  });
  const staleAfterHexChange = transitionProjectSession(recolored.session, {
    type: "complete-project-paint-match",
    token: beginAgain.outcome.token,
    matches: [bluePaintMatch]
  });
  assertEqual(staleAfterHexChange.outcome.status, "stale", "paint match results should reject when the target color hex has changed");

  const beginBeforeReset = transitionProjectSession(reviewed, {
    type: "begin-project-paint-match",
    id: reviewed.project.projectPalette[0].id
  });
  assert(beginBeforeReset.outcome.status === "requesting-paint-match", "paint match begin should return a request token");
  const reset = transitionProjectSession(beginBeforeReset.session, { type: "reset-project-palette-from-analysis" });
  assertEqual(projectSessionView(reset.session).paintMatch.status, "idle", "palette reset should clear transient paint match state");

  const beginBeforeNewProject = transitionProjectSession(reviewed, {
    type: "begin-project-paint-match",
    id: reviewed.project.projectPalette[0].id
  });
  assert(beginBeforeNewProject.outcome.status === "requesting-paint-match", "paint match begin should return a request token");
  const emptyProject = {
    projectName: "Cutout Project",
    settings,
    sourceImage: null,
    analysis: null,
    editedDetailPngDataUrl: null,
    manualStrokes: [],
    projectPalette: [],
    workflowProgress: { activeStep: "upload" as const, lineworkReviewed: false, colorsOutcome: "incomplete" as const },
    cleanupChecks: { cutline: false, remove: false, draw: false, export: false }
  };
  const confirmedNewProject = transitionProjectSession(beginBeforeNewProject.session, {
    type: "confirm-new-project",
    project: emptyProject
  });
  assertEqual(projectSessionView(confirmedNewProject.session).paintMatch.status, "idle", "new-project confirmation should clear transient paint match state");
}

{
  const duplicatePaletteProject = {
    ...lifecycleProject,
    projectPalette: [
      projectPaintColor({ id: "shared", hex: "#0c143a", label: "Hair", matches: [navyPaintMatch] }),
      projectPaintColor({ id: "shared", hex: "#f1ce2d", label: "Coat", matches: [yellowPaintMatch] })
    ]
  };
  let duplicateCreateRejected = false;
  try {
    createProjectSession(duplicatePaletteProject);
  } catch {
    duplicateCreateRejected = true;
  }
  assert(duplicateCreateRejected, "session creation should reject duplicate restored palette IDs");

  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const restorePreparing = transitionProjectSession(reviewed, { type: "begin-project-preparation", operation: "restore-project" });
  if (restorePreparing.outcome.status !== "preparing") throw new Error("expected restore token");
  const restoreRejected = transitionProjectSession(restorePreparing.session, {
    type: "complete-project-restore",
    token: restorePreparing.outcome.token,
    project: duplicatePaletteProject,
    requestAutosave: true
  });
  assertEqual(restoreRejected.outcome.status, "failed", "restoring duplicate palette IDs should fail safely");
  assertEqual(restoreRejected.session.project, reviewed.project, "failed restore should preserve the current active project");

  const invalidSizePreparing = transitionProjectSession(reviewed, { type: "begin-project-preparation", operation: "restore-project" });
  if (invalidSizePreparing.outcome.status !== "preparing") throw new Error("expected invalid-size restore token");
  const invalidSizeRejected = transitionProjectSession(invalidSizePreparing.session, {
    type: "complete-project-restore",
    token: invalidSizePreparing.outcome.token,
    project: {
      ...lifecycleProject,
      settings: { ...settings, finishedHeightIn: 5 }
    },
    requestAutosave: true
  });
  assertEqual(invalidSizeRejected.outcome.status, "failed", "restoring an out-of-range Finished Size should fail inside Project Session");
  assertEqual(invalidSizeRejected.session.project, reviewed.project, "invalid-size restore should preserve the current active project");

  const mismatchPreparing = transitionProjectSession(reviewed, { type: "begin-project-preparation", operation: "restore-project" });
  if (mismatchPreparing.outcome.status !== "preparing") throw new Error("expected mismatched-analysis restore token");
  const mismatchRejected = transitionProjectSession(mismatchPreparing.session, {
    type: "complete-project-restore",
    token: mismatchPreparing.outcome.token,
    project: {
      ...lifecycleProject,
      settings: { ...settings, finishedHeightIn: 48 }
    },
    requestAutosave: true
  });
  assertEqual(mismatchRejected.outcome.status, "failed", "restoring analysis for a different Finished Size should fail inside Project Session");
  assertEqual(mismatchRejected.session.project, reviewed.project, "mismatched-analysis restore should preserve the current active project");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const changedColors = transitionProjectSession(reviewed, {
    type: "update-project-paint-color",
    id: reviewed.project.projectPalette[0].id,
    patch: { label: "Blue coat", note: "trim", included: false, hex: "#2563eb", locked: true }
  });
  assertEqual(changedColors.session.project.workflowProgress?.colorsOutcome, "reviewed", "ordinary color edits should retain completed review");
  assertEqual(changedColors.session.project.workflowProgress?.activeStep, "export", "ordinary color edits should retain Export availability");
  assertEqual(changedColors.session.project.projectPalette[0].label, "Blue coat", "named color updates should patch only the targeted color");
  assertEqual(changedColors.session.project.projectPalette[0].hex, "#2563eb", "named color updates should normalize the targeted hex");
  assertEqual(changedColors.effects.length, 1, "one color edit should produce one Autosave opportunity");

  const restarted = transitionProjectSession(changedColors.session, { type: "restart-color-review" });
  assertDeepEqual(restarted.session.project.workflowProgress, {
    activeStep: "colors",
    lineworkReviewed: true,
    colorsOutcome: "incomplete"
  }, "explicit restart should revoke only the color milestone and return to Colors");
}

{
  const reviewed = createProjectSession({
    ...lifecycleProject,
    workflowProgress: { activeStep: "export" as const, lineworkReviewed: true, colorsOutcome: "reviewed" as const }
  });
  const originalLabel = reviewed.project.projectPalette[0].label;
  const originalMatchName = reviewed.project.projectPalette[0].matches[0].colorName;
  try {
    (reviewed.project.projectPalette[0] as { label: string }).label = "Mutated directly";
  } catch {}
  try {
    (reviewed.project.projectPalette[0].matches[0] as { colorName: string }).colorName = "Mutated match";
  } catch {}
  assertEqual(reviewed.project.projectPalette[0].label, originalLabel, "direct in-place palette mutation should not alter durable session color labels");
  assertEqual(reviewed.project.projectPalette[0].matches[0].colorName, originalMatchName, "direct in-place match mutation should not alter durable session match suggestions");
  assertEqual(reviewed.revision, 0, "direct palette mutation outside a transition should not create a Project Revision");

  const named = transitionProjectSession(reviewed, {
    type: "update-project-paint-color",
    id: reviewed.project.projectPalette[0].id,
    patch: { label: "Updated through action" }
  });
  assertEqual(named.outcome.status, "applied", "named paint actions should remain the supported way to change palette state");
  assertEqual(named.session.revision, reviewed.revision + 1, "named paint actions should create one Project Revision");
  assertEqual(named.effects.length, 1, "named paint actions should request one Autosave opportunity");
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
  const requesting = requestAiProposal(session);
  const requestingWorkflow = projectSessionView(requesting.session).capabilities.guidedWorkflow;
  assertEqual(requestingWorkflow.canCompleteLineworkReview, false, "a requesting proposal should disable displayed Clean Lines completion");
  const requestingBypass = transitionProjectSession(requesting.session, { type: "complete-linework-review" });
  assertEqual(requestingBypass.outcome.status, "rejected", "a requesting proposal should reject Clean Lines completion through the same session policy");
  const requestingPalette = transitionProjectSession(requesting.session, {
    type: "update-project-paint-color",
    id: requesting.session.project.projectPalette[0].id,
    patch: { label: "Blocked" }
  });
  assertEqual(requestingPalette.outcome.status, "rejected", "a requesting proposal should reject Colors mutations through the same session policy");
  assertEqual(requestingPalette.session.project.projectPalette, requesting.session.project.projectPalette, "a requesting proposal should preserve paint work when Colors mutations are rejected");
  const requestingColorGuide = transitionProjectSession(requesting.session, { type: "set-color-guide-included", included: false });
  assertEqual(requestingColorGuide.outcome.status, "rejected", "a requesting proposal should reject Export option mutations through the same session policy");
  assertEqual(requestingColorGuide.session.project.settings.includePaintGuidePage, requesting.session.project.settings.includePaintGuidePage, "a requesting proposal should preserve export settings when rejected");

  const blocked = completePendingAiProposal(session);
  const workflow = projectSessionView(blocked.session).capabilities.guidedWorkflow;
  assertEqual(workflow.steps.find((item) => item.step === "colors")?.status, "locked", "a pending proposal should be represented by session capabilities");
  assertEqual(workflow.canCompleteLineworkReview, false, "a pending proposal review should disable displayed Clean Lines completion");
  const bypassed = transitionProjectSession(blocked.session, { type: "navigate-workflow", target: "colors" });
  assertEqual(bypassed.outcome.status, "rejected", "pending-proposal navigation should be rejected by the same session policy");
  const bypassedLineworkReview = transitionProjectSession(blocked.session, { type: "complete-linework-review" });
  assertEqual(bypassedLineworkReview.outcome.status, "rejected", "pending-proposal review should reject Clean Lines completion through the same session policy");
  const blockedPalette = transitionProjectSession(blocked.session, {
    type: "add-project-paint-color",
    hex: "#222222",
    label: "Blocked ready"
  });
  assertEqual(blockedPalette.outcome.status, "rejected", "a pending proposal review should reject Colors mutations through the same session policy");
  assertEqual(blockedPalette.session.project.projectPalette, blocked.session.project.projectPalette, "a pending proposal review should preserve paint work when Colors mutations are rejected");
  const blockedColorGuide = transitionProjectSession(blocked.session, { type: "set-color-guide-included", included: false });
  assertEqual(blockedColorGuide.outcome.status, "rejected", "a pending proposal review should reject Export option mutations through the same session policy");
  assertEqual(blockedColorGuide.session.project.settings.includePaintGuidePage, blocked.session.project.settings.includePaintGuidePage, "a pending proposal review should preserve export settings when rejected");
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
  const matching = transitionProjectSession(session, {
    type: "begin-project-paint-match",
    id: session.project.projectPalette[0].id
  });
  const preparing = transitionProjectSession(matching.session, { type: "begin-project-preparation", operation: "restore-project" });
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
  assertEqual(projectSessionView(restored.session).paintMatch.status, "idle", "restore should clear transient paint match state");
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
