# 03 — Make Clean Lines the dominant workspace

**What to build:** Turn Clean Lines into the core workspace: a nearly full-width, auto-fitted canvas with six primary controls, one contextual instruction, one review decision, and optional drawers for advanced tools and diagnostics.

**Blocked by:** 01 — Introduce durable Guided Workflow state; 02 — Build the focused Upload step and File menu.

**Status:** ready-for-agent

- [ ] The canvas occupies at least 70% of main content width on a typical desktop and at least 65vh of usable height.
- [ ] Permanent setup and paint/diagnostics rails are absent from Clean Lines.
- [ ] Exactly six primary controls are visible: Remove Line, Add Missing Line, Undo, Show Original, Fit, and Looks Good — Continue to Colors.
- [ ] Remove Line is selected by default and Add Missing Line creates normal-width freehand Feature Lines.
- [ ] A single short instruction changes with the selected primary tool.
- [ ] Looks Good records linework review and advances only when the Cut Line is valid.
- [ ] Eraser, smooth curve, brush size, redo, reset, zoom, layers, presets, blank Trace Studio, and outside-only mode remain available under More Tools.
- [ ] A compact status control summarizes cutline quality, page count, and visual-review state.
- [ ] Full technical diagnostics are hidden until the status drawer is opened.
- [ ] Paint and export controls do not render in Clean Lines.
- [ ] Desktop and mobile browser tests verify canvas dominance, primary-control count, progressive disclosure, and review advancement.

