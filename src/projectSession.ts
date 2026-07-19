import {
  resizeAnalysisForFinishedHeight,
  type CutoutProjectAnalysis
} from "./cutoutProject.ts";
import type { Settings } from "./traceWorkflow.ts";

export type ProjectSessionProject = {
  projectName: string;
  settings: Settings;
  sourceImage?: ProjectSessionSourceImage | null;
  analysis: CutoutProjectAnalysis | null;
  editedDetailPngDataUrl?: string | null;
  manualStrokes?: readonly unknown[];
  projectPalette?: readonly unknown[];
  workflowProgress?: {
    activeStep: "upload" | "clean" | "colors" | "export";
    lineworkReviewed: boolean;
    colorsOutcome: "incomplete" | "reviewed" | "skipped";
  };
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
};

export type ProjectCapabilities = {
  readonly renameProject: boolean;
  readonly changeFinishedSize: boolean;
  readonly selectSourceImage: boolean;
  readonly analyzeSource: boolean;
  readonly regenerateAnalysis: boolean;
  readonly startNewProject: boolean;
};

export type ProjectSessionAction<TProject extends ProjectSessionProject = ProjectSessionProject> =
  | { type: "rename-project"; projectName: string }
  | { type: "change-finished-size"; finishedHeightIn: number }
  | { type: "hydrate-project"; project: TProject }
  | { type: "update-non-size-settings"; settings: Settings }
  | { type: "replace-analysis"; analysis: CutoutProjectAnalysis | null }
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
    | { status: "rejected"; error: { code: "invalid-project-name" | "invalid-finished-size" | "analysis-size-mismatch"; message: string } };
  effects: readonly ProjectSessionEffect[];
};

export type ProjectSessionEffectAdapter = {
  requestAutosave: (revision: number) => void;
  clearAutosave?: () => void;
};

export function createProjectSession<TProject extends ProjectSessionProject>(
  project: TProject
): ProjectSession<TProject> {
  return { revision: 0, project, operation: { status: "idle" }, nextOperationId: 1 };
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
      project: action.project,
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
        ? action.project
        : action.type === "update-non-size-settings"
          ? {
              ...session.project,
              settings: {
                ...action.settings,
                finishedHeightIn: session.project.settings.finishedHeightIn
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
    startNewProject: true
  });
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
  code: "invalid-project-name" | "invalid-finished-size" | "analysis-size-mismatch",
  message: string
): ProjectSessionTransition<TProject> {
  return {
    session,
    capabilities: projectCapabilities(session),
    outcome: { status: "rejected", error: { code, message } },
    effects: []
  };
}
