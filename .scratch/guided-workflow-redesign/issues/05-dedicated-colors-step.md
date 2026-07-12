# 05 — Build the dedicated Colors step

**What to build:** Move paint review into its own workflow step with simple semantic color rows that answer what the color represents, which paint to buy, and whether it belongs in the shopping list.

**Blocked by:** 01 — Introduce durable Guided Workflow state; 03 — Make Clean Lines the dominant workspace.

**Status:** ready-for-human

- [x] Colors renders only after linework review and no paint controls remain beside the editor.
- [x] The step reports the actual project color count while six remains the default extraction target.
- [x] Each primary color row emphasizes area label, selected paint, and inclusion in the shopping list.
- [x] Merge tools, manual hex, confidence, palette count, and detailed matching metadata live under Edit Color Details.
- [x] Continue to Export records a reviewed Colors milestone and enables the PDF Color Guide.
- [x] Skip Paint Guide records a skipped outcome, disables the PDF Color Guide, and advances to Export.
- [x] Returning later and completing Colors replaces the skipped outcome and re-enables the Color Guide.
- [x] Color edits after review update project/export data without revoking the Colors milestone.
- [x] Existing paint matching, manual colors, locking, merging, shopping list, and project restoration remain functional.
- [x] Browser and state tests cover reviewed, skipped, revisited, and edited-after-review paths.
