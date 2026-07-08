import type { ProjectPaletteColor } from "./cutoutProject";

export type CraftPaintMatch = {
  id: string;
  brand: string;
  line: string;
  colorName: string;
  hex: string;
  finish: string;
  outdoorRecommended: boolean;
  retailer?: string;
  productUrl?: string;
  notes?: string;
  distance: number;
  confidence: "close match" | "approximate match" | "poor match / manual check recommended";
};

export type PaintGuideEdit = {
  hex: string;
  label: string;
  note: string;
  included: boolean;
  selectedMatchId: string | null;
  manualOverride: string;
};

export type PaintGuideEntry = PaintGuideEdit & {
  index: number;
  coverage: number;
  matches: CraftPaintMatch[];
  selectedMatch: CraftPaintMatch | null;
};

export function paintGuideEntriesForPalette(palette: ProjectPaletteColor[], edits: PaintGuideEdit[]): PaintGuideEntry[] {
  return palette.map((color, index) => {
    const edit = edits.find((item) => sameHex(item.hex, color.hex));
    return {
      index: index + 1,
      hex: normalizeHex(color.hex),
      label: edit?.label.trim() || `Color ${index + 1}`,
      note: edit?.note.trim() || "",
      included: edit?.included ?? true,
      selectedMatchId: edit?.selectedMatchId ?? null,
      manualOverride: edit?.manualOverride.trim() || "",
      coverage: color.coverage,
      matches: color.matches,
      selectedMatch: color.matches.find((match) => match.id === edit?.selectedMatchId) ?? null
    };
  });
}

export function updatePaintGuideEdit(edits: PaintGuideEdit[], nextEdit: PaintGuideEdit): PaintGuideEdit[] {
  const normalized = {
    ...nextEdit,
    hex: normalizeHex(nextEdit.hex),
    label: nextEdit.label,
    note: nextEdit.note,
    selectedMatchId: nextEdit.selectedMatchId,
    manualOverride: nextEdit.manualOverride
  };
  const existingIndex = edits.findIndex((item) => sameHex(item.hex, normalized.hex));
  if (existingIndex === -1) return [...edits, normalized];
  return edits.map((item, index) => index === existingIndex ? normalized : item);
}

export function shoppingListText(entries: PaintGuideEntry[]) {
  const included = entries.filter((entry) => entry.included);
  if (included.length === 0) return "No paint colors selected.";
  return included
    .map((entry) => {
      const note = entry.note ? ` - ${entry.note}` : "";
      if (entry.manualOverride) return `${entry.label}: ${entry.manualOverride}${note}`;
      if (entry.selectedMatch) {
        return `${entry.label}: ${entry.selectedMatch.brand} ${entry.selectedMatch.line} ${entry.selectedMatch.colorName}${note}`;
      }
      return `${entry.label} (${entry.hex.toUpperCase()})${note}`;
    })
    .join("\n");
}

export function matchDisplayName(match: CraftPaintMatch) {
  return `${match.brand} ${match.line} ${match.colorName}`;
}

function sameHex(a: string, b: string) {
  return normalizeHex(a) === normalizeHex(b);
}

function normalizeHex(hex: string) {
  const value = hex.trim().toLowerCase();
  return value.startsWith("#") ? value : `#${value}`;
}
