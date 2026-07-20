import { StrictMode, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { ChevronLeft, ChevronRight, Copy, Download, Eraser, Eye, FileImage, FileText, FolderOpen, Hand, ListChecks, MousePointerClick, Pencil, Redo2, RefreshCw, RotateCcw, Save, SlidersHorizontal, Sparkles, SwatchBook, Trash2, Undo2, X, ZoomIn, ZoomOut } from "lucide-react";
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
import {
  createProjectSessionPersistenceCoordinator,
  createProjectSession,
  projectSessionView,
  transitionProjectSession,
  validateCraftPaintMatches,
  type ProjectSession,
  type ProjectSessionAction,
  type ProjectSessionAiProposalResult,
  type ProjectSessionAiProposalState,
  type ProjectSessionEffect,
  type ProjectSessionInputReadiness,
  type ProjectPersistenceSnapshot,
  type ProjectSessionSourceImage
} from "./projectSession.ts";
import { previewDetailSegment, previewFirstDetailSegment, removeDetailSegmentPreview, type DetailSegmentPreview } from "./detailEditor";
import {
  createEditorTransactionHistory,
  recordEditorTransaction,
  redoEditorTransaction,
  undoEditorTransaction,
  type EditorTransactionHistory
} from "./editorTransactions.ts";
import { type AiProposalReview, type AiProposalReviewView } from "./aiLineworkReview";
import {
  filterPaintGuideEntries,
  groupShoppingListItems,
  isValidHexColor,
  matchConfidenceLabel,
  matchDisplayName,
  paintGuideEditsFromProjectPalette,
  paintGuideEntriesForProjectPalette,
  paintSanityWarnings,
  seedProjectPaletteFromDetected,
  shoppingListText,
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
import { isSvgFile, prepareSvgFastPathUpload, svgInkForPreview } from "./svgFastPath";
import {
  DEFAULT_WORKFLOW_PROGRESS,
  type WorkflowProgress,
  type WorkflowStep,
  type WorkflowStepItem
} from "./guidedWorkflow";
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
  shouldAutoFitViewport,
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
  type DetailExtractionMode,
  type DetailPreset,
  type Settings,
  type TraceMode
} from "./traceWorkflow";
import "./styles.css";

type EditorTool = "erase" | "draw" | "smoothDraw" | "remove" | "select" | "pan";
type BrushSize = "thin" | "normal" | "bold";
type CleanupStep = "cutline" | "remove" | "draw" | "export";
type Analysis = CutoutProjectAnalysis;
type AppProjectSessionProject = {
  projectName: string;
  settings: Settings;
  sourceImage: ProjectSessionSourceImage | null;
  analysis: Analysis | null;
  inputReadiness?: ProjectSessionInputReadiness;
  editedDetailPngDataUrl: string | null;
  manualStrokes: TraceStroke[];
  projectPalette: ProjectPaintColor[];
  workflowProgress: WorkflowProgress;
  cleanupChecks: Record<CleanupStep, boolean>;
  createdAt: string | null;
  traceMode: TraceMode;
  referenceOpacity: number;
  layerVisibility: CutoutProject["layerVisibility"];
  traceViewport: TraceViewport;
};
type AppProjectSessionState = {
  session: ProjectSession<AppProjectSessionProject>;
  pendingEffects: readonly ProjectSessionEffect<AppProjectSessionProject>[];
};
type PaintGuidePatch = Partial<Omit<ProjectPaintColor, "id" | "source">>;
type PreparedSourceCandidate = {
  generation: number;
  projectName: string;
  file: File;
  dataUrl: string;
  sourceInkDataUrl: string | null;
  lineworkDetected: boolean;
};
const AI_PROPOSAL_ESTIMATE_USD = 0.10;
type ProjectStatus = "No saved project" | "Unsaved changes" | "Auto-saved" | "Saved" | "Restored auto-save" | "Project opened" | "Project export failed" | "Project import failed" | "Auto-save failed";
type StrokeDragState = {
  mode: "move" | "point";
  strokeId: string;
  pointIndex?: number;
  startPoint: TracePoint;
  originalStrokes: TraceStroke[];
  previewStrokes?: TraceStroke[];
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
  detailExtractionMode: "auto",
  paletteSize: 6,
  includeInstructionCoverPage: true,
  includePaintGuidePage: true
};

function cutoutProjectFromPersistenceSnapshot(
  snapshot: ProjectPersistenceSnapshot<AppProjectSessionProject>
): CutoutProject {
  const project = snapshot.project;
  if (!project.sourceImage || !project.analysis) {
    throw new Error("The project is not ready to save.");
  }
  const now = new Date().toISOString();
  return createCutoutProjectSnapshot({
    projectName: project.projectName,
    createdAt: project.createdAt ?? now,
    updatedAt: now,
    sourceImage: project.sourceImage,
    settings: project.settings,
    traceMode: project.traceMode,
    analysis: project.analysis,
    editedDetailPngDataUrl: project.editedDetailPngDataUrl,
    manualStrokes: project.manualStrokes,
    projectPalette: project.projectPalette,
    paintGuideEdits: paintGuideEditsFromProjectPalette(project.projectPalette),
    referenceOpacity: project.referenceOpacity,
    layerVisibility: { ...project.layerVisibility, printPreview: false },
    traceViewport: project.traceViewport,
    cleanupChecks: project.cleanupChecks,
    workflowProgress: project.workflowProgress
  });
}

function appProjectFromCutoutProject(project: CutoutProject): AppProjectSessionProject {
  return {
    projectName: project.projectName,
    settings: project.settings,
    sourceImage: project.sourceImage,
    analysis: project.analysis,
    inputReadiness: inputReadinessForAnalysis(project.analysis, false),
    editedDetailPngDataUrl: project.editedDetailPngDataUrl,
    manualStrokes: project.manualStrokes,
    projectPalette: project.projectPalette,
    workflowProgress: project.workflowProgress,
    cleanupChecks: project.cleanupChecks,
    createdAt: project.createdAt,
    traceMode: project.traceMode,
    referenceOpacity: project.referenceOpacity,
    layerVisibility: { ...project.layerVisibility, printPreview: false },
    traceViewport: project.traceViewport
  };
}

function App() {
  const [image, setImage] = useState<File | null>(null);
  const [sourceImageDataUrl, setSourceImageDataUrl] = useState<string | null>(null);
  const [projectSessionState, setProjectSessionState] = useState<AppProjectSessionState>(() => ({
    session: createProjectSession({
      projectName: "Cutout Project",
      settings: defaultSettings,
      sourceImage: null,
      analysis: null,
      editedDetailPngDataUrl: null,
      manualStrokes: [],
      projectPalette: [],
      workflowProgress: DEFAULT_WORKFLOW_PROGRESS,
      cleanupChecks: { cutline: false, remove: false, draw: false, export: false },
      createdAt: null,
      traceMode: "paint",
      referenceOpacity: 35,
      layerVisibility: {
        showReference: false,
        showCutline: true,
        showManualLines: true,
        showSuggestions: false,
        printPreview: false
      },
      traceViewport: DEFAULT_TRACE_VIEWPORT
    }),
    pendingEffects: []
  }));
  const projectSessionRef = useRef(projectSessionState.session);
  const projectSession = projectSessionState.session;
  const {
    projectName,
    settings,
    analysis,
    inputReadiness = "ready-line-art",
    editedDetailPngDataUrl: editedDetailDataUrl,
    manualStrokes,
    projectPalette,
    cleanupChecks,
    traceMode,
    referenceOpacity,
    layerVisibility: { showReference, showCutline, showManualLines, showSuggestions },
    traceViewport
  } = projectSession.project;
  const sessionView = projectSessionView(projectSession);
  const projectCapabilities = sessionView.capabilities;
  const aiProposalState = sessionView.aiProposal;
  const aiProposal = aiProposalState.status === "ready" ? aiProposalState.proposal : null;
  const aiProposalReview = aiProposalState.status === "ready" ? aiProposalState.review : null;
  const aiProposalError = aiProposalState.status === "failed" ? aiProposalState.error : null;
  const workflowProgress = projectCapabilities.guidedWorkflow.progress;
  const [projectNameDraft, setProjectNameDraft] = useState(projectName);
  const updateProjectSettings = (nextSettings: Settings) => applyProjectSessionAction({
    type: "update-non-size-settings",
    settings: nextSettings
  });
  const updateReferenceOpacity = (referenceOpacity: number) => applyProjectSessionAction({
    type: "set-reference-opacity",
    referenceOpacity
  });
  const updateLayerVisibility = (
    key: "showReference" | "showCutline" | "showManualLines" | "showSuggestions",
    value: boolean
  ) => {
    applyProjectSessionAction({ type: "set-layer-visibility", layer: key, visible: value });
  };
  const setShowReference = (value: boolean) => updateLayerVisibility("showReference", value);
  const setShowCutline = (value: boolean) => updateLayerVisibility("showCutline", value);
  const setShowManualLines = (value: boolean) => updateLayerVisibility("showManualLines", value);
  const setShowSuggestions = (value: boolean) => updateLayerVisibility("showSuggestions", value);
  const updateTraceViewport = (traceViewport: TraceViewport) => applyProjectSessionAction({
    type: "set-trace-viewport",
    traceViewport
  });
  const [sourceCandidate, setSourceCandidate] = useState<PreparedSourceCandidate | null>(null);
  const [sourceReadPending, setSourceReadPending] = useState(false);
  const [projectStatus, setProjectStatus] = useState<ProjectStatus>("No saved project");
  const [autoStarterOpen, setAutoStarterOpen] = useState(true);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTool, setEditorTool] = useState<EditorTool>("remove");
  const [brushSize, setBrushSize] = useState<BrushSize>("normal");
  const [printPreview, setPrintPreview] = useState(false);
  const [editableDetailLinesPresent, setEditableDetailLinesPresent] = useState(false);
  const [cutlineBounds, setCutlineBounds] = useState<TraceBounds | null>(null);
  const [cutlineBoundsResolved, setCutlineBoundsResolved] = useState(false);
  const [detailLineBounds, setDetailLineBounds] = useState<TraceBounds | null>(null);
  const [detailLineBoundsResolved, setDetailLineBoundsResolved] = useState(false);
  const [selectedStrokeId, setSelectedStrokeId] = useState<string | null>(null);
  const [dimUnselectedStrokes, setDimUnselectedStrokes] = useState(false);
  const [selectionFeedback, setSelectionFeedback] = useState("");
  const [newPaintHex, setNewPaintHex] = useState("#f1c7a5");
  const [newPaintLabel, setNewPaintLabel] = useState("Skin tone");
  const [paintHexDrafts, setPaintHexDrafts] = useState<Record<string, string>>({});
  const [selectedPaintColorIds, setSelectedPaintColorIds] = useState<string[]>([]);
  const [paintReviewFilter, setPaintReviewFilter] = useState<PaintReviewFilter>("all");
  const [colorDetailsOpen, setColorDetailsOpen] = useState(false);
  const [shoppingListStatus, setShoppingListStatus] = useState("");
  const [featureLineHistory, setFeatureLineHistory] = useState<EditorTransactionHistory<TraceStroke[]>>(
    createEditorTransactionHistory
  );
  const [detailLineHistory, setDetailLineHistory] = useState<EditorTransactionHistory<string>>(
    createEditorTransactionHistory
  );
  const [svgSourceInkDataUrl, setSvgSourceInkDataUrl] = useState<string | null>(null);
  const [svgImportedDetailDataUrl, setSvgImportedDetailDataUrl] = useState<string | null>(null);
  const [svgLineworkDetected, setSvgLineworkDetected] = useState(false);
  const [aiProposalReviewView, setAiProposalReviewView] = useState<AiProposalReviewView>("ai-lines-only");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const projectFileInputRef = useRef<HTMLInputElement | null>(null);
  const fileMenuRef = useRef<HTMLDetailsElement | null>(null);
  const setupSectionRef = useRef<HTMLDivElement | null>(null);
  const traceEditorSectionRef = useRef<HTMLDivElement | null>(null);
  const paintReviewSectionRef = useRef<HTMLDetailsElement | null>(null);
  const exportSectionRef = useRef<HTMLDivElement | null>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const detailCanvasLoadIdRef = useRef(0);
  const removalPreviewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const editorViewportRef = useRef<HTMLDivElement | null>(null);
  const drawingRef = useRef(false);
  const panningRef = useRef(false);
  const panStartRef = useRef<TracePoint | null>(null);
  const lastPointRef = useRef<TracePoint | null>(null);
  const smoothAnchorRef = useRef<TracePoint | null>(null);
  const draftStrokeRef = useRef<TraceStroke | null>(null);
  const rasterTransactionBeforeRef = useRef<string | null>(null);
  const strokeDragRef = useRef<StrokeDragState | null>(null);
  const strokeIdRef = useRef(0);
  const pendingContentFitRef = useRef(false);
  const viewportUserModifiedRef = useRef(false);
  const sourceSelectionGenerationRef = useRef(0);
  const traceContentBoundsRef = useRef<TraceBounds | null>(null);
  const removalPreviewRef = useRef<DetailSegmentPreview | null>(null);
  const [removalPreviewCount, setRemovalPreviewCount] = useState(0);
  const persistenceCoordinatorRef = useRef<ReturnType<typeof createProjectSessionPersistenceCoordinator<AppProjectSessionProject>> | null>(null);
  if (persistenceCoordinatorRef.current === null) {
    persistenceCoordinatorRef.current = createProjectSessionPersistenceCoordinator<AppProjectSessionProject>({
      debounceMs: 450,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancel: (handle) => window.clearTimeout(handle as number),
      serialize: (snapshot) => serializeCutoutProject(cutoutProjectFromPersistenceSnapshot(snapshot)),
      writeAutosave: (serialized) => localStorage.setItem(CUTOUT_AUTOSAVE_KEY, serialized),
      downloadProject: (serialized, snapshot) => {
        const blob = new Blob([serialized], { type: "application/json" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = projectFileName(snapshot.project.projectName);
        link.click();
        URL.revokeObjectURL(url);
      },
      clearAutosave: () => localStorage.removeItem(CUTOUT_AUTOSAVE_KEY)
    });
  }

  const selectedImage = sourceCandidate?.file ?? image;
  const canAnalyze = selectedImage !== null && !busy && !sourceReadPending && projectCapabilities.analyzeSource;
  const canExport = image !== null && !busy && projectCapabilities.exportProject;
  const canSaveProject = !busy && projectCapabilities.saveProject;
  const canExportSvg = !busy && projectCapabilities.exportProject;
  const selectedDetailPreset = detailPresetFromTraceMode(traceMode);
  const traceStudioOpen = traceMode === "manual";
  const selectedStroke = selectedStrokeId ? manualStrokes.find((stroke) => stroke.id === selectedStrokeId) ?? null : null;
  const selectedStrokeSummary = selectedTraceStrokeSummary(manualStrokes, selectedStrokeId);
  const undoDisabled = traceStudioOpen ? featureLineHistory.undo.length === 0 : detailLineHistory.undo.length === 0;
  const redoDisabled = traceStudioOpen ? featureLineHistory.redo.length === 0 : detailLineHistory.redo.length === 0;
  const primaryTraceActionLabel = traceActionLabel({ image: selectedImage, analysis, busy, traceMode });
  const paintGuideEntries = paintGuideEntriesForProjectPalette(projectPalette);
  const paintWarnings = paintSanityWarnings(paintGuideEntries);
  const visiblePaintGuideEntries = filterPaintGuideEntries(paintGuideEntries, paintReviewFilter);
  const paintShoppingList = shoppingListText(paintGuideEntries);
  const paintGuideColorCountLabel = `${paintGuideEntries.length} ${paintGuideEntries.length === 1 ? "color" : "colors"}`;
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
  const guidedWorkflowSteps = projectCapabilities.guidedWorkflow.steps;
  const uploadStepActive = workflowProgress.activeStep === "upload";
  const cleanStepActive = workflowProgress.activeStep === "clean";
  const colorsStepActive = workflowProgress.activeStep === "colors";
  const exportStepActive = workflowProgress.activeStep === "export";
  const showAiProposal = aiProposalState.status !== "idle" || projectCapabilities.aiProposal.canBeginRequest;
  const duplicatePaintSuggestion = groupDuplicatePaintPurchases(paintGuideEntries).find((group) => group.swatchNumbers.length > 1);

  useEffect(() => {
    function dismissFileMenu(event: globalThis.PointerEvent) {
      const menu = fileMenuRef.current;
      if (menu?.open && event.target instanceof Node && !menu.contains(event.target)) {
        menu.open = false;
      }
    }
    document.addEventListener("pointerdown", dismissFileMenu);
    return () => document.removeEventListener("pointerdown", dismissFileMenu);
  }, []);

  useEffect(() => {
    if (analysis) return;
    resetEditorPresentation();
  }, [analysis]);

  useEffect(() => {
    if (editorTool !== "remove") clearRemovalPreview();
  }, [editorTool]);

  function resetEditorPresentation() {
    clearRemovalPreview();
    setDetailLineHistory(createEditorTransactionHistory());
    setFeatureLineHistory(createEditorTransactionHistory());
    setSelectedStrokeId(null);
    setDimUnselectedStrokes(false);
    setSelectionFeedback("");
    setCutlineBounds(null);
    setCutlineBoundsResolved(false);
    setDetailLineBounds(null);
    setDetailLineBoundsResolved(false);
    viewportUserModifiedRef.current = false;
    setPrintPreview(false);
    setEditableDetailLinesPresent(false);
    resetAiProposalPresentation();
  }

  function resetAiProposalPresentation() {
    setAiProposalReviewView("ai-lines-only");
  }

  useEffect(() => {
    try {
      const rawProject = localStorage.getItem(CUTOUT_AUTOSAVE_KEY);
      if (!rawProject) return;
      void restoreProjectFromText(rawProject, "Restored auto-save", false);
    } catch {
      setProjectStatus("Project import failed");
    }
  }, []);

  useEffect(() => {
    setProjectNameDraft(projectName);
  }, [projectName]);

  useEffect(() => {
    setPaintHexDrafts((current) => {
      const next: Record<string, string> = {};
      let changed = false;
      for (const entry of projectPalette) {
        const draft = current[entry.id];
        if (draft === undefined) continue;
        if (normalizePaintHexDraft(draft) === entry.hex) {
          changed = true;
          continue;
        }
        next[entry.id] = draft;
      }
      if (!changed && Object.keys(next).length === Object.keys(current).length) return current;
      return next;
    });
  }, [projectPalette]);

  useEffect(() => {
    const pendingEffects = projectSessionState.pendingEffects;
    if (pendingEffects.length === 0) return;
    const coordinator = persistenceCoordinatorRef.current;
    if (!coordinator) return;
    for (const effect of pendingEffects) {
      if (effect.type === "request-autosave") setProjectStatus("Unsaved changes");
      void coordinator.execute(effect, (resultAction) => {
        const transition = applyProjectSessionAction(resultAction);
        if (transition.outcome.status === "stale") return;
        if (resultAction.type === "persistence-succeeded") {
          setProjectStatus(resultAction.mode === "autosave" ? "Auto-saved" : "Saved");
        } else {
          setProjectStatus(resultAction.mode === "autosave" ? "Auto-save failed" : "Project export failed");
        }
      });
    }
    setProjectSessionState((current) => current.pendingEffects === pendingEffects
      ? { ...current, pendingEffects: [] }
      : current);
  }, [projectSessionState.pendingEffects]);

  useEffect(() => {
    return () => persistenceCoordinatorRef.current?.dispose();
  }, []);

  useEffect(() => {
    if (!analysis || !editorOpen) return;
    if (traceStudioOpen) {
      setEditableDetailLinesPresent(false);
      setDetailLineBounds(null);
      setDetailLineBoundsResolved(true);
      renderManualTraceLayer(manualStrokes);
      return;
    }
    loadDetailCanvas(editedDetailDataUrl ?? analysis.detailLinePngDataUrl);
  }, [analysis, dimUnselectedStrokes, editorOpen, editedDetailDataUrl, manualStrokes, printPreview, selectedStrokeId, traceStudioOpen, workflowProgress.activeStep]);

  useEffect(() => {
    let cancelled = false;
    setCutlineBounds(null);
    setCutlineBoundsResolved(false);
    if (!analysis) return;
    void imageContentBounds(analysis.outerLinePngDataUrl, {
      width: analysis.previewWidthPx,
      height: analysis.previewHeightPx
    }).then((bounds) => {
      if (!cancelled) {
        setCutlineBounds(bounds);
        setCutlineBoundsResolved(true);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [analysis]);

  useEffect(() => {
    if (!shouldAutoFitViewport({ pending: pendingContentFitRef.current, userModified: viewportUserModifiedRef.current })) return;
    if (!analysis || !editorOpen || !cutlineBoundsResolved || !detailLineBoundsResolved) return;
    if (fitTraceViewportToContent()) {
      pendingContentFitRef.current = false;
    }
  }, [analysis, editorOpen, traceStudioOpen, cutlineBounds, cutlineBoundsResolved, detailLineBounds, detailLineBoundsResolved, manualStrokes]);

  useEffect(() => {
    const viewport = editorViewportRef.current;
    if (!viewport || !analysis || !editorOpen || !cutlineBoundsResolved || !detailLineBoundsResolved) return;
    let previousWidth = 0;
    let previousHeight = 0;
    const observer = new ResizeObserver((entries) => {
      const rect = entries[0]?.contentRect;
      if (!rect || rect.width <= 1 || rect.height <= 1 || viewportUserModifiedRef.current) return;
      const meaningfullyChanged = Math.abs(rect.width - previousWidth) >= 2 || Math.abs(rect.height - previousHeight) >= 2;
      previousWidth = rect.width;
      previousHeight = rect.height;
      if (!meaningfullyChanged) return;
      requestAnimationFrame(() => {
        if (!viewportUserModifiedRef.current) fitTraceViewportToContent();
      });
    });
    observer.observe(viewport);
    return () => observer.disconnect();
  }, [analysis, editorOpen, cutlineBoundsResolved, detailLineBoundsResolved]);

  useEffect(() => {
    if (selectedStrokeId && !manualStrokes.some((stroke) => stroke.id === selectedStrokeId)) {
      setSelectedStrokeId(null);
    }
  }, [manualStrokes, selectedStrokeId]);

  async function generateTemplate(preset?: DetailPreset, settingsOverride?: Settings) {
    const candidate = sourceCandidate;
    const targetImage = candidate?.file ?? image;
    if (!targetImage) return;
    const targetSvgSourceInk = candidate ? candidate.sourceInkDataUrl : svgSourceInkDataUrl;
    const mode = candidate ? "replace-source" as const : "regenerate-analysis" as const;
    const nextSettings = settingsOverride ?? (preset ? detailPresetSettings(preset, settings) : settings);
    const preservedManualStrokes = mode === "regenerate-analysis" && traceStudioOpen ? manualStrokes : [];
    if (mode === "regenerate-analysis" && analysis && preservedManualStrokes.length > 0) {
      const shouldRegenerate = window.confirm("Regenerate the cutline? This may replace the cutline and starter lines. Your manual Trace Studio lines will be kept unless you reset details.");
      if (!shouldRegenerate) return;
    }
    const preparing = applyProjectSessionAction({ type: "begin-project-preparation", operation: mode });
    if (preparing.outcome.status !== "preparing") return;
    const token = preparing.outcome.token;
    setBusy(true);
    setError(null);
    try {
      const payload = new FormData();
      payload.append("image", targetImage);
      payload.append("settings", JSON.stringify(nextSettings));
      const response = await fetch("/api/analyze", { method: "POST", body: payload });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Unable to analyze image.");
      const openEditor = opensEditorWithReference(nextSettings.templateStyle);
      const importedSvgDetail = targetSvgSourceInk
        ? await svgInkForPreview({
            sourceInkDataUrl: targetSvgSourceInk,
            subjectBoundsPx: body.subjectBoundsPx,
            previewWidthPx: body.previewWidthPx,
            previewHeightPx: body.previewHeightPx,
            outerLinePngDataUrl: body.outerLinePngDataUrl
          })
        : null;
      const initialProjectPalette = seedProjectPaletteFromDetected(body.palette, []);
      const completed = applyProjectSessionAction({
        type: "complete-source-analysis",
        token,
        mode,
        ...(candidate
          ? {
              projectName: projectNameDraft.trim() || candidate.projectName,
              sourceImage: {
                name: candidate.file.name,
                type: candidate.file.type || "application/octet-stream",
                dataUrl: candidate.dataUrl
              }
            }
          : {}),
        settings: nextSettings,
        analysis: body,
        inputReadiness: inputReadinessForAnalysis(body, targetSvgSourceInk !== null),
        initialDetailPngDataUrl: importedSvgDetail,
        initialProjectPalette,
        openEditorAfterCompletion: openEditor,
        ...(candidate ? { createdAt: new Date().toISOString() } : {})
      });
      if (completed.outcome.status === "stale") return;
      if (completed.outcome.status !== "successful") {
        throw new Error(completed.outcome.status === "failed" ? completed.outcome.error : "Unable to apply prepared analysis.");
      }

      resetAiProposalPresentation();
      resetEditorPresentation();
      setColorDetailsOpen(false);
      applyTraceModePresentation(nextSettings.templateStyle);
      if (candidate) {
        setImage(candidate.file);
        setSourceImageDataUrl(candidate.dataUrl);
        setSvgSourceInkDataUrl(candidate.sourceInkDataUrl);
        setSvgLineworkDetected(candidate.lineworkDetected);
        setSourceCandidate((current) => current?.generation === candidate.generation ? null : current);
      }
      setSvgImportedDetailDataUrl(importedSvgDetail);
      setSelectedPaintColorIds([]);
      setEditorOpen(openEditor || preservedManualStrokes.length > 0);
      setEditorTool(defaultEditorToolForTraceMode(nextSettings.templateStyle));
      pendingContentFitRef.current = openEditor || preservedManualStrokes.length > 0;
      setProjectStatus("Unsaved changes");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to analyze image.";
      const failed = applyProjectSessionAction({ type: "fail-project-preparation", token, error: message });
      if (failed.outcome.status !== "stale") setError(message);
    } finally {
      setBusy(false);
    }
  }

  async function requestAiLineworkProposal() {
    if (!image || !analysis) return;
    const requesting = applyProjectSessionAction({
      type: "confirm-ai-proposal-request",
      estimatedCostUsd: AI_PROPOSAL_ESTIMATE_USD,
      uploadConfirmed: true
    });
    if (requesting.outcome.status !== "requesting") return;
    const token = requesting.outcome.token;
    const requestImage = image;
    const requestSettings = settings;
    const requestAnalysis = analysis;
    try {
      const payload = new FormData();
      payload.append("image", requestImage);
      payload.append("settings", JSON.stringify(requestSettings));
      payload.append("confirmation", JSON.stringify({ uploadConfirmed: true, estimatedCostUsd: AI_PROPOSAL_ESTIMATE_USD }));
      const response = await fetch("/api/generate-linework", { method: "POST", body: payload });
      const body: unknown = await response.json();
      if (!response.ok) {
        const message = typeof body === "object" && body !== null && "error" in body && typeof body.error === "string"
          ? body.error
          : "Unable to generate the AI proposal.";
        throw new Error(message);
      }
      const proposal = parseAiProposalResponse(body, requestAnalysis);
      const completed = applyProjectSessionAction({ type: "complete-ai-proposal-request", token, proposal });
      if (completed.outcome.status === "successful") resetAiProposalPresentation();
    } catch (err) {
      applyProjectSessionAction({
        type: "fail-ai-proposal-request",
        token,
        error: err instanceof Error ? err.message : "Unable to generate the AI proposal."
      });
    }
  }

  function beginAiLineworkRequest() {
    const transition = applyProjectSessionAction({ type: "begin-ai-proposal-request" });
    if (transition.outcome.status === "applied") resetAiProposalPresentation();
  }

  function cancelAiLineworkRequest() {
    applyProjectSessionAction({ type: "cancel-ai-proposal-request" });
  }

  function selectAiProposalReviewView(view: AiProposalReviewView) {
    const transition = applyProjectSessionAction({ type: "review-ai-proposal-view", view });
    if (transition.outcome.status === "applied" || transition.outcome.status === "unchanged") {
      setAiProposalReviewView(view);
    }
  }

  function acceptAiLineworkProposal() {
    const accepted = applyProjectSessionAction({ type: "accept-ai-proposal" });
    const transaction = accepted.editorTransaction;
    const before = transaction?.before.editedDetailPngDataUrl;
    const after = transaction?.after.editedDetailPngDataUrl;
    if (accepted.outcome.status !== "applied" || !before || !after) return;
    setDetailLineHistory((current) => recordEditorTransaction(current, { before, after }));
    loadDetailCanvas(after);
    setProjectStatus("Unsaved changes");
  }

  function rejectAiLineworkProposal() {
    applyProjectSessionAction({ type: "reject-ai-proposal" });
  }

  async function exportPdf() {
    if (!canExport || !image) return;
    const authorized = applyProjectSessionAction({ type: "request-export" });
    if (authorized.outcome.status !== "applied") return;
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
      const editedDetail = traceStudioOpen || editedDetailDataUrl === null ? null : currentDetailDataUrl();
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
    if (!canExportSvg || !analysis) return;
    const authorized = applyProjectSessionAction({ type: "request-export" });
    if (authorized.outcome.status !== "applied") return;
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
    const generation = sourceSelectionGenerationRef.current + 1;
    sourceSelectionGenerationRef.current = generation;
    if (!file) {
      setSourceCandidate(null);
      setSourceReadPending(false);
      return;
    }

    const preparing = applyProjectSessionAction({ type: "begin-project-preparation", operation: "replace-source" });
    if (preparing.outcome.status !== "preparing") return;
    const token = preparing.outcome.token;
    setSourceReadPending(true);
    setError(null);
    try {
      let candidate: PreparedSourceCandidate;
      if (isSvgFile(file)) {
        const prepared = await prepareSvgFastPathUpload(file);
        candidate = {
          generation,
          projectName: cleanedProjectNameFromFileName(file.name),
          file: prepared.sourceFile,
          dataUrl: prepared.sourceDataUrl,
          sourceInkDataUrl: prepared.sourceInkDataUrl,
          lineworkDetected: prepared.sourceInkDataUrl !== null
        };
      } else {
        candidate = {
          generation,
          projectName: cleanedProjectNameFromFileName(file.name),
          file,
          dataUrl: await readFileAsDataUrl(file),
          sourceInkDataUrl: null,
          lineworkDetected: false
        };
      }
      const completed = applyProjectSessionAction({ type: "complete-project-preparation", token });
      if (completed.outcome.status !== "successful" || sourceSelectionGenerationRef.current !== generation) return;
      setSourceCandidate(candidate);
      setProjectNameDraft(candidate.projectName);
    } catch (err) {
      const message = err instanceof Error ? err.message : "Unable to read the selected image.";
      const failed = applyProjectSessionAction({ type: "fail-project-preparation", token, error: message });
      if (failed.outcome.status !== "stale") setError(message);
    } finally {
      if (sourceSelectionGenerationRef.current === generation) setSourceReadPending(false);
    }
  }

  function startNewProject() {
    const hasCurrentWork =
      image !== null ||
      analysis !== null ||
      manualStrokes.length > 0 ||
      projectPalette.length > 0 ||
      sourceImageDataUrl !== null ||
      sourceCandidate !== null;

    if (hasCurrentWork && !window.confirm("Start a new project? This clears the current image, strokes, and paint palette on this device. Export the project JSON first if you want to keep it.")) {
      applyProjectSessionAction({ type: "cancel-new-project" });
      return;
    }

    const confirmed = applyProjectSessionAction({
      type: "confirm-new-project",
      project: {
        projectName: "Cutout Project",
        settings: defaultSettings,
        sourceImage: null,
        analysis: null,
        editedDetailPngDataUrl: null,
        manualStrokes: [],
        projectPalette: [],
        workflowProgress: DEFAULT_WORKFLOW_PROGRESS,
        cleanupChecks: { cutline: false, remove: false, draw: false, export: false },
        createdAt: null,
        traceMode: "paint",
        referenceOpacity: 35,
        layerVisibility: {
          showReference: false,
          showCutline: true,
          showManualLines: true,
          showSuggestions: false,
          printPreview: false
        },
        traceViewport: DEFAULT_TRACE_VIEWPORT
      }
    });
    if (confirmed.outcome.status !== "successful") return;
    sourceSelectionGenerationRef.current += 1;
    setSourceCandidate(null);
    setSourceReadPending(false);
    setImage(null);
    setSvgSourceInkDataUrl(null);
    setSvgImportedDetailDataUrl(null);
    setSvgLineworkDetected(false);
    setSourceImageDataUrl(null);
    setProjectStatus("No saved project");
    applyTraceModePresentation("paint");
    setAdvancedOpen(false);
    setEditorOpen(false);
    setBrushSize("normal");
    setSelectedPaintColorIds([]);
    setPaintReviewFilter("all");
    setColorDetailsOpen(false);
    setShoppingListStatus("");
    resetEditorPresentation();
    setError(null);
    strokeIdRef.current = 0;
  }

  function navigateToWorkflowStep(step: WorkflowStep) {
    const transition = applyProjectSessionAction({ type: "navigate-workflow", target: step });
    if (transition.outcome.status === "rejected" || transition.session.project.workflowProgress.activeStep !== step) return;
    const targetElement = step === "upload"
      ? setupSectionRef.current
      : step === "clean"
        ? traceEditorSectionRef.current
        : step === "colors"
          ? paintReviewSectionRef.current
          : exportSectionRef.current;

    targetElement?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function downloadProjectFile() {
    if (!canSaveProject) return;
    applyProjectSessionAction({ type: "request-explicit-save" });
  }

  async function openProjectFile(file: File | null) {
    if (!file) return;
    await restoreProject(() => file.text(), "Project opened", true);
  }

  async function restoreProjectFromText(text: string, status: ProjectStatus, requestAutosave: boolean) {
    await restoreProject(() => Promise.resolve(text), status, requestAutosave);
  }

  async function restoreProject(
    readProject: () => Promise<string>,
    status: ProjectStatus,
    requestAutosave: boolean
  ) {
    const preparing = applyProjectSessionAction({ type: "begin-project-preparation", operation: "restore-project" });
    if (preparing.outcome.status !== "preparing") return;
    const token = preparing.outcome.token;
    try {
      const project = restoreCutoutProject(await readProject());
      const restoredFile = await fileFromDataUrl(project.sourceImage.dataUrl, project.sourceImage.name, project.sourceImage.type);
      const completed = applyProjectSessionAction({
        type: "complete-project-restore",
        token,
        project: appProjectFromCutoutProject(project),
        requestAutosave
      });
      if (completed.outcome.status !== "successful") return;
      installRestoredProjectRuntime(project, restoredFile, status);
    } catch (restoreError) {
      const message = restoreError instanceof Error ? restoreError.message : "Unable to open that project file.";
      const failed = applyProjectSessionAction({ type: "fail-project-preparation", token, error: message });
      if (failed.outcome.status === "stale") return;
      setProjectStatus("Project import failed");
      setError("Unable to open that project file.");
    }
  }

  function installRestoredProjectRuntime(project: CutoutProject, restoredFile: File, status: ProjectStatus) {
    resetAiProposalPresentation();
    setColorDetailsOpen(false);
    setImage(restoredFile);
    setSvgSourceInkDataUrl(null);
    setSvgImportedDetailDataUrl(project.editedDetailPngDataUrl);
    setSvgLineworkDetected(false);
    setSourceImageDataUrl(project.sourceImage.dataUrl);
    setAutoStarterOpen(project.traceMode !== "manual");
    setEditorTool(defaultEditorToolForTraceMode(project.traceMode));
    setSelectedPaintColorIds([]);
    setPaintReviewFilter("all");
    setShoppingListStatus("");
    setEditorOpen(opensEditorWithReference(project.traceMode) || project.manualStrokes.length > 0);
    setPrintPreview(false);
    pendingContentFitRef.current = isDefaultTraceViewport(project.traceViewport);
    viewportUserModifiedRef.current = !isDefaultTraceViewport(project.traceViewport);
    setSelectedStrokeId(null);
    setDimUnselectedStrokes(false);
    setSelectionFeedback("");
    setFeatureLineHistory(createEditorTransactionHistory());
    setDetailLineHistory(createEditorTransactionHistory());
    setError(null);
    setProjectStatus(status);
    strokeIdRef.current = highestStrokeNumber(project.manualStrokes);
  }

  function updateSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
    if (key === "finishedHeightIn") {
      applyProjectSessionAction({
        type: "change-finished-size",
        finishedHeightIn: value as Settings["finishedHeightIn"]
      });
      return;
    }
    const next = { ...settings, [key]: value };
    updateProjectSettings(next);
  }

  function applyProjectSessionAction(action: ProjectSessionAction<AppProjectSessionProject>) {
    const transition = transitionProjectSession(projectSessionRef.current, action);
    projectSessionRef.current = transition.session;
    setProjectSessionState((current) => ({
      session: transition.session,
      pendingEffects: [...current.pendingEffects, ...transition.effects]
    }));
    return transition;
  }

  function closeFileMenu() {
    if (fileMenuRef.current) fileMenuRef.current.open = false;
  }

  function selectAddMissingLine() {
    setBrushSize("normal");
    setEditorTool("draw");
  }

  function acceptCleanLines() {
    const transition = applyProjectSessionAction({ type: "complete-linework-review" });
    if (transition.outcome.status === "rejected") setError(transition.outcome.error.message);
    else setError(null);
  }

  function finishColorReview(outcome: "reviewed" | "skipped") {
    const transition = applyProjectSessionAction({ type: "complete-color-review", outcome });
    if (transition.outcome.status === "rejected") setError(transition.outcome.error.message);
    else setError(null);
  }

  function setExportColorGuide(included: boolean) {
    const transition = applyProjectSessionAction({ type: "set-color-guide-included", included });
    if (transition.outcome.status === "rejected") setError(transition.outcome.error.message);
    else setError(null);
  }

  function resetTracingSettings() {
    const nextMode = traceMode === "manual" ? "manual" : "paint";
    updateProjectSettings({
      ...traceModeSettings(nextMode, settings),
      threshold: defaultSettings.threshold,
      smoothing: defaultSettings.smoothing,
      speckArea: defaultSettings.speckArea,
      holeArea: defaultSettings.holeArea,
      detailLines: nextMode === "manual" ? false : defaultSettings.detailLines,
      detailCleanup: nextMode === "manual" ? 100 : defaultSettings.detailCleanup,
      templateStyle: nextMode
    });
    applyTraceModePresentation(nextMode);
    setAdvancedOpen(false);
    setProjectStatus(image ? "Unsaved changes" : "No saved project");
  }

  function applyTraceMode(mode: TraceMode) {
    applyTraceModePresentation(mode);
    const next = traceModeSettings(mode, settings);
    updateProjectSettings(next);
  }

  async function applyDetailPreset(preset: DetailPreset) {
    const next = detailPresetSettings(preset, settings);
    if (analysis && (editedDetailDataUrl !== null || detailLineHistory.undo.length > 0)) {
      const shouldReplace = window.confirm("Change detail strength? This will replace your edited starter-line cleanup with a newly generated layer.");
      if (!shouldReplace) return;
    }
    if (!analysis || !image) {
      applyTraceModePresentation(next.templateStyle);
      updateProjectSettings(next);
      setProjectStatus(sourceCandidate || image ? "Unsaved changes" : "No saved project");
      return;
    }
    await generateTemplate(undefined, next);
  }

  function switchToBlankTraceStudio() {
    applyTraceModePresentation("manual");
    const switched = applyProjectSessionAction({
      type: "switch-to-blank-trace-studio"
    });
    const featureTransaction = switched.editorTransaction;
    if (featureTransaction) {
      setFeatureLineHistory((current) => recordEditorTransaction(current, {
        before: featureTransaction.before.manualStrokes as TraceStroke[],
        after: featureTransaction.after.manualStrokes as TraceStroke[]
      }));
    }
    setSelectedStrokeId(null);
    setSelectionFeedback("Switched to blank Trace Studio");
    setEditorOpen(true);
    setPrintPreview(false);
    pendingContentFitRef.current = true;
  }

  function updateInteriorDetail(value: number) {
    applyProjectSessionAction({
      type: "invalidate-analysis-for-detail-settings",
      detailCleanup: value
    });
  }

  function applyTraceModePresentation(mode: TraceMode) {
    setAutoStarterOpen(mode !== "manual");
    setEditorTool(defaultEditorToolForTraceMode(mode));
  }

  function updatePaintGuideEntry(id: string, patch: Partial<Omit<ProjectPaintColor, "id" | "source">>) {
    const current = projectPalette.find((entry) => entry.id === id);
    if (!current) return null;
    const transition = applyProjectSessionAction({
      type: "update-project-paint-color",
      id,
      patch
    });
    setShoppingListStatus("");
    return transition;
  }

  function setPaintHexDraft(id: string, value: string) {
    setPaintHexDrafts((current) => current[id] === value ? current : { ...current, [id]: value });
    setShoppingListStatus("");
  }

  function clearPaintHexDraft(id: string) {
    setPaintHexDrafts((current) => {
      if (!(id in current)) return current;
      const { [id]: _removed, ...rest } = current;
      return rest;
    });
  }

  async function commitPaintHexDraft(id: string, draftValue: string) {
    const current = projectSessionRef.current.project.projectPalette?.find((entry) => entry.id === id);
    if (!current) {
      clearPaintHexDraft(id);
      return;
    }
    const normalizedHex = normalizePaintHexDraft(draftValue);
    if (!isValidSessionPaintHex(draftValue)) {
      clearPaintHexDraft(id);
      setShoppingListStatus("Enter a valid 3- or 6-digit hex color.");
      return;
    }
    if (normalizedHex === current.hex) {
      clearPaintHexDraft(id);
      return;
    }
    const transition = updatePaintGuideEntry(id, { hex: normalizedHex });
    if (transition?.outcome.status === "applied" || transition?.outcome.status === "unchanged") {
      clearPaintHexDraft(id);
      await refreshPaintMatchesForColor(id);
      return;
    }
    clearPaintHexDraft(id);
    setShoppingListStatus("Enter a valid 3- or 6-digit hex color.");
  }

  async function addManualPaintColor() {
    if (!isValidHexColor(newPaintHex)) {
      setShoppingListStatus("Enter a valid hex color");
      return;
    }
    const added = applyProjectSessionAction({
      type: "add-project-paint-color",
      hex: newPaintHex,
      label: newPaintLabel
    });
    if (added.outcome.status !== "applied") return;
    const createdPaintColorId = added.outcome.createdPaintColorId;
    if (!createdPaintColorId) {
      setShoppingListStatus("Unable to add color");
      return;
    }
    setNewPaintLabel("");
    await refreshPaintMatchesForColor(createdPaintColorId, {
      successStatus: "Color added",
      failureStatus: "Color added. Unable to refresh paint matches. Existing choices were kept."
    });
  }

  function removePaintColor(id: string) {
    applyProjectSessionAction({ type: "remove-project-paint-color", id });
    setSelectedPaintColorIds((ids) => ids.filter((item) => item !== id));
    setShoppingListStatus("");
  }

  function mergeSelectedPaintColors() {
    applyProjectSessionAction({ type: "merge-project-paint-colors", ids: selectedPaintColorIds });
    setSelectedPaintColorIds([]);
    setShoppingListStatus("Colors merged");
  }

  function mergeProjectPaintColorsBySwatches(swatchNumbers: number[]) {
    const ids = paintGuideEntries
      .filter((entry) => swatchNumbers.includes(entry.index))
      .map((entry) => entry.id);
    applyProjectSessionAction({ type: "merge-project-paint-colors", ids });
    setSelectedPaintColorIds([]);
    setShoppingListStatus("Colors merged");
  }

  function resetProjectPaletteFromDetected() {
    applyProjectSessionAction({ type: "reset-project-palette-from-analysis" });
    setSelectedPaintColorIds([]);
    setShoppingListStatus("Palette reset to detected colors");
  }

  function togglePaintMergeSelection(id: string) {
    setSelectedPaintColorIds((ids) => ids.includes(id) ? ids.filter((item) => item !== id) : [...ids, id]);
  }

  async function refreshPaintMatchesForColor(
    id: string,
    options?: {
      successStatus?: string;
      failureStatus?: string;
    }
  ) {
    const request = applyProjectSessionAction({ type: "begin-project-paint-match", id });
    if (request.outcome.status !== "requesting-paint-match") return;
    try {
      const matches = await requestPaintMatches(request.outcome.token.expectedHex);
      const completed = applyProjectSessionAction({
        type: "complete-project-paint-match",
        token: request.outcome.token,
        matches
      });
      if (completed.outcome.status === "stale") return;
      if (completed.outcome.status === "applied" || completed.outcome.status === "successful") {
        if (typeof options?.successStatus === "string") setShoppingListStatus(options.successStatus);
      }
    } catch {
      const failed = applyProjectSessionAction({
        type: "fail-project-paint-match",
        token: request.outcome.token,
        error: "Unable to refresh paint matches."
      });
      if (failed.outcome.status === "stale") return;
      setShoppingListStatus(options?.failureStatus ?? "Unable to refresh paint matches. Existing choices were kept.");
    }
  }

  async function requestPaintMatches(hex: string) {
    if (!isValidHexColor(hex)) throw new Error("Invalid hex color");
    const response = await fetch("/api/match-color", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ hex })
    });
    if (!response.ok) throw new Error("Unable to refresh paint matches.");
    let body: unknown;
    try {
      body = await response.json();
    } catch {
      throw new Error("Unable to refresh paint matches.");
    }
    if (!body || typeof body !== "object") {
      throw new Error("Unable to refresh paint matches.");
    }
    const validated = validateCraftPaintMatches((body as { matches?: unknown }).matches);
    if (!validated.ok) throw new Error(validated.message);
    return validated.matches;
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
    clearRemovalPreview();
    const canvas = detailCanvasRef.current;
    if (!canvas) return;
    const loadId = ++detailCanvasLoadIdRef.current;
    setDetailLineBoundsResolved(false);
    const image = new Image();
    image.onload = () => {
      if (loadId !== detailCanvasLoadIdRef.current) return;
      clearRemovalPreview();
      canvas.width = image.naturalWidth;
      canvas.height = image.naturalHeight;
      const context = canvas.getContext("2d");
      if (!context) return;
      context.clearRect(0, 0, canvas.width, canvas.height);
      context.drawImage(image, 0, 0);
      const bounds = canvasContentBounds(canvas);
      setEditableDetailLinesPresent(bounds !== null);
      setDetailLineBounds(bounds);
      setDetailLineBoundsResolved(true);
    };
    image.onerror = () => {
      if (loadId !== detailCanvasLoadIdRef.current) return;
      setDetailLineBounds(null);
      setDetailLineBoundsResolved(true);
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

  function applyEditorTransactionArtifacts(
    editedDetailPngDataUrl: string | null,
    nextManualStrokes: TraceStroke[]
  ) {
    return applyProjectSessionAction({
      type: "commit-editor-transaction",
      outcome: { editedDetailPngDataUrl, manualStrokes: nextManualStrokes }
    });
  }

  function commitDetailLineTransaction(before: string, after: string) {
    if (before === after) return false;
    setDetailLineHistory((current) => recordEditorTransaction(current, { before, after }));
    applyEditorTransactionArtifacts(after, projectSessionRef.current.project.manualStrokes);
    return true;
  }

  function commitFeatureLineTransaction(before: TraceStroke[], after: TraceStroke[]) {
    if (before.length === after.length && before.every((stroke, index) => stroke === after[index])) return false;
    setFeatureLineHistory((current) => recordEditorTransaction(current, { before, after }));
    applyEditorTransactionArtifacts(projectSessionRef.current.project.editedDetailPngDataUrl, after);
    return true;
  }

  function setDetailExtractionMode(mode: DetailExtractionMode) {
    const next = { ...settings, detailExtractionMode: mode };
    void generateTemplate(undefined, next);
  }

  function undoDetailEdit() {
    if (traceStudioOpen) {
      const replay = undoEditorTransaction(featureLineHistory);
      if (!replay.changed) return;
      setFeatureLineHistory(replay.history);
      applyEditorTransactionArtifacts(editedDetailDataUrl, replay.artifact);
      setSelectedStrokeId(null);
      setSelectionFeedback("Undid stroke edit");
      return;
    }
    const replay = undoEditorTransaction(detailLineHistory);
    if (!replay.changed) return;
    setDetailLineHistory(replay.history);
    applyEditorTransactionArtifacts(replay.artifact, manualStrokes);
    loadDetailCanvas(replay.artifact);
  }

  function redoDetailEdit() {
    if (traceStudioOpen) {
      const replay = redoEditorTransaction(featureLineHistory);
      if (!replay.changed) return;
      setFeatureLineHistory(replay.history);
      applyEditorTransactionArtifacts(editedDetailDataUrl, replay.artifact);
      setSelectedStrokeId(null);
      setSelectionFeedback("Redid stroke edit");
      return;
    }
    const replay = redoEditorTransaction(detailLineHistory);
    if (!replay.changed) return;
    setDetailLineHistory(replay.history);
    applyEditorTransactionArtifacts(replay.artifact, manualStrokes);
    loadDetailCanvas(replay.artifact);
  }

  function resetDetailLayer() {
    if (!analysis) return;
    if (traceStudioOpen) {
      if (!commitFeatureLineTransaction(manualStrokes, [])) return;
      setSelectedStrokeId(null);
      setSelectionFeedback("Cleared manual strokes");
      return;
    }
    const before = currentDetailDataUrl();
    const restoredDetail = svgImportedDetailDataUrl ?? analysis.detailLinePngDataUrl;
    if (before) commitDetailLineTransaction(before, restoredDetail);
    loadDetailCanvas(restoredDetail);
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
    rasterTransactionBeforeRef.current = currentDetailDataUrl();
    drawingRef.current = true;
    lastPointRef.current = point;
    smoothAnchorRef.current = point;
    drawStrokeSegment(point, point);
  }

  function continueStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (editorTool === "remove" && !drawingRef.current && !traceStudioOpen) {
      previewDetailLineAt(canvasPoint(event));
      return;
    }
    const drag = strokeDragRef.current;
    if (traceStudioOpen && drag) {
      const point = canvasPoint(event);
      const result = drag.mode === "move"
        ? moveTraceStroke(drag.originalStrokes, drag.strokeId, { x: point.x - drag.startPoint.x, y: point.y - drag.startPoint.y })
        : updateTraceStrokePoint(drag.originalStrokes, drag.strokeId, drag.pointIndex ?? -1, point);
      if (result.changed) {
        strokeDragRef.current = { ...drag, moved: true, previewStrokes: result.strokes };
        renderManualTraceLayer(result.strokes);
      }
      return;
    }
    if (traceStudioOpen && panningRef.current) {
      const previous = panStartRef.current;
      if (!previous) return;
      const current = { x: event.clientX, y: event.clientY };
      viewportUserModifiedRef.current = true;
      pendingContentFitRef.current = false;
      updateTraceViewport(panViewport(projectSessionRef.current.project.traceViewport, {
        x: current.x - previous.x,
        y: current.y - previous.y
      }));
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
        if (drag.moved && drag.previewStrokes) {
          commitFeatureLineTransaction(drag.originalStrokes, drag.previewStrokes);
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
          commitFeatureLineTransaction(manualStrokes, [...manualStrokes, draft]);
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
      const after = event.currentTarget.toDataURL("image/png");
      const before = rasterTransactionBeforeRef.current;
      if (before) commitDetailLineTransaction(before, after);
      const bounds = canvasContentBounds(event.currentTarget);
      setEditableDetailLinesPresent(bounds !== null);
      setDetailLineBounds(bounds);
    }
    drawingRef.current = false;
    lastPointRef.current = null;
    smoothAnchorRef.current = null;
    rasterTransactionBeforeRef.current = null;
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
    const preview = previewDetailSegment(imageData.data, canvas.width, canvas.height, point);
    if (!preview) {
      clearRemovalPreview();
      return;
    }
    const result = removeDetailSegmentPreview(imageData.data, canvas.width, preview);
    if (!result.changed) return;
    const before = canvas.toDataURL("image/png");
    context.putImageData(imageData, 0, 0);
    commitDetailLineTransaction(before, canvas.toDataURL("image/png"));
    const bounds = canvasContentBounds(canvas);
    setEditableDetailLinesPresent(bounds !== null);
    setDetailLineBounds(bounds);
    clearRemovalPreview();
  }

  function previewDetailLineAt(point: TracePoint) {
    const canvas = detailCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const preview = previewDetailSegment(imageData.data, canvas.width, canvas.height, point);
    renderRemovalPreview(preview, canvas.width, canvas.height);
  }

  function previewFirstDetailLine() {
    const canvas = detailCanvasRef.current;
    if (!canvas) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const preview = previewFirstDetailSegment(imageData.data, canvas.width, canvas.height);
    renderRemovalPreview(preview, canvas.width, canvas.height);
  }

  function renderRemovalPreview(preview: DetailSegmentPreview | null, width: number, height: number) {
    const previewCanvas = removalPreviewCanvasRef.current;
    if (!previewCanvas) return;
    const previewContext = previewCanvas.getContext("2d");
    if (!previewContext) return;
    removalPreviewRef.current = preview;
    setRemovalPreviewCount(preview?.pixels.length ?? 0);
    previewCanvas.width = width;
    previewCanvas.height = height;
    previewContext.clearRect(0, 0, previewCanvas.width, previewCanvas.height);
    if (!preview) return;
    const overlay = previewContext.createImageData(previewCanvas.width, previewCanvas.height);
    for (const pixel of preview.pixels) {
      const index = (pixel.y * previewCanvas.width + pixel.x) * 4;
      overlay.data[index] = 220;
      overlay.data[index + 1] = 62;
      overlay.data[index + 2] = 42;
      overlay.data[index + 3] = 230;
    }
    previewContext.putImageData(overlay, 0, 0);
  }

  function removePreviewedDetailLine() {
    const canvas = detailCanvasRef.current;
    const preview = removalPreviewRef.current;
    if (!canvas || !preview) return;
    const context = canvas.getContext("2d");
    if (!context) return;
    const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
    const result = removeDetailSegmentPreview(imageData.data, canvas.width, preview);
    if (!result.changed) return;
    const before = canvas.toDataURL("image/png");
    context.putImageData(imageData, 0, 0);
    commitDetailLineTransaction(before, canvas.toDataURL("image/png"));
    const bounds = canvasContentBounds(canvas);
    setEditableDetailLinesPresent(bounds !== null);
    setDetailLineBounds(bounds);
    clearRemovalPreview();
  }

  function clearRemovalPreview() {
    removalPreviewRef.current = null;
    setRemovalPreviewCount(0);
    const canvas = removalPreviewCanvasRef.current;
    canvas?.getContext("2d")?.clearRect(0, 0, canvas.width, canvas.height);
  }

  function renderManualTraceLayer(strokes: TraceStroke[], draftStroke?: TraceStroke, showSelection = !printPreview) {
    clearRemovalPreview();
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
    commitFeatureLineTransaction(manualStrokes, result.strokes);
    setSelectedStrokeId(null);
    setSelectionFeedback(result.removedStrokeIds.length === 1 ? "Deleted stroke" : `Deleted ${result.removedStrokeIds.length} strokes`);
  }

  function nextStrokeId() {
    strokeIdRef.current += 1;
    return `stroke-${strokeIdRef.current}`;
  }

  function commitManualStrokeEdit(result: StrokeEditResult, nextSelectedStrokeId = selectedStrokeId) {
    if (!result.changed) return;
    commitFeatureLineTransaction(manualStrokes, result.strokes);
    setSelectedStrokeId(result.selectedStrokeId ?? nextSelectedStrokeId ?? null);
  }

  function deleteSelectedStroke() {
    if (!selectedStrokeId) return;
    const result = deleteTraceStroke(manualStrokes, selectedStrokeId);
    if (!result.changed) return;
    commitFeatureLineTransaction(manualStrokes, result.strokes);
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
    viewportUserModifiedRef.current = true;
    pendingContentFitRef.current = false;
    const viewport = editorViewportRef.current;
    const focus = viewport
      ? { x: viewport.clientWidth / 2, y: viewport.clientHeight / 2 }
      : { x: 0, y: 0 };
    const viewportSize = viewport
      ? { width: viewport.clientWidth, height: viewport.clientHeight }
      : { width: 1, height: 1 };
    updateTraceViewport(zoomViewport(projectSessionRef.current.project.traceViewport, nextZoom, focus, viewportSize));
  }

  function resetZoom() {
    viewportUserModifiedRef.current = false;
    pendingContentFitRef.current = false;
    if (!fitTraceViewportToContent()) {
      updateTraceViewport(DEFAULT_TRACE_VIEWPORT);
    }
  }

  function hundredPercentZoom() {
    viewportUserModifiedRef.current = true;
    pendingContentFitRef.current = false;
    const viewport = editorViewportRef.current;
    if (!viewport || !analysis) {
      updateTraceViewport({ zoom: 1, panX: 0, panY: 0 });
      return;
    }
    const fitted = fittedTraceSize(
      { width: analysis.previewWidthPx, height: analysis.previewHeightPx },
      { width: viewport.clientWidth, height: viewport.clientHeight }
    );
    updateTraceViewport(centerBoundsInViewport(
      traceContentBounds(),
      { width: analysis.previewWidthPx, height: analysis.previewHeightPx },
      { width: viewport.clientWidth, height: viewport.clientHeight },
      analysis.previewWidthPx / fitted.width
    ));
  }

  function fitTraceViewportToContent() {
    const viewport = editorViewportRef.current;
    if (!viewport || !analysis) return false;
    updateTraceViewport(fitBoundsToViewport(
      traceContentBounds(),
      { width: analysis.previewWidthPx, height: analysis.previewHeightPx },
      { width: viewport.clientWidth, height: viewport.clientHeight },
      { paddingPx: 32, targetFill: 0.8 }
    ));
    return true;
  }

  function traceContentBounds() {
    return traceContentBoundsRef.current ?? fullCanvasBounds({
      width: analysis?.previewWidthPx ?? 1,
      height: analysis?.previewHeightPx ?? 1
    });
  }

  traceContentBoundsRef.current = analysis
    ? mergeTraceBounds([cutlineBounds, detailLineBounds, boundsFromTraceStrokes(manualStrokes)])
      ?? fullCanvasBounds({ width: analysis.previewWidthPx, height: analysis.previewHeightPx })
    : null;

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="topbar-brand">
          <div>
            <h1>Cutout Studio</h1>
            <p>Personal wood cutout template generator</p>
          </div>
          <details className="file-menu" aria-label="File menu" ref={fileMenuRef}>
            <summary>
              <FolderOpen size={16} />
              File
            </summary>
            <div className="file-menu-popover">
              <button type="button" onClick={() => {
                closeFileMenu();
                startNewProject();
              }}>
                <FileImage size={15} />
                New Project
              </button>
              <button type="button" onClick={() => {
                closeFileMenu();
                projectFileInputRef.current?.click();
              }}>
                <FolderOpen size={15} />
                Open Project
              </button>
              <button type="button" onClick={() => {
                closeFileMenu();
                downloadProjectFile();
              }} disabled={!canSaveProject}>
                <Save size={15} />
                Save Project
              </button>
              <span>{projectStatus}</span>
            </div>
          </details>
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
      </header>

      <section className={uploadStepActive ? "workspace upload-workspace" : cleanStepActive ? "workspace clean-lines-workspace" : colorsStepActive ? "workspace colors-workspace" : exportStepActive ? "workspace export-workspace-shell" : "workspace"}>
        {uploadStepActive ? (
        <aside className="left-panel" aria-label="Template settings">
          <PanelTitle icon={<FileImage size={18} />} title="Upload" />
          <GuidedWorkflowCard steps={guidedWorkflowSteps} onNavigate={navigateToWorkflowStep} />
            <section className="upload-step" aria-label="Upload step" ref={setupSectionRef}>
              <label className="upload-box">
                <FileImage size={28} />
                <span>{sourceCandidate?.file.name ?? image?.name ?? "Choose a complete PNG, JPG, or SVG"}</span>
                <input
                  aria-label="Source image"
                  type="file"
                  accept="image/png,image/jpeg,image/svg+xml"
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    void handleImageUpload(file);
                  }}
                />
              </label>
              {(sourceCandidate?.lineworkDetected ?? svgLineworkDetected) ? <p className="helper-note">SVG linework detected. Its authored dark ink will open as editable starter lines.</p> : null}
              <p className="helper-note">Choose one complete character on a simple background.</p>
              {error ? <div className="error-box">{error}</div> : null}
              <NumberField
                label="Finished height"
                suffix="in"
                min={6}
                max={96}
                step={1}
                value={settings.finishedHeightIn}
                onChange={(value) => updateSetting("finishedHeightIn", value)}
              />
              <label className="project-name-field">
                <span>Project name <small>optional</small></span>
                <input
                  aria-label="Project name (optional)"
                  type="text"
                  value={projectNameDraft}
                  onChange={(event) => setProjectNameDraft(event.target.value)}
                  onBlur={() => {
                    const normalizedName = projectNameDraft.trim() || "Cutout Project";
                    setProjectNameDraft(normalizedName);
                    applyProjectSessionAction({ type: "rename-project", projectName: normalizedName });
                  }}
                />
              </label>
              <button className="primary-action upload-primary-action" onClick={() => void generateTemplate("balanced")} disabled={!canAnalyze}>
                <RefreshCw size={17} />
                {busy ? "Generating Template..." : "Generate Template"}
              </button>
            </section>
        </aside>
        ) : (
        <>
        {!cleanStepActive && !colorsStepActive && !exportStepActive ? <aside className="left-panel" aria-label="Template settings">
          <PanelTitle icon={<SlidersHorizontal size={18} />} title="Template Setup" />
          <GuidedWorkflowCard steps={guidedWorkflowSteps} onNavigate={navigateToWorkflowStep} />
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
                <strong>Wood Template - Recommended</strong>
                <small>Generate editable starter details first, then delete bad lines and add only missing important features.</small>
              </button>
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

          <label className="toggle-row">
            <input
              type="checkbox"
              checked={settings.includeInstructionCoverPage}
              onChange={() => updateProjectSettings({
                ...settings,
                includeInstructionCoverPage: !settings.includeInstructionCoverPage
              })}
            />
            Include instruction cover page
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
            <button className="secondary-action" onClick={() => void generateTemplate()} disabled={!canAnalyze}>
              <RefreshCw size={17} />
              {primaryTraceActionLabel}
            </button>
          </div>
        </aside> : null}

        {!colorsStepActive && !exportStepActive ? <section className="preview-stage" aria-label={cleanStepActive ? "Clean Lines workspace" : "Trace preview"}>
          {cleanStepActive ? (
            <div className="clean-workflow-nav">
              <GuidedWorkflowCard steps={guidedWorkflowSteps} onNavigate={navigateToWorkflowStep} />
            </div>
          ) : null}
          {analysis ? (
            <div className="page-preview">
              <div className="preview-strip">
                <span>{editorOpen ? `${traceModeLabel(traceMode)} Editor` : "Trace preview"}</span>
                <span>{analysis.tileCols} x {analysis.tileRows} pages</span>
              </div>
              {editorOpen ? (
                <div className="editor-wrap" ref={traceEditorSectionRef}>
                  {cleanStepActive ? (
                    <>
                      <CleanLinesPrimaryControls
                        editorTool={editorTool}
                        brushSize={brushSize}
                        undoDisabled={undoDisabled}
                        showReference={showReference}
                        canAccept={projectCapabilities.guidedWorkflow.canCompleteLineworkReview}
                        removalPreviewCount={removalPreviewCount}
                        onRemove={() => setEditorTool("remove")}
                        onAdd={selectAddMissingLine}
                        onUndo={undoDetailEdit}
                        onToggleOriginal={() => setShowReference(!showReference)}
                        onFit={resetZoom}
                        onAccept={acceptCleanLines}
                      />
                      <CleanLinesStatus
                        analysis={analysis}
                        reviewed={workflowProgress.lineworkReviewed}
                        review={traceQualityReview}
                      />
                      {showAiProposal ? (
                        <AiProposalCard
                          phase={aiProposalState.status}
                          proposal={aiProposal}
                          review={aiProposalReview}
                          reviewView={aiProposalReviewView}
                          inputReadiness={inputReadiness}
                          previewWidthPx={analysis.previewWidthPx}
                          previewHeightPx={analysis.previewHeightPx}
                          originalPreviewPngDataUrl={analysis.paintGuidePngDataUrl}
                          outerLinePngDataUrl={analysis.outerLinePngDataUrl}
                          error={aiProposalError}
                          canBegin={projectCapabilities.aiProposal.canBeginRequest}
                          canConfirm={projectCapabilities.aiProposal.canConfirmRequest}
                          canAccept={projectCapabilities.aiProposal.canAccept}
                          canReject={projectCapabilities.aiProposal.canReject}
                          onBegin={beginAiLineworkRequest}
                          onCancel={cancelAiLineworkRequest}
                          onConfirm={() => void requestAiLineworkProposal()}
                          onReviewView={selectAiProposalReviewView}
                          onAccept={acceptAiLineworkProposal}
                          onReject={rejectAiLineworkProposal}
                        />
                      ) : null}
                    </>
                  ) : null}
                  <details className={cleanStepActive ? "clean-more-tools" : "clean-more-tools always-open"} aria-label="More Tools" open={cleanStepActive ? undefined : true}>
                    <summary>{cleanStepActive ? "More Tools" : "Editor tools"}</summary>
                    <div className="clean-more-tools-content">
                  {cleanStepActive ? (
                    <div className="choice-group clean-preset-tools" aria-label="Trace style">
                      <span className="choice-label">Detail modes</span>
                      <div className="detail-preset-group" aria-label="Detail strength">
                        {(["simple", "balanced", "detailed"] as DetailPreset[]).map((preset) => (
                          <button key={preset} className={selectedDetailPreset === preset ? "choice selected" : "choice"} onClick={() => applyDetailPreset(preset)}>
                            <strong>{detailPresetLabel(preset)}</strong>
                            <small>{detailPresetHelp(preset)}</small>
                          </button>
                        ))}
                      </div>
                      <div className="auto-starter-options">
                        <button className={traceMode === "manual" ? "choice selected" : "choice"} onClick={() => applyTraceMode("manual")}>
                          <strong>{traceModeLabel("manual")}</strong>
                        </button>
                        <button className={traceMode === "outline" ? "choice selected" : "choice"} onClick={() => applyTraceMode("outline")}>
                          <strong>{traceModeLabel("outline")}</strong>
                        </button>
                      </div>
                      <div className="choice-group" aria-label="Image type">
                        <span className="choice-label">Image type</span>
                        <div className="auto-starter-options">
                          {([
                            ["auto", "Auto"],
                            ["lineArt", "Existing line art"],
                            ["rendered", "Rendered image"]
                          ] as [DetailExtractionMode, string][]).map(([mode, label]) => (
                            <button
                              key={mode}
                              className={settings.detailExtractionMode === mode ? "choice selected" : "choice"}
                              onClick={() => setDetailExtractionMode(mode)}
                            >
                              <strong>{label}</strong>
                            </button>
                          ))}
                        </div>
                      </div>
                      <button className="advanced-toggle" onClick={() => setAdvancedOpen((open) => !open)}>
                        {advancedOpen ? "Hide fine-tune starter settings" : "Fine-tune starter settings"}
                      </button>
                      {advancedOpen ? (
                        <div className="advanced-panel">
                          <RangeField label="Line smoothness" min={0} max={8} value={settings.smoothing} onChange={(value) => updateSetting("smoothing", value)} />
                          <RangeField label="Cleanup strength" min={traceMode === "marker" ? 85 : traceMode === "paint" ? 76 : 0} max={100} value={settings.detailCleanup} onChange={updateInteriorDetail} lowLabel="More lines" highLabel="Cleaner" />
                          <RangeField label="Background sensitivity" min={0} max={180} value={settings.threshold} onChange={(value) => updateSetting("threshold", value)} />
                          <RangeField label="Remove tiny marks" min={0} max={600} value={settings.speckArea} onChange={(value) => updateSetting("speckArea", value)} />
                          <RangeField label="Close small gaps" min={0} max={1500} value={settings.holeArea} onChange={(value) => updateSetting("holeArea", value)} />
                          <button className="tool-button" onClick={resetTracingSettings}>
                            <RotateCcw size={15} /> Reset tracing settings
                          </button>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
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
                      <input type="checkbox" checked={showReference} onChange={() => setShowReference(!showReference)} />
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
                          onChange={(event) => updateReferenceOpacity(Number(event.target.value))}
                        />
                      </label>
                    ) : null}
                    <label>
                      <input type="checkbox" checked={showCutline} onChange={() => setShowCutline(!showCutline)} />
                      Cutline
                    </label>
                    <label>
                      <input type="checkbox" checked={showManualLines} onChange={() => setShowManualLines(!showManualLines)} />
                      {traceStudioOpen ? "Manual lines" : "Editable starter lines"}
                    </label>
                    {traceStudioOpen ? (
                      <label>
                        <input type="checkbox" checked={showSuggestions} onChange={() => setShowSuggestions(!showSuggestions)} />
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
                    </div>
                  </details>
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
                        onPointerLeave={clearRemovalPreview}
                        onFocus={() => {
                          if (editorTool === "remove" && !removalPreviewRef.current) previewFirstDetailLine();
                        }}
                        onKeyDown={(event) => {
                          if (editorTool !== "remove" || (event.key !== "Enter" && event.key !== "Delete")) return;
                          event.preventDefault();
                          removePreviewedDetailLine();
                        }}
                        tabIndex={editorTool === "remove" ? 0 : -1}
                        aria-describedby="connected-line-preview-status"
                        aria-label="Editable interior detail lines"
                      />
                      <canvas
                        ref={removalPreviewCanvasRef}
                        className="removal-preview-layer"
                        width={analysis.previewWidthPx}
                        height={analysis.previewHeightPx}
                        aria-hidden="true"
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
        </section> : null}

        {colorsStepActive ? <aside className="right-panel colors-panel" aria-label="Colors workspace">
          {colorsStepActive ? (
            <div className="colors-workflow-nav">
              <GuidedWorkflowCard steps={guidedWorkflowSteps} onNavigate={navigateToWorkflowStep} />
            </div>
          ) : null}
          {analysis ? (
            <>
              {!colorsStepActive && traceQualityReview ? (
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
              {workflowProgress.activeStep === "colors" ? (
                <div className="colors-step-actions" aria-label="Colors step actions">
                  <button className="primary-action" onClick={() => finishColorReview("reviewed")} disabled={!projectCapabilities.guidedWorkflow.canCompleteColorReview}>Continue to Export</button>
                  <button className="tool-button" onClick={() => finishColorReview("skipped")} disabled={!projectCapabilities.guidedWorkflow.canCompleteColorReview}>Skip Paint Guide</button>
                </div>
              ) : null}
              {colorsStepActive ? (
                <section className="colors-step-header">
                  <div>
                    <h2>Review Colors</h2>
                    <p>{paintGuideColorCountLabel} in this project</p>
                  </div>
                  <ColorPrimaryRows entries={paintGuideEntries} onUpdate={updatePaintGuideEntry} />
                </section>
              ) : null}
              <details
                className="paint-guide-disclosure"
                aria-label="Paint Guide"
                open
                ref={paintReviewSectionRef}
              >
                <summary className="paint-guide-disclosure-summary">
                  <span className="paint-guide-disclosure-heading">
                    <SwatchBook size={18} />
                    <span className="paint-guide-disclosure-copy">
                      <strong>Paint Guide</strong>
                      <span>{paintGuideColorCountLabel}</span>
                    </span>
                  </span>
                  <span className="paint-guide-disclosure-state">Open</span>
                </summary>
                <details className="edit-color-details" aria-label="Edit Color Details" open={colorDetailsOpen} onToggle={(event) => setColorDetailsOpen(event.currentTarget.open)}>
                  <summary>Edit Color Details</summary>
                <div className="paint-guide-disclosure-content">
                  <RangeField label="Paint colors" min={2} max={10} value={settings.paletteSize} onChange={(value) => updateProjectSettings({ ...settings, paletteSize: value })} />
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
                                  onChange={(event) => {
                                    const transition = updatePaintGuideEntry(entry.id, { hex: event.target.value });
                                    if (transition?.outcome.status === "applied" || transition?.outcome.status === "unchanged") {
                                      clearPaintHexDraft(entry.id);
                                      void refreshPaintMatchesForColor(entry.id);
                                    }
                                  }}
                                  aria-label={`Color picker for ${entry.label}`}
                                />
                              </label>
                              <label>
                                <span>Hex</span>
                                <input
                                  type="text"
                                  value={paintHexDrafts[entry.id] ?? entry.hex}
                                  onChange={(event) => setPaintHexDraft(entry.id, event.target.value)}
                                  onBlur={(event) => {
                                    void commitPaintHexDraft(entry.id, event.target.value);
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
                                onChange={(event) => updatePaintGuideEntry(entry.id, paintSelectionPatch(entry, event.target.value))}
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
                </div>
                </details>
              </details>
            </>
          ) : (
            <>
              <PanelTitle icon={<SwatchBook size={18} />} title="Paint Guide" />
              <p className="muted">Paint planning appears after preview generation.</p>
            </>
          )}
          {error ? <div className="error-box">{error}</div> : null}
        </aside> : null}
        {exportStepActive && analysis ? (
          <div ref={exportSectionRef}>
            <ExportWorkspace
              analysis={analysis}
              steps={guidedWorkflowSteps}
              includeCover={settings.includeInstructionCoverPage}
              includeColorGuide={settings.includePaintGuidePage}
              error={error}
              canExportPdf={canExport}
              canExportSvg={canExportSvg}
              onNavigate={navigateToWorkflowStep}
              onToggleCover={() => updateProjectSettings({ ...settings, includeInstructionCoverPage: !settings.includeInstructionCoverPage })}
              onToggleColorGuide={() => setExportColorGuide(!settings.includePaintGuidePage)}
              onDownloadPdf={() => void exportPdf()}
              onDownloadSvg={exportSvgLinework}
              onSaveProject={downloadProjectFile}
            />
          </div>
        ) : null}
        </>
        )}
      </section>
    </main>
  );
}

function ExportWorkspace({
  analysis,
  steps,
  includeCover,
  includeColorGuide,
  error,
  canExportPdf,
  canExportSvg,
  onNavigate,
  onToggleCover,
  onToggleColorGuide,
  onDownloadPdf,
  onDownloadSvg,
  onSaveProject
}: {
  analysis: Analysis;
  steps: readonly WorkflowStepItem[];
  includeCover: boolean;
  includeColorGuide: boolean;
  error: string | null;
  canExportPdf: boolean;
  canExportSvg: boolean;
  onNavigate: (step: WorkflowStep) => void;
  onToggleCover: () => void;
  onToggleColorGuide: () => void;
  onDownloadPdf: () => void;
  onDownloadSvg: () => void;
  onSaveProject: () => void;
}) {
  return (
    <section className="export-workspace" aria-label="Export workspace">
      <div className="export-workflow-nav">
        <GuidedWorkflowCard steps={steps} onNavigate={onNavigate} />
      </div>
      <div className="export-packet-summary">
        <div className="export-preview">
          <img src={analysis.previewPngDataUrl} alt="Assembled template preview" />
        </div>
        <div className="export-packet-copy">
          <span className="choice-kicker">Template Pack</span>
          <h2>Ready to Print</h2>
          <dl>
            <div><dt>Finished Size</dt><dd>{analysis.finishedWidthIn} x {analysis.finishedHeightIn} in</dd></div>
            <div><dt>Trace pages</dt><dd>{analysis.tileCount} tiled pages</dd></div>
            <div><dt>Print setting</dt><dd>Print at 100% / actual size</dd></div>
          </dl>
          <p className="calibration-reminder">Measure the calibration square before taping the full template together.</p>
          <div className="packet-options" aria-label="Template Pack options">
            <label><input type="checkbox" checked={includeCover} onChange={onToggleCover} /> Include cover page</label>
            <label><input type="checkbox" checked={includeColorGuide} onChange={onToggleColorGuide} /> Include Color Guide</label>
          </div>
          <button className="primary-action export-pdf-action" onClick={onDownloadPdf} disabled={!canExportPdf}>
            <Download size={18} /> Download Printable PDF
          </button>
          {error ? <div className="error-box" role="alert">{error}</div> : null}
          <details className="more-export-options" aria-label="More Export Options">
            <summary>More Export Options</summary>
            <div>
              <button className="tool-button" onClick={onDownloadSvg} disabled={!canExportSvg}><FileText size={16} /> Download SVG Linework</button>
              <button className="tool-button" onClick={onSaveProject}><Save size={16} /> Save Project JSON</button>
            </div>
          </details>
        </div>
      </div>
    </section>
  );
}

function GuidedWorkflowCard({
  steps,
  onNavigate
}: {
  steps: readonly WorkflowStepItem[];
  onNavigate: (step: WorkflowStep) => void;
}) {
  return (
    <section className="workflow-card" aria-label="Guided workflow">
      <div className="workflow-card-title">
        <strong>Guided workflow</strong>
        <span>Upload, clean the lines, review colors, then export.</span>
      </div>
      <ol className="workflow-steps">
        {steps.map((step, index) => (
          <li key={step.step} className={`workflow-step ${step.status}`}>
            <button type="button" onClick={() => onNavigate(step.step)} disabled={!step.clickable} aria-current={step.status === "current" ? "step" : undefined}>
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
  );
}

function ColorPrimaryRows({
  entries,
  onUpdate
}: {
  entries: PaintGuideEntry[];
  onUpdate: (id: string, patch: PaintGuidePatch) => void;
}) {
  return (
    <div className="color-primary-list" aria-label="Primary colors">
      {entries.map((entry) => (
        <article className="color-primary-row" key={`primary-${entry.id}`} aria-labelledby={`primary-color-${entry.id}`}>
          <span className="swatch" style={{ backgroundColor: entry.hex }} aria-hidden="true" />
          <h3 className="visually-hidden" id={`primary-color-${entry.id}`}>{entry.label}</h3>
          <label>
            <span>Area</span>
            <input aria-label={`Area label for ${entry.label}`} type="text" value={entry.label} onChange={(event) => onUpdate(entry.id, { label: event.target.value })} />
          </label>
          <label>
            <span>Paint to buy</span>
            <select
              aria-label={`Selected paint for ${entry.label}`}
              value={entry.manualOverride ? "__manual__" : entry.selectedMatchId ?? ""}
              onChange={(event) => onUpdate(entry.id, paintSelectionPatch(entry, event.target.value))}
            >
              <option value="">Choose in store</option>
              {entry.matches.map((match) => <option key={match.id} value={match.id}>{matchDisplayName(match)}</option>)}
              <option value="__manual__">Manual choice</option>
            </select>
          </label>
          <label className="color-shopping-toggle">
            <input aria-label={`Include ${entry.label} in shopping list`} type="checkbox" checked={entry.included} onChange={() => onUpdate(entry.id, { included: !entry.included })} />
            Shopping list
          </label>
        </article>
      ))}
    </div>
  );
}

function paintSelectionPatch(entry: PaintGuideEntry, value: string): PaintGuidePatch {
  if (value === "__manual__") {
    return { selectedMatchId: null, manualOverride: entry.manualOverride || "Choose in store" };
  }
  if (value === "") return { selectedMatchId: null, manualOverride: "" };
  return { selectedMatchId: value, manualOverride: "" };
}

function normalizePaintHexDraft(hex: string) {
  const value = hex.trim().toLowerCase();
  const prefixed = value.startsWith("#") ? value : `#${value}`;
  if (/^#[0-9a-f]{3}$/i.test(prefixed)) {
    const [hash, r, g, b] = prefixed;
    return `${hash}${r}${r}${g}${g}${b}${b}`;
  }
  return prefixed;
}

function isValidSessionPaintHex(hex: string) {
  return /^#?[0-9a-f]{3}$/i.test(hex.trim()) || /^#?[0-9a-f]{6}$/i.test(hex.trim());
}

function AiProposalCard({
  phase,
  proposal,
  review,
  reviewView,
  inputReadiness,
  previewWidthPx,
  previewHeightPx,
  originalPreviewPngDataUrl,
  outerLinePngDataUrl,
  error,
  canBegin,
  canConfirm,
  canAccept,
  canReject,
  onBegin,
  onCancel,
  onConfirm,
  onReviewView,
  onAccept,
  onReject
}: {
  phase: ProjectSessionAiProposalState["status"];
  proposal: ProjectSessionAiProposalResult | null;
  review: AiProposalReview | null;
  reviewView: AiProposalReviewView;
  inputReadiness: ProjectSessionInputReadiness;
  previewWidthPx: number;
  previewHeightPx: number;
  originalPreviewPngDataUrl: string;
  outerLinePngDataUrl: string;
  error: string | null;
  canBegin: boolean;
  canConfirm: boolean;
  canAccept: boolean;
  canReject: boolean;
  onBegin: () => void;
  onCancel: () => void;
  onConfirm: () => void;
  onReviewView: (view: AiProposalReviewView) => void;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <section className="ai-proposal-card" aria-label="AI-assisted linework proposal">
      {phase === "idle" ? (
        <>
          <div>
            <strong>Simplify for wood template</strong>
            <p>{inputReadiness === "ready-line-art"
              ? "Existing ink was found. Ask for one optional Wood-Transfer Style proposal when the artwork is too detailed to transfer directly."
              : "Ask for one optional Wood-Transfer Style proposal. Your Cut Line, print geometry, and current Detail Lines stay unchanged."}</p>
          </div>
          <button className="tool-button" onClick={onBegin} disabled={!canBegin}><Sparkles size={16} /> Simplify for wood template</button>
        </>
      ) : null}
      {phase === "confirming" ? (
        <>
          <div>
            <strong>Confirm one provider request</strong>
            <p>Your source image will be uploaded to OpenAI under its normal retention terms. Exact estimated cost: ${AI_PROPOSAL_ESTIMATE_USD.toFixed(2)}. No automatic retry will be sent.</p>
          </div>
          <div className="ai-proposal-actions">
            <button className="primary-action" onClick={onConfirm} disabled={!canConfirm}>Confirm upload and request one proposal</button>
            <button className="tool-button" onClick={onCancel}>Cancel</button>
          </div>
        </>
      ) : null}
      {phase === "requesting" ? (
        <div role="status" aria-live="polite">
          <strong>Creating a separate linework proposal</strong>
          <p>Exactly one request is in progress. This can take up to two minutes; your accepted lines remain unchanged.</p>
        </div>
      ) : null}
      {phase === "ready" && proposal && review ? (
        <>
          <div>
            <strong>{review.decision === "review-only" ? "Review only" : review.decision === "accepted" ? "Proposal accepted" : review.decision === "rejected" ? "Proposal rejected" : "Ready for visual review"}</strong>
            <p>
              {review.decision === "review-only"
                ? `This proposal cannot replace accepted Detail Lines. Validation: ${proposal.validationIssues.join(", ") || "unspecified"}.`
                : review.decision === "accepted"
                  ? "The reviewed proposal is now the editable Detail Line layer. Undo restores the prior accepted layer."
                  : review.decision === "rejected"
                    ? "The proposal was discarded. Accepted Detail Lines and manual Feature Lines were preserved."
                    : "Technical checks passed. Review AI lines only, Original Overlay, and Print Preview before accepting."}
            </p>
          </div>
          {review.decision === "pending" || review.decision === "review-only" ? (
            <>
              <div className="ai-proposal-view-tabs" aria-label="AI proposal review views">
                {([
                  ["ai-lines-only", "AI lines only"],
                  ["original-overlay", "Original Overlay"],
                  ["print-preview", "Print Preview"]
                ] as [AiProposalReviewView, string][]).map(([view, label]) => (
                  <button key={view} className={reviewView === view ? "tool-button selected" : "tool-button"} aria-pressed={reviewView === view} onClick={() => onReviewView(view)}>
                    {label}{review.reviewedViews.has(view) ? " ✓" : ""}
                  </button>
                ))}
              </div>
              <div
                className="ai-proposal-review-frame"
                aria-label={`${reviewView === "ai-lines-only" ? "AI lines only" : reviewView === "original-overlay" ? "Original Overlay" : "Print Preview"} review`}
                style={{ aspectRatio: `${previewWidthPx} / ${previewHeightPx}` }}
              >
                {reviewView === "original-overlay" ? <img src={originalPreviewPngDataUrl} alt="Original artwork" /> : null}
                {reviewView === "print-preview" ? <img src={outerLinePngDataUrl} alt="Protected Cut Line" /> : null}
                <img className={reviewView === "ai-lines-only" ? "" : "ai-proposal-review-overlay"} src={proposal.proposalDetailPngDataUrl} alt="AI linework proposal" />
              </div>
              <div className="ai-proposal-actions">
                {review.decision === "pending" ? (
                  <>
                    <button className="primary-action" onClick={onAccept} disabled={!canAccept}>Accept AI Detail Lines</button>
                    <button className="tool-button" onClick={onReject} disabled={!canReject}>Reject proposal</button>
                  </>
                ) : null}
                {review.decision === "review-only" ? <button className="tool-button" onClick={onBegin} disabled={!canBegin}>Simplify another version</button> : null}
              </div>
            </>
          ) : (
            <div className="ai-proposal-actions">
              <button className="tool-button" onClick={onBegin} disabled={!canBegin}>Simplify another version</button>
            </div>
          )}
        </>
      ) : null}
      {phase === "failed" ? (
        <div role="alert">
          <strong>Proposal not created</strong>
          <p>{error} No retry was sent, and your accepted Detail Lines remain unchanged.</p>
        </div>
      ) : null}
    </section>
  );
}

function CleanLinesPrimaryControls({
  editorTool,
  brushSize,
  undoDisabled,
  showReference,
  canAccept,
  removalPreviewCount,
  onRemove,
  onAdd,
  onUndo,
  onToggleOriginal,
  onFit,
  onAccept
}: {
  editorTool: EditorTool;
  brushSize: BrushSize;
  undoDisabled: boolean;
  showReference: boolean;
  canAccept: boolean;
  removalPreviewCount: number;
  onRemove: () => void;
  onAdd: () => void;
  onUndo: () => void;
  onToggleOriginal: () => void;
  onFit: () => void;
  onAccept: () => void;
}) {
  return (
    <>
      <div className="clean-primary-controls" aria-label="Clean Lines primary controls">
        <button className={editorTool === "remove" ? "tool-button selected" : "tool-button"} onClick={onRemove}><MousePointerClick size={16} /> Remove Line</button>
        <button className={editorTool === "draw" && brushSize === "normal" ? "tool-button selected" : "tool-button"} onClick={onAdd}><Pencil size={16} /> Add Missing Line</button>
        <button className="tool-button" onClick={onUndo} disabled={undoDisabled}><Undo2 size={16} /> Undo</button>
        <button className={showReference ? "tool-button selected" : "tool-button"} onClick={onToggleOriginal}><Eye size={16} /> Show Original</button>
        <button className="tool-button" onClick={onFit}><ZoomIn size={16} /> Fit</button>
        <button className="primary-action" onClick={onAccept} disabled={!canAccept}><ChevronRight size={16} /> Looks Good - Continue to Colors</button>
      </div>
      <p className="clean-tool-instruction" id="connected-line-preview-status" aria-label="Clean Lines instruction" role="status">
        {editorTool === "remove"
          ? removalPreviewCount > 0
            ? `Connected line preview: ${removalPreviewCount} pixels. Click or press Enter to remove it.`
            : "Point at a line to preview the complete segment before removing it."
          : editorTool === "draw"
            ? "Draw only the missing feature or paint-boundary line."
            : "Use the selected tool, then return to Remove Line or Add Missing Line."}
      </p>
    </>
  );
}

function CleanLinesStatus({
  analysis,
  reviewed,
  review
}: {
  analysis: Analysis;
  reviewed: boolean;
  review: ReturnType<typeof buildTraceQualityReview> | null;
}) {
  const extractionLabel = analysis.traceQuality?.detailExtractionModeUsed === "lineArt"
    ? "Existing line art detected"
    : "Rendered image boundaries";
  return (
    <details className="clean-status" aria-label="Clean Lines status">
      <summary>
        <span>Cutline {analysis.outerCutPath.trim() ? "OK" : "Needs attention"}</span>
        <span>{analysis.tileCount} pages</span>
        <span>{extractionLabel}</span>
        <span>{reviewed ? "Reviewed" : "Visual review needed"}</span>
      </summary>
      {review ? (
        <section className="clean-status-details" aria-label="Trace Quality Review">
          <h3>Trace Quality Review</h3>
          <dl className="trace-quality-grid">
            <div><dt>Cutline</dt><dd>{review.cutlineStatus}</dd></div>
            <div><dt>Vector cutline</dt><dd>{review.vectorCutlinePresent ? `Present (${review.vectorPointCount} points)` : "Missing"}</dd></div>
            <div><dt>Preview bounds</dt><dd>{review.previewBoundsText}</dd></div>
            <div><dt>Subject bounds</dt><dd>{review.subjectBoundsText}</dd></div>
            <div><dt>Tile layout</dt><dd>{review.tileCountText}</dd></div>
            <div><dt>Original underlay</dt><dd>{review.originalUnderlayStatus}</dd></div>
            <div><dt>Detail lines</dt><dd>{review.detailLineStatus}</dd></div>
            <div><dt>Image type</dt><dd>{extractionLabel}</dd></div>
            <div><dt>Detail cleanup</dt><dd>{review.detailCleanupStatus}</dd></div>
          </dl>
          {review.warnings.map((warning) => <p key={warning}>{warning}</p>)}
        </section>
      ) : null}
    </details>
  );
}

function brushPixels(size: BrushSize) {
  if (size === "thin") return 10;
  if (size === "bold") return 34;
  return 20;
}

function inputReadinessForAnalysis(
  analysis: Analysis,
  svgLineworkDetected: boolean
): ProjectSessionInputReadiness {
  return analysis.traceQuality?.detailExtractionModeUsed === "rendered" && !svgLineworkDetected
    ? "needs-simplification"
    : "ready-line-art";
}

function parseAiProposalResponse(value: unknown, analysis: Analysis): ProjectSessionAiProposalResult {
  if (typeof value !== "object" || value === null) throw new Error("AI proposal response was malformed.");
  const proposal = value as Record<string, unknown>;
  if (proposal.status !== "pending-review" && proposal.status !== "review-only") {
    throw new Error("AI proposal response had an invalid review status.");
  }
  if (proposal.canReplaceAcceptedDetail !== false) {
    throw new Error("AI proposal response exceeded proposal-only authority.");
  }
  if (
    proposal.previewWidthPx !== analysis.previewWidthPx
    || proposal.previewHeightPx !== analysis.previewHeightPx
  ) {
    throw new Error("AI proposal response did not match the editor preview size.");
  }
  if (
    typeof proposal.proposalPreviewPngDataUrl !== "string"
    || !proposal.proposalPreviewPngDataUrl.startsWith("data:image/png;base64,")
    || typeof proposal.proposalDetailPngDataUrl !== "string"
    || !proposal.proposalDetailPngDataUrl.startsWith("data:image/png;base64,")
  ) {
    throw new Error("AI proposal response did not contain normalized PNG layers.");
  }
  if (
    !Array.isArray(proposal.validationIssues)
    || proposal.validationIssues.some((issue) => typeof issue !== "string")
    || typeof proposal.inkCoverage !== "number"
    || typeof proposal.suppressedPixelCount !== "number"
    || typeof proposal.model !== "string"
    || typeof proposal.provider !== "string"
    || proposal.estimatedCostUsd !== AI_PROPOSAL_ESTIMATE_USD
  ) {
    throw new Error("AI proposal response metadata was malformed.");
  }
  return proposal as ProjectSessionAiProposalResult;
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
  return canvasContentBounds(canvas) !== null;
}

function canvasContentBounds(canvas: HTMLCanvasElement): TraceBounds | null {
  const context = canvas.getContext("2d");
  if (!context || canvas.width === 0 || canvas.height === 0) return null;
  const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
  let left = canvas.width;
  let top = canvas.height;
  let right = -1;
  let bottom = -1;
  for (let index = 0; index < pixels.length; index += 4) {
    const alpha = pixels[index + 3];
    if (alpha > 8 && (pixels[index] < 245 || pixels[index + 1] < 245 || pixels[index + 2] < 245)) {
      const pixelIndex = index / 4;
      const x = pixelIndex % canvas.width;
      const y = Math.floor(pixelIndex / canvas.width);
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x);
      bottom = Math.max(bottom, y);
    }
  }
  return right >= left && bottom >= top ? { left, top, right: right + 1, bottom: bottom + 1 } : null;
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
