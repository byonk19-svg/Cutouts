import type { CutoutProjectAnalysis } from "./cutoutProject.ts";

export type TraceQualityReviewInput = {
  analysis: CutoutProjectAnalysis;
  manualStrokeCount: number;
  showReference: boolean;
  printPreview: boolean;
};

export type TraceQualityReview = {
  cutlineStatus: "OK" | "Needs regeneration";
  vectorCutlinePresent: boolean;
  vectorPointCount: number;
  pathInsidePreview: boolean;
  previewBoundsText: string;
  subjectBoundsText: string;
  tileCountText: string;
  originalUnderlayStatus: "Visible" | "Hidden" | "Hidden in print preview";
  manualDetailLineCount: number;
  exportReadiness: "Ready" | "Good for outside cutline, incomplete for paint/details" | "Regenerate cutline first";
  warnings: string[];
};

export function buildTraceQualityReview({
  analysis,
  manualStrokeCount,
  showReference,
  printPreview
}: TraceQualityReviewInput): TraceQualityReview {
  const vectorCutlinePresent = analysis.outerCutPath.trim().length > 0;
  const pathBounds = pathBoundsFromData(analysis.outerCutPath);
  const pathInsidePreview = pathBounds
    ? pathBounds.minX >= 0
      && pathBounds.minY >= 0
      && pathBounds.maxX <= analysis.previewWidthPx
      && pathBounds.maxY <= analysis.previewHeightPx
    : false;
  const warnings = [...(analysis.traceQuality?.warnings ?? [])];

  if (!vectorCutlinePresent) {
    warnings.push("Regenerate the cutline before exporting SVG linework.");
  } else if (!pathInsidePreview) {
    warnings.push("The vector cutline extends outside the preview bounds. Regenerate the cutline before exporting SVG.");
  }
  if ((analysis.traceQuality?.subjectCoverage ?? 1) < 0.05) {
    warnings.push("The trace has a small detected subject. Check that the source image contains one complete cutout subject.");
  }
  if (manualStrokeCount === 0) {
    warnings.push("Manual tracing recommended: no interior detail lines have been drawn yet.");
  }

  return {
    cutlineStatus: vectorCutlinePresent ? "OK" : "Needs regeneration",
    vectorCutlinePresent,
    vectorPointCount: analysis.traceQuality?.vectorCutlinePointCount ?? countPathPoints(analysis.outerCutPath),
    pathInsidePreview,
    previewBoundsText: `${analysis.previewWidthPx} x ${analysis.previewHeightPx} px`,
    subjectBoundsText: subjectBoundsText(analysis),
    tileCountText: `${analysis.tileCols} x ${analysis.tileRows} pages (${analysis.tileCount} total)`,
    originalUnderlayStatus: printPreview ? "Hidden in print preview" : showReference ? "Visible" : "Hidden",
    manualDetailLineCount: manualStrokeCount,
    exportReadiness: exportReadiness(vectorCutlinePresent, manualStrokeCount),
    warnings: uniqueWarnings(warnings)
  };
}

function exportReadiness(vectorCutlinePresent: boolean, manualStrokeCount: number): TraceQualityReview["exportReadiness"] {
  if (!vectorCutlinePresent) return "Regenerate cutline first";
  if (manualStrokeCount === 0) return "Good for outside cutline, incomplete for paint/details";
  return "Ready";
}

function subjectBoundsText(analysis: CutoutProjectAnalysis) {
  const bounds = analysis.subjectBoundsPx;
  if (!bounds) return "Unavailable";
  const [left, top, right, bottom] = bounds;
  return `${left},${top} -> ${right},${bottom} px`;
}

function countPathPoints(pathData: string) {
  return (pathData.match(/[ML]\s+-?\d+(?:\.\d+)?\s+-?\d+(?:\.\d+)?/g) ?? []).length;
}

function pathBoundsFromData(pathData: string) {
  const values = Array.from(pathData.matchAll(/-?\d+(?:\.\d+)?/g), (match) => Number(match[0]));
  if (values.length < 4) return null;
  const xs = values.filter((_, index) => index % 2 === 0);
  const ys = values.filter((_, index) => index % 2 === 1);
  return {
    minX: Math.min(...xs),
    minY: Math.min(...ys),
    maxX: Math.max(...xs),
    maxY: Math.max(...ys)
  };
}

function uniqueWarnings(warnings: string[]) {
  return [...new Set(warnings.filter(Boolean))];
}
