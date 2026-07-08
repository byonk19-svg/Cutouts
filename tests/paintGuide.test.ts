import { paintGuideEntriesForPalette, shoppingListText, updatePaintGuideEdit } from "../src/paintGuide.ts";
import type { ProjectPaletteColor } from "../src/cutoutProject.ts";

function assert(condition: unknown, message: string) {
  if (!condition) throw new Error(message);
}

function assertEqual(actual: unknown, expected: unknown, message: string) {
  if (actual !== expected) throw new Error(`${message}: expected ${expected}, got ${actual}`);
}

const palette: ProjectPaletteColor[] = [
  { hex: "#0C143A", coverage: 0.32, matches: [] },
  { hex: "#f1ce2d", coverage: 0.24, matches: [] },
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
    included: true
  });
  const updated = updatePaintGuideEdit(edits, {
    hex: "#0C143A",
    label: "Hair",
    note: "blue-black hair",
    included: false
  });
  const entries = paintGuideEntriesForPalette(palette, updated);

  assertEqual(entries[0].label, "Hair", "paint edits should match palette colors case-insensitively");
  assertEqual(entries[0].note, "blue-black hair", "paint edits should preserve notes");
  assertEqual(entries[0].included, false, "paint edits should preserve hidden state");
  assertEqual(entries[1].label, "Coat", "paint edits should preserve labels");
}

{
  const entries = paintGuideEntriesForPalette(palette, [
    { hex: "#0c143a", label: "Hair", note: "blue-black hair", included: false },
    { hex: "#f1ce2d", label: "Coat", note: "yellow raincoat", included: true },
    { hex: "#6a5424", label: "Boots", note: "", included: true }
  ]);
  const shoppingList = shoppingListText(entries);

  assert(!shoppingList.includes("Hair"), "hidden colors should not appear in shopping list text");
  assert(shoppingList.includes("Coat (#F1CE2D) - yellow raincoat"), "shopping list should include labels, hex values, and notes");
  assert(shoppingList.includes("Boots (#6A5424)"), "shopping list should include included colors without notes");
}
