import { StrictMode, useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Download, Eraser, Eye, FileImage, FileText, Pencil, Redo2, RefreshCw, RotateCcw, SlidersHorizontal, SwatchBook, Undo2 } from "lucide-react";
import "./styles.css";

type TraceMode = "outline" | "paint" | "extra";
type EditorTool = "erase" | "draw";
type BrushSize = "small" | "medium" | "large";

type Settings = {
  finishedHeightIn: number;
  threshold: number;
  smoothing: number;
  speckArea: number;
  holeArea: number;
  detailLines: boolean;
  detailCleanup: number;
  templateStyle: TraceMode;
  paletteSize: number;
};

type PaintMatch = {
  brand: string;
  name: string;
  hex: string;
  distance: number;
  source: string;
};

type PaletteColor = {
  hex: string;
  coverage: number;
  matches: PaintMatch[];
};

type Analysis = {
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
  palette: PaletteColor[];
};

const defaultSettings: Settings = {
  finishedHeightIn: 36,
  threshold: 42,
  smoothing: 4,
  speckArea: 60,
  holeArea: 220,
  detailLines: true,
  detailCleanup: 82,
  templateStyle: "paint",
  paletteSize: 6
};

function App() {
  const [image, setImage] = useState<File | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [traceMode, setTraceMode] = useState<TraceMode>("paint");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editorTool, setEditorTool] = useState<EditorTool>("erase");
  const [brushSize, setBrushSize] = useState<BrushSize>("medium");
  const [showReference, setShowReference] = useState(false);
  const [referenceOpacity, setReferenceOpacity] = useState(35);
  const [history, setHistory] = useState<string[]>([]);
  const [redoHistory, setRedoHistory] = useState<string[]>([]);
  const [editedDetailDataUrl, setEditedDetailDataUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const detailCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const drawingRef = useRef(false);
  const lastPointRef = useRef<{ x: number; y: number } | null>(null);

  const canAnalyze = image !== null && !busy;
  const canExport = image !== null && analysis !== null && !busy;

  useEffect(() => {
    setEditorOpen(false);
    setHistory([]);
    setRedoHistory([]);
    setEditedDetailDataUrl(null);
  }, [analysis]);

  useEffect(() => {
    if (!analysis || !editorOpen) return;
    loadDetailCanvas(editedDetailDataUrl ?? analysis.detailLinePngDataUrl);
  }, [analysis, editorOpen, editedDetailDataUrl]);

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
      setAnalysis(body);
      setEditorOpen(false);
      setHistory([]);
      setRedoHistory([]);
      setEditedDetailDataUrl(null);
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
      payload.append("image", image);
      payload.append("settings", JSON.stringify(settings));
      const editedDetail = currentDetailDataUrl();
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
    }
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
    const detailCleanup = traceMode === "paint" ? value : 100 - value;
    setSettings((current) => ({ ...current, detailCleanup, detailLines: true, templateStyle: traceMode }));
    setAnalysis(null);
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
    return canvas.toDataURL("image/png");
  }

  function saveHistorySnapshot() {
    const current = currentDetailDataUrl();
    if (!current) return;
    setHistory((items) => [...items.slice(-19), current]);
    setRedoHistory([]);
  }

  function undoDetailEdit() {
    const current = currentDetailDataUrl();
    const previous = history[history.length - 1];
    if (!previous) return;
    setHistory((items) => items.slice(0, -1));
    if (current) setRedoHistory((items) => [...items.slice(-19), current]);
    setEditedDetailDataUrl(previous);
    loadDetailCanvas(previous);
  }

  function redoDetailEdit() {
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
    saveHistorySnapshot();
    setEditedDetailDataUrl(null);
    loadDetailCanvas(analysis.detailLinePngDataUrl);
  }

  function beginStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!analysis) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    saveHistorySnapshot();
    drawingRef.current = true;
    const point = canvasPoint(event);
    lastPointRef.current = point;
    drawStrokeSegment(point, point);
  }

  function continueStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (!drawingRef.current) return;
    const point = canvasPoint(event);
    const previous = lastPointRef.current ?? point;
    drawStrokeSegment(previous, point);
    lastPointRef.current = point;
  }

  function endStroke(event: PointerEvent<HTMLCanvasElement>) {
    if (drawingRef.current) {
      event.currentTarget.releasePointerCapture(event.pointerId);
      setEditedDetailDataUrl(event.currentTarget.toDataURL("image/png"));
    }
    drawingRef.current = false;
    lastPointRef.current = null;
  }

  function canvasPoint(event: PointerEvent<HTMLCanvasElement>) {
    const canvas = event.currentTarget;
    const rect = canvas.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * canvas.width,
      y: ((event.clientY - rect.top) / rect.height) * canvas.height
    };
  }

  function drawStrokeSegment(from: { x: number; y: number }, to: { x: number; y: number }) {
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

  return (
    <main className="app-shell">
      <header className="topbar">
        <div>
          <h1>Cutout Studio</h1>
          <p>Personal wood cutout template generator</p>
        </div>
        <button className="primary-action" onClick={exportPdf} disabled={!canExport}>
          <Download size={18} />
          Export PDF
        </button>
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
                setImage(file);
                setAnalysis(null);
                setError(null);
              }}
            />
          </label>

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
              <strong>Cut Only</strong>
              <small>Outer shape only</small>
            </button>
            <button className={traceMode === "paint" ? "choice selected" : "choice"} onClick={() => applyTraceMode("paint")}>
              <strong>Clean Character Template</strong>
              <small>Bold outline and editable feature lines</small>
            </button>
            <button className={traceMode === "extra" ? "choice selected" : "choice"} onClick={() => applyTraceMode("extra")}>
              <strong>Detailed Paint Map</strong>
              <small>More color boundaries</small>
            </button>
          </div>

          <RangeField label="Line smoothness" min={0} max={8} value={settings.smoothing} onChange={(value) => updateSetting("smoothing", value)} />
          {settings.detailLines ? (
            <RangeField
              label={traceMode === "paint" ? "Cleanup strength" : "Inside detail"}
              min={traceMode === "paint" ? 76 : 0}
              max={100}
              value={traceMode === "paint" ? settings.detailCleanup : 100 - settings.detailCleanup}
              onChange={updateInteriorDetail}
              lowLabel={traceMode === "paint" ? "More lines" : undefined}
              highLabel={traceMode === "paint" ? "Cleaner" : undefined}
            />
          ) : null}
          <RangeField label="Paint colors" min={2} max={10} value={settings.paletteSize} onChange={(value) => updateSetting("paletteSize", value)} />

          <button className="advanced-toggle" onClick={() => setAdvancedOpen((open) => !open)}>
            {advancedOpen ? "Hide advanced cleanup" : "Show advanced cleanup"}
          </button>
          {advancedOpen ? (
            <div className="advanced-panel">
              <RangeField label="Background sensitivity" min={0} max={180} value={settings.threshold} onChange={(value) => updateSetting("threshold", value)} />
              <RangeField label="Remove tiny marks" min={0} max={600} value={settings.speckArea} onChange={(value) => updateSetting("speckArea", value)} />
              <RangeField label="Close small gaps" min={0} max={1500} value={settings.holeArea} onChange={(value) => updateSetting("holeArea", value)} />
            </div>
          ) : null}

          <button className="secondary-action" onClick={() => analyze()} disabled={!canAnalyze}>
            <RefreshCw size={17} />
            {busy ? "Working..." : "Generate Preview"}
          </button>
        </aside>

        <section className="preview-stage" aria-label="Trace preview">
          {analysis ? (
            <div className="page-preview">
              <div className="preview-strip">
                <span>{editorOpen ? "Clean Template Editor" : "Trace preview"}</span>
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
                    <select value={brushSize} onChange={(event) => setBrushSize(event.target.value as BrushSize)} aria-label="Brush size">
                      <option value="small">Small brush</option>
                      <option value="medium">Medium brush</option>
                      <option value="large">Large brush</option>
                    </select>
                    <button className="tool-button" onClick={undoDetailEdit} disabled={history.length === 0}>
                      <Undo2 size={15} />
                      Undo
                    </button>
                    <button className="tool-button" onClick={redoDetailEdit} disabled={redoHistory.length === 0}>
                      <Redo2 size={15} />
                      Redo
                    </button>
                    <button className="tool-button" onClick={resetDetailLayer}>
                      <RotateCcw size={15} />
                      Reset details
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
                  <div className="template-editor" style={{ aspectRatio: `${analysis.previewWidthPx} / ${analysis.previewHeightPx}` }}>
                    {showReference ? (
                      <img
                        src={analysis.paintGuidePngDataUrl}
                        alt=""
                        className="reference-layer"
                        style={{ opacity: referenceOpacity / 100 }}
                      />
                    ) : null}
                    <canvas
                      ref={detailCanvasRef}
                      className="detail-line-layer"
                      width={analysis.previewWidthPx}
                      height={analysis.previewHeightPx}
                      onPointerDown={beginStroke}
                      onPointerMove={continueStroke}
                      onPointerUp={endStroke}
                      onPointerCancel={endStroke}
                      aria-label="Editable interior detail lines"
                    />
                    <img src={analysis.outerLinePngDataUrl} alt="" className="outer-line-layer" draggable={false} />
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
              <p>Generate a black-and-white cut line preview before exporting the full-size PDF pack.</p>
            </div>
          )}
        </section>

        <aside className="right-panel" aria-label="Paint guide and export summary">
          <PanelTitle icon={<SwatchBook size={18} />} title="Color Guide" />
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
              <div className="palette-list">
                {analysis.palette.map((color, index) => (
                  <article className="palette-row" key={`${color.hex}-${index}`}>
                    <div className="swatch" style={{ backgroundColor: color.hex }} />
                    <div>
                      <strong>{color.hex.toUpperCase()}</strong>
                      <span>{Math.round(color.coverage * 100)}% coverage</span>
                      <p>{color.matches.map((match) => `${match.brand} ${match.name}`).join(" / ")}</p>
                    </div>
                  </article>
                ))}
              </div>
            </>
          ) : (
            <p className="muted">Paint matches appear after preview generation.</p>
          )}
          {error ? <div className="error-box">{error}</div> : null}
        </aside>
      </section>
    </main>
  );
}

function brushPixels(size: BrushSize) {
  if (size === "small") return 10;
  if (size === "large") return 34;
  return 20;
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

function traceModeSettings(mode: TraceMode, current: Settings): Settings {
  if (mode === "outline") {
    return {
      ...current,
      smoothing: Math.max(current.smoothing, 3),
      speckArea: Math.max(current.speckArea, 80),
      holeArea: Math.max(current.holeArea, 260),
      detailLines: false,
      detailCleanup: 100,
      templateStyle: mode
    };
  }
  if (mode === "extra") {
    return {
      ...current,
      smoothing: Math.max(2, current.smoothing),
      detailLines: true,
      detailCleanup: 35,
      templateStyle: mode
    };
  }
  return {
    ...current,
    smoothing: Math.max(current.smoothing, 4),
    detailLines: true,
    detailCleanup: 82,
    templateStyle: mode
  };
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
