import type { ProjectPaletteColor } from "./cutoutProject";

export type PaintGuideEdit = {
  hex: string;
  label: string;
  note: string;
  included: boolean;
};

export type PaintGuideEntry = PaintGuideEdit & {
  index: number;
  coverage: number;
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
      coverage: color.coverage
    };
  });
}

export function updatePaintGuideEdit(edits: PaintGuideEdit[], nextEdit: PaintGuideEdit): PaintGuideEdit[] {
  const normalized = {
    ...nextEdit,
    hex: normalizeHex(nextEdit.hex),
    label: nextEdit.label,
    note: nextEdit.note
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
      return `${entry.label} (${entry.hex.toUpperCase()})${note}`;
    })
    .join("\n");
}

function sameHex(a: string, b: string) {
  return normalizeHex(a) === normalizeHex(b);
}

function normalizeHex(hex: string) {
  const value = hex.trim().toLowerCase();
  return value.startsWith("#") ? value : `#${value}`;
}
