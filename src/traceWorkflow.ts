export type TraceMode = "outline" | "paint" | "manual" | "marker" | "extra";

export type Settings = {
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

export function traceModeSettings(mode: TraceMode, current: Settings): Settings {
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
  if (mode === "manual") {
    return {
      ...current,
      smoothing: Math.max(current.smoothing, 4),
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
  if (mode === "marker") {
    return {
      ...current,
      smoothing: Math.max(current.smoothing, 5),
      speckArea: Math.max(current.speckArea, 120),
      holeArea: Math.max(current.holeArea, 320),
      detailLines: true,
      detailCleanup: 94,
      templateStyle: mode
    };
  }
  return {
    ...current,
    smoothing: Math.max(current.smoothing, 4),
    detailLines: true,
    detailCleanup: 88,
    templateStyle: mode
  };
}

export function traceModeLabel(mode: TraceMode) {
  if (mode === "outline") return "Cutline Only";
  if (mode === "manual") return "Trace Studio";
  if (mode === "marker") return "Experimental Auto Suggestions";
  if (mode === "extra") return "Detailed Paint Map";
  return "Clean Template Starter";
}

export function traceModeHelp(mode: TraceMode) {
  if (mode === "outline") return "Outside shape for jigsaw cutting.";
  if (mode === "manual") return "Auto cutline with manual clean line tracing.";
  if (mode === "marker") return "Rough starter lines. Usually needs cleanup.";
  if (mode === "extra") return "More color boundaries for paint planning.";
  return "Bold cutline with editable starter feature lines.";
}

export function startsWithBlankManualLayer(mode: TraceMode) {
  return mode === "manual";
}

export function opensEditorWithReference(mode: TraceMode) {
  return mode === "manual";
}
