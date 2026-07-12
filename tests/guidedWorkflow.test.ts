import {
  DEFAULT_WORKFLOW_PROGRESS,
  completeColorReview,
  completeLineworkReview,
  deriveLegacyWorkflowProgress,
  invalidateLineworkReview,
  navigateWorkflow,
  normalizeWorkflowProgress,
  resetWorkflowForSource,
  workflowStepItems,
  type WorkflowProgress
} from "../src/guidedWorkflow.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

{
  assertEqual(DEFAULT_WORKFLOW_PROGRESS.activeStep, "upload", "new work should start at Upload");
  assertEqual(DEFAULT_WORKFLOW_PROGRESS.lineworkReviewed, false, "new work should require linework review");
  assertEqual(DEFAULT_WORKFLOW_PROGRESS.colorsOutcome, "incomplete", "new work should require a Colors decision");
}

{
  const clean = navigateWorkflow(DEFAULT_WORKFLOW_PROGRESS, "clean", { hasAnalysis: true });
  const blockedColors = navigateWorkflow(clean, "colors", { hasAnalysis: true });
  const reviewed = completeLineworkReview(clean);
  const colors = navigateWorkflow(reviewed, "colors", { hasAnalysis: true });
  const exportReady = completeColorReview(colors, "skipped");

  assertEqual(clean.activeStep, "clean", "analysis should unlock Clean Lines");
  assertEqual(blockedColors.activeStep, "clean", "Colors should remain locked before linework review");
  assertEqual(reviewed.activeStep, "colors", "linework review should advance to Colors");
  assertEqual(colors.activeStep, "colors", "reviewed linework should unlock Colors navigation");
  assertEqual(exportReady.activeStep, "export", "a Colors decision should advance to Export");
  assertEqual(exportReady.colorsOutcome, "skipped", "skipping Colors should be durable workflow state");
}

{
  const reviewed: WorkflowProgress = {
    activeStep: "export",
    lineworkReviewed: true,
    colorsOutcome: "reviewed"
  };
  const invalidated = invalidateLineworkReview(reviewed);

  assertEqual(invalidated.activeStep, "clean", "editing reviewed lines should return to Clean Lines");
  assertEqual(invalidated.lineworkReviewed, false, "editing lines should revoke linework review");
  assertEqual(invalidated.colorsOutcome, "incomplete", "editing lines should revoke the Colors milestone");
  assertEqual(resetWorkflowForSource(reviewed).activeStep, "upload", "replacing the Source Image should reset workflow progress");
}

{
  const invalid: WorkflowProgress = {
    activeStep: "export",
    lineworkReviewed: false,
    colorsOutcome: "reviewed"
  };
  const normalized = normalizeWorkflowProgress(invalid, { hasAnalysis: true });
  const withoutAnalysis = normalizeWorkflowProgress(invalid, { hasAnalysis: false });

  assertEqual(normalized.activeStep, "clean", "restore should clamp progress to the furthest valid step");
  assertEqual(normalized.colorsOutcome, "incomplete", "restore should remove a Colors outcome unsupported by linework review");
  assertEqual(withoutAnalysis.activeStep, "upload", "projects without analysis should restore to Upload");
}

{
  const untouched = deriveLegacyWorkflowProgress({
    hasAnalysis: true,
    cleanupChecks: { cutline: false, remove: false, draw: false, export: false },
    includePaintGuidePage: true
  });
  const lineworkReviewed = deriveLegacyWorkflowProgress({
    hasAnalysis: true,
    cleanupChecks: { cutline: true, remove: true, draw: true, export: false },
    includePaintGuidePage: true
  });
  const exportedWithoutColors = deriveLegacyWorkflowProgress({
    hasAnalysis: true,
    cleanupChecks: { cutline: true, remove: true, draw: true, export: true },
    includePaintGuidePage: false
  });

  assertEqual(untouched.activeStep, "clean", "legacy analyzed projects should resume at Clean Lines");
  assertEqual(lineworkReviewed.activeStep, "colors", "legacy cleanup completion should unlock Colors");
  assertEqual(exportedWithoutColors.activeStep, "export", "legacy exported projects should resume at Export");
  assertEqual(exportedWithoutColors.colorsOutcome, "skipped", "legacy export without Color Guide should derive skipped Colors");
}

{
  const progress: WorkflowProgress = {
    activeStep: "colors",
    lineworkReviewed: true,
    colorsOutcome: "incomplete"
  };
  const items = workflowStepItems(progress, { hasAnalysis: true });

  assertEqual(items.find((item) => item.step === "upload")?.status, "completed", "Upload should show completed after analysis");
  assertEqual(items.find((item) => item.step === "clean")?.status, "completed", "Clean Lines should show completed after review");
  assertEqual(items.find((item) => item.step === "colors")?.status, "current", "active Colors should show current");
  assertEqual(items.find((item) => item.step === "export")?.status, "locked", "Export should remain locked before a Colors decision");
  assert(items.filter((item) => item.clickable).every((item) => item.status !== "locked"), "locked steps should not be clickable");
}

{
  const items = workflowStepItems(DEFAULT_WORKFLOW_PROGRESS, { hasAnalysis: true });

  assertEqual(items.find((item) => item.step === "upload")?.clickable, true, "the current step should be clickable");
  assertEqual(items.find((item) => item.step === "clean")?.status, "available", "analysis should make Clean Lines available");
  assertEqual(items.find((item) => item.step === "clean")?.clickable, false, "available future steps should advance through the primary action");
}
