import {
  resizeAnalysisForFinishedHeight,
  type CutoutProjectAnalysis
} from "./cutoutProject.ts";
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

export type ProjectSessionProject = {
  projectName: string;
  settings: Settings;
  sourceImage?: ProjectSessionSourceImage | null;
  analysis: CutoutProjectAnalysis | null;
  editedDetailPngDataUrl?: string | null;
  manualStrokes?: readonly unknown[];
  projectPalette?: readonly unknown[];
  workflowProgress?: WorkflowProgress;
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

export type ProjectPreparationOperation = "replace-source" | "regenerate-analysis";

export type ProjectPreparationToken = {
  revision: number;
  operationId: number;
  operation: ProjectPreparationOperation;
};

export type ProjectOperationStatus =
  | { status: "idle" }
  | { status: "preparing"; token: ProjectPreparationToken }
  | { status: "failed"; operation: ProjectPreparationOperation; error: string }
  | { status: "successful"; operation: ProjectPreparationOperation | "new-project" }
  | { status: "stale"; operation: ProjectPreparationOperation };

export type ProjectSession<TProject extends ProjectSessionProject = ProjectSessionProject> = {
  revision: number;
  project: TProject;
  operation: ProjectOperationStatus;
  nextOperationId: number;
  guidedWorkflowBlocked: boolean;
};

export type GuidedWorkflowCapabilities = {
  readonly progress: WorkflowProgress;
  readonly steps: readonly WorkflowStepItem[];
  readonly canCompleteLineworkReview: boolean;
  readonly canCompleteColorReview: boolean;
  readonly canRestartColorReview: boolean;
};

export type ProjectCapabilities = {
  readonly renameProject: boolean;
  readonly changeFinishedSize: boolean;
  readonly selectSourceImage: boolean;
  readonly analyzeSource: boolean;
  readonly regenerateAnalysis: boolean;
  readonly startNewProject: boolean;
  readonly guidedWorkflow: GuidedWorkflowCapabilities;
};

export type ProjectSessionAction<TProject extends ProjectSessionProject = ProjectSessionProject> =
  | { type: "rename-project"; projectName: string }
  | { type: "change-finished-size"; finishedHeightIn: number }
  | { type: "hydrate-project"; project: TProject }
  | { type: "update-non-size-settings"; settings: Settings }
  | { type: "replace-analysis"; analysis: CutoutProjectAnalysis | null }
  | { type: "navigate-workflow"; target: WorkflowStep }
  | { type: "complete-linework-review" }
  | { type: "complete-color-review"; outcome: Exclude<ColorsOutcome, "incomplete"> }
  | { type: "restart-color-review" }
  | {
      type: "commit-accepted-linework";
      editedDetailPngDataUrl: string | null;
      manualStrokes: readonly unknown[];
    }
  | { type: "update-project-palette"; projectPalette: readonly unknown[] }
  | { type: "set-color-guide-included"; included: boolean }
  | { type: "set-guided-workflow-blocked"; blocked: boolean }
  | { type: "begin-project-preparation"; operation: ProjectPreparationOperation }
  | { type: "complete-project-preparation"; token: ProjectPreparationToken }
  | { type: "fail-project-preparation"; token: ProjectPreparationToken; error: string }
  | {
      type: "complete-source-analysis";
      token: ProjectPreparationToken;
      mode: ProjectPreparationOperation;
      projectName?: string;
      sourceImage?: ProjectSessionSourceImage;
      settings: Settings;
      analysis: CutoutProjectAnalysis;
      initialDetailPngDataUrl: string | null;
      initialProjectPalette: readonly unknown[];
    }
  | { type: "cancel-new-project" }
  | { type: "confirm-new-project"; project: TProject };

export type ProjectSessionEffect =
  | { type: "request-autosave"; revision: number }
  | { type: "clear-autosave" };

export type ProjectSessionTransition<TProject extends ProjectSessionProject> = {
  session: ProjectSession<TProject>;
  capabilities: ProjectCapabilities;
  outcome:
    | { status: "applied" }
    | { status: "unchanged" }
    | { status: "preparing"; token: ProjectPreparationToken }
    | { status: "failed"; error: string }
    | { status: "successful" }
    | { status: "stale" }
    | { status: "cancelled" }
    | { status: "rejected"; error: { code: ProjectSessionRejectionCode; message: string } };
  effects: readonly ProjectSessionEffect[];
};

export type ProjectSessionRejectionCode =
  | "invalid-project-name"
  | "invalid-finished-size"
  | "analysis-size-mismatch"
  | "locked-workflow-step"
  | "invalid-cut-line"
  | "linework-review-required"
  | "color-review-required"
  | "workflow-blocked";

export type ProjectSessionEffectAdapter = {
  requestAutosave: (revision: number) => void;
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
    guidedWorkflowBlocked: false
  };
}

export function projectSessionView<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
) {
  return {
    revision: session.revision,
    project: session.project,
    operation: session.operation,
    capabilities: projectCapabilities(session)
  };
}

export function transitionProjectSession<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  action: ProjectSessionAction<TProject>
): ProjectSessionTransition<TProject> {
  if (action.type === "set-guided-workflow-blocked") {
    if (session.guidedWorkflowBlocked === action.blocked) return unchangedTransition(session);
    const nextSession = { ...session, guidedWorkflowBlocked: action.blocked };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "applied" },
      effects: []
    };
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
    if (session.guidedWorkflowBlocked) {
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
    if (session.guidedWorkflowBlocked) {
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
    if (session.guidedWorkflowBlocked) {
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
  if (action.type === "commit-accepted-linework") {
    if (
      session.project.editedDetailPngDataUrl === action.editedDetailPngDataUrl
      && sameReadonlyArray(session.project.manualStrokes, action.manualStrokes)
    ) return unchangedTransition(session);
    return applyProjectTransition(session, {
      ...session.project,
      editedDetailPngDataUrl: action.editedDetailPngDataUrl,
      manualStrokes: action.manualStrokes,
      workflowProgress: invalidateLineworkReview(normalizedWorkflowProgress(session.project)),
      cleanupChecks: emptyCleanupChecks()
    } as TProject);
  }
  if (action.type === "update-project-palette") {
    if (session.project.projectPalette === action.projectPalette) return unchangedTransition(session);
    return applyProjectTransition(session, { ...session.project, projectPalette: action.projectPalette } as TProject);
  }
  if (action.type === "set-color-guide-included") {
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
        ? { projectName: action.projectName!.trim(), sourceImage: action.sourceImage! }
        : {}),
      settings: action.settings,
      analysis: action.analysis,
      editedDetailPngDataUrl: action.initialDetailPngDataUrl,
      manualStrokes: action.mode === "replace-source" ? [] : session.project.manualStrokes,
      projectPalette: action.initialProjectPalette,
      workflowProgress: { activeStep: "clean", lineworkReviewed: false, colorsOutcome: "incomplete" },
      cleanupChecks: { cutline: false, remove: false, draw: false, export: false },
      unacceptedAiProposal: null
    } as TProject;
    const revision = session.revision + 1;
    const nextSession = {
      ...session,
      revision,
      project,
      operation: { status: "successful", operation: action.mode } as const
    };
    return {
      session: nextSession,
      capabilities: projectCapabilities(nextSession),
      outcome: { status: "successful" },
      effects: [{ type: "request-autosave", revision }]
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
      guidedWorkflowBlocked: false,
      operation: { status: "successful", operation: "new-project" } as const
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
          : { ...session.project, analysis: action.analysis } as TProject;
  const revision = session.revision + 1;
  const nextSession = { ...session, revision, project };

  return {
    session: nextSession,
    capabilities: projectCapabilities(nextSession),
    outcome: { status: "applied" },
    effects: [{ type: "request-autosave", revision }]
  };
}

export function executeProjectSessionEffects(
  effects: readonly ProjectSessionEffect[],
  adapter: ProjectSessionEffectAdapter
) {
  for (const effect of effects) {
    if (effect.type === "request-autosave") adapter.requestAutosave(effect.revision);
    if (effect.type === "clear-autosave") adapter.clearAutosave?.();
  }
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
    guidedWorkflow: guidedWorkflowCapabilities(session)
  });
}

function guidedWorkflowCapabilities<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
): GuidedWorkflowCapabilities {
  const progress = normalizedWorkflowProgress(session.project);
  const steps = workflowStepItems(progress, { hasAnalysis: hasAnalysis(session.project) }).map((item) => (
    session.guidedWorkflowBlocked && (item.step === "colors" || item.step === "export")
      ? { ...item, status: "locked" as const, clickable: false }
      : item
  ));
  return Object.freeze({
    progress: Object.freeze(progress),
    steps: Object.freeze(steps.map((item) => Object.freeze(item))),
    canCompleteLineworkReview: hasValidCutLine(session.project) && !session.guidedWorkflowBlocked,
    canCompleteColorReview: progress.lineworkReviewed && !session.guidedWorkflowBlocked,
    canRestartColorReview: progress.lineworkReviewed && progress.colorsOutcome !== "incomplete" && !session.guidedWorkflowBlocked
  });
}

function normalizeProjectWorkflow<TProject extends ProjectSessionProject>(project: TProject): TProject {
  const progress = normalizedWorkflowProgress(project);
  const current = project.workflowProgress;
  if (current && sameWorkflowProgress(current, progress)) return project;
  return { ...project, workflowProgress: progress } as TProject;
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

function hasAnalysis(project: ProjectSessionProject) {
  return project.analysis !== null;
}

function hasValidCutLine(project: ProjectSessionProject) {
  return Boolean(project.analysis?.outerCutPath.trim());
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
  project: TProject
): ProjectSessionTransition<TProject> {
  const revision = session.revision + 1;
  const nextSession = { ...session, revision, project: normalizeProjectWorkflow(project) };
  return {
    session: nextSession,
    capabilities: projectCapabilities(nextSession),
    outcome: { status: "applied" },
    effects: [{ type: "request-autosave", revision }]
  };
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
