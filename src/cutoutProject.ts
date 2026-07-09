import type { TraceStroke } from "./traceStrokes";
import { DEFAULT_TRACE_VIEWPORT, type TraceViewport } from "./traceViewport.ts";
import type { Settings, TraceMode } from "./traceWorkflow";
import { paintGuideEditsFromProjectPalette, seedProjectPaletteFromDetected, type CraftPaintMatch, type PaintGuideEdit, type ProjectPaintColor } from "./paintGuide.ts";

export const CUTOUT_PROJECT_SCHEMA_VERSION = 1;
export const CUTOUT_AUTOSAVE_KEY = "cutout-studio:auto-save:v1";

export type ProjectSourceImage = {
  name: string;
  type: string;
  dataUrl: string;
};

export type ProjectPaintMatch = CraftPaintMatch;

export type ProjectPaletteColor = {
  hex: string;
  coverage: number;
  matches: ProjectPaintMatch[];
};

export type TraceQualityMetadata = {
  subjectCoverage: number;
  fakeCheckerboardBackground: boolean;
  discardedComponentCount?: number;
  discardedComponentCoverage?: number;
  vectorCutlinePointCount?: number;
  pathBoundsPx?: [number, number, number, number] | null;
  warnings: string[];
};

export type CutoutProjectAnalysis = {
  sourceWidthPx?: number;
  sourceHeightPx?: number;
  subjectBoundsPx?: [number, number, number, number];
  finishedWidthIn: number;
  finishedHeightIn: number;
  tileCols: number;
  tileRows: number;
  tileCount: number;
  previewPngDataUrl: string;
  outerLinePngDataUrl: string;
  outerCutPath: string;
  detailLinePngDataUrl: string;
  paintGuidePngDataUrl: string;
  previewWidthPx: number;
  previewHeightPx: number;
  palette: ProjectPaletteColor[];
  traceQuality?: TraceQualityMetadata;
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
  projectPalette: ProjectPaintColor[];
  paintGuideEdits: PaintGuideEdit[];
  referenceOpacity: number;
  layerVisibility: ProjectLayerVisibility;
  traceViewport: TraceViewport;
};

export type CutoutProjectSnapshotInput = Omit<CutoutProject, "schemaVersion" | "projectPalette" | "paintGuideEdits"> & {
  projectPalette?: ProjectPaintColor[];
  paintGuideEdits?: PaintGuideEdit[];
};

export function createCutoutProjectSnapshot(input: CutoutProjectSnapshotInput): CutoutProject {
  const projectPalette = cloneProjectPalette(input.projectPalette ?? seedProjectPaletteFromDetected(input.analysis.palette, input.paintGuideEdits ?? []));
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
    projectPalette,
    paintGuideEdits: input.paintGuideEdits
      ? input.paintGuideEdits.map((edit) => ({ ...edit }))
      : paintGuideEditsFromProjectPalette(projectPalette),
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

  const project = parsed as CutoutProject & { paintGuideEdits?: unknown; projectPalette?: unknown };
  assertString(project.createdAt, "createdAt");
  assertString(project.updatedAt, "updatedAt");
  assertSourceImage(project.sourceImage);
  if (typeof project.projectName !== "string") {
    project.projectName = cleanedProjectNameFromFileName(project.sourceImage.name);
  }
  assertString(project.projectName, "projectName");
  assertSettings(project.settings);
  assertTraceMode(project.traceMode);
  assertAnalysis(project.analysis);
  assertManualStrokes(project.manualStrokes);
  if (!Array.isArray(project.paintGuideEdits)) project.paintGuideEdits = [];
  assertPaintGuideEdits(project.paintGuideEdits);
  if (!Array.isArray(project.projectPalette)) {
    project.projectPalette = seedProjectPaletteFromDetected(project.analysis.palette, project.paintGuideEdits);
  }
  assertProjectPalette(project.projectPalette);
  assertLayerVisibility(project.layerVisibility);
  if (!isValidTraceViewport(project.traceViewport)) {
    project.traceViewport = DEFAULT_TRACE_VIEWPORT;
  }
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

export function cleanedProjectNameFromFileName(fileName: string) {
  const baseName = fileName
    .replace(/\.[^.]+$/, "")
    .replace(/\b(png|jpg|jpeg|webp|favpng|transparent|image|download)\b/gi, " ")
    .replace(/[()[\]{}]/g, " ")
    .replace(/[_-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  const words = baseName
    .split(" ")
    .filter((word) => word.length > 1 && !/^[a-f0-9]{8,}$/i.test(word))
    .slice(0, 4);
  const cleaned = words.length > 0 ? words.join(" ") : baseName;
  return titleCaseProjectName(cleaned).slice(0, 48).trim() || "Cutout Project";
}

function titleCaseProjectName(value: string) {
  return value.replace(/\b[a-z0-9][a-z0-9']*/gi, (word) => {
    if (/^[A-Z0-9]+$/.test(word) && word.length <= 4) return word;
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });
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
  if (typeof value.outerCutPath !== "string") {
    value.outerCutPath = "";
  }
  if (!Array.isArray(value.palette)) throw new Error("Project analysis palette is invalid.");
  if ("sourceWidthPx" in value) assertNumber(value.sourceWidthPx, "analysis.sourceWidthPx");
  if ("sourceHeightPx" in value) assertNumber(value.sourceHeightPx, "analysis.sourceHeightPx");
  if ("subjectBoundsPx" in value) assertBounds(value.subjectBoundsPx, "analysis.subjectBoundsPx");
  if ("traceQuality" in value && value.traceQuality !== undefined) assertTraceQuality(value.traceQuality);
}

function assertBounds(value: unknown, label: string): asserts value is [number, number, number, number] {
  if (!Array.isArray(value) || value.length !== 4) throw new Error(`Project ${label} is invalid.`);
  for (const item of value) {
    assertNumber(item, label);
  }
}

function assertTraceQuality(value: unknown): asserts value is TraceQualityMetadata {
  if (!isRecord(value)) throw new Error("Project analysis.traceQuality is invalid.");
  assertNumber(value.subjectCoverage, "analysis.traceQuality.subjectCoverage");
  if (typeof value.fakeCheckerboardBackground !== "boolean") throw new Error("Project analysis.traceQuality.fakeCheckerboardBackground is invalid.");
  if (!Array.isArray(value.warnings) || value.warnings.some((warning) => typeof warning !== "string")) {
    throw new Error("Project analysis.traceQuality.warnings is invalid.");
  }
  if ("discardedComponentCount" in value && value.discardedComponentCount !== undefined) {
    assertNumber(value.discardedComponentCount, "analysis.traceQuality.discardedComponentCount");
  }
  if ("discardedComponentCoverage" in value && value.discardedComponentCoverage !== undefined) {
    assertNumber(value.discardedComponentCoverage, "analysis.traceQuality.discardedComponentCoverage");
  }
  if ("vectorCutlinePointCount" in value && value.vectorCutlinePointCount !== undefined) {
    assertNumber(value.vectorCutlinePointCount, "analysis.traceQuality.vectorCutlinePointCount");
  }
  if (value.pathBoundsPx !== null && value.pathBoundsPx !== undefined) {
    assertBounds(value.pathBoundsPx, "analysis.traceQuality.pathBoundsPx");
  }
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
    if (!("selectedMatchId" in edit)) edit.selectedMatchId = null;
    if (edit.selectedMatchId !== null && typeof edit.selectedMatchId !== "string") throw new Error("Project paintGuideEdits.selectedMatchId is invalid.");
    if (!("manualOverride" in edit)) edit.manualOverride = "";
    if (typeof edit.manualOverride !== "string") throw new Error("Project paintGuideEdits.manualOverride is invalid.");
  }
}

function assertProjectPalette(value: unknown): asserts value is ProjectPaintColor[] {
  if (!Array.isArray(value)) throw new Error("Project paint palette is invalid.");
  for (const color of value) {
    if (!isRecord(color)) throw new Error("Project paint palette color is invalid.");
    assertString(color.id, "projectPalette.id");
    assertString(color.hex, "projectPalette.hex");
    if (typeof color.label !== "string") throw new Error("Project projectPalette.label is invalid.");
    if (typeof color.note !== "string") throw new Error("Project projectPalette.note is invalid.");
    if (typeof color.included !== "boolean") throw new Error("Project projectPalette.included is invalid.");
    if (!("selectedMatchId" in color)) color.selectedMatchId = null;
    if (color.selectedMatchId !== null && typeof color.selectedMatchId !== "string") throw new Error("Project projectPalette.selectedMatchId is invalid.");
    if (!("manualOverride" in color)) color.manualOverride = "";
    if (typeof color.manualOverride !== "string") throw new Error("Project projectPalette.manualOverride is invalid.");
    assertNumber(color.coverage, "projectPalette.coverage");
    if (!Array.isArray(color.matches)) throw new Error("Project projectPalette.matches is invalid.");
    if (typeof color.locked !== "boolean") color.locked = false;
    if (color.source !== "detected" && color.source !== "manual") color.source = "manual";
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

function isValidTraceViewport(value: unknown): value is TraceViewport {
  return isRecord(value)
    && typeof value.zoom === "number"
    && Number.isFinite(value.zoom)
    && typeof value.panX === "number"
    && Number.isFinite(value.panX)
    && typeof value.panY === "number"
    && Number.isFinite(value.panY);
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

function cloneProjectPalette(palette: ProjectPaintColor[]): ProjectPaintColor[] {
  return palette.map((color) => ({
    ...color,
    matches: color.matches.map((match) => ({ ...match }))
  }));
}
