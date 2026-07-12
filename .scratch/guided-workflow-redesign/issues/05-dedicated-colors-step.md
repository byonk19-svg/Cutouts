# 05 — Build the dedicated Colors step

**What to build:** Move paint review into its own workflow step with simple semantic color rows that answer what the color represents, which paint to buy, and whether it belongs in the shopping list.

**Blocked by:** 01 — Introduce durable Guided Workflow state; 03 — Make Clean Lines the dominant workspace.

**Status:** ready-for-agent

- [ ] Colors renders only after linework review and no paint controls remain beside the editor.
- [ ] The step reports the actual project color count while six remains the default extraction target.
- [ ] Each primary color row emphasizes area label, selected paint, and inclusion in the shopping list.
- [ ] Merge tools, manual hex, confidence, palette count, and detailed matching metadata live under Edit Color Details.
- [ ] Continue to Export records a reviewed Colors milestone and enables the PDF Color Guide.
- [ ] Skip Paint Guide records a skipped outcome, disables the PDF Color Guide, and advances to Export.
- [ ] Returning later and completing Colors replaces the skipped outcome and re-enables the Color Guide.
- [ ] Color edits after review update project/export data without revoking the Colors milestone.
- [ ] Existing paint matching, manual colors, locking, merging, shopping list, and project restoration remain functional.
- [ ] Browser and state tests cover reviewed, skipped, revisited, and edited-after-review paths.

