Status: ready-for-human

# Add Trace Quality Review Panel

## Scope

Add a focused review panel that helps the maker decide whether the generated trace is trustworthy before exporting. Keep this to trace diagnostics and warnings; do not add new tracing algorithms, editor tools, or paint-guide features from this issue.

## What To Show

- Cutline found: yes/no
- Vector cutline point count
- Preview bounds in pixels
- Subject bounds in source pixels
- Tile count and row/column layout
- Warnings for likely bad inputs such as mostly blank images, tiny detected subjects, very low subject coverage, or likely PDF/tile-page screenshots
- Warning for fake transparency / checkerboard backgrounds baked into JPG or flat-image pixels
- Original underlay visibility status
- Manual detail line count and export-readiness warning when no manual lines exist

## Acceptance Criteria

- [x] The panel appears after analysis and updates when a new image is analyzed.
- [x] The panel reports whether a vector `outerCutPath` exists.
- [x] The panel reports the number of points in the vector cutline path.
- [x] The panel reports preview dimensions and subject bounds without requiring developer tools.
- [x] The panel reports tile count using the same values used for PDF export.
- [x] The panel warns when the detected subject coverage is suspiciously small.
- [x] The panel warns when isolated marks or page-number-like artifacts are likely present outside the main subject.
- [x] The panel warns when the input looks like a finished trace tile/PDF page rather than one complete source image.
- [x] The panel warns when the image appears to have a checkerboard background baked into the pixels.
- [x] The panel reports whether the original underlay is visible, hidden, or hidden by print preview.
- [x] The panel reports manual detail line count and recommends manual tracing when the count is zero.
- [x] Exporting from Trace Studio with zero manual lines asks the user to confirm an outside-cutline-only packet.
- [x] Existing manual Trace Studio workflow, SVG export, PDF export, and paint guide behavior remain unchanged.
- [x] Unit coverage exists for diagnostic calculations and warning thresholds.
- [x] Browser smoke covers the panel appearing after analysis for a normal source image.

## Baseline

- Known-good tracing baseline: `ddcaeb5 Improve tracing pipeline and SVG cutline export`
- Baseline documentation: `ea1cfb6 Document tracing baseline`

## Comments

- This is the next UX layer after the tracing baseline. The goal is user confidence and support/debug visibility, not more automatic detail tracing.
- Implemented as the first Trace Quality Review pass. Human review should verify the wording on a real Coraline-style checkerboard JPG and decide whether any warning thresholds need tuning.
