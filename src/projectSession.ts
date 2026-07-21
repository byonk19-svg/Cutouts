import {
  acceptAiProposalReview,
  beginAiProposalReview,
  canAcceptAiProposal,
  rejectAiProposalReview,
  reviewAiProposalView,
  type AiProposalReview,
  type AiProposalReviewView
} from "./aiLineworkReview.ts";
import {
  resizeAnalysisForFinishedHeight,
  type CutoutProjectAnalysis
} from "./cutoutProject.ts";
import type { EditorTransaction } from "./editorTransactions.ts";
import {
  addProjectPaintColor,
  mergeProjectPaintColors,
  removeProjectPaintColor,
  seedProjectPaletteFromDetected,
  updateProjectPaintColor,
  type CraftPaintMatch,
  type ProjectPaintColor
} from "./paintGuide.ts";
import {
  DEFAULT_WORKFLOW_PROGRESS,
  completeColorReview,
  completeLineworkReview,
  invalidateLineworkReview,
  navigateWorkflow,
  normalizeWorkflowProgress,
  workflowStepItems,
  type ColorsOutcome,
  type WorkflowProgress,
  type WorkflowStep,
  type WorkflowStepItem
} from "./guidedWorkflow.ts";
import { DEFAULT_TRACE_VIEWPORT, type TraceViewport } from "./traceViewport.ts";
import { traceModeSettings, type Settings, type TraceMode } from "./traceWorkflow.ts";

const AI_PROPOSAL_ESTIMATE_USD = 0.10;

export type ProjectSessionInputReadiness = "needs-simplification" | "ready-line-art";

export type ProjectSessionLayerVisibility = {
  showReference: boolean;
  showCutline: boolean;
  showManualLines: boolean;
  showSuggestions: boolean;
  printPreview: boolean;
};

export type ProjectSessionProject = {
  projectName: string;
  settings: Settings;
  sourceImage?: ProjectSessionSourceImage | null;
  analysis: CutoutProjectAnalysis | null;
  inputReadiness?: ProjectSessionInputReadiness;
  editedDetailPngDataUrl?: string | null;
  manualStrokes?: readonly unknown[];
  projectPalette?: readonly ProjectPaintColor[];
  workflowProgress?: WorkflowProgress;
  createdAt?: string | null;
  traceMode?: TraceMode;
  referenceOpacity?: number;
  layerVisibility?: ProjectSessionLayerVisibility;
  traceViewport?: TraceViewport;
  cleanupChecks?: {
    cutline: boolean;
    remove: boolean;
    draw: boolean;
    export: boolean;
  };
  unacceptedAiProposal?: unknown | null;
};

export type ProjectSessionSourceImage = {
  name: string;
  type: string;
  dataUrl: string;
};

export type ProjectPreparationOperation = "replace-source" | "regenerate-analysis" | "restore-project";
export type ProjectSourcePreparationOperation = Exclude<ProjectPreparationOperation, "restore-project">;

export type ProjectPreparationToken = {
  revision: number;
  operationId: number;
  operation: ProjectPreparationOperation;
};

export type ProjectSessionAiProposalToken = {
  revision: number;
  proposalRevision: number;
  requestId: number;
};

export type ProjectSessionPaintMatchToken = {
  revision: number;
  colorId: string;
  expectedHex: string;
  requestId: number;
};

export type CraftPaintMatchValidation =
  | { ok: true; matches: readonly CraftPaintMatch[] }
  | { ok: false; message: string };

export type ProjectSessionAiProposalResult = {
  status: "pending-review" | "review-only";
  validationIssues: readonly string[];
  canReplaceAcceptedDetail: false;
  proposalPreviewPngDataUrl: string;
  proposalDetailPngDataUrl: string;
  inkCoverage: number;
  suppressedPixelCount: number;
  previewWidthPx: number;
  previewHeightPx: number;
  model: string;
  provider: string;
  estimatedCostUsd: number;
};

export type ProjectSessionAiProposalState =
  | { status: "idle" }
  | { status: "confirming"; estimatedCostUsd: number }
  | { status: "requesting"; estimatedCostUsd: number; token: ProjectSessionAiProposalToken }
  | { status: "failed"; error: string }
  | { status: "ready"; proposal: ProjectSessionAiProposalResult; review: AiProposalReview };

export type ProjectSessionPaintMatchState =
  | { status: "idle" }
  | { status: "requesting"; token: ProjectSessionPaintMatchToken }
  | { status: "failed"; token: ProjectSessionPaintMatchToken; error: string };

export type ProjectOperationStatus =
  | { status: "idle" }
  | { status: "preparing"; token: ProjectPreparationToken }
  | { status: "failed"; operation: ProjectPreparationOperation; error: string }
  | { status: "successful"; operation: ProjectPreparationOperation | "new-project" }
  | { status: "stale"; operation: ProjectPreparationOperation };

export type ProjectPersistenceHealth =
  | { status: "idle" }
  | { status: "pending"; revision: number; mode: "autosave" | "explicit" }
  | { status: "saved"; revision: number; mode: "autosave" | "explicit" }
  | { status: "failed"; revision: number; mode: "autosave" | "explicit"; error: string };

export type ProjectSession<TProject extends ProjectSessionProject = ProjectSessionProject> = {
  revision: number;
  project: TProject;
  operation: ProjectOperationStatus;
  nextOperationId: number;
  nextPaintColorId: number;
  proposalRevision: number;
  nextAiProposalRequestId: number;
  nextPaintMatchRequestId: number;
  aiProposal: ProjectSessionAiProposalState;
  paintMatch: ProjectSessionPaintMatchState;
  persistence: ProjectPersistenceHealth;
};

export type ProjectSessionEditableArtifact = {
  editedDetailPngDataUrl: string | null;
  manualStrokes: readonly unknown[];
};

export type GuidedWorkflowCapabilities = {
  readonly progress: WorkflowProgress;
  readonly steps: readonly WorkflowStepItem[];
  readonly canCompleteLineworkReview: boolean;
  readonly canCompleteColorReview: boolean;
  readonly canRestartColorReview: boolean;
};

export type AiProposalCapabilities = {
  readonly canBeginRequest: boolean;
  readonly canConfirmRequest: boolean;
  readonly canAccept: boolean;
  readonly canReject: boolean;
};

export type PaintCapabilities = {
  readonly canMutate: boolean;
};

export type ProjectCapabilities = {
  readonly renameProject: boolean;
  readonly changeFinishedSize: boolean;
  readonly selectSourceImage: boolean;
  readonly analyzeSource: boolean;
  readonly regenerateAnalysis: boolean;
  readonly startNewProject: boolean;
  readonly saveProject: boolean;
  readonly exportProject: boolean;
  readonly aiProposal: AiProposalCapabilities;
  readonly paint: PaintCapabilities;
  readonly guidedWorkflow: GuidedWorkflowCapabilities;
};

export type ProjectSessionAction<TProject extends ProjectSessionProject = ProjectSessionProject> =
  | { type: "rename-project"; projectName: string }
  | { type: "change-finished-size"; finishedHeightIn: number }
  | { type: "update-non-size-settings"; settings: Settings }
  | { type: "invalidate-analysis-for-detail-settings"; detailCleanup: number }
  | { type: "switch-to-blank-trace-studio" }
  | { type: "begin-ai-proposal-request" }
  | { type: "cancel-ai-proposal-request" }
  | { type: "confirm-ai-proposal-request"; estimatedCostUsd: number; uploadConfirmed: boolean }
  | { type: "complete-ai-proposal-request"; token: ProjectSessionAiProposalToken; proposal: ProjectSessionAiProposalResult }
  | { type: "fail-ai-proposal-request"; token: ProjectSessionAiProposalToken; error: string }
  | { type: "review-ai-proposal-view"; view: AiProposalReviewView }
  | { type: "reject-ai-proposal" }
  | { type: "accept-ai-proposal" }
  | { type: "navigate-workflow"; target: WorkflowStep }
  | { type: "complete-linework-review" }
  | { type: "complete-color-review"; outcome: Exclude<ColorsOutcome, "incomplete"> }
  | { type: "restart-color-review" }
  | { type: "add-project-paint-color"; hex: string; label: string; note?: string }
  | {
      type: "update-project-paint-color";
      id: string;
      patch: Partial<Pick<ProjectPaintColor, "hex" | "label" | "note" | "included" | "selectedMatchId" | "manualOverride" | "locked">>;
    }
  | { type: "remove-project-paint-color"; id: string }
  | { type: "merge-project-paint-colors"; ids: readonly string[] }
  | { type: "reset-project-palette-from-analysis" }
  | { type: "begin-project-paint-match"; id: string }
  | { type: "complete-project-paint-match"; token: ProjectSessionPaintMatchToken; matches: readonly CraftPaintMatch[] }
  | { type: "fail-project-paint-match"; token: ProjectSessionPaintMatchToken; error: string }
  | {
      type: "commit-editor-transaction";
      outcome: {
        editedDetailPngDataUrl: string | null;
        manualStrokes: readonly unknown[];
      };
    }
  | { type: "set-reference-opacity"; referenceOpacity: number }
  | { type: "set-layer-visibility"; layer: Exclude<keyof ProjectSessionLayerVisibility, "printPreview">; visible: boolean }
  | { type: "set-trace-viewport"; traceViewport: TraceViewport }
  | { type: "set-color-guide-included"; included: boolean }
  | { type: "request-export" }
  | { type: "request-explicit-save" }
  | { type: "persistence-succeeded"; revision: number; mode: "autosave" | "explicit" }
  | { type: "persistence-failed"; revision: number; mode: "autosave" | "explicit"; error: string }
  | { type: "begin-project-preparation"; operation: ProjectPreparationOperation }
  | { type: "complete-project-preparation"; token: ProjectPreparationToken }
  | { type: "fail-project-preparation"; token: ProjectPreparationToken; error: string }
  | {
      type: "complete-source-analysis";
      token: ProjectPreparationToken;
      mode: ProjectSourcePreparationOperation;
      projectName?: string;
      sourceImage?: ProjectSessionSourceImage;
      inputReadiness?: ProjectSessionInputReadiness;
      settings: Settings;
      analysis: CutoutProjectAnalysis;
      initialDetailPngDataUrl: string | null;
      initialProjectPalette: readonly ProjectPaintColor[];
      openEditorAfterCompletion: boolean;
      createdAt?: string;
    }
  | { type: "complete-project-restore"; token: ProjectPreparationToken; project: TProject; requestAutosave: boolean }
  | { type: "cancel-new-project" }
  | { type: "confirm-new-project"; project: TProject };

export type ProjectSessionEffect<TProject extends ProjectSessionProject = ProjectSessionProject> =
  | { type: "request-autosave"; revision: number; project: TProject }
  | { type: "request-explicit-save"; revision: number; project: TProject }
  | { type: "clear-autosave" };

export type ProjectSessionTransition<TProject extends ProjectSessionProject> = {
  session: ProjectSession<TProject>;
  capabilities: ProjectCapabilities;
  outcome:
    | { status: "applied"; createdPaintColorId?: string }
    | { status: "unchanged" }
    | { status: "preparing"; token: ProjectPreparationToken }
    | { status: "requesting"; token: ProjectSessionAiProposalToken }
    | { status: "requesting-paint-match"; token: ProjectSessionPaintMatchToken }
    | { status: "failed"; error: string }
    | { status: "successful" }
    | { status: "stale" }
    | { status: "cancelled" }
    | { status: "save-requested" }
    | { status: "rejected"; error: { code: ProjectSessionRejectionCode; message: string } };
  editorTransaction?: EditorTransaction<ProjectSessionEditableArtifact>;
  effects: readonly ProjectSessionEffect<TProject>[];
};

export type ProjectSessionRejectionCode =
  | "invalid-project-name"
  | "invalid-project-file"
  | "invalid-paint-hex"
  | "invalid-finished-size"
  | "analysis-size-mismatch"
  | "locked-workflow-step"
  | "invalid-cut-line"
  | "linework-review-required"
  | "color-review-required"
  | "ai-proposal-unavailable"
  | "ai-proposal-confirmation-required"
  | "ai-proposal-acceptance-unavailable"
  | "paint-color-target-missing"
  | "paint-color-target-ambiguous"
  | "workflow-blocked";

export type ProjectSessionEffectAdapter<TProject extends ProjectSessionProject = ProjectSessionProject> = {
  requestAutosave: (revision: number, project: TProject) => void;
  requestExplicitSave?: (revision: number, project: TProject) => void;
  clearAutosave?: () => void;
};

export function createProjectSession<TProject extends ProjectSessionProject>(
  project: TProject
): ProjectSession<TProject> {
  const paletteValidation = validateStableProjectPaletteIds(project.projectPalette);
  if (!paletteValidation.ok) throw new Error(paletteValidation.message);
  const normalizedProject = normalizeProjectWorkflow(project);
  return {
    revision: 0,
    project: normalizedProject,
    operation: { status: "idle" },
    nextOperationId: 1,
    nextPaintColorId: deriveNextPaintColorId(normalizedProject.projectPalette),
    proposalRevision: 0,
    nextAiProposalRequestId: 1,
    nextPaintMatchRequestId: 1,
    aiProposal: idleAiProposalState(),
    paintMatch: idlePaintMatchState(),
    persistence: { status: "idle" }
  };
}

export function projectSessionView<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
) {
  return {
    revision: session.revision,
    project: session.project,
    operation: session.operation,
    aiProposal: session.aiProposal,
    paintMatch: session.paintMatch,
    capabilities: projectCapabilities(session)
  };
}

export function transitionProjectSession<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  action: ProjectSessionAction<TProject>
): ProjectSessionTransition<TProject> {
  if (action.type === "request-export") {
    if (!canExportProject(session)) {
      return rejectedTransition(session, "workflow-blocked", "Export is unavailable for the current project state.");
    }
    return {
      session,
      capabilities: projectCapabilities(session),
      outcome: { status: "applied" },
      effects: []
    };
  }
  if (action.type === "request-explicit-save") {
    if (!isPersistableProject(session.project)) {
      return rejectedTransition(session, "invalid-project-file", "The project is not ready to save.");
    }
    const nextSession = {
      ...session,
      persistence: { status: "pending", revision: session.revision, mode: "explicit" } as const
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "save-requested" },
      effects: [{ type: "request-explicit-save", revision: session.revision, project: session.project }]
    };
  }
  if (action.type === "persistence-succeeded" || action.type === "persistence-failed") {
    if (
      action.revision !== session.revision
      || session.persistence.status !== "pending"
      || session.persistence.revision !== action.revision
      || session.persistence.mode !== action.mode
    ) {
      return { session, capabilities: projectCapabilities(session), outcome: { status: "stale" }, effects: [] };
    }
    const persistence = action.type === "persistence-succeeded"
      ? { status: "saved", revision: action.revision, mode: action.mode } as const
      : { status: "failed", revision: action.revision, mode: action.mode, error: action.error } as const;
    const nextSession = { ...session, persistence };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: action.type === "persistence-succeeded"
        ? { status: "successful" }
        : { status: "failed", error: action.error },
      effects: []
    };
  }
  if (action.type === "begin-ai-proposal-request") {
    if (!canBeginAiProposalRequest(session)) {
      return rejectedTransition(session, "ai-proposal-unavailable", "AI proposal requests are not available for the current project state.");
    }
    const nextSession = { ...session, aiProposal: confirmingAiProposalState() };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "applied" },
      effects: []
    };
  }
  if (action.type === "cancel-ai-proposal-request") {
    if (session.aiProposal.status !== "confirming") return unchangedTransition(session);
    const nextSession = { ...session, aiProposal: idleAiProposalState() };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "applied" },
      effects: []
    };
  }
  if (action.type === "confirm-ai-proposal-request") {
    if (session.aiProposal.status !== "confirming" || !canAiProposalRequestPrerequisites(session)) {
      return rejectedTransition(session, "ai-proposal-unavailable", "AI proposal requests are not available for the current project state.");
    }
    if (action.estimatedCostUsd !== AI_PROPOSAL_ESTIMATE_USD || !action.uploadConfirmed) {
      return rejectedTransition(session, "ai-proposal-confirmation-required", "Confirm the exact cost and upload before requesting an AI proposal.");
    }
    const token = Object.freeze({
      revision: session.revision,
      proposalRevision: session.proposalRevision,
      requestId: session.nextAiProposalRequestId
    } satisfies ProjectSessionAiProposalToken);
    const nextSession = {
      ...session,
      nextAiProposalRequestId: session.nextAiProposalRequestId + 1,
      aiProposal: requestingAiProposalState(token)
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "requesting", token },
      effects: []
    };
  }
  if (action.type === "fail-ai-proposal-request") {
    if (!isCurrentAiProposalRequest(session, action.token)) return staleAiProposalTransition(session);
    const nextSession = { ...session, aiProposal: failedAiProposalState(action.error) };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "failed", error: action.error },
      effects: []
    };
  }
  if (action.type === "complete-ai-proposal-request") {
    if (!isCurrentAiProposalRequest(session, action.token)) return staleAiProposalTransition(session);
    const nextSession = {
      ...session,
      aiProposal: readyAiProposalState(action.proposal)
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "successful" },
      effects: []
    };
  }
  if (action.type === "review-ai-proposal-view") {
    if (session.aiProposal.status !== "ready") {
      return rejectedTransition(session, "ai-proposal-unavailable", "There is no AI proposal ready for review.");
    }
    const review = reviewAiProposalView(session.aiProposal.review, action.view);
    if (review === session.aiProposal.review) return unchangedTransition(session);
    const nextSession = {
      ...session,
      aiProposal: readyAiProposalState(session.aiProposal.proposal, review)
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "applied" },
      effects: []
    };
  }
  if (action.type === "reject-ai-proposal") {
    if (session.aiProposal.status !== "ready") {
      return rejectedTransition(session, "ai-proposal-unavailable", "There is no AI proposal ready to reject.");
    }
    const review = rejectAiProposalReview(session.aiProposal.review);
    if (review === session.aiProposal.review) return unchangedTransition(session);
    const nextSession = {
      ...session,
      aiProposal: readyAiProposalState(session.aiProposal.proposal, review)
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "applied" },
      effects: []
    };
  }
  if (action.type === "accept-ai-proposal") {
    if (session.aiProposal.status !== "ready" || !canAcceptAiProposal(session.aiProposal.review)) {
      return rejectedTransition(session, "ai-proposal-acceptance-unavailable", "Review every required AI proposal view before accepting it.");
    }
    const before = editableArtifact(session.project);
    const review = acceptAiProposalReview(session.aiProposal.review);
    const after = {
      editedDetailPngDataUrl: session.aiProposal.proposal.proposalDetailPngDataUrl,
      manualStrokes: session.project.manualStrokes ?? []
    } satisfies ProjectSessionEditableArtifact;
    return applyProjectTransition(session, {
      ...session.project,
      editedDetailPngDataUrl: after.editedDetailPngDataUrl,
      manualStrokes: after.manualStrokes,
      workflowProgress: invalidateLineworkReview(normalizedWorkflowProgress(session.project)),
      cleanupChecks: emptyCleanupChecks()
    } as TProject, {
      proposalChange: "preserve",
      aiProposalOverride: readyAiProposalState(session.aiProposal.proposal, review),
      editorTransaction: { before, after }
    });
  }
  if (action.type === "navigate-workflow") {
    const capabilities = guidedWorkflowCapabilities(session);
    const target = capabilities.steps.find((item) => item.step === action.target);
    if (!target || !target.clickable) {
      return rejectedTransition(session, "locked-workflow-step", `${workflowStepName(action.target)} is locked.`);
    }
    const progress = navigateWorkflow(capabilities.progress, action.target, { hasAnalysis: hasAnalysis(session.project) });
    if (progress.activeStep === capabilities.progress.activeStep) return unchangedTransition(session);
    return applyProjectTransition(session, {
      ...session.project,
      workflowProgress: progress
    } as TProject);
  }
  if (action.type === "complete-linework-review") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    if (!hasValidCutLine(session.project)) {
      return rejectedTransition(session, "invalid-cut-line", "A valid cut line is required before continuing to Colors.");
    }
    const progress = completeLineworkReview(normalizedWorkflowProgress(session.project));
    return applyProjectTransition(session, {
      ...session.project,
      workflowProgress: progress,
      cleanupChecks: {
        ...(session.project.cleanupChecks ?? emptyCleanupChecks()),
        cutline: true,
        remove: true,
        draw: true
      }
    } as TProject);
  }
  if (action.type === "complete-color-review") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    const progress = normalizedWorkflowProgress(session.project);
    if (!progress.lineworkReviewed) {
      return rejectedTransition(session, "linework-review-required", "Review Clean Lines before completing Colors.");
    }
    return applyProjectTransition(session, {
      ...session.project,
      settings: { ...session.project.settings, includePaintGuidePage: action.outcome === "reviewed" },
      workflowProgress: completeColorReview(progress, action.outcome)
    } as TProject);
  }
  if (action.type === "restart-color-review") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before restarting Colors.");
    }
    const progress = normalizedWorkflowProgress(session.project);
    if (!progress.lineworkReviewed) {
      return rejectedTransition(session, "linework-review-required", "Review Clean Lines before restarting Colors.");
    }
    const restarted = { ...progress, activeStep: "colors" as const, colorsOutcome: "incomplete" as const };
    if (sameWorkflowProgress(progress, restarted)) return unchangedTransition(session);
    return applyProjectTransition(session, { ...session.project, workflowProgress: restarted } as TProject);
  }
  if (action.type === "add-project-paint-color") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    const hex = validatePaintHex(action.hex);
    if (!hex.ok) return rejectedTransition(session, "invalid-paint-hex", "Enter a valid 3- or 6-digit hex color.");
    const currentPalette = currentProjectPalette(session.project);
    const nextId = nextManualPaintColorId(currentPalette, session.nextPaintColorId);
    const nextPalette = addProjectPaintColor(currentPalette, {
      id: nextId,
      hex: hex.value,
      label: action.label,
      note: action.note
    });
    const added = applyPaintPaletteTransition(session, nextPalette);
    return added.outcome.status === "applied"
      ? { ...added, outcome: { status: "applied", createdPaintColorId: nextId } }
      : added;
  }
  if (action.type === "update-project-paint-color") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    let patch = action.patch;
    if (typeof patch.hex === "string") {
      const hex = validatePaintHex(patch.hex);
      if (!hex.ok) return rejectedTransition(session, "invalid-paint-hex", "Enter a valid 3- or 6-digit hex color.");
      patch = {
        ...patch,
        hex: hex.value
      };
    }
    const current = findProjectPaintColor(session.project, action.id);
    if (!current) {
      return rejectedTransition(session, "paint-color-target-missing", "The requested paint color no longer exists.");
    }
    const nextPalette = updateProjectPaintColor(currentProjectPalette(session.project), action.id, patch);
    const updated = nextPalette.find((color) => color.id === action.id);
    if (!updated) {
      return rejectedTransition(session, "paint-color-target-missing", "The requested paint color no longer exists.");
    }
    if (sameProjectPaintColor(current, updated)) return unchangedTransition(session);
    return applyPaintPaletteTransition(session, nextPalette);
  }
  if (action.type === "remove-project-paint-color") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    const current = findProjectPaintColor(session.project, action.id);
    if (!current) {
      return rejectedTransition(session, "paint-color-target-missing", "The requested paint color no longer exists.");
    }
    const nextPalette = removeProjectPaintColor(currentProjectPalette(session.project), action.id);
    return applyPaintPaletteTransition(session, nextPalette);
  }
  if (action.type === "merge-project-paint-colors") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    const distinctIds = [...new Set(action.ids)];
    if (distinctIds.length < 2 || distinctIds.length !== action.ids.length) {
      return rejectedTransition(session, "paint-color-target-ambiguous", "Choose at least two different paint colors to merge.");
    }
    const currentPalette = currentProjectPalette(session.project);
    if (!distinctIds.every((id) => currentPalette.some((color) => color.id === id))) {
      return rejectedTransition(session, "paint-color-target-missing", "One or more paint colors no longer exist.");
    }
    const nextPalette = mergeProjectPaintColors(currentPalette, distinctIds);
    if (sameProjectPaintPalette(currentPalette, nextPalette)) return unchangedTransition(session);
    return applyPaintPaletteTransition(session, nextPalette);
  }
  if (action.type === "reset-project-palette-from-analysis") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    if (!session.project.analysis) return unchangedTransition(session);
    const nextPalette = seedProjectPaletteFromDetected(session.project.analysis.palette);
    if (sameProjectPaintPalette(currentProjectPalette(session.project), nextPalette)) return unchangedTransition(session);
    return applyPaintPaletteTransition(session, nextPalette);
  }
  if (action.type === "begin-project-paint-match") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    const target = findProjectPaintColor(session.project, action.id);
    if (!target) {
      return rejectedTransition(session, "paint-color-target-missing", "The requested paint color no longer exists.");
    }
    const token = Object.freeze({
      revision: session.revision,
      colorId: target.id,
      expectedHex: normalizePaintHex(target.hex),
      requestId: session.nextPaintMatchRequestId
    } satisfies ProjectSessionPaintMatchToken);
    const nextSession = {
      ...session,
      nextPaintMatchRequestId: session.nextPaintMatchRequestId + 1,
      paintMatch: requestingPaintMatchState(token)
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "requesting-paint-match", token },
      effects: []
    };
  }
  if (action.type === "fail-project-paint-match") {
    if (!isCurrentPaintMatchRequest(session, action.token)) return stalePaintMatchTransition(session);
    const nextSession = { ...session, paintMatch: failedPaintMatchState(action.token, action.error) };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "failed", error: action.error },
      effects: []
    };
  }
  if (action.type === "complete-project-paint-match") {
    if (!isCurrentPaintMatchRequest(session, action.token)) return stalePaintMatchTransition(session);
    const validatedMatches = validateCraftPaintMatches(action.matches);
    if (!validatedMatches.ok) {
      const nextSession = { ...session, paintMatch: failedPaintMatchState(action.token, validatedMatches.message) };
      return {
        session: nextSession,
        capabilities: projectCapabilities(nextSession),
        outcome: { status: "failed", error: validatedMatches.message },
        effects: []
      };
    }
    const nextPalette = updateProjectPaintColor(currentProjectPalette(session.project), action.token.colorId, {
      matches: [...validatedMatches.matches]
    });
    return applyPaintPaletteTransition(session, nextPalette);
  }
  if (action.type === "invalidate-analysis-for-detail-settings") {
    const traceMode = session.project.traceMode ?? session.project.settings.templateStyle;
    return applyProjectTransition(session, {
      ...session.project,
      settings: nonSizeSettings(session.project.settings, {
        ...session.project.settings,
        detailCleanup: action.detailCleanup,
        detailLines: true,
        templateStyle: traceMode
      }),
      traceMode,
      traceViewport: DEFAULT_TRACE_VIEWPORT,
      analysis: null,
      inputReadiness: undefined,
      editedDetailPngDataUrl: null,
      manualStrokes: []
    } as TProject, { proposalChange: "invalidate" });
  }
  if (action.type === "switch-to-blank-trace-studio") {
    const before = editableArtifact(session.project);
    const after = {
      editedDetailPngDataUrl: session.project.editedDetailPngDataUrl ?? null,
      manualStrokes: []
    } satisfies ProjectSessionEditableArtifact;
    const featureLinesChanged = !sameReadonlyArray(before.manualStrokes, after.manualStrokes);
    const lineworkChanged = session.project.traceMode !== "manual" || featureLinesChanged;
    return applyProjectTransition(session, {
      ...session.project,
      settings: nonSizeSettings(session.project.settings, traceModeSettings("manual", session.project.settings)),
      traceMode: "manual",
      layerVisibility: traceStudioLayerVisibility(),
      manualStrokes: after.manualStrokes,
      ...(lineworkChanged
        ? {
            workflowProgress: invalidateLineworkReview(normalizedWorkflowProgress(session.project)),
            cleanupChecks: emptyCleanupChecks()
          }
        : {})
    } as TProject, {
      proposalChange: lineworkChanged ? "invalidate" : "preserve",
      ...(featureLinesChanged ? { editorTransaction: { before, after } } : {})
    });
  }
  if (action.type === "commit-editor-transaction") {
    const outcome = action.outcome;
    if (
      session.project.editedDetailPngDataUrl === outcome.editedDetailPngDataUrl
      && sameReadonlyArray(session.project.manualStrokes, outcome.manualStrokes)
    ) return unchangedTransition(session);
    return applyProjectTransition(session, {
      ...session.project,
      editedDetailPngDataUrl: outcome.editedDetailPngDataUrl,
      manualStrokes: outcome.manualStrokes,
      workflowProgress: invalidateLineworkReview(normalizedWorkflowProgress(session.project)),
      cleanupChecks: emptyCleanupChecks()
    } as TProject, { proposalChange: "invalidate" });
  }
  if (action.type === "set-reference-opacity") {
    if (session.project.referenceOpacity === action.referenceOpacity) return unchangedTransition(session);
    return applyProjectTransition(session, {
      ...session.project,
      referenceOpacity: action.referenceOpacity
    } as TProject);
  }
  if (action.type === "set-layer-visibility") {
    const current = session.project.layerVisibility ?? defaultLayerVisibility(false);
    if (current[action.layer] === action.visible && current.printPreview === false) return unchangedTransition(session);
    return applyProjectTransition(session, {
      ...session.project,
      layerVisibility: { ...current, [action.layer]: action.visible, printPreview: false }
    } as TProject);
  }
  if (action.type === "set-trace-viewport") {
    if (session.project.traceViewport === action.traceViewport) return unchangedTransition(session);
    return applyProjectTransition(session, {
      ...session.project,
      traceViewport: action.traceViewport
    } as TProject);
  }
  if (action.type === "set-color-guide-included") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    const progress = normalizedWorkflowProgress(session.project);
    if (progress.colorsOutcome === "incomplete" || (progress.colorsOutcome === "skipped" && action.included)) {
      return rejectedTransition(session, "color-review-required", "Complete color review before including the Color Guide.");
    }
    if (session.project.settings.includePaintGuidePage === action.included) return unchangedTransition(session);
    return applyProjectTransition(session, {
      ...session.project,
      settings: { ...session.project.settings, includePaintGuidePage: action.included }
    } as TProject);
  }
  if (action.type === "begin-project-preparation") {
    const token = {
      revision: session.revision,
      operationId: session.nextOperationId,
      operation: action.operation
    } satisfies ProjectPreparationToken;
    const nextSession = {
      ...session,
      operation: { status: "preparing", token } as const,
      nextOperationId: session.nextOperationId + 1
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "preparing", token },
      effects: []
    };
  }
  if (action.type === "fail-project-preparation") {
    if (!isCurrentPreparation(session, action.token)) return staleTransition(session, action.token);
    const nextSession = {
      ...session,
      operation: { status: "failed", operation: action.token.operation, error: action.error } as const
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "failed", error: action.error },
      effects: []
    };
  }
  if (action.type === "complete-project-preparation") {
    if (!isCurrentPreparation(session, action.token)) return staleTransition(session, action.token);
    const nextSession = {
      ...session,
      operation: { status: "successful", operation: action.token.operation } as const
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "successful" },
      effects: []
    };
  }
  if (action.type === "complete-project-restore") {
    if (!isCurrentPreparation(session, action.token) || action.token.operation !== "restore-project") {
      return staleTransition(session, action.token);
    }
    const restoreValidation = validateRestoredProject(action.project);
    if (!restoreValidation.ok) {
      const nextSession = {
        ...session,
        operation: { status: "failed", operation: "restore-project", error: restoreValidation.message } as const
      };
      return {
        session: nextSession,
        capabilities: projectCapabilities(nextSession),
        outcome: { status: "failed", error: restoreValidation.message },
        effects: []
      };
    }
    const revision = session.revision + 1;
    const project = normalizeProjectWorkflow(action.project);
    const nextSession = {
      ...session,
      revision,
      project,
      nextPaintColorId: reconcileNextPaintColorId(session.nextPaintColorId, project.projectPalette),
      proposalRevision: session.proposalRevision + 1,
      aiProposal: idleAiProposalState(),
      paintMatch: idlePaintMatchState(),
      operation: { status: "successful", operation: "restore-project" } as const,
      persistence: action.requestAutosave
        ? { status: "pending", revision, mode: "autosave" } as const
        : { status: "saved", revision, mode: "autosave" } as const
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "successful" },
      effects: action.requestAutosave ? [autosaveEffect(nextSession)] : []
    };
  }
  if (action.type === "complete-source-analysis") {
    if (!isCurrentPreparation(session, action.token) || action.mode !== action.token.operation) {
      return staleTransition(session, action.token);
    }
    if (action.analysis.finishedHeightIn !== action.settings.finishedHeightIn) {
      return rejectedTransition(session, "analysis-size-mismatch", "Analysis does not match the prepared Finished Size.");
    }
    if (action.mode === "replace-source" && (!action.sourceImage || !action.projectName?.trim())) {
      const nextSession = {
        ...session,
        operation: { status: "failed", operation: action.mode, error: "Prepared Source Image was incomplete." } as const
      };
      return {
        session: nextSession,
        capabilities: projectCapabilities(nextSession),
        outcome: { status: "failed", error: "Prepared Source Image was incomplete." },
        effects: []
      };
    }
    const paletteValidation = validateStableProjectPaletteIds(action.initialProjectPalette);
    if (!paletteValidation.ok) {
      const nextSession = {
        ...session,
        operation: { status: "failed", operation: action.mode, error: paletteValidation.message } as const
      };
      return {
        session: nextSession,
        capabilities: projectCapabilities(nextSession),
        outcome: { status: "failed", error: paletteValidation.message },
        effects: []
      };
    }
    const project = {
      ...session.project,
      ...(action.mode === "replace-source"
        ? {
            projectName: action.projectName!.trim(),
            sourceImage: action.sourceImage!,
            ...(action.createdAt ? { createdAt: action.createdAt } : {})
          }
        : {}),
      settings: action.settings,
      analysis: action.analysis,
      inputReadiness: action.inputReadiness ?? deriveInputReadiness(action.analysis),
      editedDetailPngDataUrl: action.initialDetailPngDataUrl,
      manualStrokes: action.mode === "replace-source" ? [] : session.project.manualStrokes,
      projectPalette: snapshotProjectPalette(action.initialProjectPalette),
      traceMode: action.settings.templateStyle,
      layerVisibility: defaultLayerVisibility(action.openEditorAfterCompletion),
      traceViewport: DEFAULT_TRACE_VIEWPORT,
      workflowProgress: { activeStep: "clean", lineworkReviewed: false, colorsOutcome: "incomplete" },
      cleanupChecks: { cutline: false, remove: false, draw: false, export: false }
    } as TProject;
    const revision = session.revision + 1;
    const nextSession = {
      ...session,
      revision,
      project,
      nextPaintColorId: reconcileNextPaintColorId(session.nextPaintColorId, project.projectPalette),
      proposalRevision: session.proposalRevision + 1,
      aiProposal: idleAiProposalState(),
      paintMatch: idlePaintMatchState(),
      operation: { status: "successful", operation: action.mode } as const,
      persistence: { status: "pending", revision, mode: "autosave" } as const
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "successful" },
      effects: [autosaveEffect(nextSession)]
    };
  }
  if (action.type === "cancel-new-project") {
    return {
      session,
      capabilities: projectCapabilities(session),
      outcome: { status: "cancelled" },
      effects: []
    };
  }
  if (action.type === "confirm-new-project") {
    const paletteValidation = validateStableProjectPaletteIds(action.project.projectPalette);
    if (!paletteValidation.ok) {
      return rejectedTransition(session, "invalid-project-file", paletteValidation.message);
    }
    const project = normalizeProjectWorkflow(action.project);
    const nextSession = {
      ...session,
      revision: session.revision + 1,
      project,
      nextPaintColorId: reconcileNextPaintColorId(session.nextPaintColorId, project.projectPalette),
      proposalRevision: session.proposalRevision + 1,
      aiProposal: idleAiProposalState(),
      paintMatch: idlePaintMatchState(),
      operation: { status: "successful", operation: "new-project" } as const,
      persistence: { status: "idle" } as const
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "successful" },
      effects: [{ type: "clear-autosave" }]
    };
  }
  if (action.type === "rename-project" && action.projectName.trim().length === 0) {
    return rejectedTransition(session, "invalid-project-name", "Project name cannot be blank.");
  }
  if (action.type === "change-finished-size" && !isValidFinishedHeight(action.finishedHeightIn)) {
    return rejectedTransition(session, "invalid-finished-size", "Finished Size must be between 6 and 96 inches.");
  }
  const normalizedProjectName = action.type === "rename-project" ? action.projectName.trim() : null;
  if (action.type === "rename-project" && normalizedProjectName === session.project.projectName) {
    return unchangedTransition(session);
  }
  if (action.type === "change-finished-size" && action.finishedHeightIn === session.project.settings.finishedHeightIn) {
    return unchangedTransition(session);
  }
  const project = action.type === "rename-project"
    ? { ...session.project, projectName: normalizedProjectName as string } as TProject
    : action.type === "change-finished-size"
      ? {
        ...session.project,
        settings: {
          ...session.project.settings,
          finishedHeightIn: action.finishedHeightIn
        },
        analysis: session.project.analysis
          ? resizeAnalysisForFinishedHeight(session.project.analysis, action.finishedHeightIn)
          : null
        } as TProject
      : {
          ...session.project,
          settings: nonSizeSettings(session.project.settings, action.settings),
          traceMode: action.settings.templateStyle
        } as TProject;
  return applyProjectTransition(session, project, {
    proposalChange: action.type === "change-finished-size" ? "invalidate" : "preserve"
  });
}

export function executeProjectSessionEffects<TProject extends ProjectSessionProject>(
  effects: readonly ProjectSessionEffect<TProject>[],
  adapter: ProjectSessionEffectAdapter<TProject>
) {
  for (const effect of effects) {
    if (effect.type === "request-autosave") adapter.requestAutosave(effect.revision, effect.project);
    if (effect.type === "request-explicit-save") adapter.requestExplicitSave?.(effect.revision, effect.project);
    if (effect.type === "clear-autosave") adapter.clearAutosave?.();
  }
}

export type ProjectPersistenceSnapshot<TProject extends ProjectSessionProject> = {
  revision: number;
  project: TProject;
};

export type ProjectSessionPersistenceCoordinatorAdapter<TProject extends ProjectSessionProject> = {
  debounceMs: number;
  schedule: (callback: () => void | Promise<void>, delayMs: number) => unknown;
  cancel: (handle: unknown) => void;
  serialize: (snapshot: ProjectPersistenceSnapshot<TProject>) => string;
  writeAutosave: (serialized: string) => void | Promise<void>;
  downloadProject: (serialized: string, snapshot: ProjectPersistenceSnapshot<TProject>) => void | Promise<void>;
  clearAutosave: () => void | Promise<void>;
};

export type ProjectPersistenceResultAction =
  | { type: "persistence-succeeded"; revision: number; mode: "autosave" | "explicit" }
  | { type: "persistence-failed"; revision: number; mode: "autosave" | "explicit"; error: string };

export function createProjectSessionPersistenceCoordinator<TProject extends ProjectSessionProject>(
  adapter: ProjectSessionPersistenceCoordinatorAdapter<TProject>
) {
  let pendingAutosave: unknown | null = null;

  function reportFailure(
    report: (action: ProjectPersistenceResultAction) => void,
    revision: number,
    mode: "autosave" | "explicit",
    error: unknown
  ) {
    report({
      type: "persistence-failed",
      revision,
      mode,
      error: error instanceof Error ? error.message : "Unable to save the project."
    });
  }

  return {
    execute(
      effect: ProjectSessionEffect<TProject>,
      report: (action: ProjectPersistenceResultAction) => void
    ): void | Promise<void> {
      if (effect.type === "clear-autosave") {
        if (pendingAutosave !== null) adapter.cancel(pendingAutosave);
        pendingAutosave = null;
        return Promise.resolve(adapter.clearAutosave()).then(() => undefined);
      }

      const snapshot = { revision: effect.revision, project: effect.project };
      if (effect.type === "request-autosave") {
        if (pendingAutosave !== null) adapter.cancel(pendingAutosave);
        const handle = adapter.schedule(async () => {
          if (pendingAutosave === handle) pendingAutosave = null;
          try {
            const serialized = adapter.serialize(snapshot);
            await adapter.writeAutosave(serialized);
            report({ type: "persistence-succeeded", revision: effect.revision, mode: "autosave" });
          } catch (error) {
            reportFailure(report, effect.revision, "autosave", error);
          }
        }, adapter.debounceMs);
        pendingAutosave = handle;
        return;
      }

      if (pendingAutosave !== null) adapter.cancel(pendingAutosave);
      pendingAutosave = null;
      return (async () => {
        try {
          const serialized = adapter.serialize(snapshot);
          await adapter.writeAutosave(serialized);
          await adapter.downloadProject(serialized, snapshot);
          report({ type: "persistence-succeeded", revision: effect.revision, mode: "explicit" });
        } catch (error) {
          reportFailure(report, effect.revision, "explicit", error);
        }
      })();
    },
    dispose() {
      if (pendingAutosave !== null) adapter.cancel(pendingAutosave);
      pendingAutosave = null;
    }
  };
}

function isCurrentPreparation<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  token: ProjectPreparationToken
) {
  return token.revision === session.revision
    && session.operation.status === "preparing"
    && session.operation.token.operationId === token.operationId;
}

function staleTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  token: ProjectPreparationToken
): ProjectSessionTransition<TProject> {
  const ownsCurrentOperation = session.operation.status === "preparing"
    && session.operation.token.operationId === token.operationId;
  const nextSession = ownsCurrentOperation
    ? { ...session, operation: { status: "stale", operation: token.operation } as const }
    : session;
  return {
    session: nextSession,
    capabilities: projectCapabilities(nextSession),
    outcome: { status: "stale" },
    effects: []
  };
}

function staleAiProposalTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
): ProjectSessionTransition<TProject> {
  return {
    session,
    capabilities: projectCapabilities(session),
    outcome: { status: "stale" },
    effects: []
  };
}

function stalePaintMatchTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
): ProjectSessionTransition<TProject> {
  return {
    session,
    capabilities: projectCapabilities(session),
    outcome: { status: "stale" },
    effects: []
  };
}

function idleAiProposalState(): ProjectSessionAiProposalState {
  return Object.freeze({ status: "idle" });
}

function confirmingAiProposalState(): ProjectSessionAiProposalState {
  return Object.freeze({ status: "confirming", estimatedCostUsd: AI_PROPOSAL_ESTIMATE_USD });
}

function requestingAiProposalState(token: ProjectSessionAiProposalToken): ProjectSessionAiProposalState {
  return Object.freeze({ status: "requesting", estimatedCostUsd: AI_PROPOSAL_ESTIMATE_USD, token });
}

function failedAiProposalState(error: string): ProjectSessionAiProposalState {
  return Object.freeze({ status: "failed", error });
}

function readyAiProposalState(
  proposal: ProjectSessionAiProposalResult,
  review = beginAiProposalReview(proposal.status)
): ProjectSessionAiProposalState {
  return Object.freeze({ status: "ready", proposal: snapshotAiProposalResult(proposal), review });
}

function snapshotAiProposalResult(proposal: ProjectSessionAiProposalResult): ProjectSessionAiProposalResult {
  return Object.freeze({
    ...proposal,
    validationIssues: Object.freeze([...proposal.validationIssues])
  });
}

function idlePaintMatchState(): ProjectSessionPaintMatchState {
  return Object.freeze({ status: "idle" });
}

function requestingPaintMatchState(token: ProjectSessionPaintMatchToken): ProjectSessionPaintMatchState {
  return Object.freeze({ status: "requesting", token });
}

function failedPaintMatchState(token: ProjectSessionPaintMatchToken, error: string): ProjectSessionPaintMatchState {
  return Object.freeze({ status: "failed", token, error });
}

function projectCapabilities<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
): ProjectCapabilities {
  const preparing = session.operation.status === "preparing";
  return Object.freeze({
    renameProject: true,
    changeFinishedSize: true,
    selectSourceImage: true,
    analyzeSource: !preparing,
    regenerateAnalysis: !preparing && session.project.analysis !== null && session.project.sourceImage != null,
    startNewProject: true,
    saveProject: isPersistableProject(session.project),
    exportProject: canExportProject(session),
    aiProposal: Object.freeze({
      canBeginRequest: canBeginAiProposalRequest(session),
      canConfirmRequest: session.aiProposal.status === "confirming" && canAiProposalRequestPrerequisites(session),
      canAccept: session.aiProposal.status === "ready" && canAcceptAiProposal(session.aiProposal.review),
      canReject: session.aiProposal.status === "ready" && session.aiProposal.review.decision === "pending"
    }),
    paint: Object.freeze({
      canMutate: !isWorkflowBlockedByAiProposal(session)
    }),
    guidedWorkflow: guidedWorkflowCapabilities(session)
  });
}

function guidedWorkflowCapabilities<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
): GuidedWorkflowCapabilities {
  const progress = normalizedWorkflowProgress(session.project);
  const steps = workflowStepItems(progress, { hasAnalysis: hasAnalysis(session.project) }).map((item) => (
    isWorkflowBlockedByAiProposal(session) && (item.step === "colors" || item.step === "export")
      ? { ...item, status: "locked" as const, clickable: false }
      : item
  ));
  return Object.freeze({
    progress: Object.freeze(progress),
    steps: Object.freeze(steps.map((item) => Object.freeze(item))),
    canCompleteLineworkReview: hasValidCutLine(session.project) && !isWorkflowBlockedByAiProposal(session),
    canCompleteColorReview: progress.lineworkReviewed && !isWorkflowBlockedByAiProposal(session),
    canRestartColorReview: progress.lineworkReviewed && progress.colorsOutcome !== "incomplete" && !isWorkflowBlockedByAiProposal(session)
  });
}

function normalizeProjectWorkflow<TProject extends ProjectSessionProject>(project: TProject): TProject {
  const { unacceptedAiProposal: _legacyProposal, ...rest } = project as TProject & { unacceptedAiProposal?: unknown | null };
  const sanitized = rest as TProject;
  const readinessNormalized = sanitized.analysis && sanitized.inputReadiness === undefined
    ? { ...sanitized, inputReadiness: deriveInputReadiness(sanitized.analysis) } as TProject
    : sanitized;
  const snappedProjectPalette = snapshotProjectPalette(readinessNormalized.projectPalette);
  const paletteNormalized = snappedProjectPalette === readinessNormalized.projectPalette
    ? readinessNormalized
    : { ...readinessNormalized, projectPalette: snappedProjectPalette } as TProject;
  const progress = normalizedWorkflowProgress(paletteNormalized);
  const current = paletteNormalized.workflowProgress;
  if (current && sameWorkflowProgress(current, progress)) return paletteNormalized;
  return { ...paletteNormalized, workflowProgress: progress } as TProject;
}

function normalizedWorkflowProgress(project: ProjectSessionProject): WorkflowProgress {
  const raw = project.workflowProgress as Partial<WorkflowProgress> | undefined;
  if (!hasAnalysis(project)) return { ...DEFAULT_WORKFLOW_PROGRESS };

  const lineworkReviewed = hasValidCutLine(project) && raw?.lineworkReviewed === true;
  const colorsOutcome = lineworkReviewed && (raw?.colorsOutcome === "reviewed" || raw?.colorsOutcome === "skipped")
    ? raw.colorsOutcome
    : "incomplete";
  const supported = {
    activeStep: isWorkflowStep(raw?.activeStep) ? raw.activeStep : furthestSupportedStep(lineworkReviewed, colorsOutcome),
    lineworkReviewed,
    colorsOutcome
  } satisfies WorkflowProgress;
  return normalizeWorkflowProgress(supported, { hasAnalysis: true });
}

function furthestSupportedStep(lineworkReviewed: boolean, colorsOutcome: ColorsOutcome): WorkflowStep {
  if (!lineworkReviewed) return "clean";
  return colorsOutcome === "incomplete" ? "colors" : "export";
}

function isWorkflowStep(value: unknown): value is WorkflowStep {
  return value === "upload" || value === "clean" || value === "colors" || value === "export";
}

function sameWorkflowProgress(left: Partial<WorkflowProgress>, right: WorkflowProgress) {
  return left.activeStep === right.activeStep
    && left.lineworkReviewed === right.lineworkReviewed
    && left.colorsOutcome === right.colorsOutcome;
}

function sameReadonlyArray(left: readonly unknown[] | undefined, right: readonly unknown[]) {
  if (!left || left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function editableArtifact(project: ProjectSessionProject): ProjectSessionEditableArtifact {
  return {
    editedDetailPngDataUrl: project.editedDetailPngDataUrl ?? project.analysis?.detailLinePngDataUrl ?? null,
    manualStrokes: project.manualStrokes ?? []
  };
}

function hasAnalysis(project: ProjectSessionProject) {
  return project.analysis !== null;
}

function isPersistableProject(project: ProjectSessionProject) {
  return project.sourceImage != null && project.analysis !== null;
}

function hasValidCutLine(project: ProjectSessionProject) {
  return Boolean(project.analysis?.outerCutPath.trim());
}

function deriveInputReadiness(analysis: CutoutProjectAnalysis): ProjectSessionInputReadiness {
  return analysis.traceQuality?.detailExtractionModeUsed === "rendered"
    ? "needs-simplification"
    : "ready-line-art";
}

function canAiProposalRequestPrerequisites<TProject extends ProjectSessionProject>(session: ProjectSession<TProject>) {
  return session.project.sourceImage != null
    && hasValidCutLine(session.project)
    && session.aiProposal.status !== "requesting";
}

function canBeginAiProposalRequest<TProject extends ProjectSessionProject>(session: ProjectSession<TProject>) {
  return canAiProposalRequestPrerequisites(session)
    && session.aiProposal.status !== "confirming"
    && !isWorkflowBlockedByAiProposal(session);
}

function currentProjectPalette(project: ProjectSessionProject) {
  return [...(project.projectPalette ?? [])];
}

function findProjectPaintColor(project: ProjectSessionProject, id: string) {
  return currentProjectPalette(project).find((color) => color.id === id) ?? null;
}

function snapshotProjectPalette(projectPalette: readonly ProjectPaintColor[] | undefined) {
  if (!projectPalette) return projectPalette;
  let changed = !Object.isFrozen(projectPalette);
  const snapped = projectPalette.map((color) => {
    const snapshot = snapshotProjectPaintColor(color);
    if (snapshot !== color) changed = true;
    return snapshot;
  });
  return changed ? Object.freeze(snapped) : projectPalette;
}

function snapshotProjectPaintColor(color: ProjectPaintColor): ProjectPaintColor {
  const matches = snapshotCraftPaintMatches(color.matches);
  const id = color.id.trim();
  const hex = normalizePaintHex(color.hex);
  const label = color.label.trim();
  const note = color.note.trim();
  const manualOverride = color.manualOverride.trim();
  const selectedMatchId = color.selectedMatchId && matches.some((match) => match.id === color.selectedMatchId)
    ? color.selectedMatchId
    : null;
  if (
    Object.isFrozen(color)
    && matches === color.matches
    && id === color.id
    && hex === color.hex
    && label === color.label
    && note === color.note
    && manualOverride === color.manualOverride
    && selectedMatchId === color.selectedMatchId
  ) {
    return color;
  }
  return Object.freeze({
    ...color,
    id,
    hex,
    label,
    note,
    manualOverride,
    selectedMatchId,
    matches
  }) as ProjectPaintColor;
}

function snapshotCraftPaintMatches(matches: readonly CraftPaintMatch[]): ProjectPaintColor["matches"] {
  let changed = !Object.isFrozen(matches);
  const snapped = matches.map((match) => {
    const snapshot = snapshotCraftPaintMatch(match);
    if (snapshot !== match) changed = true;
    return snapshot;
  });
  return (changed ? Object.freeze(snapped) : matches) as ProjectPaintColor["matches"];
}

function isCurrentAiProposalRequest<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  token: ProjectSessionAiProposalToken
) {
  return session.aiProposal.status === "requesting"
    && session.aiProposal.token.requestId === token.requestId
    && session.aiProposal.token.proposalRevision === token.proposalRevision
    && session.proposalRevision === token.proposalRevision;
}

function isWorkflowBlockedByAiProposal<TProject extends ProjectSessionProject>(session: ProjectSession<TProject>) {
  return session.aiProposal.status === "requesting"
    || (session.aiProposal.status === "ready" && session.aiProposal.review.decision === "pending");
}

function isCurrentPaintMatchRequest<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  token: ProjectSessionPaintMatchToken
) {
  if (
    session.paintMatch.status !== "requesting"
    || session.paintMatch.token.requestId !== token.requestId
    || session.paintMatch.token.revision !== token.revision
    || session.paintMatch.token.colorId !== token.colorId
    || session.paintMatch.token.expectedHex !== token.expectedHex
    || session.revision !== token.revision
  ) {
    return false;
  }
  const target = findProjectPaintColor(session.project, token.colorId);
  return target !== null && normalizePaintHex(target.hex) === token.expectedHex;
}

function canExportProject<TProject extends ProjectSessionProject>(session: ProjectSession<TProject>) {
  const progress = normalizedWorkflowProgress(session.project);
  return session.project.sourceImage != null
    && hasValidCutLine(session.project)
    && progress.activeStep === "export"
    && progress.lineworkReviewed
    && progress.colorsOutcome !== "incomplete"
    && !isWorkflowBlockedByAiProposal(session);
}

function emptyCleanupChecks() {
  return { cutline: false, remove: false, draw: false, export: false };
}

function workflowStepName(step: WorkflowStep) {
  if (step === "upload") return "Upload";
  if (step === "clean") return "Clean Lines";
  if (step === "colors") return "Colors";
  return "Export";
}

function applyPaintPaletteTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  projectPalette: readonly ProjectPaintColor[]
): ProjectSessionTransition<TProject> {
  if (sameProjectPaintPalette(currentProjectPalette(session.project), projectPalette)) {
    const nextSession = session.paintMatch.status === "idle"
      ? session
      : { ...session, paintMatch: idlePaintMatchState() };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: nextSession === session ? "unchanged" : "successful" },
      effects: []
    };
  }
  return applyProjectTransition(session, { ...session.project, projectPalette } as TProject);
}

function applyProjectTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  project: TProject,
  options?: {
    proposalChange?: "preserve" | "invalidate";
    aiProposalOverride?: ProjectSessionAiProposalState;
    editorTransaction?: EditorTransaction<ProjectSessionEditableArtifact>;
  }
): ProjectSessionTransition<TProject> {
  const revision = session.revision + 1;
  const normalizedProject = normalizeProjectWorkflow(project);
  const persistable = isPersistableProject(normalizedProject);
  const proposalChange = options?.proposalChange ?? "preserve";
  const nextSession = {
    ...session,
    revision,
    project: normalizedProject,
    nextPaintColorId: reconcileNextPaintColorId(session.nextPaintColorId, normalizedProject.projectPalette),
    proposalRevision: proposalChange === "invalidate" ? session.proposalRevision + 1 : session.proposalRevision,
    aiProposal: proposalChange === "invalidate"
      ? idleAiProposalState()
      : options?.aiProposalOverride ?? session.aiProposal,
    paintMatch: idlePaintMatchState(),
    persistence: persistable
      ? { status: "pending", revision, mode: "autosave" } as const
      : { status: "idle" } as const
  };
  return {
    session: nextSession,
    capabilities: projectCapabilities(nextSession),
    outcome: { status: "applied" },
    ...(options?.editorTransaction ? { editorTransaction: options.editorTransaction } : {}),
    effects: persistable ? [autosaveEffect(nextSession)] : []
  };
}

function autosaveEffect<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
): ProjectSessionEffect<TProject> {
  return { type: "request-autosave", revision: session.revision, project: session.project };
}

function nonSizeSettings(current: Settings, next: Settings): Settings {
  return {
    ...next,
    finishedHeightIn: current.finishedHeightIn,
    includePaintGuidePage: current.includePaintGuidePage
  };
}

function defaultLayerVisibility(showReference: boolean): ProjectSessionLayerVisibility {
  return {
    showReference,
    showCutline: true,
    showManualLines: true,
    showSuggestions: false,
    printPreview: false
  };
}

function traceStudioLayerVisibility(): ProjectSessionLayerVisibility {
  return defaultLayerVisibility(true);
}

function validateRestoredProject(project: ProjectSessionProject): { ok: true } | { ok: false; message: string } {
  if (project.projectName.trim().length === 0) return { ok: false, message: "Project name cannot be blank." };
  if (!isValidFinishedHeight(project.settings.finishedHeightIn)) {
    return { ok: false, message: "Finished Size must be between 6 and 96 inches." };
  }
  if (project.analysis && project.analysis.finishedHeightIn !== project.settings.finishedHeightIn) {
    return { ok: false, message: "Analysis does not match the restored Finished Size." };
  }
  return validateStableProjectPaletteIds(project.projectPalette);
}

function isValidFinishedHeight(value: number) {
  return Number.isFinite(value) && value >= 6 && value <= 96;
}

function unchangedTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
): ProjectSessionTransition<TProject> {
  return { session, capabilities: projectCapabilities(session), outcome: { status: "unchanged" }, effects: [] };
}

function rejectedTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  code: ProjectSessionRejectionCode,
  message: string
): ProjectSessionTransition<TProject> {
  return {
    session,
    capabilities: projectCapabilities(session),
    outcome: { status: "rejected", error: { code, message } },
    effects: []
  };
}

function normalizePaintHex(hex: string) {
  const value = hex.trim().toLowerCase();
  const prefixed = value.startsWith("#") ? value : `#${value}`;
  if (/^#[0-9a-f]{3}$/i.test(prefixed)) {
    const [hash, r, g, b] = prefixed;
    return `${hash}${r}${r}${g}${g}${b}${b}`;
  }
  return prefixed;
}

function validatePaintHex(hex: string) {
  const normalized = normalizePaintHex(hex);
  return /^#[0-9a-f]{6}$/i.test(normalized)
    ? { ok: true as const, value: normalized }
    : { ok: false as const };
}

export function validateCraftPaintMatches(matches: unknown): CraftPaintMatchValidation {
  if (!Array.isArray(matches)) {
    return { ok: false, message: "Unable to refresh paint matches. Existing choices were kept." };
  }
  const normalized: CraftPaintMatch[] = [];
  for (const match of matches) {
    if (!isRecord(match)) {
      return { ok: false, message: "Unable to refresh paint matches. Existing choices were kept." };
    }
    if (
      typeof match.id !== "string"
      || typeof match.brand !== "string"
      || typeof match.line !== "string"
      || typeof match.colorName !== "string"
      || typeof match.hex !== "string"
      || typeof match.finish !== "string"
      || typeof match.outdoorRecommended !== "boolean"
      || typeof match.distance !== "number"
      || !Number.isFinite(match.distance)
      || (match.confidence !== "close match"
        && match.confidence !== "approximate match"
        && match.confidence !== "poor match / manual check recommended")
    ) {
      return { ok: false, message: "Unable to refresh paint matches. Existing choices were kept." };
    }
    for (const key of ["retailer", "productUrl", "notes"] as const) {
      if (key in match && match[key] !== undefined && typeof match[key] !== "string") {
        return { ok: false, message: "Unable to refresh paint matches. Existing choices were kept." };
      }
    }
    const hex = validatePaintHex(match.hex);
    if (!hex.ok) {
      return { ok: false, message: "Unable to refresh paint matches. Existing choices were kept." };
    }
    normalized.push(cloneCraftPaintMatch({
      id: match.id,
      brand: match.brand,
      line: match.line,
      colorName: match.colorName,
      hex: hex.value,
      finish: match.finish,
      outdoorRecommended: match.outdoorRecommended,
      retailer: typeof match.retailer === "string" ? match.retailer : undefined,
      productUrl: typeof match.productUrl === "string" ? match.productUrl : undefined,
      notes: typeof match.notes === "string" ? match.notes : undefined,
      distance: match.distance,
      confidence: match.confidence
    }));
  }
  return { ok: true, matches: normalized };
}

function cloneCraftPaintMatch(match: CraftPaintMatch): CraftPaintMatch {
  return {
    ...match,
    hex: normalizePaintHex(match.hex),
    retailer: match.retailer,
    productUrl: match.productUrl,
    notes: match.notes
  };
}

function snapshotCraftPaintMatch(match: CraftPaintMatch): CraftPaintMatch {
  const hex = normalizePaintHex(match.hex);
  if (Object.isFrozen(match) && hex === match.hex) return match;
  return Object.freeze({
    ...match,
    hex
  });
}

function nextManualPaintColorId(projectPalette: readonly ProjectPaintColor[], floor: number) {
  let index = floor;
  while (projectPalette.some((color) => color.id === `manual-${index}`)) index += 1;
  return `manual-${index}`;
}

function validateStableProjectPaletteIds(projectPalette: readonly ProjectPaintColor[] | undefined) {
  if (!projectPalette) return { ok: true as const };
  const seen = new Set<string>();
  for (const color of projectPalette) {
    const id = color.id.trim();
    if (!id || seen.has(id)) {
      return { ok: false as const, message: "Project paint palette IDs must be non-blank and unique." };
    }
    seen.add(id);
  }
  return { ok: true as const };
}

function deriveNextPaintColorId(projectPalette: readonly ProjectPaintColor[] | undefined) {
  const colors = projectPalette ?? [];
  const numericSuffixes = colors.flatMap((color) => {
    const match = /^manual-(\d+)(?:-|$)/.exec(color.id);
    return match ? [Number(match[1])] : [];
  });
  return (numericSuffixes.length > 0 ? Math.max(...numericSuffixes) : 0) + 1;
}

function reconcileNextPaintColorId(current: number, projectPalette: readonly ProjectPaintColor[] | undefined) {
  return Math.max(current, deriveNextPaintColorId(projectPalette));
}

function sameProjectPaintPalette(left: readonly ProjectPaintColor[], right: readonly ProjectPaintColor[]) {
  return left.length === right.length && left.every((color, index) => sameProjectPaintColor(color, right[index]));
}

function sameProjectPaintColor(left: ProjectPaintColor | undefined, right: ProjectPaintColor | undefined) {
  if (!left || !right) return false;
  return left.id === right.id
    && left.hex === right.hex
    && left.label === right.label
    && left.note === right.note
    && left.included === right.included
    && left.selectedMatchId === right.selectedMatchId
    && left.manualOverride === right.manualOverride
    && left.coverage === right.coverage
    && left.locked === right.locked
    && left.source === right.source
    && sameCraftPaintMatches(left.matches, right.matches);
}

function sameCraftPaintMatches(left: readonly CraftPaintMatch[], right: readonly CraftPaintMatch[]) {
  return left.length === right.length && left.every((match, index) => sameCraftPaintMatch(match, right[index]));
}

function sameCraftPaintMatch(left: CraftPaintMatch | undefined, right: CraftPaintMatch | undefined) {
  if (!left || !right) return false;
  return left.id === right.id
    && left.brand === right.brand
    && left.line === right.line
    && left.colorName === right.colorName
    && left.hex === right.hex
    && left.finish === right.finish
    && left.outdoorRecommended === right.outdoorRecommended
    && left.retailer === right.retailer
    && left.productUrl === right.productUrl
    && left.notes === right.notes
    && left.distance === right.distance
    && left.confidence === right.confidence;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
