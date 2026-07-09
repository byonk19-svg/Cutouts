import {
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

  assertEqual(traceModeLabel("manual"), "Trace Studio", "manual mode should be labeled as the Trace Studio workflow");
  assertEqual(traceModeHelp("manual"), "Best for printable wood templates.", "manual mode should be presented as the recommended workflow");
  assert(startsWithBlankManualLayer("manual"), "manual mode should start with a blank detail layer");
  assert(opensEditorWithReference("manual"), "manual mode should open the editor with the reference visible");
  assertEqual(settings.detailLines, false, "manual mode should not import generated detail suggestions into the editable layer");
  assertEqual(settings.detailCleanup, 100, "manual mode should request a cutline-only backend detail layer");
  assertEqual(settings.templateStyle, "manual", "manual mode should preserve its workflow identity in settings");
}

{
  assertEqual(traceModeLabel("outline"), "Outside Shape Only Export", "outline mode should be described as a secondary outside shape path");
  assertEqual(traceModeLabel("paint"), "Starter Detail Lines", "paint mode should be described as editable starter detail lines");
  assert(traceModeHelp("paint").includes("Optional rough interior lines"), "paint mode copy should set expectation that starter lines are optional and editable");
  assertEqual(traceModeLabel("marker"), "Experimental Auto Suggestions", "marker mode should no longer promise final marker template art");
  assert(
    traceModeHelp("marker").includes("Usually needs cleanup"),
    "experimental auto detail copy should set expectation that suggestions need editing"
  );
  assert(!startsWithBlankManualLayer("marker"), "experimental auto detail should keep generated suggestions as the editable starting layer");
}
