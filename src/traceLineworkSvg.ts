import type { CutoutProjectAnalysis } from "./cutoutProject";
import type { TraceStroke } from "./traceStrokes";

export type TraceLineworkSvgInput = {
  projectName: string;
  analysis: CutoutProjectAnalysis;
  manualStrokes: TraceStroke[];
  acceptedDetailPngDataUrl?: string | null;
  includeCutline?: boolean;
  includeSuggestions?: boolean;
  includeWhiteBackground?: boolean;
  includeCalibration?: boolean;
};

export function buildTraceLineworkSvg({
  projectName,
  analysis,
  manualStrokes,
  acceptedDetailPngDataUrl = null,
  includeCutline = true,
  includeSuggestions = false,
  includeWhiteBackground = true,
  includeCalibration = true
}: TraceLineworkSvgInput) {
  const width = formatNumber(analysis.previewWidthPx);
  const height = formatNumber(analysis.previewHeightPx);
  const title = escapeXml(projectName.trim() || "Cutout Studio Linework");
  const parts = [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${formatNumber(analysis.finishedWidthIn)}in" height="${formatNumber(analysis.finishedHeightIn)}in" viewBox="0 0 ${width} ${height}" role="img" aria-labelledby="title desc">`,
    `<title id="title">${title}</title>`,
    `<desc id="desc">Printable cutout linework. Print at 100% / actual size. Finished size ${formatNumber(analysis.finishedWidthIn)} in wide by ${formatNumber(analysis.finishedHeightIn)} in tall.</desc>`
  ];

  if (includeWhiteBackground) {
    parts.push(`<rect id="white-background" x="0" y="0" width="${width}" height="${height}" fill="#ffffff"/>`);
  }
  if (includeCutline) {
    if (analysis.outerCutPath.trim()) {
      parts.push(cutlinePathLayer(analysis.outerCutPath));
    } else {
      parts.push("<!-- Missing vector cutline. Regenerate analysis to create outerCutPath. -->");
    }
  }
  if (includeSuggestions && !acceptedDetailPngDataUrl) {
    parts.push(imageLayer("suggestion-layer", analysis.detailLinePngDataUrl, width, height, "0.35"));
  }
  if (acceptedDetailPngDataUrl) {
    parts.push(imageLayer("accepted-detail-layer", acceptedDetailPngDataUrl, width, height, "1"));
  }

  parts.push('<g id="manual-strokes" fill="none" stroke="#000000" stroke-linecap="round" stroke-linejoin="round">');
  for (const stroke of manualStrokes) {
    const pathData = strokePathData(stroke);
    if (!pathData) continue;
    parts.push(`<path id="${escapeXml(stroke.id)}" d="${pathData}" stroke-width="${formatNumber(stroke.width)}"/>`);
  }
  parts.push("</g>");

  if (includeCalibration) {
    parts.push(calibrationMarkup(analysis));
  }

  parts.push("</svg>");
  return parts.join("\n");
}

export function svgLineworkFileName(projectName: string) {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "cutout"}-linework.svg`;
}

function imageLayer(id: string, dataUrl: string, width: string, height: string, opacity: string) {
  return `<image id="${id}" href="${escapeXml(dataUrl)}" x="0" y="0" width="${width}" height="${height}" opacity="${opacity}" preserveAspectRatio="none"/>`;
}

function cutlinePathLayer(pathData: string) {
  return `<path id="cutline-layer" d="${escapeXml(pathData)}" fill="none" stroke="#000000" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>`;
}

function strokePathData(stroke: TraceStroke) {
  if (stroke.points.length === 0) return "";
  const [first, ...rest] = stroke.points;
  if (rest.length === 0) {
    return `M ${formatNumber(first.x)} ${formatNumber(first.y)} l 0.01 0.01`;
  }
  return [
    `M ${formatNumber(first.x)} ${formatNumber(first.y)}`,
    ...rest.map((point) => `L ${formatNumber(point.x)} ${formatNumber(point.y)}`)
  ].join(" ");
}

function calibrationMarkup(analysis: CutoutProjectAnalysis) {
  const pxPerIn = analysis.previewHeightPx / analysis.finishedHeightIn;
  const size = formatNumber(pxPerIn);
  const margin = formatNumber(Math.max(pxPerIn * 0.25, 12));
  const labelY = formatNumber(Math.max(pxPerIn * 0.25, 12) + pxPerIn + Math.max(pxPerIn * 0.18, 10));
  const fontSize = formatNumber(Math.max(pxPerIn * 0.16, 9));
  return [
    '<g id="print-calibration" fill="none" stroke="#000000">',
    `<rect id="calibration-square" x="${margin}" y="${margin}" width="${size}" height="${size}" stroke-width="${formatNumber(Math.max(pxPerIn * 0.02, 1))}"/>`,
    `<text x="${margin}" y="${labelY}" fill="#000000" stroke="none" font-family="Arial, sans-serif" font-size="${fontSize}">1 in - Print at 100% / actual size</text>`,
    "</g>"
  ].join("\n");
}

function formatNumber(value: number) {
  return Number(value.toFixed(3)).toString();
}

function escapeXml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
