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
  detailExtractionMode: "auto",
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
  assertEqual(traceModeLabel("paint"), "Wood Template starter lines", "paint mode should be described as the recommended wood-template path");
  assert(traceModeHelp("paint").includes("first draft"), "paint mode copy should set expectation that starter lines are the editable first draft");
  assert(opensEditorWithReference("paint"), "starter detail mode should open the editor so rough-line guidance is visible");
  assert(!opensEditorWithReference("outline"), "outside-shape-only mode should stay in preview instead of opening the detail editor");
  assertEqual(traceModeLabel("marker"), "Minimal starter lines", "marker mode should be the minimal preset");
  assertEqual(traceModeLabel("extra"), "Faithful Artwork starter lines", "extra mode should be the faithful preset");
  assert(
    traceModeHelp("marker").includes("may also remove useful paint boundaries"),
    "minimal preset copy should disclose that useful boundaries can be lost"
  );
  assert(!startsWithBlankManualLayer("marker"), "simple auto detail should keep generated suggestions as the editable starting layer");
}

{
  const simple = detailPresetSettings("simple", baseSettings);
  const balanced = detailPresetSettings("balanced", baseSettings);
  const detailed = detailPresetSettings("detailed", baseSettings);

  assertEqual(detailPresetLabel("simple"), "Minimal - Experimental", "simple preset should disclose its experimental status");
  assertEqual(detailPresetLabel("balanced"), "Wood Template - Recommended", "balanced preset should be the recommended product path");
  assertEqual(detailPresetLabel("detailed"), "Faithful Artwork", "detailed preset should describe faithful source output");
  assertEqual(detailPresetHelp("simple"), "Removes many minor lines and may also remove useful paint boundaries.", "minimal helper should disclose the risk of losing useful boundaries");
  assertEqual(detailPresetHelp("balanced"), "Recommended - key details.", "balanced preset should identify the recommended density");
  assertEqual(detailPresetHelp("detailed"), "Faithful artwork - most lines.", "detailed preset should describe faithful source output");
  assertEqual(simple.templateStyle, "marker", "simple preset should use the strongest-feature backend style");
  assertEqual(balanced.templateStyle, "paint", "balanced preset should use the default clean backend style");
  assertEqual(detailed.templateStyle, "extra", "detailed preset should use the detailed backend style");
  assert(simple.detailCleanup > balanced.detailCleanup, "simple preset should clean more aggressively than balanced");
  assert(detailed.detailCleanup < balanced.detailCleanup, "detailed preset should keep more detail than balanced");
  assertEqual(simple.speckArea, baseSettings.speckArea, "detail strength should not change outer-mask speck cleanup");
  assertEqual(simple.holeArea, baseSettings.holeArea, "detail strength should not change outer-mask gap cleanup");
  assertEqual(simple.smoothing, baseSettings.smoothing, "detail strength should not change outer cutline smoothing");
  assertEqual(detailed.speckArea, baseSettings.speckArea, "detailed strength should preserve outer-mask cleanup");
  assertEqual(detailed.holeArea, baseSettings.holeArea, "detailed strength should preserve outer-mask gap cleanup");
  assertEqual(detailPresetFromTraceMode("marker"), "simple", "marker mode should map to simple preset");
  assertEqual(detailPresetFromTraceMode("paint"), "balanced", "paint mode should map to balanced preset");
  assertEqual(detailPresetFromTraceMode("extra"), "detailed", "extra mode should map to detailed preset");
}
