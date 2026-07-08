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

export type ShoppingListItem = {
  key: string;
  purchaseLabel: string;
  labels: string[];
  swatchNumbers: number[];
  notes: string[];
};

export type PaintReviewFilter = "all" | "missing" | "included";

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

export function filterPaintGuideEntries(entries: PaintGuideEntry[], filter: PaintReviewFilter) {
  if (filter === "included") return entries.filter((entry) => entry.included);
  if (filter === "missing") return entries.filter((entry) => !entry.selectedMatch && !entry.manualOverride);
  return entries;
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
  const groups = groupShoppingListItems(entries);
  if (groups.length === 0) return "No paint colors selected.";
  return groups.map((group) => {
    const notes = group.notes.length > 0 ? ` - ${formatHumanList(group.notes)}` : "";
    return `${group.purchaseLabel} - ${formatHumanList(group.labels)}, ${formatSwatches(group.swatchNumbers)}${notes}`;
  }).join("\n");
}

export function groupShoppingListItems(entries: PaintGuideEntry[]): ShoppingListItem[] {
  const groups = new Map<string, ShoppingListItem>();
  for (const entry of entries) {
    if (!entry.included) continue;
    const key = shoppingListGroupKey(entry);
    const purchaseLabel = shoppingListPurchaseLabel(entry);
    const group = groups.get(key) ?? {
      key,
      purchaseLabel,
      labels: [],
      swatchNumbers: [],
      notes: []
    };
    addUnique(group.labels, entry.label);
    group.swatchNumbers.push(entry.index);
    addUnique(group.notes, entry.note);
    groups.set(key, group);
  }
  return [...groups.values()].map((group) => ({
    ...group,
    swatchNumbers: [...new Set(group.swatchNumbers)].sort((a, b) => a - b)
  }));
}

export function matchDisplayName(match: CraftPaintMatch) {
  return `${match.brand} ${match.line} ${match.colorName}`;
}

export function matchConfidenceLabel(match: CraftPaintMatch) {
  if (match.confidence === "close match") return "Close match";
  if (match.confidence === "approximate match") return "Approximate match";
  return "Check in store";
}

function sameHex(a: string, b: string) {
  return normalizeHex(a) === normalizeHex(b);
}

function normalizeHex(hex: string) {
  const value = hex.trim().toLowerCase();
  return value.startsWith("#") ? value : `#${value}`;
}

function shoppingListGroupKey(entry: PaintGuideEntry) {
  if (entry.manualOverride) return `manual:${entry.manualOverride.trim().toLowerCase()}`;
  if (entry.selectedMatch) return `paint:${entry.selectedMatch.id}`;
  return "no-match";
}

function shoppingListPurchaseLabel(entry: PaintGuideEntry) {
  if (entry.manualOverride) return entry.manualOverride;
  if (entry.selectedMatch) return matchDisplayName(entry.selectedMatch);
  return "No match / choose in store";
}

function addUnique(items: string[], value: string) {
  const trimmed = value.trim();
  if (trimmed && !items.includes(trimmed)) items.push(trimmed);
}

function formatSwatches(numbers: number[]) {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length === 1) return `swatch ${sorted[0]}`;
  return `swatches ${formatHumanList(sorted.map(String))}`;
}

function formatHumanList(items: string[]) {
  if (items.length <= 1) return items[0] ?? "";
  if (items.length === 2) return `${items[0]} and ${items[1]}`;
  return `${items.slice(0, -1).join(", ")}, and ${items[items.length - 1]}`;
}
