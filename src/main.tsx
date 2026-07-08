import { StrictMode, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ChevronLeft, ChevronRight, Copy, Download, Eraser, Eye, FileImage, FileText, FolderOpen, Hand, ListChecks, MousePointerClick, Pencil, Redo2, RefreshCw, RotateCcw, Save, SlidersHorizontal, SwatchBook, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
import {
  CUTOUT_AUTOSAVE_KEY,
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
  isValidHexColor,
  matchConfidenceLabel,
  matchDisplayName,
  mergeProjectPaintColors,
  paintGuideEditsFromProjectPalette,
  paintGuideEntriesForProjectPalette,
  removeProjectPaintColor,
  seedProjectPaletteFromDetected,
  shoppingListText,
  updateProjectPaintColor,
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
import { DEFAULT_TRACE_VIEWPORT, fittedTraceSize, panViewport, screenToTracePoint, zoomViewport, type TraceViewport } from "./traceViewport";
import {
  opensEditorWithReference,
  traceModeHelp,
  traceModeLabel,
  traceModeSettings,
  type Settings,
  type TraceMode
} from "./traceWorkflow";
import "./styles.css";

type EditorTool = "erase" | "draw" | "smoothDraw" | "remove" | "select" | "pan";
type BrushSize = "thin" | "normal" | "bold";
type CleanupStep = "cutline" | "remove" | "draw" | "export";
type Analysis = CutoutProjectAnalysis;
type ProjectStatus = "No saved project" | "Unsaved changes" | "Auto-saved" | "Saved" | "Restored auto-save" | "Project opened" | "Project export failed" | "Project import failed" | "Auto-save failed";
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
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTool, setEditorTool] = useState<EditorTool>("erase");
  const [brushSize, setBrushSize] = useState<BrushSize>("normal");
  const [showReference, setShowReference] = useState(false);
  const [referenceOpacity, setReferenceOpacity] = useState(35);
  const [showCutline, setShowCutline] = useState(true);
  const [showManualLines, setShowManualLines] = useState(true);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [printPreview, setPrintPreview] = useState(false);
  const [traceViewport, setTraceViewport] = useState<TraceViewport>(DEFAULT_TRACE_VIEWPORT);
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

  const canAnalyze = image !== null && !busy;
  const canExport = image !== null && analysis !== null && !busy;
  const canSaveProject = image !== null && sourceImageDataUrl !== null && analysis !== null && !busy;
  const canExportSvg = analysis !== null && !busy;
  const advancedTraceModeSelected = traceMode === "marker" || traceMode === "extra";
  const traceStudioOpen = traceMode === "manual";
  const selectedStroke = selectedStrokeId ? manualStrokes.find((stroke) => stroke.id === selectedStrokeId) ?? null : null;
  const selectedStrokeSummary = selectedTraceStrokeSummary(manualStrokes, selectedStrokeId);
  const undoDisabled = traceStudioOpen ? manualHistory.length === 0 : history.length === 0;
  const redoDisabled = traceStudioOpen ? manualRedoHistory.length === 0 : redoHistory.length === 0;
  const paintGuideEntries = paintGuideEntriesForProjectPalette(projectPalette);
  const visiblePaintGuideEntries = filterPaintGuideEntries(paintGuideEntries, paintReviewFilter);
  const paintShoppingList = shoppingListText(paintGuideEntries);
  const canIncludePaintGuide = paintGuideEntries.length > 0;

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
    setPrintPreview(false);
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
    traceViewport,
    autosavePaused
  ]);

  useEffect(() => {
    if (!analysis || !editorOpen) return;
    if (traceStudioOpen) {
      renderManualTraceLayer(manualStrokes);
      return;
    }
    loadDetailCanvas(editedDetailDataUrl ?? analysis.detailLinePngDataUrl);
  }, [analysis, dimUnselectedStrokes, editorOpen, editedDetailDataUrl, manualStrokes, printPreview, selectedStrokeId, traceStudioOpen]);

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
      setProjectPalette(seedProjectPaletteFromDetected(body.palette, []));
      setSelectedPaintColorIds([]);
      setEditorOpen(openEditor);
      setShowReference(openEditor);
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
    try {
      const svg = buildTraceLineworkSvg({
        projectName,
        analysis,
        manualStrokes,
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
      setProjectName(file.name.replace(/\.[^.]+$/, "") || "Cutout Project");
      setProjectCreatedAt(new Date().toISOString());
    } catch {
      setError("Unable to read the selected image.");
    }
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
    setTraceMode(project.traceMode);
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
    setEditedDetailDataUrl(null);
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

  function applyTraceMode(mode: TraceMode) {
    setTraceMode(mode);
    const next = traceModeSettings(mode, settings);
    setSettings(next);
    setAnalysis(null);
  }

  function updateInteriorDetail(value: number) {
    const detailCleanup = traceMode === "paint" || traceMode === "marker" ? value : 100 - value;
    setSettings((current) => ({ ...current, detailCleanup, detailLines: true, templateStyle: traceMode }));
    setAnalysis(null);
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
    setTraceViewport(DEFAULT_TRACE_VIEWPORT);
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
    setTraceViewport({
      zoom: analysis.previewWidthPx / fitted.width,
      panX: 0,
      panY: 0
    });
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Cutout Studio</h1>
          <p>Personal wood cutout template generator</p>
        </div>
        <div className="topbar-actions">
          <button className="secondary-topbar-action" onClick={exportSvgLinework} disabled={!canExportSvg}>
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

          <div className="project-card">
            <div className="project-card-title">
              <strong>{projectName}</strong>
              <span>{projectStatus}</span>
            </div>
            <div className="project-actions">
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

          <NumberField
            label="Finished height"
            suffix="in"
            min={6}
            max={96}
            step={1}
            value={settings.finishedHeightIn}
            onChange={(value) => updateSetting("finishedHeightIn", value)}
          />

          <div className="choice-group" aria-label="Trace style">
            <span className="choice-label">Trace style</span>
            <button className={traceMode === "outline" ? "choice selected" : "choice"} onClick={() => applyTraceMode("outline")}>
              <strong>{traceModeLabel("outline")}</strong>
              <small>{traceModeHelp("outline")}</small>
            </button>
            <button className={traceMode === "paint" ? "choice selected" : "choice"} onClick={() => applyTraceMode("paint")}>
              <strong>{traceModeLabel("paint")}</strong>
              <small>{traceModeHelp("paint")}</small>
            </button>
            <button className={traceMode === "manual" ? "choice selected" : "choice"} onClick={() => applyTraceMode("manual")}>
              <strong>{traceModeLabel("manual")}</strong>
              <small>{traceModeHelp("manual")}</small>
            </button>
          </div>

          <RangeField label="Line smoothness" min={0} max={8} value={settings.smoothing} onChange={(value) => updateSetting("smoothing", value)} />
          {settings.detailLines ? (
            <RangeField
              label={traceMode === "paint" || traceMode === "marker" ? "Cleanup strength" : "Inside detail"}
              min={traceMode === "marker" ? 85 : traceMode === "paint" ? 76 : 0}
              max={100}
              value={traceMode === "paint" || traceMode === "marker" ? settings.detailCleanup : 100 - settings.detailCleanup}
              onChange={updateInteriorDetail}
              lowLabel={traceMode === "paint" || traceMode === "marker" ? "More lines" : undefined}
              highLabel={traceMode === "paint" || traceMode === "marker" ? "Cleaner" : undefined}
            />
          ) : null}
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
              ? "Hide advanced cleanup"
              : advancedTraceModeSelected
                ? `Show advanced cleanup (${traceModeLabel(traceMode)} selected)`
                : "Show advanced cleanup"}
          </button>
          {advancedOpen ? (
            <div className="advanced-panel">
              <RangeField label="Background sensitivity" min={0} max={180} value={settings.threshold} onChange={(value) => updateSetting("threshold", value)} />
              <RangeField label="Remove tiny marks" min={0} max={600} value={settings.speckArea} onChange={(value) => updateSetting("speckArea", value)} />
              <RangeField label="Close small gaps" min={0} max={1500} value={settings.holeArea} onChange={(value) => updateSetting("holeArea", value)} />
              <div className="choice-group" aria-label="Advanced trace styles">
                <span className="choice-label">Experimental detail sources</span>
                <button className={traceMode === "marker" ? "choice selected" : "choice"} onClick={() => applyTraceMode("marker")}>
                  <strong>{traceModeLabel("marker")}</strong>
                  <small>{traceModeHelp("marker")}</small>
                </button>
                <button className={traceMode === "extra" ? "choice selected" : "choice"} onClick={() => applyTraceMode("extra")}>
                  <strong>{traceModeLabel("extra")}</strong>
                  <small>{traceModeHelp("extra")}</small>
                </button>
              </div>
            </div>
          ) : null}

          <button className="secondary-action" onClick={() => analyze()} disabled={!canAnalyze}>
            <RefreshCw size={17} />
            {busy ? "Working..." : "Generate Starting Template"}
          </button>
        </aside>

        <section className="preview-stage" aria-label="Trace preview">
          {analysis ? (
            <div className="page-preview">
              <div className="preview-strip">
                <span>{editorOpen ? `${traceModeLabel(traceMode)} Editor` : "Trace preview"}</span>
                <span>{analysis.tileCols} x {analysis.tileRows} pages</span>
              </div>
              {editorOpen ? (
                <div className="editor-wrap">
                  <div className="editor-tools" aria-label="Template editor tools">
                    <SegmentedButton
                      selected={editorTool === "erase"}
                      onClick={() => setEditorTool("erase")}
                      icon={<Eraser size={15} />}
                      label="Erase details"
                    />
                    <SegmentedButton
                      selected={editorTool === "draw"}
                      onClick={() => setEditorTool("draw")}
                      icon={<Pencil size={15} />}
                      label="Draw details"
                    />
                    <SegmentedButton
                      selected={editorTool === "smoothDraw"}
                      onClick={() => setEditorTool("smoothDraw")}
                      icon={<Pencil size={15} />}
                      label="Smooth curve"
                    />
                    <SegmentedButton
                      selected={editorTool === "remove"}
                      onClick={() => setEditorTool("remove")}
                      icon={<MousePointerClick size={15} />}
                      label="Click to remove line"
                    />
                    {traceStudioOpen ? (
                      <>
                        <SegmentedButton
                          selected={editorTool === "select"}
                          onClick={() => setEditorTool("select")}
                          icon={<MousePointerClick size={15} />}
                          label="Select stroke"
                        />
                        <SegmentedButton
                          selected={editorTool === "pan"}
                          onClick={() => setEditorTool("pan")}
                          icon={<Hand size={15} />}
                          label="Pan"
                        />
                      </>
                    ) : null}
                    <select value={brushSize} onChange={(event) => setBrushSize(event.target.value as BrushSize)} aria-label="Brush size">
                      <option value="thin">Thin detail</option>
                      <option value="normal">Normal detail</option>
                      <option value="bold">Bold outline</option>
                    </select>
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
                    {traceStudioOpen ? (
                      <button className="tool-button" onClick={deleteSelectedStroke} disabled={!selectedStrokeId}>
                        <Trash2 size={15} />
                        Delete stroke
                      </button>
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
                    <button className={showReference ? "tool-button selected" : "tool-button"} onClick={() => setShowReference((shown) => !shown)}>
                      <Eye size={15} />
                      Show original
                    </button>
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
                  </div>
                  <div className="layer-controls" aria-label="Trace Studio layer visibility">
                    <label>
                      <input type="checkbox" checked={showReference} onChange={() => setShowReference((shown) => !shown)} />
                      Original underlay
                    </label>
                    <label>
                      <input type="checkbox" checked={showCutline} onChange={() => setShowCutline((shown) => !shown)} />
                      Cutline
                    </label>
                    <label>
                      <input type="checkbox" checked={showManualLines} onChange={() => setShowManualLines((shown) => !shown)} />
                      Manual lines
                    </label>
                    <label>
                      <input type="checkbox" checked={showSuggestions} onChange={() => setShowSuggestions((shown) => !shown)} />
                      Suggestions
                    </label>
                  </div>
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
                      ? "Trace only the face, clothing, and feature lines you want on the final template."
                      : "Best results: erase extra marks, draw missing face/clothing lines, then export."}
                  </p>
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

        <aside className="right-panel" aria-label="Paint guide and export summary">
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
              <div className="palette-list">
                {visiblePaintGuideEntries.map((entry) => (
                  <article className={entry.included ? "palette-row" : "palette-row muted-paint"} key={entry.id}>
                    <div className="swatch" style={{ backgroundColor: entry.hex }} />
                    <div className="paint-guide-fields">
                      <div className="palette-row-header">
                        <strong>{entry.index}. {entry.label}</strong>
                        <span>{entry.hex.toUpperCase()} / {entry.source === "manual" ? "manual" : `${Math.round(entry.coverage * 100)}%`}{entry.locked ? " / locked" : ""}</span>
                      </div>
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
                              : "No match selected"}
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
                              <em>{matchConfidenceLabel(match)}{match.outdoorRecommended ? " / Outdoor" : ""}</em>
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
                  </article>
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
