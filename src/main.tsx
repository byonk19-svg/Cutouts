import { StrictMode, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ChevronLeft, ChevronRight, Copy, Download, Eraser, Eye, FileImage, FileText, FolderOpen, Hand, ListChecks, MousePointerClick, Pencil, Redo2, RefreshCw, RotateCcw, Save, SlidersHorizontal, SwatchBook, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  CUTOUT_AUTOSAVE_KEY,
  cleanedProjectNameFromFileName,
  createCutoutProjectSnapshot,
  projectFileName,
  restoreCutoutProject,
  serializeCutoutProject,
  type CutoutProject,
  type CutoutProjectAnalysis
} from "./cutoutProject";
import { removeClickedDetailSegment } from "./detailEditor";
import {
  addProjectPaintColor,
  filterPaintGuideEntries,
  groupShoppingListItems,
  isValidHexColor,
  matchConfidenceLabel,
  matchDisplayName,
  mergeProjectPaintColors,
  paintGuideEditsFromProjectPalette,
  paintGuideEntriesForProjectPalette,
  paintSanityWarnings,
  removeProjectPaintColor,
  seedProjectPaletteFromDetected,
  shoppingListText,
  updateProjectPaintColor,
  type PaintGuideEntry,
  type PaintReviewFilter,
  type ProjectPaintColor
} from "./paintGuide";
import {
  changeTraceStrokeWidth,
  createTraceStroke,
  deleteTraceStroke,
  drawTraceStrokes,
  duplicateTraceStroke,
  eraseTraceStrokes,
  moveTraceStroke,
  selectAdjacentTraceStroke,
  selectTracePointIndex,
  selectedTraceStrokeSummary,
  selectTraceStroke,
  simplifyTraceStrokeById,
  smoothTraceStrokeById,
  updateTraceStrokePoint,
  type StrokeEditResult,
  type TracePoint,
  type TraceStroke
} from "./traceStrokes";
import { buildTraceLineworkSvg, svgLineworkFileName } from "./traceLineworkSvg";
import { buildTraceQualityReview } from "./traceQuality";
import {
  DEFAULT_TRACE_VIEWPORT,
  boundsFromTraceStrokes,
  centerBoundsInViewport,
  fitBoundsToViewport,
  fittedTraceSize,
  fullCanvasBounds,
  mergeTraceBounds,
  panViewport,
  screenToTracePoint,
  zoomViewport,
  type TraceBounds,
  type TraceViewport
} from "./traceViewport";
import {
  detailPresetFromTraceMode,
  detailPresetHelp,
  detailPresetLabel,
  detailPresetSettings,
  opensEditorWithReference,
  traceModeHelp,
  traceModeLabel,
  traceModeSettings,
  type DetailPreset,
  type Settings,
  type TraceMode
} from "./traceWorkflow";
import "./styles.css";

type EditorTool = "erase" | "draw" | "smoothDraw" | "remove" | "select" | "pan";
type BrushSize = "thin" | "normal" | "bold";
type CleanupStep = "cutline" | "remove" | "draw" | "export";
type Analysis = CutoutProjectAnalysis;
type ProjectStatus = "No saved project" | "Unsaved changes" | "Auto-saved" | "Saved" | "Restored auto-save" | "Project opened" | "Project export failed" | "Project import failed" | "Auto-save failed";
type WorkflowStatus = "Complete" | "Next" | "Needs attention";
type WorkflowTarget = "setup" | "editor" | "paint" | "export";
type StrokeDragState = {
  mode: "move" | "point";
  strokeId: string;
  pointIndex?: number;
  startPoint: TracePoint;
  originalStrokes: TraceStroke[];
  moved: boolean;
};

const defaultSettings: Settings = {
  finishedHeightIn: 36,
  threshold: 42,
  smoothing: 4,
  speckArea: 60,
  holeArea: 220,
  detailLines: true,
  detailCleanup: 88,
  templateStyle: "paint",
  paletteSize: 6,
  includeInstructionCoverPage: true,
  includePaintGuidePage: true
};

const cleanupStepLabels: Record<CleanupStep, string> = {
  cutline: "Review cutline",
  remove: "Remove extra marks",
  draw: "Draw missing details",
  export: "Export printable template"
};

function App() {
  const [image, setImage] = useState<File | null>(null);
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState<string | null>(null);
  const [projectName, setProjectName] = useState("Cutout Project");
  const [projectCreatedAt, setProjectCreatedAt] = useState<string | null>(null);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("No saved project");
  const [autosavePaused, setAutosavePaused] = useState(false);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [traceMode, setTraceMode] = useState<TraceMode>("paint");
  const [autoStarterOpen, setAutoStarterOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTool, setEditorTool] = useState<EditorTool>("remove");
  const [brushSize, setBrushSize] = useState<BrushSize>("normal");
  const [showReference, setShowReference] = useState(false);
  const [referenceOpacity, setReferenceOpacity] = useState(35);
  const [showCutline, setShowCutline] = useState(true);
  const [showManualLines, setShowManualLines] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [printPreview, setPrintPreview] = useState(false);
  const [editableDetailLinesPresent, setEditableDetailLinesPresent] = useState(false);
  const [traceViewport, setTraceViewport] = useState<TraceViewport>(DEFAULT_TRACE_VIEWPORT);
  const [cutlineBounds, setCutlineBounds] = useState<TraceBounds | null>(null);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [dimUnselectedStrokes, setDimUnselectedStrokes] = useState(false);
  const [selectionFeedback, setSelectionFeedback] = useState("");
  const [cleanupChecks, setCleanupChecks] = useState<Record<CleanupStep, boolean>>({
    cutline: false,
    remove: false,
    draw: false,
    export: false
  });
  const [manualStrokes, setManualStrokes] = useState<TraceStroke[]>([]);
  const [projectPalette, setProjectPalette] = useState<ProjectPaintColor[]>([]);
  const [newPaintHex, setNewPaintHex] = useState("#f1c7a5");
  const [newPaintLabel, setNewPaintLabel] = useState("Skin tone");
  const [selectedPaintColorIds, setSelectedPaintColorIds] = useState<string[]>([]);
  const [paintReviewFilter, setPaintReviewFilter] = useState<PaintReviewFilter>("all");
  const [shoppingListStatus, setShoppingListStatus] = useState("");
  const [manualHistory, setManualHistory] = useState<TraceStroke[][]>([]);
  const [manualRedoHistory, setManualRedoHistory] = useState<TraceStroke[][]>([]);
  const [history, setHistory] = useState<string[]>([]);
  const [redoHistory, setRedoHistory] = useState<string[]>([]);
  const [editedDetailDataUrl, setEditedDetailDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const setupSectionRef = useRef<HTMLDivElement | null>(null);
  const traceEditorSectionRef = useRef<HTMLDivElement | null>(null);
  const paintReviewSectionRef = useRef<HTMLElement | null>(null);
  const exportSectionRef = useRef<HTMLDivElement | null>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorViewportRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef<TracePoint | null>(null);
  const lastPointRef = useRef<TracePoint | null>(null);
  const smoothAnchorRef = useRef<TracePoint | null>(null);
  const draftStrokeRef = useRef<TraceStroke | null>(null);
  const strokeDragRef = useRef<StrokeDragState | null>(null);
  const strokeIdRef = useRef(0);
  const pendingContentFitRef = useRef(false);

  const canAnalyze = image !== null && !busy;
  const canExport = image !== null && analysis !== null && !busy;
  const canSaveProject = image !== null && sourceImageDataUrl !== null && analysis !== null && !busy;
  const canExportSvg = analysis !== null && analysis.outerCutPath.trim().length > 0 && !busy;
  const selectedDetailPreset = detailPresetFromTraceMode(traceMode);
  const traceStudioOpen = traceMode === "manual";
  const selectedStroke = selectedStrokeId ? manualStrokes.find((stroke) => stroke.id === selectedStrokeId) ?? null : null;
  const selectedStrokeSummary = selectedTraceStrokeSummary(manualStrokes, selectedStrokeId);
  const undoDisabled = traceStudioOpen ? manualHistory.length === 0 : history.length === 0;
  const redoDisabled = traceStudioOpen ? manualRedoHistory.length === 0 : redoHistory.length === 0;
  const primaryTraceActionLabel = traceActionLabel({ image, analysis, busy, traceMode });
  const paintGuideEntries = paintGuideEntriesForProjectPalette(projectPalette);
  const paintWarnings = paintSanityWarnings(paintGuideEntries);
  const visiblePaintGuideEntries = filterPaintGuideEntries(paintGuideEntries, paintReviewFilter);
  const paintShoppingList = shoppingListText(paintGuideEntries);
  const canIncludePaintGuide = paintGuideEntries.length > 0;
  const detailCleanupAccepted = cleanupChecks.cutline && cleanupChecks.remove && cleanupChecks.draw;
  const traceQualityReview = analysis
    ? buildTraceQualityReview({
      analysis,
      manualStrokeCount: manualStrokes.length,
      starterDetailLinesPresent: !traceStudioOpen && editableDetailLinesPresent,
      detailCleanupAccepted,
      showReference,
      printPreview
    })
    : null;
  const workflowSteps = [
    workflowStep("Generate cutline", "setup", analysis !== null, image !== null),
    workflowStep("Edit template lines", "editor", manualStrokes.length > 0 || cleanupChecks.draw, analysis !== null),
    workflowStep("Review paint palette", "paint", paintGuideEntries.length > 0 && paintWarnings.length === 0, analysis !== null),
    workflowStep("Export packet", "export", cleanupChecks.export, canExport)
  ];
  const duplicatePaintSuggestion = groupDuplicatePaintPurchases(paintGuideEntries).find((group) => group.swatchNumbers.length > 1);

  useEffect(() => {
    if (analysis) return;
    resetEditorState();
  }, [analysis]);

  function resetEditorState() {
    setHistory([]);
    setRedoHistory([]);
    setEditedDetailDataUrl(null);
    setManualStrokes([]);
    setManualHistory([]);
    setManualRedoHistory([]);
    setSelectedStrokeId(null);
    setDimUnselectedStrokes(false);
    setSelectionFeedback("");
    setTraceViewport(DEFAULT_TRACE_VIEWPORT);
    setCutlineBounds(null);
    setPrintPreview(false);
    setEditableDetailLinesPresent(false);
  }

  useEffect(() => {
    try {
      const rawProject = localStorage.getItem(CUTOUT_AUTOSAVE_KEY);
      if (!rawProject) return;
      void applyProject(restoreCutoutProject(rawProject), "Restored auto-save").catch(() => {
        setProjectStatus("Project import failed");
      });
    } catch {
      setProjectStatus("Project import failed");
    }
  }, []);

  useEffect(() => {
    if (autosavePaused) return;
    const snapshot = buildProjectSnapshot();
    if (!snapshot) return;
    setProjectStatus("Unsaved changes");
    const timeoutId = window.setTimeout(() => {
      try {
        localStorage.setItem(CUTOUT_AUTOSAVE_KEY, serializeCutoutProject(snapshot));
        setProjectStatus("Auto-saved");
      } catch {
        setProjectStatus("Auto-save failed");
      }
    }, 450);

    return () => window.clearTimeout(timeoutId);
  }, [
    image,
    sourceImageDataUrl,
    projectName,
    projectCreatedAt,
    settings,
    traceMode,
    analysis,
    manualStrokes,
    projectPalette,
    referenceOpacity,
    showReference,
    showCutline,
    showManualLines,
    showSuggestions,
    printPreview,
    editedDetailDataUrl,
    traceViewport,
    autosavePaused
  ]);

  useEffect(() => {
    if (!analysis || !editorOpen) return;
    if (traceStudioOpen) {
      setEditableDetailLinesPresent(false);
      renderManualTraceLayer(manualStrokes);
      return;
    }
    loadDetailCanvas(editedDetailDataUrl ?? analysis.detailLinePngDataUrl);
  }, [analysis, dimUnselectedStrokes, editorOpen, editedDetailDataUrl, manualStrokes, printPreview, selectedStrokeId, traceStudioOpen]);

  useEffect(() => {
    let cancelled = false;
    setCutlineBounds(null);
    if (!analysis) return;
    void imageContentBounds(analysis.outerLinePngDataUrl, {
      width: analysis.previewWidthPx,
      height: analysis.previewHeightPx
    }).then((bounds) => {
      if (!cancelled) {
        setCutlineBounds(bounds ?? fullCanvasBounds({ width: analysis.previewWidthPx, height: analysis.previewHeightPx }));
      }
    });
    return () => {
      cancelled = true;
    };
  }, [analysis]);

  useEffect(() => {
    if (!pendingContentFitRef.current || !analysis || !editorOpen || !cutlineBounds) return;
    if (fitTraceViewportToContent()) {
      pendingContentFitRef.current = false;
    }
  }, [analysis, editorOpen, traceStudioOpen, cutlineBounds]);

  useEffect(() => {
    if (selectedStrokeId && !manualStrokes.some((stroke) => stroke.id === selectedStrokeId)) {
      setSelectedStrokeId(null);
    }
  }, [manualStrokes, selectedStrokeId]);

  useEffect(() => {
    if (printPreview) {
      setShowReference(false);
      setShowSuggestions(false);
      setShowCutline(true);
      setShowManualLines(true);
    }
  }, [printPreview]);

  async function analyze(nextSettings = settings) {
    if (!image) return;
    const preservedManualStrokes = traceStudioOpen ? manualStrokes : [];
    if (analysis && preservedManualStrokes.length > 0) {
      const shouldRegenerate = window.confirm("Regenerate the cutline? This may replace the cutline and starter lines. Your manual Trace Studio lines will be kept unless you reset details.");
      if (!shouldRegenerate) return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("image", image);
      payload.append("settings", JSON.stringify(nextSettings));
      const response = await fetch("/api/analyze", { method: "POST", body: payload });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to analyze image.");
      const openEditor = opensEditorWithReference(nextSettings.templateStyle);
      resetEditorState();
      setAnalysis(body);
      if (preservedManualStrokes.length > 0) setManualStrokes(preservedManualStrokes);
      setProjectPalette(seedProjectPaletteFromDetected(body.palette, []));
      setSelectedPaintColorIds([]);
      setEditorOpen(openEditor || preservedManualStrokes.length > 0);
      setShowReference(openEditor);
      setShowSuggestions(false);
      setShowCutline(true);
      setShowManualLines(true);
      setEditorTool(defaultEditorToolForTraceMode(nextSettings.templateStyle));
      pendingContentFitRef.current = openEditor || preservedManualStrokes.length > 0;
      resetCleanupChecks();
    } catch (err) {
      setAnalysis(null);
      setError(err instanceof Error ? err.message : "Unable to analyze image.");
    } finally {
      setBusy(false);
    }
  }

  async function exportPdf() {
    if (!image) return;
    if (traceStudioOpen && manualStrokes.length === 0) {
      const shouldContinue = window.confirm("No manual detail lines have been drawn yet. Export an outside-cutline-only packet?");
      if (!shouldContinue) return;
    }
    setBusy(true);
    setError(null);
    try {
      const payload = new FormData();
      const pdfSettings = {
        ...settings,
        projectName,
        paintGuideEntries,
        paintGuideEntriesOnly: true,
        manualStrokes: traceStudioOpen ? manualStrokes : [],
        manualStrokeSourceWidthPx: traceStudioOpen && analysis ? analysis.previewWidthPx : 0,
        manualStrokeSourceHeightPx: traceStudioOpen && analysis ? analysis.previewHeightPx : 0
      };
      payload.append("image", image);
      payload.append("settings", JSON.stringify(pdfSettings));
      const editedDetail = traceStudioOpen ? null : currentDetailDataUrl();
      if (editedDetail) payload.append("editedDetail", editedDetail);
      const response = await fetch("/api/export", { method: "POST", body: payload });
      if (!response.ok) {
        const body = await response.json();
        throw new Error(body.error || "Unable to export PDF.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "cutout-template-pack.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to export PDF.");
    } finally {
      setBusy(false);
      if (traceStudioOpen) {
        window.setTimeout(() => renderManualTraceLayer(manualStrokes), 0);
      }
    }
  }

  function exportSvgLinework() {
    if (!analysis) return;
    if (!analysis.outerCutPath.trim()) {
      setError("Regenerate the cutline before exporting SVG linework.");
      return;
    }
    try {
      const svg = buildTraceLineworkSvg({
        projectName,
        analysis,
        manualStrokes,
        acceptedDetailPngDataUrl: traceStudioOpen ? null : currentDetailDataUrl(),
        includeCutline: true,
        includeSuggestions: showSuggestions,
        includeWhiteBackground: true,
        includeCalibration: true
      });
      const blob = new Blob([svg], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = svgLineworkFileName(projectName);
      link.click();
      URL.revokeObjectURL(url);
    } catch {
      setError("Unable to export SVG linework.");
    }
  }

  async function handleImageUpload(file: File | null) {
    setImage(file);
    setAnalysis(null);
    setError(null);
    setSourceImageDataUrl(null);
    setProjectPalette([]);
    setSelectedPaintColorIds([]);
    setPaintReviewFilter("all");
    setShoppingListStatus("");
    setProjectCreatedAt(null);
    setProjectStatus(file ? "Unsaved changes" : "No saved project");
    if (!file) return;

    try {
      setSourceImageDataUrl(await readFileAsDataUrl(file));
      setProjectName(cleanedProjectNameFromFileName(file.name));
      setProjectCreatedAt(new Date().toISOString());
    } catch {
      setError("Unable to read the selected image.");
    }
  }

  function startNewProject() {
    const hasCurrentWork =
      image !== null ||
      analysis !== null ||
      manualStrokes.length > 0 ||
      projectPalette.length > 0 ||
      sourceImageDataUrl !== null;

    if (hasCurrentWork && !window.confirm("Start a new project? This clears the current image, strokes, and paint palette on this device. Export the project JSON first if you want to keep it.")) {
      return;
    }

    setAutosavePaused(true);
    localStorage.removeItem(CUTOUT_AUTOSAVE_KEY);
    setImage(null);
    setSourceImageDataUrl(null);
    setProjectName("Cutout Project");
    setProjectCreatedAt(null);
    setProjectStatus("No saved project");
    setSettings(defaultSettings);
    applyTraceModeUiState("paint");
    setAdvancedOpen(false);
    setAnalysis(null);
    setEditorOpen(false);
    setBrushSize("normal");
    setShowReference(false);
    setReferenceOpacity(35);
    setShowCutline(true);
    setShowManualLines(true);
    setShowSuggestions(false);
    setProjectPalette([]);
    setSelectedPaintColorIds([]);
    setPaintReviewFilter("all");
    setShoppingListStatus("");
    resetCleanupChecks();
    resetEditorState();
    setError(null);
    strokeIdRef.current = 0;
    window.setTimeout(() => setAutosavePaused(false), 100);
  }

  function scrollToWorkflowTarget(target: WorkflowTarget) {
    const targetElement = target === "setup"
      ? setupSectionRef.current
      : target === "editor"
        ? traceEditorSectionRef.current
        : target === "paint"
          ? paintReviewSectionRef.current
          : exportSectionRef.current;

    targetElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function buildProjectSnapshot() {
    if (!image || !sourceImageDataUrl || !analysis) return null;
    const now = new Date().toISOString();
    return createCutoutProjectSnapshot({
      projectName,
      createdAt: projectCreatedAt ?? now,
      updatedAt: now,
      sourceImage: {
        name: image.name,
        type: image.type || "application/octet-stream",
        dataUrl: sourceImageDataUrl
      },
      settings,
      traceMode,
      analysis,
      editedDetailPngDataUrl: traceStudioOpen ? null : editedDetailDataUrl,
      manualStrokes,
      projectPalette,
      paintGuideEdits: paintGuideEditsFromProjectPalette(projectPalette),
      referenceOpacity,
      layerVisibility: {
        showReference,
        showCutline,
        showManualLines,
        showSuggestions,
        printPreview
      },
      traceViewport
    });
  }

  function downloadProjectFile(status: ProjectStatus) {
    const project = buildProjectSnapshot();
    if (!project) return;
    try {
      const blob = new Blob([serializeCutoutProject(project)], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = projectFileName(project.projectName);
      link.click();
      URL.revokeObjectURL(url);
      localStorage.setItem(CUTOUT_AUTOSAVE_KEY, serializeCutoutProject(project));
      setProjectStatus(status);
    } catch {
      setProjectStatus("Project export failed");
    }
  }

  async function openProjectFile(file: File | null) {
    if (!file) return;
    try {
      const text = await file.text();
      const project = restoreCutoutProject(text);
      await applyProject(project, "Project opened");
      localStorage.setItem(CUTOUT_AUTOSAVE_KEY, serializeCutoutProject(project));
    } catch {
      setProjectStatus("Project import failed");
      setError("Unable to open that project file.");
    }
  }

  async function applyProject(project: CutoutProject, status: ProjectStatus) {
    const restoredFile = await fileFromDataUrl(project.sourceImage.dataUrl, project.sourceImage.name, project.sourceImage.type);
    setAutosavePaused(true);
    setImage(restoredFile);
    setSourceImageDataUrl(project.sourceImage.dataUrl);
    setProjectName(project.projectName);
    setProjectCreatedAt(project.createdAt);
    setSettings(project.settings);
    applyTraceModeUiState(project.traceMode);
    setManualStrokes(project.manualStrokes);
    setProjectPalette(project.projectPalette);
    setSelectedPaintColorIds([]);
    setPaintReviewFilter("all");
    setShoppingListStatus("");
    setAnalysis(project.analysis);
    setEditorOpen(opensEditorWithReference(project.traceMode) || project.manualStrokes.length > 0);
    setShowReference(project.layerVisibility.showReference);
    setReferenceOpacity(project.referenceOpacity);
    setShowCutline(project.layerVisibility.showCutline);
    setShowManualLines(project.layerVisibility.showManualLines);
    setShowSuggestions(project.layerVisibility.showSuggestions);
    setPrintPreview(false);
    setTraceViewport(project.traceViewport);
    pendingContentFitRef.current = isDefaultTraceViewport(project.traceViewport);
    setSelectedStrokeId(null);
    setDimUnselectedStrokes(false);
    setSelectionFeedback("");
    setCleanupChecks({
      cutline: false,
      remove: false,
      draw: false,
      export: false
    });
    setManualHistory([]);
    setManualRedoHistory([]);
    setHistory([]);
    setRedoHistory([]);
    setEditedDetailDataUrl(project.editedDetailPngDataUrl);
    setError(null);
    setProjectStatus(status);
    strokeIdRef.current = highestStrokeNumber(project.manualStrokes);
    window.setTimeout(() => setAutosavePaused(false), 100);
  }

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    setAnalysis(null);
  }

  function resetTracingSettings() {
    const nextMode = traceMode === "manual" ? "manual" : "paint";
    setSettings((current) => ({
      ...traceModeSettings(nextMode, current),
      threshold: defaultSettings.threshold,
      smoothing: defaultSettings.smoothing,
      speckArea: defaultSettings.speckArea,
      holeArea: defaultSettings.holeArea,
      detailLines: nextMode === "manual" ? false : defaultSettings.detailLines,
      detailCleanup: nextMode === "manual" ? 100 : defaultSettings.detailCleanup,
      templateStyle: nextMode
    }));
    applyTraceModeUiState(nextMode);
    setAdvancedOpen(false);
    setProjectStatus(image ? "Unsaved changes" : "No saved project");
  }

  function applyTraceMode(mode: TraceMode) {
    applyTraceModeUiState(mode);
    const next = traceModeSettings(mode, settings);
    setSettings(next);
    setAnalysis(null);
  }

  function applyDetailPreset(preset: DetailPreset) {
    const next = detailPresetSettings(preset, settings);
    applyTraceModeUiState(next.templateStyle);
    setSettings(next);
    setAnalysis(null);
  }

  function switchToBlankTraceStudio() {
    applyTraceModeUiState("manual");
    setSettings((current) => traceModeSettings("manual", current));
    setManualHistory((items) => [...items.slice(-19), manualStrokes]);
    setManualRedoHistory([]);
    setManualStrokes([]);
    setSelectedStrokeId(null);
    setSelectionFeedback("Switched to blank Trace Studio");
    setEditorOpen(true);
    setShowReference(true);
    setShowSuggestions(false);
    setShowCutline(true);
    setShowManualLines(true);
    setPrintPreview(false);
    pendingContentFitRef.current = true;
  }

  function updateInteriorDetail(value: number) {
    setSettings((current) => ({ ...current, detailCleanup: value, detailLines: true, templateStyle: traceMode }));
    setAnalysis(null);
  }

  function applyTraceModeUiState(mode: TraceMode) {
    setTraceMode(mode);
    setAutoStarterOpen(mode !== "manual");
    setEditorTool(defaultEditorToolForTraceMode(mode));
  }

  function updatePaintGuideEntry(id: string, patch: Partial<Omit<ProjectPaintColor, "id" | "source">>) {
    const current = projectPalette.find((entry) => entry.id === id);
    if (!current) return;
    setProjectPalette((palette) => updateProjectPaintColor(palette, id, patch));
    setShoppingListStatus("");
    if (typeof patch.hex === "string" && isValidHexColor(patch.hex)) {
      void refreshPaintMatchesForColor(id, patch.hex);
    }
  }

  async function addManualPaintColor() {
    if (!isValidHexColor(newPaintHex)) {
      setShoppingListStatus("Enter a valid hex color");
      return;
    }
    const matches = await fetchPaintMatches(newPaintHex);
    setProjectPalette((palette) => addProjectPaintColor(palette, {
      hex: newPaintHex,
      label: newPaintLabel,
      matches
    }));
    setNewPaintLabel("");
    setShoppingListStatus("Color added");
  }

  function removePaintColor(id: string) {
    setProjectPalette((palette) => removeProjectPaintColor(palette, id));
    setSelectedPaintColorIds((ids) => ids.filter((item) => item !== id));
    setShoppingListStatus("");
  }

  function mergeSelectedPaintColors() {
    setProjectPalette((palette) => mergeProjectPaintColors(palette, selectedPaintColorIds));
    setSelectedPaintColorIds([]);
    setShoppingListStatus("Colors merged");
  }

  function mergeProjectPaintColorsBySwatches(swatchNumbers: number[]) {
    const ids = paintGuideEntries
      .filter((entry) => swatchNumbers.includes(entry.index))
      .map((entry) => entry.id);
    setProjectPalette((palette) => mergeProjectPaintColors(palette, ids));
    setSelectedPaintColorIds([]);
    setShoppingListStatus("Colors merged");
  }

  function resetProjectPaletteFromDetected() {
    if (!analysis) return;
    setProjectPalette(seedProjectPaletteFromDetected(analysis.palette, []));
    setSelectedPaintColorIds([]);
    setShoppingListStatus("Palette reset to detected colors");
  }

  function togglePaintMergeSelection(id: string) {
    setSelectedPaintColorIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  async function refreshPaintMatchesForColor(id: string, hex: string) {
    const matches = await fetchPaintMatches(hex);
    setProjectPalette((palette) => updateProjectPaintColor(palette, id, { matches }));
  }

  async function fetchPaintMatches(hex: string) {
    if (!isValidHexColor(hex)) return [];
    const response = await fetch("/api/match-color", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hex })
    });
    if (!response.ok) return [];
    const body = await response.json();
    return Array.isArray(body.matches) ? body.matches : [];
  }

  async function copyPaintShoppingList() {
    try {
      await navigator.clipboard.writeText(paintShoppingList);
      setShoppingListStatus("Shopping list copied");
    } catch {
      setShoppingListStatus("Unable to copy shopping list");
    }
  }

  function loadDetailCanvas(src: string) {
    const canvas = detailCanvasRef.current;
    if (!canvas) return;
    const image = new Image();
    image.onload = () => {
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      setEditableDetailLinesPresent(canvasHasVisibleInk(canvas));
    };
    image.src = src;
  }

  function currentDetailDataUrl() {
    const canvas = detailCanvasRef.current;
    if (!canvas || !analysis) return editedDetailDataUrl;
    if (traceStudioOpen) {
      renderManualTraceLayer(manualStrokes, undefined, false);
    }
    return canvas.toDataURL("image/png");
  }

  function saveHistorySnapshot() {
    const current = currentDetailDataUrl();
    if (!current) return;
    setHistory((items) => [...items.slice(-19), current]);
    setRedoHistory([]);
  }

  function undoDetailEdit() {
    if (traceStudioOpen) {
      const previous = manualHistory[manualHistory.length - 1];
      if (!previous) return;
      setManualHistory((items) => items.slice(0, -1));
      setManualRedoHistory((items) => [...items.slice(-19), manualStrokes]);
      setManualStrokes(previous);
      setSelectedStrokeId(null);
      setSelectionFeedback("Undid stroke edit");
      return;
    }
    const current = currentDetailDataUrl();
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    if (current) setRedoHistory((items) => [...items.slice(-19), current]);
    setEditedDetailDataUrl(previous);
    loadDetailCanvas(previous);
  }

  function redoDetailEdit() {
    if (traceStudioOpen) {
      const next = manualRedoHistory[manualRedoHistory.length - 1];
      if (!next) return;
      setManualHistory((items) => [...items.slice(-19), manualStrokes]);
      setManualRedoHistory((items) => items.slice(0, -1));
      setManualStrokes(next);
      setSelectedStrokeId(null);
      setSelectionFeedback("Redid stroke edit");
      return;
    }
    const current = currentDetailDataUrl();
    const next = redoHistory[redoHistory.length - 1];
    if (!next) return;
    if (current) setHistory((items) => [...items.slice(-19), current]);
    setRedoHistory((items) => items.slice(0, -1));
    setEditedDetailDataUrl(next);
    loadDetailCanvas(next);
  }

  function resetDetailLayer() {
    if (!analysis) return;
    if (traceStudioOpen) {
      setManualHistory((items) => [...items.slice(-19), manualStrokes]);
      setManualRedoHistory([]);
      setManualStrokes([]);
      setSelectedStrokeId(null);
      setSelectionFeedback("Cleared manual strokes");
      return;
    }
    saveHistorySnapshot();
    setEditedDetailDataUrl(null);
    loadDetailCanvas(analysis.detailLinePngDataUrl);
  }

  function resetCleanupChecks() {
    setCleanupChecks({
      cutline: false,
      remove: false,
      draw: false,
      export: false
    });
  }

  function toggleCleanupStep(step: CleanupStep) {
    setCleanupChecks((current) => ({ ...current, [step]: !current[step] }));
  }

  function beginStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!analysis) return;
    const point = canvasPoint(event);
    if (traceStudioOpen) {
      if (editorTool === "pan") {
        safelySetPointerCapture(event.currentTarget, event.pointerId);
        panningRef.current = true;
        panStartRef.current = { x: event.clientX, y: event.clientY };
        return;
      }
      if (editorTool === "select") {
        const handleStroke = selectedStrokeId ? manualStrokes.find((stroke) => stroke.id === selectedStrokeId) ?? null : null;
        const pointIndex = handleStroke ? selectTracePointIndex(handleStroke, point, pointHandleHitRadius(handleStroke.width)) : null;
        if (handleStroke && pointIndex !== null) {
          safelySetPointerCapture(event.currentTarget, event.pointerId);
          strokeDragRef.current = {
            mode: "point",
            strokeId: handleStroke.id,
            pointIndex,
            startPoint: point,
            originalStrokes: manualStrokes,
            moved: false
          };
          return;
        }
        const stroke = selectTraceStroke(manualStrokes, point, brushPixels(brushSize));
        setSelectedStrokeId(stroke?.id ?? null);
        setSelectionFeedback(stroke ? `Selected ${shortStrokeLabel(stroke.id)}` : "Selection cleared");
        if (stroke) {
          safelySetPointerCapture(event.currentTarget, event.pointerId);
          strokeDragRef.current = {
            mode: "move",
            strokeId: stroke.id,
            startPoint: point,
            originalStrokes: manualStrokes,
            moved: false
          };
        }
        return;
      }
      if (editorTool === "erase" || editorTool === "remove") {
        removeManualStrokeAt(point);
        return;
      }
      safelySetPointerCapture(event.currentTarget, event.pointerId);
      drawingRef.current = true;
      lastPointRef.current = point;
      smoothAnchorRef.current = point;
      draftStrokeRef.current = createTraceStroke(nextStrokeId(), [point], brushPixels(brushSize));
      renderManualTraceLayer(manualStrokes, draftStrokeRef.current);
      return;
    }
    if (editorTool === "remove") {
      removeDetailLineAt(point);
      return;
    }
    safelySetPointerCapture(event.currentTarget, event.pointerId);
    saveHistorySnapshot();
    drawingRef.current = true;
    lastPointRef.current = point;
    smoothAnchorRef.current = point;
    drawStrokeSegment(point, point);
  }

  function continueStroke(event: PointerEvent<HTMLCanvasElement>) {
    const drag = strokeDragRef.current;
    if (traceStudioOpen && drag) {
      const point = canvasPoint(event);
      const result = drag.mode === "move"
        ? moveTraceStroke(drag.originalStrokes, drag.strokeId, { x: point.x - drag.startPoint.x, y: point.y - drag.startPoint.y })
        : updateTraceStrokePoint(drag.originalStrokes, drag.strokeId, drag.pointIndex ?? -1, point);
      if (result.changed) {
        strokeDragRef.current = { ...drag, moved: true };
        setManualStrokes(result.strokes);
      }
      return;
    }
    if (traceStudioOpen && panningRef.current) {
      const previous = panStartRef.current;
      if (!previous) return;
      const current = { x: event.clientX, y: event.clientY };
      setTraceViewport((viewport) => panViewport(viewport, { x: current.x - previous.x, y: current.y - previous.y }));
      panStartRef.current = current;
      return;
    }
    if (!drawingRef.current || editorTool === "remove" || editorTool === "select" || editorTool === "pan") return;
    const point = canvasPoint(event);
    if (traceStudioOpen) {
      const draft = draftStrokeRef.current;
      if (!draft) return;
      const previous = lastPointRef.current ?? point;
      const nextPoint = editorTool === "smoothDraw" ? midpoint(previous, point) : point;
      draftStrokeRef.current = createTraceStroke(draft.id, [...draft.points, nextPoint], draft.width);
      lastPointRef.current = point;
      smoothAnchorRef.current = nextPoint;
      renderManualTraceLayer(manualStrokes, draftStrokeRef.current);
      return;
    }
    const previous = lastPointRef.current ?? point;
    if (editorTool === "smoothDraw") {
      const anchor = smoothAnchorRef.current ?? previous;
      const mid = midpoint(previous, point);
      drawSmoothStrokeSegment(anchor, previous, mid);
      smoothAnchorRef.current = mid;
    } else {
      drawStrokeSegment(previous, point);
    }
    lastPointRef.current = point;
  }

  function endStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (traceStudioOpen) {
      const drag = strokeDragRef.current;
      if (drag) {
        safelyReleasePointerCapture(event.currentTarget, event.pointerId);
        if (drag.moved) {
          setManualHistory((items) => [...items.slice(-19), drag.originalStrokes]);
          setManualRedoHistory([]);
          setSelectionFeedback(drag.mode === "point" ? "Edited point" : "Moved stroke");
        }
        strokeDragRef.current = null;
        return;
      }
      if (panningRef.current) {
        safelyReleasePointerCapture(event.currentTarget, event.pointerId);
        panningRef.current = false;
        panStartRef.current = null;
        return;
      }
      if (drawingRef.current) {
        safelyReleasePointerCapture(event.currentTarget, event.pointerId);
        const draft = draftStrokeRef.current;
        if (draft && draft.points.length > 0) {
          setManualHistory((items) => [...items.slice(-19), manualStrokes]);
          setManualRedoHistory([]);
          setManualStrokes((items) => [...items, draft]);
          setSelectedStrokeId(draft.id);
          setSelectionFeedback("Created stroke");
        }
      }
      drawingRef.current = false;
      lastPointRef.current = null;
      smoothAnchorRef.current = null;
      draftStrokeRef.current = null;
      return;
    }
    if (drawingRef.current) {
      if (editorTool === "smoothDraw" && smoothAnchorRef.current && lastPointRef.current) {
        drawStrokeSegment(smoothAnchorRef.current, lastPointRef.current);
      }
      safelyReleasePointerCapture(event.currentTarget, event.pointerId);
      setEditedDetailDataUrl(event.currentTarget.toDataURL("image/png"));
      setEditableDetailLinesPresent(canvasHasVisibleInk(event.currentTarget));
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    smoothAnchorRef.current = null;
  }

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>): TracePoint {
    const viewport = editorViewportRef.current;
    const canvas = event.currentTarget;
    if (!viewport) {
      const rect = canvas.getBoundingClientRect();
      return {
        x: ((event.clientX - rect.left) / rect.width) * canvas.width,
        y: ((event.clientY - rect.top) / rect.height) * canvas.height
      };
    }
    const rect = viewport.getBoundingClientRect();
    return screenToTracePoint(
      { x: event.clientX - rect.left, y: event.clientY - rect.top },
      traceViewport,
      { width: canvas.width, height: canvas.height },
      { width: rect.width, height: rect.height }
    );
  }

  function drawStrokeSegment(from: TracePoint, to: TracePoint) {
    const canvas = detailCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.globalCompositeOperation = editorTool === "erase" ? "destination-out" : "source-over";
    context.strokeStyle = "#000000";
    context.lineWidth = brushPixels(brushSize);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.lineTo(to.x, to.y);
    context.stroke();
    context.restore();
  }

  function drawSmoothStrokeSegment(
    from: TracePoint,
    control: TracePoint,
    to: TracePoint
  ) {
    const canvas = detailCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    context.save();
    context.globalCompositeOperation = "source-over";
    context.strokeStyle = "#000000";
    context.lineWidth = brushPixels(brushSize);
    context.lineCap = "round";
    context.lineJoin = "round";
    context.beginPath();
    context.moveTo(from.x, from.y);
    context.quadraticCurveTo(control.x, control.y, to.x, to.y);
    context.stroke();
    context.restore();
  }

  function removeDetailLineAt(point: TracePoint) {
    const canvas = detailCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = removeClickedDetailSegment(imageData.data, canvas.width, canvas.height, point);
    if (!result.changed) return;
    saveHistorySnapshot();
    context.putImageData(imageData, 0, 0);
    setEditedDetailDataUrl(canvas.toDataURL("image/png"));
    setEditableDetailLinesPresent(canvasHasVisibleInk(canvas));
  }

  function renderManualTraceLayer(strokes: TraceStroke[], draftStroke?: TraceStroke, showSelection = !printPreview) {
    const canvas = detailCanvasRef.current;
    if (!canvas || !analysis) return;
    canvas.width = analysis.previewWidthPx;
    canvas.height = analysis.previewHeightPx;
    const context = canvas.getContext("2d");
    if (!context) return;
    drawTraceStrokes(context, strokes, draftStroke, showSelection ? selectedStrokeId : null, {
      dimUnselected: showSelection && !printPreview && dimUnselectedStrokes
    });
  }

  function removeManualStrokeAt(point: TracePoint) {
    const result = eraseTraceStrokes(manualStrokes, point, brushPixels(brushSize));
    if (!result.changed) return;
    setManualHistory((items) => [...items.slice(-19), manualStrokes]);
    setManualRedoHistory([]);
    setManualStrokes(result.strokes);
    setSelectedStrokeId(null);
    setSelectionFeedback(result.removedStrokeIds.length === 1 ? "Deleted stroke" : `Deleted ${result.removedStrokeIds.length} strokes`);
  }

  function nextStrokeId() {
    strokeIdRef.current += 1;
    return `stroke-${strokeIdRef.current}`;
  }

  function commitManualStrokeEdit(result: StrokeEditResult, nextSelectedStrokeId = selectedStrokeId) {
    if (!result.changed) return;
    setManualHistory((items) => [...items.slice(-19), manualStrokes]);
    setManualRedoHistory([]);
    setManualStrokes(result.strokes);
    setSelectedStrokeId(result.selectedStrokeId ?? nextSelectedStrokeId ?? null);
  }

  function deleteSelectedStroke() {
    if (!selectedStrokeId) return;
    const result = deleteTraceStroke(manualStrokes, selectedStrokeId);
    if (!result.changed) return;
    setManualHistory((items) => [...items.slice(-19), manualStrokes]);
    setManualRedoHistory([]);
    setManualStrokes(result.strokes);
    setSelectedStrokeId(null);
    setSelectionFeedback("Deleted stroke");
  }

  function duplicateSelectedStroke() {
    if (!selectedStrokeId) return;
    const offset = analysis ? Math.max(10, analysis.previewWidthPx * 0.025) : 12;
    commitManualStrokeEdit(duplicateTraceStroke(manualStrokes, selectedStrokeId, nextStrokeId(), { x: offset, y: offset }));
    setSelectionFeedback("Duplicated stroke");
  }

  function smoothSelectedStroke() {
    if (!selectedStrokeId) return;
    commitManualStrokeEdit(smoothTraceStrokeById(manualStrokes, selectedStrokeId));
    setSelectionFeedback("Smoothed stroke");
  }

  function simplifySelectedStroke() {
    if (!selectedStrokeId) return;
    commitManualStrokeEdit(simplifyTraceStrokeById(manualStrokes, selectedStrokeId, 2.4));
    setSelectionFeedback("Simplified stroke");
  }

  function changeSelectedStrokeWidth(size: BrushSize) {
    if (!selectedStrokeId) return;
    commitManualStrokeEdit(changeTraceStrokeWidth(manualStrokes, selectedStrokeId, brushPixels(size)));
    setSelectionFeedback(`Set width to ${brushSizeLabel(size)}`);
  }

  function selectAdjacentStroke(direction: -1 | 1) {
    const stroke = selectAdjacentTraceStroke(manualStrokes, selectedStrokeId, direction);
    setSelectedStrokeId(stroke?.id ?? null);
    setEditorTool("select");
    setSelectionFeedback(stroke ? `Selected ${shortStrokeLabel(stroke.id)}` : "No strokes to select");
  }

  function clearSelectedStroke() {
    setSelectedStrokeId(null);
    setSelectionFeedback("Selection cleared");
  }

  function changeZoom(nextZoom: number) {
    const viewport = editorViewportRef.current;
    const focus = viewport
      ? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
      : { x: 0, y: 0 };
    const viewportSize = viewport
      ? { width: viewport.clientWidth, height: viewport.clientHeight }
      : { width: 1, height: 1 };
    setTraceViewport((current) => zoomViewport(current, nextZoom, focus, viewportSize));
  }

  function resetZoom() {
    if (!fitTraceViewportToContent()) {
      setTraceViewport(DEFAULT_TRACE_VIEWPORT);
    }
  }

  function hundredPercentZoom() {
    const viewport = editorViewportRef.current;
    if (!viewport || !analysis) {
      setTraceViewport({ zoom: 1, panX: 0, panY: 0 });
      return;
    }
    const fitted = fittedTraceSize(
      { width: analysis.previewWidthPx, height: analysis.previewHeightPx },
      { width: viewport.clientWidth, height: viewport.clientHeight }
    );
    setTraceViewport(centerBoundsInViewport(
      traceContentBounds(),
      { width: analysis.previewWidthPx, height: analysis.previewHeightPx },
      { width: viewport.clientWidth, height: viewport.clientHeight },
      analysis.previewWidthPx / fitted.width
    ));
  }

  function fitTraceViewportToContent() {
    const viewport = editorViewportRef.current;
    if (!viewport || !analysis) return false;
    setTraceViewport(fitBoundsToViewport(
      traceContentBounds(),
      { width: analysis.previewWidthPx, height: analysis.previewHeightPx },
      { width: viewport.clientWidth, height: viewport.clientHeight },
      { paddingPx: 32, targetFill: 0.8 }
    ));
    return true;
  }

  function traceContentBounds() {
    if (!analysis) return fullCanvasBounds({ width: 1, height: 1 });
    const canvasBounds = fullCanvasBounds({ width: analysis.previewWidthPx, height: analysis.previewHeightPx });
    const strokeBounds = boundsFromTraceStrokes(manualStrokes);
    if (strokeBounds) return mergeTraceBounds([cutlineBounds, strokeBounds]) ?? strokeBounds;
    return cutlineBounds ?? canvasBounds;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Cutout Studio</h1>
          <p>Personal wood cutout template generator</p>
        </div>
        <div className="topbar-actions" ref={exportSectionRef}>
          <button
            className="secondary-topbar-action"
            onClick={exportSvgLinework}
            disabled={!canExportSvg}
            title={analysis && !analysis.outerCutPath.trim() ? "Regenerate the cutline before exporting SVG linework." : undefined}
          >
            <FileText size={18} />
            Export SVG Linework
          </button>
          <button className="primary-action" onClick={exportPdf} disabled={!canExport}>
            <Download size={18} />
            Export Template Packet PDF
          </button>
        </div>
      </header>

      <section className="workspace">
        <aside className="left-panel" aria-label="Template settings">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title="Template Setup" />
          <label className="upload-box">
            <FileImage size={28} />
            <span>{image ? image.name : "Upload PNG or JPG"}</span>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void handleImageUpload(file);
              }}
            />
          </label>
          <p className="helper-note">
            Upload one complete source image, not a finished template PDF or an individual tiled page. Cutout Studio generates the tiled trace packet for you.
          </p>

          <div className="project-card">
            <label className="project-name-field">
              <span>Project name</span>
              <input
                type="text"
                value={projectName}
                onChange={(event) => setProjectName(event.target.value)}
                onBlur={() => setProjectName((name) => name.trim() || "Cutout Project")}
              />
            </label>
            <div className="project-card-title">
              <strong>{projectName}</strong>
              <span>{projectStatus}</span>
            </div>
            <div className="project-actions">
              <button className="tool-button danger-lite" onClick={startNewProject}>
                <X size={15} />
                Start New
              </button>
              <button className="tool-button" onClick={() => projectFileInputRef.current?.click()}>
                <FolderOpen size={15} />
                Open Project
              </button>
              <button className="tool-button" onClick={() => downloadProjectFile("Saved")} disabled={!canSaveProject}>
                <Save size={15} />
                Save Project
              </button>
              <button className="tool-button" onClick={() => downloadProjectFile("Saved")} disabled={!canSaveProject}>
                <Download size={15} />
                Export JSON
              </button>
            </div>
            <input
              ref={projectFileInputRef}
              className="hidden-project-input"
              type="file"
              accept=".cutout.json,application/json"
              onChange={(event) => {
                const file = event.target.files?.[0] ?? null;
                void openProjectFile(file);
                event.currentTarget.value = "";
              }}
            />
          </div>

          <section className="workflow-card" aria-label="Guided workflow">
            <div className="workflow-card-title">
              <strong>Workflow</strong>
              <span>Start with Trace Studio, then clean up paint colors.</span>
            </div>
            <ol className="workflow-steps">
              {workflowSteps.map((step, index) => (
                <li key={step.label} className={`workflow-step ${step.status === "Complete" ? "complete" : step.status === "Next" ? "next" : ""}`}>
                  <button type="button" onClick={() => scrollToWorkflowTarget(step.target)}>
                    <span>{index + 1}</span>
                    <div>
                      <strong>{step.label}</strong>
                      <em>{step.status}</em>
                    </div>
                  </button>
                </li>
              ))}
            </ol>
          </section>

          <div className="workflow-anchor-section" ref={setupSectionRef}>
            <NumberField
              label="Finished height"
              suffix="in"
              min={6}
              max={96}
              step={1}
              value={settings.finishedHeightIn}
              onChange={(value) => updateSetting("finishedHeightIn", value)}
            />

            <div className="choice-group trace-method-picker" aria-label="Trace style">
              <span className="choice-label">Tracing method</span>
              <button className={traceMode === "paint" ? "choice selected recommended-choice" : "choice recommended-choice"} onClick={() => applyTraceMode("paint")}>
                <span className="choice-kicker">Recommended</span>
                <strong>Balanced Auto Starter</strong>
                <small>Generate editable starter details first, then delete bad lines and add only missing important features.</small>
              </button>
              <div className="detail-preset-group" aria-label="Detail strength">
                <span className="choice-label">Detail strength</span>
                {(["simple", "balanced", "detailed"] as DetailPreset[]).map((preset) => (
                  <button
                    key={preset}
                    className={selectedDetailPreset === preset ? "choice selected" : "choice"}
                    onClick={() => applyDetailPreset(preset)}
                  >
                    <strong>{detailPresetLabel(preset)}</strong>
                    <small>{detailPresetHelp(preset)}</small>
                  </button>
                ))}
              </div>
              <details className="auto-starter-card" open={autoStarterOpen} onToggle={(event) => setAutoStarterOpen(event.currentTarget.open)}>
                <summary>
                  <span>
                    <strong>Other trace options</strong>
                    <small>Use a blank layer or generate only the outside shape when starter lines are not useful.</small>
                  </span>
                </summary>
                <div className="auto-starter-options">
                  <button className={traceMode === "manual" ? "choice selected" : "choice"} onClick={() => applyTraceMode("manual")}>
                    <strong>{traceModeLabel("manual")}</strong>
                    <small>{traceModeHelp("manual")}</small>
                  </button>
                  <button className={traceMode === "outline" ? "choice selected" : "choice"} onClick={() => applyTraceMode("outline")}>
                    <strong>{traceModeLabel("outline")}</strong>
                    <small>{traceModeHelp("outline")}</small>
                  </button>
                </div>
              </details>
              <p className="helper-note">Starter lines are generated automatically. Delete bad lines and add only missing important features.</p>
            </div>
          </div>

          <RangeField label="Paint colors" min={2} max={10} value={settings.paletteSize} onChange={(value) => updateSetting("paletteSize", value)} />
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.includeInstructionCoverPage}
              onChange={() => setSettings((current) => ({
                ...current,
                includeInstructionCoverPage: !current.includeInstructionCoverPage
              }))}
            />
            Include instruction cover page
          </label>
          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.includePaintGuidePage && canIncludePaintGuide}
              disabled={!canIncludePaintGuide}
              onChange={() => setSettings((current) => ({
                ...current,
                includePaintGuidePage: !current.includePaintGuidePage
              }))}
            />
            Include paint guide page
          </label>

          <button className="advanced-toggle" onClick={() => setAdvancedOpen((open) => !open)}>
            {advancedOpen
              ? "Hide fine-tune starter settings"
              : `Fine-tune starter settings (${detailPresetLabel(selectedDetailPreset)} selected)`}
          </button>
          {advancedOpen ? (
            <div className="advanced-panel">
              <p className="helper-note">These settings only affect starter lines, not your manual Trace Studio strokes. Most projects should use the Detail strength presets above.</p>
              <RangeField label="Line smoothness" min={0} max={8} value={settings.smoothing} onChange={(value) => updateSetting("smoothing", value)} />
              <p className="helper-note">Higher values round out jagged edges in the cut line.</p>
              {settings.detailLines ? (
                <RangeField
                  label="Cleanup strength"
                  min={traceMode === "marker" ? 85 : traceMode === "paint" ? 76 : 0}
                  max={100}
                  value={settings.detailCleanup}
                  onChange={updateInteriorDetail}
                  lowLabel="More lines"
                  highLabel="Cleaner"
                />
              ) : null}
              {settings.detailLines ? (
                <p className="helper-note">Higher values remove faint or noisy interior lines; lower values keep more detail.</p>
              ) : null}
              <RangeField label="Background sensitivity" min={0} max={180} value={settings.threshold} onChange={(value) => updateSetting("threshold", value)} />
              <p className="helper-note">How different a color must be from the background to count as part of the subject.</p>
              <RangeField label="Remove tiny marks" min={0} max={600} value={settings.speckArea} onChange={(value) => updateSetting("speckArea", value)} />
              <p className="helper-note">Deletes small stray specks smaller than this size.</p>
              <RangeField label="Close small gaps" min={0} max={1500} value={settings.holeArea} onChange={(value) => updateSetting("holeArea", value)} />
              <p className="helper-note">Fills in small holes/gaps in the cutout shape smaller than this size.</p>
              <div className="reset-tracing-settings">
                <button className="tool-button" onClick={resetTracingSettings}>
                  <RotateCcw size={15} />
                  Reset tracing settings
                </button>
                <p className="helper-note">Restores the recommended starter settings. Your current editor cleanup is not changed.</p>
              </div>
            </div>
          ) : null}

          <div className="workflow-anchor-section">
            <button className="secondary-action" onClick={() => analyze()} disabled={!canAnalyze}>
              <RefreshCw size={17} />
              {primaryTraceActionLabel}
            </button>
          </div>
        </aside>

        <section className="preview-stage" aria-label="Trace preview">
          {analysis ? (
            <div className="page-preview">
              <div className="preview-strip">
                <span>{editorOpen ? `${traceModeLabel(traceMode)} Editor` : "Trace preview"}</span>
                <span>{analysis.tileCols} x {analysis.tileRows} pages</span>
              </div>
              {editorOpen ? (
                <div className="editor-wrap" ref={traceEditorSectionRef}>
                  <div className="editor-tools" aria-label="Template editor tools">
                    <div className="tool-group primary-tool-group">
                      <span>Draw</span>
                      <SegmentedButton
                        selected={editorTool === "draw"}
                        onClick={() => setEditorTool("draw")}
                        icon={<Pencil size={15} />}
                        label="Draw details"
                      />
                      <SegmentedButton
                        selected={editorTool === "erase"}
                        onClick={() => setEditorTool("erase")}
                        icon={<Eraser size={15} />}
                        label="Erase details"
                      />
                      <SegmentedButton
                        selected={editorTool === "smoothDraw"}
                        onClick={() => setEditorTool("smoothDraw")}
                        icon={<Pencil size={15} />}
                        label="Smooth curve"
                      />
                      <select value={brushSize} onChange={(event) => setBrushSize(event.target.value as BrushSize)} aria-label="Brush size">
                        <option value="thin">Thin detail</option>
                        <option value="normal">Normal detail</option>
                        <option value="bold">Bold outline</option>
                      </select>
                    </div>
                    <div className="tool-group">
                      <span>Edit</span>
                      {traceStudioOpen ? (
                        <SegmentedButton
                          selected={editorTool === "select"}
                          onClick={() => setEditorTool("select")}
                          icon={<MousePointerClick size={15} />}
                          label="Select stroke"
                        />
                      ) : null}
                      <SegmentedButton
                        selected={editorTool === "remove"}
                        onClick={() => setEditorTool("remove")}
                        icon={<MousePointerClick size={15} />}
                        label="Click to remove line"
                      />
                      {traceStudioOpen ? (
                        <>
                          <select
                            value={selectedStroke ? brushSizeName(selectedStroke.width) : "normal"}
                            onChange={(event) => changeSelectedStrokeWidth(event.target.value as BrushSize)}
                            disabled={!selectedStroke}
                            aria-label="Selected stroke width"
                          >
                            <option value="thin">Selected thin</option>
                            <option value="normal">Selected normal</option>
                            <option value="bold">Selected bold</option>
                          </select>
                          <button className="tool-button" onClick={duplicateSelectedStroke} disabled={!selectedStroke}>
                            <Copy size={15} />
                            Duplicate
                          </button>
                          <button className="tool-button" onClick={smoothSelectedStroke} disabled={!selectedStroke}>
                            <SlidersHorizontal size={15} />
                            Smooth selected
                          </button>
                          <button className="tool-button" onClick={simplifySelectedStroke} disabled={!selectedStroke}>
                            <RefreshCw size={15} />
                            Simplify
                          </button>
                          <button className="tool-button" onClick={deleteSelectedStroke} disabled={!selectedStrokeId}>
                            <Trash2 size={15} />
                            Delete stroke
                          </button>
                        </>
                      ) : null}
                      <button className="tool-button" onClick={undoDetailEdit} disabled={undoDisabled}>
                        <Undo2 size={15} />
                        Undo
                      </button>
                      <button className="tool-button" onClick={redoDetailEdit} disabled={redoDisabled}>
                        <Redo2 size={15} />
                        Redo
                      </button>
                      <button className="tool-button" onClick={resetDetailLayer}>
                        <RotateCcw size={15} />
                        Reset details
                      </button>
                    </div>
                    <div className="tool-group">
                      <span>View</span>
                      {traceStudioOpen ? (
                        <SegmentedButton
                          selected={editorTool === "pan"}
                          onClick={() => setEditorTool("pan")}
                          icon={<Hand size={15} />}
                          label="Pan"
                        />
                      ) : null}
                      <button className="tool-button" onClick={() => changeZoom(traceViewport.zoom * 1.2)}>
                        <ZoomIn size={15} />
                        Zoom in
                      </button>
                      <button className="tool-button" onClick={() => changeZoom(traceViewport.zoom / 1.2)}>
                        <ZoomOut size={15} />
                        Zoom out
                      </button>
                      <button className="tool-button" onClick={resetZoom}>Fit</button>
                      <button className="tool-button" onClick={hundredPercentZoom}>100%</button>
                      <button className={printPreview ? "tool-button selected" : "tool-button"} onClick={() => setPrintPreview((shown) => !shown)}>
                        Preview Printable Template
                      </button>
                    </div>
                  </div>
                  <div className="layer-controls" aria-label="Trace Studio layer visibility">
                    <label>
                      <input type="checkbox" checked={showReference} onChange={() => setShowReference((shown) => !shown)} />
                      Show original
                    </label>
                    {showReference ? (
                      <label className="opacity-control">
                        <span>Opacity</span>
                        <input
                          type="range"
                          min={0}
                          max={100}
                          value={referenceOpacity}
                          onChange={(event) => setReferenceOpacity(Number(event.target.value))}
                        />
                      </label>
                    ) : null}
                    <label>
                      <input type="checkbox" checked={showCutline} onChange={() => setShowCutline((shown) => !shown)} />
                      Cutline
                    </label>
                    <label>
                      <input type="checkbox" checked={showManualLines} onChange={() => setShowManualLines((shown) => !shown)} />
                      {traceStudioOpen ? "Manual lines" : "Editable starter lines"}
                    </label>
                    {traceStudioOpen ? (
                      <label>
                        <input type="checkbox" checked={showSuggestions} onChange={() => setShowSuggestions((shown) => !shown)} />
                        Starter lines
                      </label>
                    ) : null}
                  </div>
                  {editorOpen ? (
                    <div className="underlay-explainer" aria-label="Original underlay guide">
                      <Eye size={16} />
                      <div>
                        <strong>
                          Original underlay is {showReference && !printPreview ? "visible" : "hidden"}
                        </strong>
                        <span>
                          {showReference && !printPreview
                            ? "It is the faint source image inside the canvas below, behind the black cutline and detail lines. Raise opacity if you need more color while drawing."
                            : "Turn on Show original to show the source image behind the black cutline and detail lines."}
                        </span>
                      </div>
                    </div>
                  ) : null}
                  {!traceStudioOpen ? (
                    <section className="starter-lines-warning" aria-label="Starter detail line guidance">
                      <div>
                        <strong>Starter lines are generated automatically</strong>
                        <span>Delete bad lines first, then add only missing face, clothing, hair, accessory, and paint-boundary lines you need on wood.</span>
                      </div>
                      <button className="tool-button" onClick={switchToBlankTraceStudio}>
                        Use blank Trace Studio
                      </button>
                    </section>
                  ) : null}
                  {traceStudioOpen ? (
                    <section className="selection-inspector" aria-label="Selection Inspector">
                      <div className="selection-inspector-header">
                        <div>
                          <strong>{selectedStrokeSummary ? `Stroke ${selectedStrokeSummary.index} of ${selectedStrokeSummary.total}` : "No stroke selected"}</strong>
                          <span>{selectedStrokeSummary ? `ID ${selectedStrokeSummary.shortId}` : "Click a line to edit it."}</span>
                        </div>
                        <div className="selection-cycle" aria-label="Stroke cycle controls">
                          <button className="icon-tool-button" onClick={() => selectAdjacentStroke(-1)} disabled={manualStrokes.length === 0} aria-label="Previous stroke">
                            <ChevronLeft size={16} />
                          </button>
                          <button className="icon-tool-button" onClick={() => selectAdjacentStroke(1)} disabled={manualStrokes.length === 0} aria-label="Next stroke">
                            <ChevronRight size={16} />
                          </button>
                        </div>
                      </div>
                      {selectedStrokeSummary ? (
                        <>
                          <div className="selection-meta">
                            <span>{selectedStrokeSummary.pointCount} points</span>
                            <span>{brushSizeLabel(brushSizeName(selectedStrokeSummary.width))} / {selectedStrokeSummary.width}px</span>
                          </div>
                          <div className="selection-width-group" aria-label="Selected stroke width">
                            {(["thin", "normal", "bold"] as BrushSize[]).map((size) => (
                              <button
                                key={size}
                                className={brushSizeName(selectedStrokeSummary.width) === size ? "tool-button selected" : "tool-button"}
                                onClick={() => changeSelectedStrokeWidth(size)}
                              >
                                {brushSizeLabel(size)}
                              </button>
                            ))}
                          </div>
                          <div className="selection-actions">
                            <button className="tool-button" onClick={duplicateSelectedStroke}>
                              <Copy size={15} />
                              Duplicate
                            </button>
                            <button className="tool-button" onClick={smoothSelectedStroke}>
                              <SlidersHorizontal size={15} />
                              Smooth
                            </button>
                            <button className="tool-button" onClick={simplifySelectedStroke}>
                              <RefreshCw size={15} />
                              Simplify
                            </button>
                            <button className="tool-button" onClick={deleteSelectedStroke}>
                              <Trash2 size={15} />
                              Delete
                            </button>
                            <button className="tool-button" onClick={clearSelectedStroke}>
                              <X size={15} />
                              Clear
                            </button>
                          </div>
                          <label className="selection-dim-toggle">
                            <input
                              type="checkbox"
                              checked={dimUnselectedStrokes}
                              onChange={() => setDimUnselectedStrokes((dimmed) => !dimmed)}
                            />
                            Dim unselected strokes
                          </label>
                        </>
                      ) : null}
                      {selectionFeedback ? <p className="selection-feedback" role="status">{selectionFeedback}</p> : null}
                    </section>
                  ) : null}
                  <p className="editor-note">
                    {traceMode === "manual"
                      ? "Best results come from tracing clean, simple lines over the image underlay. Trace only the face, clothing, and feature lines you want on the final template."
                      : "Starter lines are generated automatically. Delete bad lines and add only missing important features."}
                  </p>
                  {editorOpen ? (
                    <section className="trace-guidance-panel" aria-label="What to trace">
                      <div>
                        <strong>Trace only transfer-worthy lines</strong>
                        <span>Use the faint original image in the canvas below and keep only the lines you need to transfer onto wood.</span>
                      </div>
                      <ul>
                        <li>Face features</li>
                        <li>Clothing borders</li>
                        <li>Hair shape</li>
                        <li>Paint boundaries</li>
                        <li>Accessories</li>
                        <li>Major folds/details</li>
                      </ul>
                      <p>Skip shadows, texture, tiny highlights, and photo noise.</p>
                    </section>
                  ) : null}
                  <div className="template-editor" ref={editorViewportRef}>
                    <div
                      className="template-canvas-plane"
                      style={{
                        aspectRatio: `${analysis.previewWidthPx} / ${analysis.previewHeightPx}`,
                        transform: `translate(calc(-50% + ${traceViewport.panX}px), calc(-50% + ${traceViewport.panY}px)) scale(${traceViewport.zoom})`
                      }}
                    >
                      {showReference && !printPreview ? (
                        <img
                          src={analysis.paintGuidePngDataUrl}
                          alt=""
                          className="reference-layer"
                          style={{ opacity: referenceOpacity / 100 }}
                        />
                      ) : null}
                      {showSuggestions && !printPreview ? <img src={analysis.detailLinePngDataUrl} alt="" className="suggestion-layer" draggable={false} /> : null}
                      <canvas
                        ref={detailCanvasRef}
                        className={showManualLines ? "detail-line-layer" : "detail-line-layer hidden-layer"}
                        width={analysis.previewWidthPx}
                        height={analysis.previewHeightPx}
                        onPointerDown={beginStroke}
                        onPointerMove={continueStroke}
                        onPointerUp={endStroke}
                        onPointerCancel={endStroke}
                        aria-label="Editable interior detail lines"
                      />
                      {showCutline ? <img src={analysis.outerLinePngDataUrl} alt="" className="outer-line-layer" draggable={false} /> : null}
                    </div>
                  </div>
                </div>
              ) : (
                <img src={analysis.previewPngDataUrl} alt="Generated cut line preview" />
              )}
              <div className="tile-hint">
                {Array.from({ length: Math.min(analysis.tileCount, 12) }, (_, index) => (
                  <span key={index}>{index + 1}</span>
                ))}
                <button className="edit-toggle" onClick={() => setEditorOpen((open) => !open)}>
                  {editorOpen ? "Preview template" : "Edit Template"}
                </button>
              </div>
            </div>
          ) : (
            <div className="empty-preview">
              <FileText size={44} />
              <h2>Upload a simple-background image</h2>
              <p>Generate a starting template, clean up feature lines, then export the full-size PDF pack.</p>
            </div>
          )}
        </section>

        <aside className="right-panel" aria-label="Paint guide and export summary" ref={paintReviewSectionRef}>
          <PanelTitle icon={<SwatchBook size={18} />} title="Paint Guide" />
          {analysis ? (
            <>
              <dl className="summary-grid">
                <div>
                  <dt>Finished size</dt>
                  <dd>{analysis.finishedWidthIn} x {analysis.finishedHeightIn} in</dd>
                </div>
                <div>
                  <dt>Trace pages</dt>
                  <dd>{analysis.tileCount}</dd>
                </div>
                <div>
                  <dt>Paper</dt>
                  <dd>US letter, 100%</dd>
                </div>
              </dl>
              {traceQualityReview ? (
                <section className="trace-quality-card" aria-label="Trace Quality Review">
                  <div className="trace-quality-title">
                    <ListChecks size={16} />
                    <h3>Trace Quality Review</h3>
                  </div>
                  <dl className="trace-quality-grid">
                    <div>
                      <dt>Cutline</dt>
                      <dd>{traceQualityReview.cutlineStatus}</dd>
                    </div>
                    <div>
                      <dt>Vector cutline</dt>
                      <dd>{traceQualityReview.vectorCutlinePresent ? `Present (${traceQualityReview.vectorPointCount} points)` : "Missing"}</dd>
                    </div>
                    <div>
                      <dt>Preview bounds</dt>
                      <dd>{traceQualityReview.previewBoundsText}</dd>
                    </div>
                    <div>
                      <dt>Subject bounds</dt>
                      <dd>{traceQualityReview.subjectBoundsText}</dd>
                    </div>
                    <div>
                      <dt>Tile layout</dt>
                      <dd>{traceQualityReview.tileCountText}</dd>
                    </div>
                    <div>
                      <dt>Original underlay</dt>
                      <dd>{traceQualityReview.originalUnderlayStatus}</dd>
                    </div>
                    <div>
                      <dt>Detail lines</dt>
                      <dd>{traceQualityReview.detailLineStatus}</dd>
                    </div>
                    <div>
                      <dt>Export readiness</dt>
                      <dd>{traceQualityReview.exportReadiness}</dd>
                    </div>
                    <div>
                      <dt>Detail cleanup</dt>
                      <dd>{traceQualityReview.detailCleanupStatus}</dd>
                    </div>
                  </dl>
                  {traceQualityReview.warnings.length > 0 ? (
                    <div className="trace-quality-warnings">
                      {traceQualityReview.warnings.map((warning) => (
                        <p key={warning}>{warning}</p>
                      ))}
                    </div>
                  ) : (
                    <p className="trace-quality-ok">No trace quality warnings.</p>
                  )}
                </section>
              ) : null}
              <div className="cleanup-card">
                <div className="cleanup-title">
                  <ListChecks size={17} />
                  <h3>Template Cleanup</h3>
                </div>
                <div className="cleanup-list">
                  {(Object.keys(cleanupStepLabels) as CleanupStep[]).map((step) => (
                    <label key={step} className="cleanup-step">
                      <input
                        type="checkbox"
                        checked={cleanupChecks[step]}
                        onChange={() => toggleCleanupStep(step)}
                      />
                      <span>{cleanupStepLabels[step]}</span>
                    </label>
                  ))}
                </div>
              </div>
              <section className="paint-review-header" aria-label="Paint Match Review">
                <div>
                  <h3>Paint Match Review</h3>
                  <p>Detected colors are only a starting point. Add skin, hair, trim, or other paint colors manually when the extractor misses them.</p>
                </div>
                <div className="palette-editor-actions" aria-label="Paint Palette Editor">
                  <div className="palette-presets" aria-label="Common missing colors">
                    {([
                      ["Skin tone", "#f1c7a5"],
                      ["Hair", "#0c143a"],
                      ["Main clothing", "#e4cc24"],
                      ["Boots/shoes", "#6a5424"],
                      ["Accent/trim", "#8f2d56"],
                      ["Custom", newPaintHex]
                    ] as const).map(([label, hex]) => (
                      <button
                        key={label}
                        className="filter-button"
                        onClick={() => {
                          setNewPaintLabel(label);
                          setNewPaintHex(hex);
                        }}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  <label>
                    <span>New color</span>
                    <input
                      type="color"
                      value={isValidHexColor(newPaintHex) ? newPaintHex : "#f1c7a5"}
                      onChange={(event) => setNewPaintHex(event.target.value)}
                      aria-label="New paint color"
                    />
                  </label>
                  <label>
                    <span>Hex</span>
                    <input
                      type="text"
                      value={newPaintHex}
                      onChange={(event) => setNewPaintHex(event.target.value)}
                      aria-label="New paint hex"
                    />
                  </label>
                  <label>
                    <span>Label</span>
                    <input
                      type="text"
                      value={newPaintLabel}
                      onChange={(event) => setNewPaintLabel(event.target.value)}
                      aria-label="New paint label"
                    />
                  </label>
                  <button className="tool-button" onClick={addManualPaintColor}>
                    <SwatchBook size={15} />
                    Add color
                  </button>
                  <button className="tool-button" onClick={mergeSelectedPaintColors} disabled={selectedPaintColorIds.length < 2}>
                    <RefreshCw size={15} />
                    Merge selected
                  </button>
                  <button className="tool-button" onClick={resetProjectPaletteFromDetected}>
                    <RotateCcw size={15} />
                    Reset palette
                  </button>
                </div>
                <div className="paint-review-filters" aria-label="Paint review filter">
                  {([
                    ["all", "All"],
                    ["missing", "Missing"],
                    ["included", "Shopping list"]
                  ] as const).map(([filter, label]) => (
                    <button
                      key={filter}
                      className={paintReviewFilter === filter ? "filter-button selected" : "filter-button"}
                      onClick={() => setPaintReviewFilter(filter)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </section>
              {paintWarnings.length > 0 ? (
                <section className="paint-sanity-card" aria-label="Paint Sanity Check">
                  <div>
                    <h3>Paint Sanity Check</h3>
                    <p>Review these before exporting. They are warnings, not blockers.</p>
                  </div>
                  <ul>
                    {paintWarnings.slice(0, 8).map((warning) => (
                      <li key={warning.id}>
                        <strong>Swatch {warning.swatchNumber}: {warning.label}</strong>
                        <span>{warning.reason}</span>
                      </li>
                    ))}
                  </ul>
                  {paintWarnings.length > 8 ? <p className="helper-note">+{paintWarnings.length - 8} more paint warnings</p> : null}
                </section>
              ) : null}
              <section className="palette-summary-card" aria-label="Project Palette Summary">
                <div className="palette-summary-heading">
                  <div>
                    <h3>Project Palette Summary</h3>
                    <p>Clean this list into the paint bottles you actually plan to buy.</p>
                  </div>
                </div>
                {duplicatePaintSuggestion ? (
                  <div className="merge-suggestion" role="status">
                    <strong>Duplicate paint cleanup</strong>
                    <span>
                      You have {duplicatePaintSuggestion.swatchNumbers.length} colors using {duplicatePaintSuggestion.purchaseLabel}. Merge them if they are one purchase.
                    </span>
                    <button className="tool-button" onClick={() => mergeProjectPaintColorsBySwatches(duplicatePaintSuggestion.swatchNumbers)}>
                      <RefreshCw size={15} />
                      Merge these
                    </button>
                  </div>
                ) : null}
                <div className="palette-summary-list">
                  {paintGuideEntries.map((entry) => (
                    <article className="palette-summary-item" key={`summary-${entry.id}`}>
                      <span className="mini-swatch" style={{ backgroundColor: entry.hex }} />
                      <div>
                        <strong>{entry.label}</strong>
                        <span>{entry.note || "Add use note"} / {entry.included ? "Shopping list" : "Excluded"}</span>
                        <em>
                          {entry.manualOverride
                            ? entry.manualOverride
                            : entry.selectedMatch
                              ? matchDisplayName(entry.selectedMatch)
                              : "Choose a paint match below or choose in store."}
                        </em>
                      </div>
                      {isGenericPaintLabel(entry) ? <b>Needs label</b> : null}
                    </article>
                  ))}
                </div>
              </section>
              <div className="palette-list">
                {visiblePaintGuideEntries.map((entry) => (
                  <details className={entry.included ? "palette-row" : "palette-row muted-paint"} key={entry.id}>
                    <summary className="palette-row-summary">
                      <span className="swatch" style={{ backgroundColor: entry.hex }} />
                      <span className="palette-row-compact-copy">
                        <strong>{entry.index}. {entry.label}</strong>
                        <span>{entry.note || "Add use note"} / {entry.included ? "Shopping list" : "Excluded"}</span>
                        <em>
                          {entry.manualOverride
                            ? entry.manualOverride
                            : entry.selectedMatch
                              ? matchDisplayName(entry.selectedMatch)
                              : "Choose in store"}
                        </em>
                      </span>
                      {isGenericPaintLabel(entry) ? <span className="needs-label-badge">Needs label</span> : null}
                    </summary>
                    <div className="palette-row-body">
                      <div className="swatch" style={{ backgroundColor: entry.hex }} />
                      <div className="paint-guide-fields">
                      <div className="palette-row-header">
                        <strong>{entry.index}. {entry.label}</strong>
                        <span>{entry.hex.toUpperCase()} / {entry.source === "manual" ? "manual" : `${Math.round(entry.coverage * 100)}%`}{entry.locked ? " / locked" : ""}</span>
                      </div>
                      {isGenericPaintLabel(entry) ? <span className="needs-label-badge">Needs label</span> : null}
                      <div className="palette-row-tools">
                        <label className="toggle-row compact-toggle">
                          <input
                            type="checkbox"
                            checked={selectedPaintColorIds.includes(entry.id)}
                            onChange={() => togglePaintMergeSelection(entry.id)}
                          />
                          Merge
                        </label>
                        <label className="toggle-row compact-toggle">
                          <input
                            type="checkbox"
                            checked={entry.locked}
                            onChange={() => updatePaintGuideEntry(entry.id, { locked: !entry.locked })}
                          />
                          Lock
                        </label>
                        <button className="tool-button" onClick={() => removePaintColor(entry.id)} disabled={entry.locked}>
                          <Trash2 size={15} />
                          Delete
                        </button>
                      </div>
                      <div className="selected-paint-summary">
                        <span className="source-swatch" style={{ backgroundColor: entry.hex }} />
                        <strong>
                          {entry.manualOverride
                            ? entry.manualOverride
                            : entry.selectedMatch
                              ? matchDisplayName(entry.selectedMatch)
                              : "Choose a paint match below or choose in store."}
                        </strong>
                        {entry.selectedMatch ? (
                          <em>{matchConfidenceLabel(entry.selectedMatch)}</em>
                        ) : null}
                      </div>
                      <label>
                        <span>Label</span>
                        <input
                          type="text"
                          value={entry.label}
                          onChange={(event) => updatePaintGuideEntry(entry.id, { label: event.target.value })}
                        />
                      </label>
                      <div className="paint-color-editors">
                        <label>
                          <span>Color</span>
                          <input
                            type="color"
                            value={isValidHexColor(entry.hex) ? entry.hex : "#000000"}
                            onChange={(event) => updatePaintGuideEntry(entry.id, { hex: event.target.value })}
                            aria-label={`Color picker for ${entry.label}`}
                          />
                        </label>
                        <label>
                          <span>Hex</span>
                          <input
                            type="text"
                            value={entry.hex}
                            onChange={(event) => updatePaintGuideEntry(entry.id, { hex: event.target.value })}
                            onBlur={(event) => {
                              if (isValidHexColor(event.target.value)) void refreshPaintMatchesForColor(entry.id, event.target.value);
                            }}
                          />
                        </label>
                      </div>
                      <label>
                        <span>Notes/use</span>
                        <input
                          type="text"
                          placeholder="hair, coat, boots, trim"
                          value={entry.note}
                          onChange={(event) => updatePaintGuideEntry(entry.id, { note: event.target.value })}
                        />
                      </label>
                      <label>
                        <span>Craft paint match</span>
                        <select
                          value={entry.manualOverride ? "__manual__" : entry.selectedMatchId ?? ""}
                          onChange={(event) => {
                            const value = event.target.value;
                            if (value === "__manual__") {
                              updatePaintGuideEntry(entry.id, { selectedMatchId: null, manualOverride: entry.manualOverride || "Choose in store" });
                              return;
                            }
                            if (value === "") {
                              updatePaintGuideEntry(entry.id, { selectedMatchId: null, manualOverride: "" });
                              return;
                            }
                            updatePaintGuideEntry(entry.id, { selectedMatchId: value, manualOverride: "" });
                          }}
                        >
                          <option value="">No match / choose in store</option>
                          {entry.matches.map((match) => (
                            <option key={match.id} value={match.id}>
                              {matchDisplayName(match)}
                            </option>
                          ))}
                          <option value="__manual__">Manual override</option>
                        </select>
                      </label>
                      <div className="paint-match-actions">
                        <button className="tool-button" onClick={() => updatePaintGuideEntry(entry.id, { selectedMatchId: null, manualOverride: "" })}>
                          Choose in store
                        </button>
                        <button className="tool-button" onClick={() => updatePaintGuideEntry(entry.id, { selectedMatchId: null, manualOverride: entry.manualOverride || "Choose in store" })}>
                          Manual override
                        </button>
                      </div>
                      {entry.matches.length > 0 ? (
                        <div className="paint-match-suggestions" aria-label={`Suggested paints for ${entry.label}`}>
                          {entry.matches.map((match) => (
                            <button
                              key={match.id}
                              className={entry.selectedMatchId === match.id ? "paint-match-chip selected" : "paint-match-chip"}
                              onClick={() => updatePaintGuideEntry(entry.id, { selectedMatchId: match.id, manualOverride: "" })}
                            >
                              <span className="swatch-pair" aria-hidden="true">
                                <span className="mini-swatch" style={{ backgroundColor: entry.hex }} />
                                <span className="mini-swatch" style={{ backgroundColor: match.hex }} />
                              </span>
                              <span>{matchDisplayName(match)}</span>
                              <em>Use this paint / {matchConfidenceLabel(match)}{match.outdoorRecommended ? " / Outdoor" : ""}</em>
                            </button>
                          ))}
                        </div>
                      ) : null}
                      {entry.manualOverride ? (
                        <label>
                          <span>Manual override</span>
                          <input
                            type="text"
                            placeholder="brand, line, color name, or choose in store"
                            value={entry.manualOverride}
                            onChange={(event) => updatePaintGuideEntry(entry.id, { selectedMatchId: null, manualOverride: event.target.value })}
                          />
                        </label>
                      ) : null}
                      <label className="toggle-row compact-toggle">
                        <input
                          type="checkbox"
                          checked={entry.included}
                          onChange={() => updatePaintGuideEntry(entry.id, { included: !entry.included })}
                        />
                        Include in shopping list
                      </label>
                      </div>
                    </div>
                  </details>
                ))}
              </div>
              {visiblePaintGuideEntries.length === 0 ? (
                <p className="muted">No paint colors match this filter.</p>
              ) : null}
              <div className="shopping-list-card">
                <div className="shopping-list-header">
                  <strong>Shopping list</strong>
                  <button className="tool-button" onClick={copyPaintShoppingList}>
                    <Copy size={15} />
                    Copy list
                  </button>
                </div>
                <pre className="shopping-list-preview">{paintShoppingList}</pre>
                {shoppingListStatus ? <span className="copy-status">{shoppingListStatus}</span> : null}
              </div>
            </>
          ) : (
            <p className="muted">Paint planning appears after preview generation.</p>
          )}
          {error ? <div className="error-box">{error}</div> : null}
        </aside>
      </section>
    </main>
  );
}

function brushPixels(size: BrushSize) {
  if (size === "thin") return 10;
  if (size === "bold") return 34;
  return 20;
}

function traceActionLabel({ image, analysis, busy, traceMode }: { image: File | null; analysis: Analysis | null; busy: boolean; traceMode: TraceMode }) {
  if (busy) return "Working...";
  if (!image) return "Upload an image to start";
  if (analysis) return "Regenerate Cutline";
  if (traceMode === "paint" || traceMode === "marker" || traceMode === "extra") return "Start Trace Studio with Starter lines";
  if (traceMode === "outline") return "Generate Outside Cutline Only";
  return "Start Trace Studio";
}

function defaultEditorToolForTraceMode(mode: TraceMode): EditorTool {
  return mode === "manual" ? "draw" : "remove";
}

function canvasHasVisibleInk(canvas: HTMLCanvasElement) {
  const context = canvas.getContext("2d");
  if (!context) return false;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha > 8 && (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245)) {
      return true;
    }
  }
  return false;
}

function workflowStep(label: string, target: WorkflowTarget, complete: boolean, available: boolean) {
  const status: WorkflowStatus = complete ? "Complete" : available ? "Next" : "Needs attention";
  return { label, target, status };
}

function isGenericPaintLabel(entry: PaintGuideEntry) {
  return /^Color \d+$/i.test(entry.label.trim());
}

function groupDuplicatePaintPurchases(entries: PaintGuideEntry[]) {
  return groupShoppingListItems(entries).filter((group) => group.key !== "no-match" && group.swatchNumbers.length > 1);
}

function brushSizeName(width: number): BrushSize {
  if (width <= 12) return "thin";
  if (width >= 30) return "bold";
  return "normal";
}

function brushSizeLabel(size: BrushSize) {
  if (size === "thin") return "Thin";
  if (size === "bold") return "Bold";
  return "Normal";
}

function shortStrokeLabel(id: string) {
  if (id.length <= 14) return id;
  return `${id.slice(0, 6)}...${id.slice(-4)}`;
}

function imageContentBounds(dataUrl: string, expectedSize: { width: number; height: number }): Promise<TraceBounds | null> {
  return new Promise((resolve) => {
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = expectedSize.width;
      canvas.height = expectedSize.height;
      const context = canvas.getContext("2d", { willReadFrequently: true });
      if (!context) {
        resolve(null);
        return;
      }
      context.drawImage(image, 0, 0, expectedSize.width, expectedSize.height);
      const pixels = context.getImageData(0, 0, expectedSize.width, expectedSize.height).data;
      let left = expectedSize.width;
      let top = expectedSize.height;
      let right = 0;
      let bottom = 0;
      for (let y = 0; y < expectedSize.height; y += 1) {
        for (let x = 0; x < expectedSize.width; x += 1) {
          const offset = (y * expectedSize.width + x) * 4;
          if (pixels[offset + 3] > 8) {
            left = Math.min(left, x);
            top = Math.min(top, y);
            right = Math.max(right, x + 1);
            bottom = Math.max(bottom, y + 1);
          }
        }
      }
      resolve(right > left && bottom > top ? { left, top, right, bottom } : null);
    };
    image.onerror = () => resolve(null);
    image.src = dataUrl;
  });
}

function isDefaultTraceViewport(viewport: TraceViewport) {
  return viewport.zoom === DEFAULT_TRACE_VIEWPORT.zoom
    && viewport.panX === DEFAULT_TRACE_VIEWPORT.panX
    && viewport.panY === DEFAULT_TRACE_VIEWPORT.panY;
}

function pointHandleHitRadius(width: number) {
  return Math.max(8, width * 0.65);
}

function midpoint(a: TracePoint, b: TracePoint): TracePoint {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function safelySetPointerCapture(element: HTMLCanvasElement, pointerId: number) {
  try {
    element.setPointerCapture(pointerId);
  } catch {
    // Synthetic pointer events and some browser edge cases do not expose an active pointer.
  }
}

function safelyReleasePointerCapture(element: HTMLCanvasElement, pointerId: number) {
  try {
    element.releasePointerCapture(pointerId);
  } catch {
    // Matching guard for pointer capture fallback.
  }
}

function readFileAsDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === "string") {
        resolve(reader.result);
        return;
      }
      reject(new Error("File did not load as a data URL."));
    };
    reader.onerror = () => reject(reader.error ?? new Error("Unable to read file."));
    reader.readAsDataURL(file);
  });
}

async function fileFromDataUrl(dataUrl: string, name: string, type: string) {
  const response = await fetch(dataUrl);
  const blob = await response.blob();
  return new File([blob], name, { type: type || blob.type || "application/octet-stream" });
}

function highestStrokeNumber(strokes: TraceStroke[]) {
  let highest = 0;
  for (const stroke of strokes) {
    const match = /^stroke-(\d+)$/.exec(stroke.id);
    if (match) highest = Math.max(highest, Number(match[1]));
  }
  return highest;
}

function SegmentedButton({
  selected,
  onClick,
  icon,
  label
}: {
  selected: boolean;
  onClick: () => void;
  icon: ReactNode;
  label: string;
}) {
  return (
    <button className={selected ? "tool-button selected" : "tool-button"} onClick={onClick}>
      {icon}
      {label}
    </button>
  );
}

function PanelTitle({ icon, title }: { icon: ReactNode; title: string }) {
  return (
    <div className="panel-title">
      {icon}
      <h2>{title}</h2>
    </div>
  );
}

function RangeField({
  label,
  min,
  max,
  value,
  onChange,
  lowLabel,
  highLabel
}: {
  label: string;
  min: number;
  max: number;
  value: number;
  onChange: (value: number) => void;
  lowLabel?: string;
  highLabel?: string;
}) {
  return (
    <label className="field">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
      {lowLabel && highLabel ? (
        <small className="range-hints">
          <span>{lowLabel}</span>
          <span>{highLabel}</span>
        </small>
      ) : null}
    </label>
  );
}

function NumberField({
  label,
  suffix,
  min,
  max,
  step,
  value,
  onChange
}: {
  label: string;
  suffix: string;
  min: number;
  max: number;
  step: number;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="number-field">
      <span>{label}</span>
      <div>
        <input type="number" min={min} max={max} step={step} value={value} onChange={(event) => onChange(Number(event.target.value))} />
        <em>{suffix}</em>
      </div>
    </label>
  );
}

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
