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

export type ProjectPaintColor = PaintGuideEdit & {
  id: string;
  coverage: number;
  matches: CraftPaintMatch[];
  locked: boolean;
  source: "detected" | "manual";
};

export type PaintGuideEntry = ProjectPaintColor & {
  index: number;
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

export function seedProjectPaletteFromDetected(palette: ProjectPaletteColor[], edits: PaintGuideEdit[] = []): ProjectPaintColor[] {
  const colors = palette.map((color, index) => {
    const edit = edits.find((item) => sameHex(item.hex, color.hex));
    const label = edit?.label.trim() || `Color ${index + 1}`;
    const selectedMatchId = edit?.selectedMatchId ?? null;
    return {
      id: `detected-${index + 1}-${normalizeHex(color.hex).slice(1)}`,
      hex: normalizeHex(color.hex),
      label,
      note: edit?.note.trim() || "",
      included: edit?.included ?? true,
      selectedMatchId,
      manualOverride: edit?.manualOverride.trim() || "",
      coverage: color.coverage,
      matches: color.matches,
      locked: false,
      source: "detected" as const
    };
  });
  const unmatchedEdits = edits.filter((edit) => !palette.some((color) => sameHex(color.hex, edit.hex)));
  return [
    ...colors,
    ...unmatchedEdits.map((edit, index) => ({
      id: `manual-${colors.length + index + 1}-${normalizeHex(edit.hex).slice(1)}`,
      hex: normalizeHex(edit.hex),
      label: edit.label.trim() || `Color ${colors.length + index + 1}`,
      note: edit.note.trim(),
      included: edit.included,
      selectedMatchId: edit.selectedMatchId,
      manualOverride: edit.manualOverride.trim(),
      coverage: 0,
      matches: [],
      locked: true,
      source: "manual" as const
    }))
  ];
}

export function paintGuideEntriesForPalette(palette: ProjectPaletteColor[], edits: PaintGuideEdit[]): PaintGuideEntry[] {
  return paintGuideEntriesForProjectPalette(seedProjectPaletteFromDetected(palette, edits));
}

export function paintGuideEntriesForProjectPalette(projectPalette: ProjectPaintColor[]): PaintGuideEntry[] {
  return projectPalette.map((color, index) => ({
    ...color,
    index: index + 1,
    hex: normalizeHex(color.hex),
    label: color.label.trim() || `Color ${index + 1}`,
    note: color.note.trim(),
    manualOverride: color.manualOverride.trim(),
    selectedMatch: color.matches.find((match) => match.id === color.selectedMatchId) ?? null
  }));
}

export function addProjectPaintColor(
  palette: ProjectPaintColor[],
  input: {
    id?: string;
    hex: string;
    label: string;
    note?: string;
    matches?: CraftPaintMatch[];
  }
): ProjectPaintColor[] {
  const hex = normalizeHex(input.hex);
  return [
    ...palette,
    {
      id: input.id ?? nextPaintColorId(palette, "manual"),
      hex,
      label: input.label.trim() || "New color",
      note: input.note?.trim() ?? "",
      included: true,
      selectedMatchId: null,
      manualOverride: "",
      coverage: 0,
      matches: input.matches ?? [],
      locked: true,
      source: "manual"
    }
  ];
}

export function updateProjectPaintColor(
  palette: ProjectPaintColor[],
  id: string,
  patch: Partial<Omit<ProjectPaintColor, "id" | "source">>
): ProjectPaintColor[] {
  return palette.map((color) => {
    if (color.id !== id) return color;
    const nextMatches = patch.matches ?? color.matches;
    const nextSelectedMatchId = "selectedMatchId" in patch
      ? patch.selectedMatchId ?? null
      : color.selectedMatchId && nextMatches.some((match) => match.id === color.selectedMatchId)
        ? color.selectedMatchId
        : null;
    return {
      ...color,
      ...patch,
      hex: patch.hex ? normalizeHex(patch.hex) : color.hex,
      label: patch.label ?? color.label,
      note: patch.note ?? color.note,
      included: patch.included ?? color.included,
      selectedMatchId: nextSelectedMatchId,
      manualOverride: patch.manualOverride ?? color.manualOverride,
      coverage: patch.coverage ?? color.coverage,
      matches: nextMatches,
      locked: patch.locked ?? color.locked
    };
  });
}

export function removeProjectPaintColor(palette: ProjectPaintColor[], id: string): ProjectPaintColor[] {
  return palette.filter((color) => color.id !== id);
}

export function mergeProjectPaintColors(palette: ProjectPaintColor[], ids: string[]): ProjectPaintColor[] {
  const selected = palette.filter((color) => ids.includes(color.id));
  if (selected.length < 2) return palette;
  const primary = selected[0];
  const merged: ProjectPaintColor = {
    ...primary,
    label: formatHumanList(uniqueValues(selected.map((color) => color.label))),
    note: uniqueValues(selected.map((color) => color.note)).join("; "),
    included: selected.some((color) => color.included),
    coverage: selected.reduce((total, color) => total + color.coverage, 0),
    locked: selected.some((color) => color.locked),
    manualOverride: primary.manualOverride,
    selectedMatchId: primary.selectedMatchId,
    matches: primary.matches
  };
  return palette.flatMap((color) => {
    if (color.id === primary.id) return [merged];
    if (ids.includes(color.id)) return [];
    return [color];
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

export function paintGuideEditsFromProjectPalette(projectPalette: ProjectPaintColor[]): PaintGuideEdit[] {
  return projectPalette.map((color) => ({
    hex: normalizeHex(color.hex),
    label: color.label,
    note: color.note,
    included: color.included,
    selectedMatchId: color.selectedMatchId,
    manualOverride: color.manualOverride
  }));
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

export function isValidHexColor(hex: string) {
  return /^#[0-9a-f]{6}$/i.test(normalizeHex(hex));
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

function uniqueValues(values: string[]) {
  const output: string[] = [];
  for (const value of values) addUnique(output, value);
  return output;
}

function nextPaintColorId(palette: ProjectPaintColor[], prefix: string) {
  let index = palette.length + 1;
  while (palette.some((color) => color.id === `${prefix}-${index}`)) index += 1;
  return `${prefix}-${index}`;
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
