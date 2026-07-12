# 03 — Make Clean Lines the dominant workspace

**What to build:** Turn Clean Lines into the core workspace: a nearly full-width, auto-fitted canvas with six primary controls, one contextual instruction, one review decision, and optional drawers for advanced tools and diagnostics.

**Blocked by:** 01 — Introduce durable Guided Workflow state; 02 — Build the focused Upload step and File menu.

**Status:** ready-for-human

- [x] The canvas occupies at least 70% of main content width on a typical desktop and at least 65vh of usable height.
- [x] Permanent setup and paint/diagnostics rails are absent from Clean Lines.
- [x] Exactly six primary controls are visible: Remove Line, Add Missing Line, Undo, Show Original, Fit, and Looks Good — Continue to Colors.
- [x] Remove Line is selected by default and Add Missing Line creates normal-width freehand Feature Lines.
- [x] A single short instruction changes with the selected primary tool.
- [x] Looks Good records linework review and advances only when the Cut Line is valid.
- [x] Eraser, smooth curve, brush size, redo, reset, zoom, layers, presets, blank Trace Studio, and outside-only mode remain available under More Tools.
- [x] A compact status control summarizes cutline quality, page count, and visual-review state.
- [x] Full technical diagnostics are hidden until the status drawer is opened.
- [x] Paint and export controls do not render in Clean Lines.
- [x] Desktop and mobile browser tests verify canvas dominance, primary-control count, progressive disclosure, and review advancement.
