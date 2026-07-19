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
import type { Settings } from "./traceWorkflow.ts";

const AI_PROPOSAL_ESTIMATE_USD = 0.10;

export type ProjectSessionInputReadiness = "needs-simplification" | "ready-line-art";

export type ProjectSessionProject = {
  projectName: string;
  settings: Settings;
  sourceImage?: ProjectSessionSourceImage | null;
  analysis: CutoutProjectAnalysis | null;
  inputReadiness?: ProjectSessionInputReadiness;
  editedDetailPngDataUrl?: string | null;
  manualStrokes?: readonly unknown[];
  projectPalette?: readonly unknown[];
  workflowProgress?: WorkflowProgress;
  createdAt?: string | null;
  traceMode?: unknown;
  referenceOpacity?: number;
  layerVisibility?: unknown;
  traceViewport?: unknown;
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
  proposalRevision: number;
  nextAiProposalRequestId: number;
  aiProposal: ProjectSessionAiProposalState;
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

export type ProjectCapabilities = {
  readonly renameProject: boolean;
  readonly changeFinishedSize: boolean;
  readonly selectSourceImage: boolean;
  readonly analyzeSource: boolean;
  readonly regenerateAnalysis: boolean;
  readonly startNewProject: boolean;
  readonly exportProject: boolean;
  readonly aiProposal: AiProposalCapabilities;
  readonly guidedWorkflow: GuidedWorkflowCapabilities;
};

export type ProjectSessionAction<TProject extends ProjectSessionProject = ProjectSessionProject> =
  | { type: "rename-project"; projectName: string }
  | { type: "change-finished-size"; finishedHeightIn: number }
  | { type: "hydrate-project"; project: TProject }
  | { type: "update-non-size-settings"; settings: Settings }
  | { type: "replace-analysis"; analysis: CutoutProjectAnalysis | null; inputReadiness?: ProjectSessionInputReadiness }
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
  | {
      type: "commit-accepted-linework";
      editedDetailPngDataUrl: string | null;
      manualStrokes: readonly unknown[];
    }
  | {
      type: "commit-editor-transaction";
      outcome: {
        editedDetailPngDataUrl: string | null;
        manualStrokes: readonly unknown[];
      };
    }
  | { type: "update-project-palette"; projectPalette: readonly unknown[] }
  | { type: "update-workspace-preferences"; preferences: Partial<Pick<ProjectSessionProject, "traceMode" | "referenceOpacity" | "layerVisibility" | "traceViewport">> }
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
      initialProjectPalette: readonly unknown[];
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
    | { status: "applied" }
    | { status: "unchanged" }
    | { status: "preparing"; token: ProjectPreparationToken }
    | { status: "requesting"; token: ProjectSessionAiProposalToken }
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
  | "invalid-finished-size"
  | "analysis-size-mismatch"
  | "locked-workflow-step"
  | "invalid-cut-line"
  | "linework-review-required"
  | "color-review-required"
  | "ai-proposal-unavailable"
  | "ai-proposal-confirmation-required"
  | "ai-proposal-acceptance-unavailable"
  | "workflow-blocked";

export type ProjectSessionEffectAdapter<TProject extends ProjectSessionProject = ProjectSessionProject> = {
  requestAutosave: (revision: number, project: TProject) => void;
  requestExplicitSave?: (revision: number, project: TProject) => void;
  clearAutosave?: () => void;
};

export function createProjectSession<TProject extends ProjectSessionProject>(
  project: TProject
): ProjectSession<TProject> {
  return {
    revision: 0,
    project: normalizeProjectWorkflow(project),
    operation: { status: "idle" },
    nextOperationId: 1,
    proposalRevision: 0,
    nextAiProposalRequestId: 1,
    aiProposal: idleAiProposalState(),
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
  if (action.type === "commit-accepted-linework" || action.type === "commit-editor-transaction") {
    const outcome = action.type === "commit-editor-transaction" ? action.outcome : action;
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
  if (action.type === "update-project-palette") {
    if (isWorkflowBlockedByAiProposal(session)) {
      return rejectedTransition(session, "workflow-blocked", "Finish reviewing the pending proposal before continuing.");
    }
    if (session.project.projectPalette === action.projectPalette) return unchangedTransition(session);
    return applyProjectTransition(session, { ...session.project, projectPalette: action.projectPalette } as TProject);
  }
  if (action.type === "update-workspace-preferences") {
    const project = { ...session.project, ...action.preferences } as TProject;
    if (Object.entries(action.preferences).every(([key, value]) => session.project[key as keyof TProject] === value)) {
      return unchangedTransition(session);
    }
    return applyProjectTransition(session, project);
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
    const revision = session.revision + 1;
    const project = normalizeProjectWorkflow(action.project);
    const nextSession = {
      ...session,
      revision,
      project,
      proposalRevision: session.proposalRevision + 1,
      aiProposal: idleAiProposalState(),
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
      projectPalette: action.initialProjectPalette,
      workflowProgress: { activeStep: "clean", lineworkReviewed: false, colorsOutcome: "incomplete" },
      cleanupChecks: { cutline: false, remove: false, draw: false, export: false }
    } as TProject;
    const revision = session.revision + 1;
    const nextSession = {
      ...session,
      revision,
      project,
      proposalRevision: session.proposalRevision + 1,
      aiProposal: idleAiProposalState(),
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
    const nextSession = {
      ...session,
      revision: session.revision + 1,
      project: normalizeProjectWorkflow(action.project),
      proposalRevision: session.proposalRevision + 1,
      aiProposal: idleAiProposalState(),
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
  if (action.type === "hydrate-project" && action.project.projectName.trim().length === 0) {
    return rejectedTransition(session, "invalid-project-name", "Project name cannot be blank.");
  }
  if (action.type === "hydrate-project" && !isValidFinishedHeight(action.project.settings.finishedHeightIn)) {
    return rejectedTransition(session, "invalid-finished-size", "Finished Size must be between 6 and 96 inches.");
  }
  if (
    action.type === "replace-analysis" &&
    action.analysis !== null &&
    action.analysis.finishedHeightIn !== session.project.settings.finishedHeightIn
  ) {
    return rejectedTransition(session, "analysis-size-mismatch", "Analysis does not match the current Finished Size.");
  }
  const normalizedProjectName = action.type === "rename-project" ? action.projectName.trim() : null;
  if (action.type === "rename-project" && normalizedProjectName === session.project.projectName) {
    return unchangedTransition(session);
  }
  if (action.type === "change-finished-size" && action.finishedHeightIn === session.project.settings.finishedHeightIn) {
    return unchangedTransition(session);
  }
  if (action.type === "hydrate-project" && action.project === session.project) {
    return unchangedTransition(session);
  }
  if (action.type === "replace-analysis" && action.analysis === session.project.analysis) {
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
      : action.type === "hydrate-project"
        ? normalizeProjectWorkflow(action.project)
        : action.type === "update-non-size-settings"
          ? {
              ...session.project,
              settings: {
                ...action.settings,
                finishedHeightIn: session.project.settings.finishedHeightIn,
                includePaintGuidePage: session.project.settings.includePaintGuidePage
              }
            } as TProject
          : {
              ...session.project,
              analysis: action.analysis,
              inputReadiness: action.analysis === null
                ? undefined
                : action.inputReadiness ?? deriveInputReadiness(action.analysis)
            } as TProject;
  return applyProjectTransition(session, project, {
    proposalChange: (
      action.type === "change-finished-size"
      || action.type === "hydrate-project"
      || action.type === "replace-analysis"
    )
      ? "invalidate"
      : "preserve"
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
    exportProject: canExportProject(session),
    aiProposal: Object.freeze({
      canBeginRequest: canBeginAiProposalRequest(session),
      canConfirmRequest: session.aiProposal.status === "confirming" && canAiProposalRequestPrerequisites(session),
      canAccept: session.aiProposal.status === "ready" && canAcceptAiProposal(session.aiProposal.review),
      canReject: session.aiProposal.status === "ready" && session.aiProposal.review.decision === "pending"
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
  const progress = normalizedWorkflowProgress(sanitized);
  const current = sanitized.workflowProgress;
  if (current && sameWorkflowProgress(current, progress)) return sanitized;
  return { ...sanitized, workflowProgress: progress } as TProject;
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

function needsAiSimplification(project: ProjectSessionProject) {
  const inputReadiness = project.inputReadiness;
  if (inputReadiness === "needs-simplification") return true;
  if (inputReadiness === "ready-line-art") return false;
  return project.analysis?.traceQuality?.detailExtractionModeUsed === "rendered";
}

function deriveInputReadiness(analysis: CutoutProjectAnalysis): ProjectSessionInputReadiness {
  return analysis.traceQuality?.detailExtractionModeUsed === "rendered"
    ? "needs-simplification"
    : "ready-line-art";
}

function canAiProposalRequestPrerequisites<TProject extends ProjectSessionProject>(session: ProjectSession<TProject>) {
  return needsAiSimplification(session.project)
    && session.project.sourceImage != null
    && hasValidCutLine(session.project)
    && session.aiProposal.status !== "requesting";
}

function canBeginAiProposalRequest<TProject extends ProjectSessionProject>(session: ProjectSession<TProject>) {
  return canAiProposalRequestPrerequisites(session)
    && session.aiProposal.status !== "confirming"
    && !isWorkflowBlockedByAiProposal(session);
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
  const persistable = isPersistableProject(project);
  const proposalChange = options?.proposalChange ?? "preserve";
  const nextSession = {
    ...session,
    revision,
    project: normalizeProjectWorkflow(project),
    proposalRevision: proposalChange === "invalidate" ? session.proposalRevision + 1 : session.proposalRevision,
    aiProposal: proposalChange === "invalidate"
      ? idleAiProposalState()
      : options?.aiProposalOverride ?? session.aiProposal,
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
