import type { TraceStroke } from "./traceStrokes";
import type { TraceViewport } from "./traceViewport";
import type { Settings, TraceMode } from "./traceWorkflow";
import type { PaintGuideEdit } from "./paintGuide";

export const CUTOUT_PROJECT_SCHEMA_VERSION = 1;
export const CUTOUT_AUTOSAVE_KEY = "cutout-studio:auto-save:v1";

export type ProjectSourceImage = {
  name: string;
  type: string;
  dataUrl: string;
};

export type ProjectPaintMatch = {
  brand: string;
  name: string;
  hex: string;
  distance: number;
  source: string;
};

export type ProjectPaletteColor = {
  hex: string;
  coverage: number;
  matches: ProjectPaintMatch[];
};

export type CutoutProjectAnalysis = {
  finishedWidthIn: number;
  finishedHeightIn: number;
  tileCols: number;
  tileRows: number;
  tileCount: number;
  previewPngDataUrl: string;
  outerLinePngDataUrl: string;
  detailLinePngDataUrl: string;
  paintGuidePngDataUrl: string;
  previewWidthPx: number;
  previewHeightPx: number;
  palette: ProjectPaletteColor[];
};

export type ProjectLayerVisibility = {
  showReference: boolean;
  showCutline: boolean;
  showManualLines: boolean;
  showSuggestions: boolean;
  printPreview: boolean;
};

export type CutoutProject = {
  schemaVersion: typeof CUTOUT_PROJECT_SCHEMA_VERSION;
  projectName: string;
  createdAt: string;
  updatedAt: string;
  sourceImage: ProjectSourceImage;
  settings: Settings;
  traceMode: TraceMode;
  analysis: CutoutProjectAnalysis;
  manualStrokes: TraceStroke[];
  paintGuideEdits: PaintGuideEdit[];
  referenceOpacity: number;
  layerVisibility: ProjectLayerVisibility;
  traceViewport: TraceViewport;
};

export type CutoutProjectSnapshotInput = Omit<CutoutProject, "schemaVersion">;

export function createCutoutProjectSnapshot(input: CutoutProjectSnapshotInput): CutoutProject {
  return {
    schemaVersion: CUTOUT_PROJECT_SCHEMA_VERSION,
    projectName: input.projectName.trim() || "Cutout Project",
    createdAt: input.createdAt,
    updatedAt: input.updatedAt,
    sourceImage: { ...input.sourceImage },
    settings: { ...input.settings },
    traceMode: input.traceMode,
    analysis: {
      ...input.analysis,
      palette: input.analysis.palette.map((color) => ({
        ...color,
        matches: color.matches.map((match) => ({ ...match }))
      }))
    },
    manualStrokes: input.manualStrokes.map((stroke) => ({
      ...stroke,
      points: stroke.points.map((point) => ({ ...point }))
    })),
    paintGuideEdits: input.paintGuideEdits.map((edit) => ({ ...edit })),
    referenceOpacity: input.referenceOpacity,
    layerVisibility: {
      ...input.layerVisibility,
      printPreview: false
    },
    traceViewport: { ...input.traceViewport }
  };
}

export function serializeCutoutProject(project: CutoutProject) {
  return JSON.stringify(project, null, 2);
}

export function restoreCutoutProject(raw: unknown): CutoutProject {
  const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
  if (!isRecord(parsed)) throw new Error("Project file is not valid JSON.");
  if (parsed.schemaVersion !== CUTOUT_PROJECT_SCHEMA_VERSION) {
    throw new Error("This project file uses an unsupported Cutout Studio version.");
  }

  const project = parsed as CutoutProject & { paintGuideEdits?: unknown };
  assertString(project.projectName, "projectName");
  assertString(project.createdAt, "createdAt");
  assertString(project.updatedAt, "updatedAt");
  assertSourceImage(project.sourceImage);
  assertSettings(project.settings);
  assertTraceMode(project.traceMode);
  assertAnalysis(project.analysis);
  assertManualStrokes(project.manualStrokes);
  if (!Array.isArray(project.paintGuideEdits)) project.paintGuideEdits = [];
  assertPaintGuideEdits(project.paintGuideEdits);
  assertLayerVisibility(project.layerVisibility);
  assertTraceViewport(project.traceViewport);
  assertNumber(project.referenceOpacity, "referenceOpacity");

  return createCutoutProjectSnapshot({
    ...project,
    layerVisibility: {
      ...project.layerVisibility,
      printPreview: false
    }
  });
}

export function projectFileName(projectName: string) {
  const slug = projectName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "cutout-project"}.cutout.json`;
}

function assertSourceImage(value: unknown): asserts value is ProjectSourceImage {
  if (!isRecord(value)) throw new Error("Project source image is missing.");
  assertString(value.name, "sourceImage.name");
  assertString(value.type, "sourceImage.type");
  assertString(value.dataUrl, "sourceImage.dataUrl");
}

function assertSettings(value: unknown): asserts value is Settings {
  if (!isRecord(value)) throw new Error("Project settings are missing.");
  for (const key of ["finishedHeightIn", "threshold", "smoothing", "speckArea", "holeArea", "detailCleanup", "paletteSize"] as const) {
    assertNumber(value[key], `settings.${key}`);
  }
  if (typeof value.detailLines !== "boolean") throw new Error("Project settings.detailLines is invalid.");
  if (typeof value.includeInstructionCoverPage !== "boolean") {
    value.includeInstructionCoverPage = true;
  }
  if (typeof value.includePaintGuidePage !== "boolean") {
    value.includePaintGuidePage = true;
  }
  assertTraceMode(value.templateStyle);
}

function assertTraceMode(value: unknown): asserts value is TraceMode {
  if (value !== "outline" && value !== "paint" && value !== "manual" && value !== "marker" && value !== "extra") {
    throw new Error("Project trace mode is invalid.");
  }
}

function assertAnalysis(value: unknown): asserts value is CutoutProjectAnalysis {
  if (!isRecord(value)) throw new Error("Project analysis is missing.");
  for (const key of ["finishedWidthIn", "finishedHeightIn", "tileCols", "tileRows", "tileCount", "previewWidthPx", "previewHeightPx"] as const) {
    assertNumber(value[key], `analysis.${key}`);
  }
  for (const key of ["previewPngDataUrl", "outerLinePngDataUrl", "detailLinePngDataUrl", "paintGuidePngDataUrl"] as const) {
    assertString(value[key], `analysis.${key}`);
  }
  if (!Array.isArray(value.palette)) throw new Error("Project analysis palette is invalid.");
}

function assertManualStrokes(value: unknown): asserts value is TraceStroke[] {
  if (!Array.isArray(value)) throw new Error("Project manual strokes are invalid.");
  for (const stroke of value) {
    if (!isRecord(stroke)) throw new Error("Project manual stroke is invalid.");
    assertString(stroke.id, "manualStrokes.id");
    assertNumber(stroke.width, "manualStrokes.width");
    if (stroke.color !== "#000000" || stroke.tool !== "draw") throw new Error("Project manual stroke style is invalid.");
    if (!Array.isArray(stroke.points)) throw new Error("Project manual stroke points are invalid.");
    for (const point of stroke.points) {
      if (!isRecord(point)) throw new Error("Project manual stroke point is invalid.");
      assertNumber(point.x, "manualStrokes.points.x");
      assertNumber(point.y, "manualStrokes.points.y");
    }
  }
}

function assertPaintGuideEdits(value: unknown): asserts value is PaintGuideEdit[] {
  if (!Array.isArray(value)) throw new Error("Project paint guide edits are invalid.");
  for (const edit of value) {
    if (!isRecord(edit)) throw new Error("Project paint guide edit is invalid.");
    assertString(edit.hex, "paintGuideEdits.hex");
    if (typeof edit.label !== "string") throw new Error("Project paintGuideEdits.label is invalid.");
    if (typeof edit.note !== "string") throw new Error("Project paintGuideEdits.note is invalid.");
    if (typeof edit.included !== "boolean") throw new Error("Project paintGuideEdits.included is invalid.");
  }
}

function assertLayerVisibility(value: unknown): asserts value is ProjectLayerVisibility {
  if (!isRecord(value)) throw new Error("Project layer visibility is missing.");
  for (const key of ["showReference", "showCutline", "showManualLines", "showSuggestions", "printPreview"] as const) {
    if (typeof value[key] !== "boolean") throw new Error(`Project layerVisibility.${key} is invalid.`);
  }
}

function assertTraceViewport(value: unknown): asserts value is TraceViewport {
  if (!isRecord(value)) throw new Error("Project viewport is missing.");
  assertNumber(value.zoom, "traceViewport.zoom");
  assertNumber(value.panX, "traceViewport.panX");
  assertNumber(value.panY, "traceViewport.panY");
}

function assertString(value: unknown, label: string): asserts value is string {
  if (typeof value !== "string" || value.length === 0) throw new Error(`Project ${label} is invalid.`);
}

function assertNumber(value: unknown, label: string): asserts value is number {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`Project ${label} is invalid.`);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
