import {
  filterPaintGuideEntries,
  groupShoppingListItems,
  matchConfidenceLabel,
  matchDisplayName,
  paintGuideEntriesForPalette,
  shoppingListText,
  updatePaintGuideEdit,
  type CraftPaintMatch
} from "../src/paintGuide.ts";
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
  assert(shoppingList.includes("Apple Barrel Matte Acrylic Bright Yellow - Coat, swatch 2 - yellow raincoat"), "shopping list should use selected paint names");
  assert(shoppingList.includes("Any warm brown craft paint - Boots, swatch 3"), "shopping list should use manual overrides");
}

{
  const duplicatePalette: ProjectPaletteColor[] = [
    {
      hex: "#f1ce2d",
      coverage: 0.24,
      matches: [paintMatch("apple-barrel-bright-yellow", "Apple Barrel", "Matte Acrylic", "Bright Yellow", "#f6cc27")]
    },
    {
      hex: "#e4cc24",
      coverage: 0.18,
      matches: [paintMatch("apple-barrel-bright-yellow", "Apple Barrel", "Matte Acrylic", "Bright Yellow", "#f6cc27")]
    },
    {
      hex: "#6a5424",
      coverage: 0.12,
      matches: [paintMatch("folkart-school-bus-yellow", "FolkArt", "Outdoor", "School Bus Yellow", "#dca91e")]
    },
    {
      hex: "#845424",
      coverage: 0.08,
      matches: [paintMatch("folkart-school-bus-yellow", "FolkArt", "Outdoor", "School Bus Yellow", "#dca91e")]
    },
    { hex: "#0c143a", coverage: 0.06, matches: [] }
  ];
  const entries = paintGuideEntriesForPalette(duplicatePalette, [
    { hex: "#f1ce2d", label: "Raincoat yellow", note: "main coat", included: true, selectedMatchId: "apple-barrel-bright-yellow", manualOverride: "" },
    { hex: "#e4cc24", label: "Raincoat yellow", note: "hood", included: true, selectedMatchId: "apple-barrel-bright-yellow", manualOverride: "" },
    { hex: "#6a5424", label: "Boots / warm yellow shadow", note: "left boot", included: true, selectedMatchId: "folkart-school-bus-yellow", manualOverride: "" },
    { hex: "#845424", label: "Boots / warm yellow shadow", note: "right boot", included: false, selectedMatchId: "folkart-school-bus-yellow", manualOverride: "" },
    { hex: "#0c143a", label: "Hair / outline", note: "marker outline", included: true, selectedMatchId: null, manualOverride: "" }
  ]);
  const groups = groupShoppingListItems(entries);
  const shoppingList = shoppingListText(entries);

  assertEqual(groups.length, 3, "shopping list groups duplicate purchases and excludes hidden colors");
  assertEqual(groups[0].purchaseLabel, "Apple Barrel Matte Acrylic Bright Yellow", "selected paint should be the purchase label");
  assertEqual(groups[0].swatchNumbers.join(","), "1,2", "duplicate selected paint should preserve swatch numbers");
  assert(shoppingList.includes("Apple Barrel Matte Acrylic Bright Yellow - Raincoat yellow, swatches 1 and 2"), "grouped list should combine duplicate selected paint matches");
  assert(shoppingList.includes("FolkArt Outdoor School Bus Yellow - Boots / warm yellow shadow, swatch 3"), "hidden duplicate colors should stay out of grouped list");
  assert(!shoppingList.includes("swatch 4"), "hidden colors should stay out of grouped swatch references");
  assert(shoppingList.includes("No match / choose in store - Hair / outline, swatch 5"), "no-match included colors should be clear");
}

{
  const entries = paintGuideEntriesForPalette(palette, [
    { hex: "#0c143a", label: "Hair", note: "outline", included: true, selectedMatchId: null, manualOverride: "Custom deep blue" },
    { hex: "#f1ce2d", label: "Trim", note: "buttons", included: true, selectedMatchId: null, manualOverride: "Custom deep blue" },
    { hex: "#6a5424", label: "Boots", note: "sole", included: true, selectedMatchId: null, manualOverride: "Any warm brown craft paint" }
  ]);
  const shoppingList = shoppingListText(entries);

  assert(shoppingList.includes("Custom deep blue - Hair and Trim, swatches 1 and 2"), "manual override should group as its own purchase item");
  assert(shoppingList.includes("Any warm brown craft paint - Boots, swatch 3"), "different manual override should stay separate");
}

{
  const selected = updatePaintGuideEdit([], {
    hex: "#f1ce2d",
    label: "Coat",
    note: "",
    included: true,
    selectedMatchId: "apple-barrel-bright-yellow",
    manualOverride: ""
  });
  const manualOverride = updatePaintGuideEdit(selected, {
    hex: "#f1ce2d",
    label: "Coat",
    note: "",
    included: true,
    selectedMatchId: null,
    manualOverride: "Custom yellow mix"
  });
  const entries = paintGuideEntriesForPalette(palette, manualOverride);

  assertEqual(entries[1].selectedMatch, null, "manual override should supersede selected paint match");
  assert(shoppingListText(entries).includes("Custom yellow mix - Coat, swatch 2"), "shopping list should prefer manual override text");
}

{
  const entries = paintGuideEntriesForPalette(palette, [
    { hex: "#0c143a", label: "Hair", note: "", included: true, selectedMatchId: null, manualOverride: "" },
    { hex: "#f1ce2d", label: "Coat", note: "", included: true, selectedMatchId: "apple-barrel-bright-yellow", manualOverride: "" },
    { hex: "#6a5424", label: "Boots", note: "", included: false, selectedMatchId: null, manualOverride: "Any warm brown craft paint" }
  ]);

  assertEqual(filterPaintGuideEntries(entries, "all").length, 3, "all filter should show every paint row");
  assertEqual(filterPaintGuideEntries(entries, "included").length, 2, "included filter should show shopping-list colors only");
  assertEqual(filterPaintGuideEntries(entries, "missing").length, 1, "missing filter should show colors with no selected match or manual override");
  assertEqual(filterPaintGuideEntries(entries, "missing")[0].label, "Hair", "missing filter should identify no-match rows");
}

{
  assertEqual(
    matchDisplayName(paintMatch("apple-barrel-bright-yellow", "Apple Barrel", "Matte Acrylic", "Bright Yellow", "#f6cc27")),
    "Apple Barrel Matte Acrylic Bright Yellow",
    "paint match display should include brand, line, and color name"
  );
  assertEqual(
    matchConfidenceLabel(paintMatch("apple-barrel-bright-yellow", "Apple Barrel", "Matte Acrylic", "Bright Yellow", "#f6cc27")),
    "Close match",
    "confidence labels should be reader-facing"
  );
  assertEqual(
    matchConfidenceLabel({ ...paintMatch("poor", "Brand", "Line", "Color", "#000000"), confidence: "poor match / manual check recommended" }),
    "Check in store",
    "poor match labels should tell the user to check in store"
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
