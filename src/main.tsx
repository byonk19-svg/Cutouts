import { StrictMode, useState, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { Download, FileImage, FileText, RefreshCw, SlidersHorizontal, SwatchBook } from "lucide-react";
import "./styles.css";

type TraceMode = "outline" | "paint" | "extra";

type Settings = {
  finishedHeightIn: number;
  threshold: number;
  smoothing: number;
  speckArea: number;
  holeArea: number;
  detailLines: boolean;
  detailCleanup: number;
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
  palette: PaletteColor[];
};

const defaultSettings: Settings = {
  finishedHeightIn: 36,
  threshold: 42,
  smoothing: 2,
  speckArea: 60,
  holeArea: 220,
  detailLines: true,
  detailCleanup: 70,
  paletteSize: 6
};

function App() {
  const [image, setImage] = useState<File | null>(null);
  const [settings, setSettings] = useState<Settings>(defaultSettings);
  const [traceMode, setTraceMode] = useState<TraceMode>("paint");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [analysis, setAnalysis] = useState<Analysis | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canAnalyze = image !== null && !busy;
  const canExport = image !== null && analysis !== null && !busy;

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
    updateSetting("detailCleanup", 100 - value);
    setTraceMode("paint");
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
              <strong>Cut outline</strong>
              <small>Outer shape only</small>
            </button>
            <button className={traceMode === "paint" ? "choice selected" : "choice"} onClick={() => applyTraceMode("paint")}>
              <strong>Paint tracing</strong>
              <small>Clean inside lines</small>
            </button>
            <button className={traceMode === "extra" ? "choice selected" : "choice"} onClick={() => applyTraceMode("extra")}>
              <strong>More detail</strong>
              <small>Shows smaller lines</small>
            </button>
          </div>

          <RangeField label="Line smoothness" min={0} max={8} value={settings.smoothing} onChange={(value) => updateSetting("smoothing", value)} />
          {settings.detailLines ? (
            <RangeField
              label="Inside detail"
              min={0}
              max={100}
              value={100 - settings.detailCleanup}
              onChange={updateInteriorDetail}
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
                <span>Trace preview</span>
                <span>{analysis.tileCols} x {analysis.tileRows} pages</span>
              </div>
              <img src={analysis.previewPngDataUrl} alt="Generated cut line preview" />
              <div className="tile-hint">
                {Array.from({ length: Math.min(analysis.tileCount, 12) }, (_, index) => (
                  <span key={index}>{index + 1}</span>
                ))}
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

function traceModeSettings(mode: TraceMode, current: Settings): Settings {
  if (mode === "outline") {
    return {
      ...current,
      smoothing: Math.max(current.smoothing, 3),
      speckArea: Math.max(current.speckArea, 80),
      holeArea: Math.max(current.holeArea, 260),
      detailLines: false,
      detailCleanup: 100
    };
  }
  if (mode === "extra") {
    return {
      ...current,
      smoothing: Math.max(2, current.smoothing),
      detailLines: true,
      detailCleanup: 35
    };
  }
  return {
    ...current,
    smoothing: Math.max(current.smoothing, 3),
    detailLines: true,
    detailCleanup: 55
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

function RangeField({ label, min, max, value, onChange }: { label: string; min: number; max: number; value: number; onChange: (value: number) => void }) {
  return (
    <label className="field">
      <span>
        {label}
        <strong>{value}</strong>
      </span>
      <input type="range" min={min} max={max} value={value} onChange={(event) => onChange(Number(event.target.value))} />
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
