import {
  resizeAnalysisForFinishedHeight,
  type CutoutProjectAnalysis
} from "./cutoutProject.ts";
import type { Settings } from "./traceWorkflow.ts";

export type ProjectSessionProject = {
  projectName: string;
  settings: Settings;
  analysis: CutoutProjectAnalysis | null;
};

export type ProjectSession<TProject extends ProjectSessionProject = ProjectSessionProject> = {
  revision: number;
  project: TProject;
};

export type ProjectCapabilities = {
  readonly renameProject: boolean;
  readonly changeFinishedSize: boolean;
};

export type ProjectSessionAction<TProject extends ProjectSessionProject = ProjectSessionProject> =
  | { type: "rename-project"; projectName: string }
  | { type: "change-finished-size"; finishedHeightIn: number }
  | { type: "hydrate-project"; project: TProject }
  | { type: "update-non-size-settings"; settings: Settings }
  | { type: "replace-analysis"; analysis: CutoutProjectAnalysis | null };

export type ProjectSessionEffect = {
  type: "request-autosave";
  revision: number;
};

export type ProjectSessionTransition<TProject extends ProjectSessionProject> = {
  session: ProjectSession<TProject>;
  capabilities: ProjectCapabilities;
  outcome:
    | { status: "applied" }
    | { status: "unchanged" }
    | { status: "rejected"; error: { code: "invalid-project-name" | "invalid-finished-size" | "analysis-size-mismatch"; message: string } };
  effects: readonly ProjectSessionEffect[];
};

export type ProjectSessionEffectAdapter = {
  requestAutosave: (revision: number) => void;
};

const PROJECT_CAPABILITIES: ProjectCapabilities = Object.freeze({
  renameProject: true,
  changeFinishedSize: true
});

export function createProjectSession<TProject extends ProjectSessionProject>(
  project: TProject
): ProjectSession<TProject> {
  return { revision: 0, project };
}

export function projectSessionView<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
) {
  return {
    revision: session.revision,
    project: session.project,
    capabilities: PROJECT_CAPABILITIES
  };
}

export function transitionProjectSession<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  action: ProjectSessionAction<TProject>
): ProjectSessionTransition<TProject> {
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
  const nextSession = { revision, project };

  return {
    session: nextSession,
    capabilities: PROJECT_CAPABILITIES,
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
  }
}

function isValidFinishedHeight(value: number) {
  return Number.isFinite(value) && value >= 6 && value <= 96;
}

function unchangedTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>
): ProjectSessionTransition<TProject> {
  return { session, capabilities: PROJECT_CAPABILITIES, outcome: { status: "unchanged" }, effects: [] };
}

function rejectedTransition<TProject extends ProjectSessionProject>(
  session: ProjectSession<TProject>,
  code: "invalid-project-name" | "invalid-finished-size" | "analysis-size-mismatch",
  message: string
): ProjectSessionTransition<TProject> {
  return {
    session,
    capabilities: PROJECT_CAPABILITIES,
    outcome: { status: "rejected", error: { code, message } },
    effects: []
  };
}
