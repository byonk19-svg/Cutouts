import {
  detailPresetFromTraceMode,
  detailPresetHelp,
  detailPresetLabel,
  detailPresetSettings,
  opensEditorWithReference,
  startsWithBlankManualLayer,
  traceModeHelp,
  traceModeLabel,
  traceModeSettings,
  type Settings
} from "../src/traceWorkflow.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const baseSettings: Settings = {
  finishedHeightIn: 36,
  threshold: 42,
  smoothing: 1,
  speckArea: 20,
  holeArea: 80,
  detailLines: true,
  detailCleanup: 88,
  templateStyle: "paint",
  paletteSize: 6,
  includeInstructionCoverPage: true,
  includePaintGuidePage: true
};

{
  const settings = traceModeSettings("manual", baseSettings);

  assertEqual(traceModeLabel("manual"), "Blank Trace Studio", "manual mode should be labeled as the blank fallback workflow");
  assert(traceModeHelp("manual").includes("blank layer"), "manual mode copy should present it as a blank fallback");
  assert(startsWithBlankManualLayer("manual"), "manual mode should start with a blank detail layer");
  assert(opensEditorWithReference("manual"), "manual mode should open the editor with the reference visible");
  assertEqual(settings.detailLines, false, "manual mode should not import generated detail suggestions into the editable layer");
  assertEqual(settings.detailCleanup, 100, "manual mode should request a cutline-only backend detail layer");
  assertEqual(settings.templateStyle, "manual", "manual mode should preserve its workflow identity in settings");
}

{
  assertEqual(traceModeLabel("outline"), "Outside Shape Only Export", "outline mode should be described as a secondary outside shape path");
  assertEqual(traceModeLabel("paint"), "Balanced starter lines", "paint mode should be described as balanced editable starter lines");
  assert(traceModeHelp("paint").includes("first draft"), "paint mode copy should set expectation that starter lines are the editable first draft");
  assert(opensEditorWithReference("paint"), "starter detail mode should open the editor so rough-line guidance is visible");
  assert(!opensEditorWithReference("outline"), "outside-shape-only mode should stay in preview instead of opening the detail editor");
  assertEqual(traceModeLabel("marker"), "Simple starter lines", "marker mode should be the simple preset");
  assertEqual(traceModeLabel("extra"), "Detailed starter lines", "extra mode should be the detailed preset");
  assert(
    traceModeHelp("marker").includes("Strongest"),
    "simple preset copy should set expectation that only strongest features are kept"
  );
  assert(!startsWithBlankManualLayer("marker"), "simple auto detail should keep generated suggestions as the editable starting layer");
}

{
  const simple = detailPresetSettings("simple", baseSettings);
  const balanced = detailPresetSettings("balanced", baseSettings);
  const detailed = detailPresetSettings("detailed", baseSettings);

  assertEqual(detailPresetLabel("balanced"), "Balanced", "balanced preset should have a plain user label");
  assert(detailPresetHelp("detailed").includes("More paint boundaries"), "detailed preset help should describe visual output");
  assertEqual(simple.templateStyle, "marker", "simple preset should use the strongest-feature backend style");
  assertEqual(balanced.templateStyle, "paint", "balanced preset should use the default clean backend style");
  assertEqual(detailed.templateStyle, "extra", "detailed preset should use the detailed backend style");
  assert(simple.detailCleanup > balanced.detailCleanup, "simple preset should clean more aggressively than balanced");
  assert(detailed.detailCleanup < balanced.detailCleanup, "detailed preset should keep more detail than balanced");
  assertEqual(detailPresetSettings("balanced", simple).speckArea, balanced.speckArea, "balanced preset should restore canonical speck cleanup after simple");
  assertEqual(detailPresetSettings("balanced", simple).holeArea, balanced.holeArea, "balanced preset should restore canonical gap cleanup after simple");
  assertEqual(detailPresetSettings("balanced", simple).smoothing, balanced.smoothing, "balanced preset should restore canonical smoothing after simple");
  assertEqual(detailPresetSettings("detailed", simple).speckArea, detailed.speckArea, "detailed preset should restore canonical speck cleanup after simple");
  assertEqual(detailPresetSettings("detailed", simple).holeArea, detailed.holeArea, "detailed preset should restore canonical gap cleanup after simple");
  assertEqual(detailPresetFromTraceMode("marker"), "simple", "marker mode should map to simple preset");
  assertEqual(detailPresetFromTraceMode("paint"), "balanced", "paint mode should map to balanced preset");
  assertEqual(detailPresetFromTraceMode("extra"), "detailed", "extra mode should map to detailed preset");
}
