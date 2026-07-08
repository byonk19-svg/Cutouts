import { matchDisplayName, paintGuideEntriesForPalette, shoppingListText, updatePaintGuideEdit, type CraftPaintMatch } from "../src/paintGuide.ts";
import type { ProjectPaletteColor } from "../src/cutoutProject.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const palette: ProjectPaletteColor[] = [
  {
    hex: "#0C143A",
    coverage: 0.32,
    matches: [paintMatch("folkart-outdoor-navy", "FolkArt", "Outdoor", "Navy", "#1f315d")]
  },
  {
    hex: "#f1ce2d",
    coverage: 0.24,
    matches: [paintMatch("apple-barrel-bright-yellow", "Apple Barrel", "Matte Acrylic", "Bright Yellow", "#f6cc27")]
  },
  { hex: "#6a5424", coverage: 0.12, matches: [] }
];

{
  const entries = paintGuideEntriesForPalette(palette, []);

  assertEqual(entries[0].label, "Color 1", "default paint labels should be numbered");
  assertEqual(entries[1].hex, "#f1ce2d", "palette hex should be normalized");
  assertEqual(entries[2].included, true, "palette colors should default into the shopping list");
}

{
  const edits = updatePaintGuideEdit([], {
    hex: "f1ce2d",
    label: "Coat",
    note: "yellow raincoat",
    included: true,
    selectedMatchId: "apple-barrel-bright-yellow",
    manualOverride: ""
  });
  const updated = updatePaintGuideEdit(edits, {
    hex: "#0C143A",
    label: "Hair",
    note: "blue-black hair",
    included: false,
    selectedMatchId: "folkart-outdoor-navy",
    manualOverride: ""
  });
  const entries = paintGuideEntriesForPalette(palette, updated);

  assertEqual(entries[0].label, "Hair", "paint edits should match palette colors case-insensitively");
  assertEqual(entries[0].note, "blue-black hair", "paint edits should preserve notes");
  assertEqual(entries[0].included, false, "paint edits should preserve hidden state");
  assertEqual(entries[0].selectedMatch?.colorName, "Navy", "paint edits should resolve selected paint match");
  assertEqual(entries[1].label, "Coat", "paint edits should preserve labels");
}

{
  const entries = paintGuideEntriesForPalette(palette, [
    { hex: "#0c143a", label: "Hair", note: "blue-black hair", included: false, selectedMatchId: "folkart-outdoor-navy", manualOverride: "" },
    { hex: "#f1ce2d", label: "Coat", note: "yellow raincoat", included: true, selectedMatchId: "apple-barrel-bright-yellow", manualOverride: "" },
    { hex: "#6a5424", label: "Boots", note: "", included: true, selectedMatchId: null, manualOverride: "Any warm brown craft paint" }
  ]);
  const shoppingList = shoppingListText(entries);

  assert(!shoppingList.includes("Hair"), "hidden colors should not appear in shopping list text");
  assert(shoppingList.includes("Coat: Apple Barrel Matte Acrylic Bright Yellow - yellow raincoat"), "shopping list should use selected paint names");
  assert(shoppingList.includes("Boots: Any warm brown craft paint"), "shopping list should use manual overrides");
}

{
  assertEqual(
    matchDisplayName(paintMatch("apple-barrel-bright-yellow", "Apple Barrel", "Matte Acrylic", "Bright Yellow", "#f6cc27")),
    "Apple Barrel Matte Acrylic Bright Yellow",
    "paint match display should include brand, line, and color name"
  );
}

function paintMatch(id: string, brand: string, line: string, colorName: string, hex: string): CraftPaintMatch {
  return {
    id,
    brand,
    line,
    colorName,
    hex,
    finish: "matte",
    outdoorRecommended: false,
    retailer: "",
    productUrl: "",
    notes: "",
    distance: 4.2,
    confidence: "close match"
  };
}
