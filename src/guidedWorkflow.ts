export type WorkflowStep = "upload" | "clean" | "colors" | "export";
export type ColorsOutcome = "incomplete" | "reviewed" | "skipped";

export type WorkflowProgress = {
  activeStep: WorkflowStep;
  lineworkReviewed: boolean;
  colorsOutcome: ColorsOutcome;
};

export type WorkflowFacts = {
  hasAnalysis: boolean;
};

export type CleanupChecks = {
  cutline: boolean;
  remove: boolean;
  draw: boolean;
  export: boolean;
};

export type LegacyWorkflowFacts = WorkflowFacts & {
  cleanupChecks: CleanupChecks;
  includePaintGuidePage: boolean;
};

export type WorkflowStepItem = {
  step: WorkflowStep;
  label: string;
  status: "current" | "completed" | "available" | "locked";
  clickable: boolean;
};

export const WORKFLOW_STEPS: readonly WorkflowStep[] = ["upload", "clean", "colors", "export"];

export const DEFAULT_WORKFLOW_PROGRESS: WorkflowProgress = {
  activeStep: "upload",
  lineworkReviewed: false,
  colorsOutcome: "incomplete"
};

export function navigateWorkflow(
  progress: WorkflowProgress,
  target: WorkflowStep,
  facts: WorkflowFacts
): WorkflowProgress {
  const normalized = normalizeWorkflowProgress(progress, facts);
  if (!unlockedSteps(normalized, facts).includes(target)) return normalized;
  return { ...normalized, activeStep: target };
}

export function completeLineworkReview(progress: WorkflowProgress): WorkflowProgress {
  return {
    ...progress,
    activeStep: "colors",
    lineworkReviewed: true,
    colorsOutcome: "incomplete"
  };
}

export function completeColorReview(
  progress: WorkflowProgress,
  outcome: Exclude<ColorsOutcome, "incomplete">
): WorkflowProgress {
  if (!progress.lineworkReviewed) return invalidateLineworkReview(progress);
  return {
    ...progress,
    activeStep: "export",
    colorsOutcome: outcome
  };
}

export function invalidateLineworkReview(progress: WorkflowProgress): WorkflowProgress {
  return {
    ...progress,
    activeStep: "clean",
    lineworkReviewed: false,
    colorsOutcome: "incomplete"
  };
}

export function resetWorkflowForSource(_progress: WorkflowProgress): WorkflowProgress {
  return { ...DEFAULT_WORKFLOW_PROGRESS };
}

export function normalizeWorkflowProgress(
  progress: WorkflowProgress,
  facts: WorkflowFacts
): WorkflowProgress {
  if (!facts.hasAnalysis) return { ...DEFAULT_WORKFLOW_PROGRESS };

  const normalized = progress.lineworkReviewed
    ? { ...progress }
    : { ...progress, colorsOutcome: "incomplete" as const };
  const unlocked = unlockedSteps(normalized, facts);
  if (unlocked.includes(normalized.activeStep)) return normalized;
  return { ...normalized, activeStep: unlocked[unlocked.length - 1] };
}

export function deriveLegacyWorkflowProgress(facts: LegacyWorkflowFacts): WorkflowProgress {
  if (!facts.hasAnalysis) return { ...DEFAULT_WORKFLOW_PROGRESS };
  const lineworkReviewed = facts.cleanupChecks.cutline
    && facts.cleanupChecks.remove
    && facts.cleanupChecks.draw;
  if (!lineworkReviewed) {
    return { activeStep: "clean", lineworkReviewed: false, colorsOutcome: "incomplete" };
  }
  if (!facts.cleanupChecks.export) {
    return { activeStep: "colors", lineworkReviewed: true, colorsOutcome: "incomplete" };
  }
  return {
    activeStep: "export",
    lineworkReviewed: true,
    colorsOutcome: facts.includePaintGuidePage ? "reviewed" : "skipped"
  };
}

export function workflowStepItems(
  progress: WorkflowProgress,
  facts: WorkflowFacts
): WorkflowStepItem[] {
  const normalized = normalizeWorkflowProgress(progress, facts);
  const unlocked = new Set(unlockedSteps(normalized, facts));
  return WORKFLOW_STEPS.map((step) => {
    const status = step === normalized.activeStep
      ? "current"
      : isCompleted(step, normalized, facts)
        ? "completed"
        : unlocked.has(step)
          ? "available"
          : "locked";
    return {
      step,
      label: workflowStepLabel(step),
      status,
      clickable: status === "current" || status === "completed"
    };
  });
}

function unlockedSteps(progress: WorkflowProgress, facts: WorkflowFacts): WorkflowStep[] {
  const steps: WorkflowStep[] = ["upload"];
  if (!facts.hasAnalysis) return steps;
  steps.push("clean");
  if (!progress.lineworkReviewed) return steps;
  steps.push("colors");
  if (progress.colorsOutcome !== "incomplete") steps.push("export");
  return steps;
}

function isCompleted(step: WorkflowStep, progress: WorkflowProgress, facts: WorkflowFacts) {
  if (step === "upload") return facts.hasAnalysis;
  if (step === "clean") return progress.lineworkReviewed;
  if (step === "colors") return progress.colorsOutcome !== "incomplete";
  return false;
}

function workflowStepLabel(step: WorkflowStep) {
  if (step === "upload") return "Upload";
  if (step === "clean") return "Clean Lines";
  if (step === "colors") return "Colors";
  return "Export";
}
