export type TraceMode = "outline" | "paint" | "manual" | "marker" | "extra";
export type DetailPreset = "simple" | "balanced" | "detailed";

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
  includeInstructionCoverPage: boolean;
  includePaintGuidePage: boolean;
};

export function detailPresetSettings(preset: DetailPreset, current: Settings): Settings {
  if (preset === "simple") {
    return {
      ...current,
      smoothing: 5,
      speckArea: 120,
      holeArea: 320,
      detailLines: true,
      detailCleanup: 96,
      templateStyle: "marker"
    };
  }
  if (preset === "detailed") {
    return {
      ...current,
      smoothing: 2,
      speckArea: 40,
      holeArea: 160,
      detailLines: true,
      detailCleanup: 35,
      templateStyle: "extra"
    };
  }
  return {
    ...current,
    smoothing: 4,
    speckArea: 60,
    holeArea: 220,
    detailLines: true,
    detailCleanup: 88,
    templateStyle: "paint"
  };
}

export function detailPresetLabel(preset: DetailPreset) {
  if (preset === "simple") return "Simple";
  if (preset === "detailed") return "Detailed";
  return "Balanced";
}

export function detailPresetHelp(preset: DetailPreset) {
  if (preset === "simple") return "Strongest face, clothing, and accessory features only.";
  if (preset === "detailed") return "More paint boundaries and details; expect more cleanup.";
  return "Best default for character cutout starter lines.";
}

export function detailPresetFromTraceMode(mode: TraceMode): DetailPreset {
  if (mode === "marker") return "simple";
  if (mode === "extra") return "detailed";
  return "balanced";
}

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
    return detailPresetSettings("detailed", current);
  }
  if (mode === "marker") {
    return detailPresetSettings("simple", current);
  }
  return detailPresetSettings("balanced", current);
}

export function traceModeLabel(mode: TraceMode) {
  if (mode === "outline") return "Outside Shape Only Export";
  if (mode === "manual") return "Blank Trace Studio";
  if (mode === "marker") return "Simple starter lines";
  if (mode === "extra") return "Detailed starter lines";
  return "Balanced starter lines";
}

export function traceModeHelp(mode: TraceMode) {
  if (mode === "outline") return "Generate outside cutline only.";
  if (mode === "manual") return "Start with a blank layer when generated starter lines are not useful.";
  if (mode === "marker") return detailPresetHelp("simple");
  if (mode === "extra") return detailPresetHelp("detailed");
  return "Auto-generated first draft you can delete from and add to.";
}

export function startsWithBlankManualLayer(mode: TraceMode) {
  return mode === "manual";
}

export function opensEditorWithReference(mode: TraceMode) {
  return mode !== "outline";
}
