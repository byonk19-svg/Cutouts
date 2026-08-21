import type {
  AcceptedCutLineReinforcement,
  ThinSilhouetteDiagnosticMetadata,
  ThinSilhouetteTopologyChanges
} from "./cutoutProject.ts";

export const MIN_REINFORCEMENT_WIDTH_IN = 0.25;
export const INITIAL_REINFORCEMENT_WIDTH_IN = 0.50;
export const MAX_REINFORCEMENT_WIDTH_IN = 0.75;
export const REINFORCEMENT_NOT_SAFETY_COPY = "This finished width is a visual reinforcement control, not a universal safety recommendation for wood, blades, or handling.";

export type ThinSilhouetteProposalResponse = AcceptedCutLineReinforcement & {
  diagnostic: ThinSilhouetteDiagnosticMetadata;
  excludedSmallComponentCount: number;
};

export function parseThinSilhouetteProposalResponse(value: unknown): ThinSilhouetteProposalResponse {
  if (!isRecord(value)) throw new Error("The reinforced Cut Line response is invalid.");
  const minimumWidthIn = finiteNumber(value.minimumWidthIn, "minimumWidthIn");
  if (minimumWidthIn < MIN_REINFORCEMENT_WIDTH_IN || minimumWidthIn > MAX_REINFORCEMENT_WIDTH_IN) {
    throw new Error("The reinforced Cut Line width is outside the review range.");
  }
  const outerCutPath = nonEmptyString(value.outerCutPath, "outerCutPath");
  if (!outerCutPath.startsWith("M ") || !outerCutPath.endsWith("Z")) {
    throw new Error("The reinforced Cut Line path is invalid.");
  }
  const outerLinePngDataUrl = nonEmptyString(value.outerLinePngDataUrl, "outerLinePngDataUrl");
  if (!outerLinePngDataUrl.startsWith("data:image/png;base64,")) {
    throw new Error("The reinforced Cut Line preview is invalid.");
  }
  const previewWidthPx = positiveInteger(value.previewWidthPx, "previewWidthPx");
  const previewHeightPx = positiveInteger(value.previewHeightPx, "previewHeightPx");
  const topologyChanges = parseTopologyChanges(value.topologyChanges);
  const diagnostic = parseDiagnostic(value.diagnostic);
  const excludedSmallComponentCount = nonNegativeInteger(value.excludedSmallComponentCount, "excludedSmallComponentCount");
  return {
    minimumWidthIn,
    outerCutPath,
    outerLinePngDataUrl,
    previewWidthPx,
    previewHeightPx,
    topologyChanges,
    diagnostic,
    excludedSmallComponentCount
  };
}

export function topologyChangeSummary(topology: ThinSilhouetteTopologyChanges) {
  const changes: string[] = [];
  if (topology.componentsJoined) changes.push("The proposal joined previously separate components.");
  if (topology.enclosedRegionsChanged) changes.push("The proposal changed enclosed regions.");
  if (topology.gapMergeWarning) changes.push("Nearby parts or intentional gaps may have merged.");
  return changes.length > 0 ? changes.join(" ") : "No topology change was detected.";
}

function parseTopologyChanges(value: unknown): ThinSilhouetteTopologyChanges {
  if (!isRecord(value)) throw new Error("The reinforced Cut Line topology is invalid.");
  return {
    componentsBefore: nonNegativeInteger(value.componentsBefore, "componentsBefore"),
    componentsAfter: nonNegativeInteger(value.componentsAfter, "componentsAfter"),
    holesBefore: nonNegativeInteger(value.holesBefore, "holesBefore"),
    holesAfter: nonNegativeInteger(value.holesAfter, "holesAfter"),
    componentsJoined: booleanValue(value.componentsJoined, "componentsJoined"),
    enclosedRegionsChanged: booleanValue(value.enclosedRegionsChanged, "enclosedRegionsChanged"),
    gapMergeWarning: booleanValue(value.gapMergeWarning, "gapMergeWarning")
  };
}

function parseDiagnostic(value: unknown): ThinSilhouetteDiagnosticMetadata {
  if (!isRecord(value)) throw new Error("The reinforced Cut Line diagnostic is invalid.");
  return {
    detected: booleanValue(value.detected, "detected"),
    minimumWidthIn: finiteNumber(value.minimumWidthIn, "diagnostic.minimumWidthIn"),
    p10WidthIn: finiteNumber(value.p10WidthIn, "diagnostic.p10WidthIn"),
    thinFraction: finiteNumber(value.thinFraction, "diagnostic.thinFraction"),
    longestThinRunIn: finiteNumber(value.longestThinRunIn, "diagnostic.longestThinRunIn"),
    componentCount: nonNegativeInteger(value.componentCount, "diagnostic.componentCount")
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function finiteNumber(value: unknown, label: string) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`The reinforced Cut Line ${label} is invalid.`);
  return value;
}

function positiveInteger(value: unknown, label: string) {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number <= 0) throw new Error(`The reinforced Cut Line ${label} is invalid.`);
  return number;
}

function nonNegativeInteger(value: unknown, label: string) {
  const number = finiteNumber(value, label);
  if (!Number.isInteger(number) || number < 0) throw new Error(`The reinforced Cut Line ${label} is invalid.`);
  return number;
}

function nonEmptyString(value: unknown, label: string) {
  if (typeof value !== "string" || value.trim().length === 0) throw new Error(`The reinforced Cut Line ${label} is invalid.`);
  return value;
}

function booleanValue(value: unknown, label: string) {
  if (typeof value !== "boolean") throw new Error(`The reinforced Cut Line ${label} is invalid.`);
  return value;
}
