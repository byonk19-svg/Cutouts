import { buildTraceQualityReview } from "../src/traceQuality.ts";
import type { CutoutProjectAnalysis } from "../src/cutoutProject.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const analysis: CutoutProjectAnalysis = {
  sourceWidthPx: 1000,
  sourceHeightPx: 1200,
  subjectBoundsPx: [100, 80, 900, 1120],
  finishedWidthIn: 28,
  finishedHeightIn: 36,
  tileCols: 4,
  tileRows: 4,
  tileCount: 16,
  previewPngDataUrl: "data:image/png;base64,preview",
  outerLinePngDataUrl: "data:image/png;base64,outer",
  outerCutPath: "M 10 12 L 270 12 L 270 712 L 10 712 Z",
  detailLinePngDataUrl: "data:image/png;base64,detail",
  paintGuidePngDataUrl: "data:image/png;base64,paint",
  previewWidthPx: 280,
  previewHeightPx: 720,
  palette: [],
  traceQuality: {
    subjectCoverage: 0.42,
    fakeCheckerboardBackground: true,
    warnings: ["This image looks like it has a checkerboard background baked into the file."]
  }
};

{
  const review = buildTraceQualityReview({
    analysis,
    manualStrokeCount: 0,
    showReference: true,
    printPreview: false
  });

  assertEqual(review.cutlineStatus, "OK", "review should report cutline status");
  assertEqual(review.vectorCutlinePresent, true, "review should detect vector path");
  assertEqual(review.vectorPointCount, 4, "review should count vector cutline points");
  assertEqual(review.pathInsidePreview, true, "review should confirm path bounds are inside preview");
  assertEqual(review.previewBoundsText, "280 x 720 px", "review should format preview bounds");
  assertEqual(review.subjectBoundsText, "100,80 -> 900,1120 px", "review should format subject bounds");
  assertEqual(review.tileCountText, "4 x 4 pages (16 total)", "review should format tile layout");
  assertEqual(review.originalUnderlayStatus, "Visible", "review should report visible underlay");
  assertEqual(review.manualDetailLineCount, 0, "review should include manual stroke count");
  assertEqual(review.detailLineStatus, "None", "review should report missing detail lines");
  assertEqual(review.detailCleanupStatus, "Review recommended", "review should recommend cleanup review until the checklist is accepted");
  assert(review.warnings.some((warning) => warning.includes("checkerboard background")), "review should keep backend checkerboard warning");
  assert(review.warnings.some((warning) => warning.includes("Manual tracing recommended")), "review should warn when no manual detail lines exist");
  assertEqual(review.exportReadiness, "Good for outside cutline, incomplete for paint/details", "review should summarize export readiness");
}

{
  const review = buildTraceQualityReview({
    analysis,
    manualStrokeCount: 0,
    starterDetailLinesPresent: true,
    detailCleanupAccepted: false,
    showReference: true,
    printPreview: false
  });

  assertEqual(review.detailLineStatus, "Editable starter lines present", "starter workflow should count the accepted editable detail layer");
  assertEqual(review.detailCleanupStatus, "Review recommended", "starter detail lines should still require cleanup review until the checklist is accepted");
  assert(!review.warnings.some((warning) => warning.includes("Manual tracing recommended")), "starter workflow should not demand manual tracing when editable detail lines exist");
  assertEqual(review.exportReadiness, "Technically ready to export", "starter detail layer should make the packet technically ready to export");
}

{
  const review = buildTraceQualityReview({
    analysis: { ...analysis, outerCutPath: "", traceQuality: { subjectCoverage: 0.02, fakeCheckerboardBackground: false, warnings: [] } },
    manualStrokeCount: 2,
    showReference: false,
    printPreview: false
  });

  assertEqual(review.cutlineStatus, "Needs regeneration", "missing vector path should require regeneration");
  assertEqual(review.vectorCutlinePresent, false, "missing vector path should be reported");
  assertEqual(review.originalUnderlayStatus, "Hidden", "hidden reference should be reported");
  assertEqual(review.detailCleanupStatus, "Review recommended", "missing cutline should still default cleanup review to recommended");
  assert(review.warnings.some((warning) => warning.includes("Regenerate the cutline")), "review should warn about old analysis with missing vector path");
  assert(review.warnings.some((warning) => warning.includes("small detected subject")), "review should warn about low subject coverage");
}

{
  const review = buildTraceQualityReview({
    analysis,
    manualStrokeCount: 1,
    detailCleanupAccepted: true,
    showReference: false,
    printPreview: true
  });

  assertEqual(review.detailLineStatus, "1 manual stroke", "manual strokes should still be reported");
  assertEqual(review.detailCleanupStatus, "Accepted", "accepted cleanup checklist should be reflected in the review");
  assertEqual(review.originalUnderlayStatus, "Hidden in print preview", "print preview should still hide the underlay");
  assertEqual(review.exportReadiness, "Technically ready to export", "manual detail lines plus cutline should be technically ready to export");
}
