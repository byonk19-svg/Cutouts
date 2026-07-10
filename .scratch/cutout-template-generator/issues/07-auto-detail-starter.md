Status: ready-for-human

# Add Auto Detail Starter Workflow

## Scope

Make auto-generated starter detail lines the default first draft for Trace Studio, while keeping manual tracing as a cleanup fallback. Do not change the stable outer cutline pipeline, paint guide behavior, or printed tile math from this issue.

## Backend

- Keep the known-good outer cutline baseline unchanged.
- Use mean-shift shading flattening only for interior detail-line generation.
- Apply the flattened working image to detailed, clean, and marker detail-line paths.
- Tune detail cleanup for shaded or 3D-rendered sources so smooth gradients produce fewer speckles while hard feature and paint boundaries remain.
- Add debug trace outputs for the flattened source and starter detail mask.
- Add regression coverage showing soft-gradient sources produce fewer noisy components after flattening while preserving at least one hard boundary.

## Frontend

- Present starter lines as the normal first draft, not an optional side path.
- Offer Simple, Balanced, and Detailed starter-detail presets.
- Open the editor after analysis with the original underlay, cutline, and editable starter details visible.
- Default the editor to cleanup/removal instead of draw-from-scratch.
- Tell users: starter lines are generated automatically, delete bad lines, and add only missing important features.
- Keep blank manual Trace Studio available when the generated starter lines are not useful.
- Export the current accepted starter detail layer plus any user edits in the printable PDF packet and SVG linework.

## Acceptance Criteria

- [x] Starter lines are selected by default for new projects.
- [x] Balanced Auto Starter is the default preset, with Simple and Detailed alternatives.
- [x] Analysis opens the editor with original underlay, cutline, and editable starter detail lines visible.
- [x] The default editor tool removes bad generated lines.
- [x] Copy makes clear that users should clean up generated starter lines before adding missing important details.
- [x] Blank manual Trace Studio remains available as a fallback.
- [x] PDF and SVG export include the current edited starter detail layer.
- [x] Debug trace export writes canonical `flattened.png` and `final-starter-details.png` layers.
- [x] Debug trace export writes luminance, color-boundary, dark-feature, raw-candidate, cleaned-component, and final starter-detail layers.
- [x] Backend tests cover soft-gradient noise suppression and hard-boundary preservation.
- [x] Frontend tests cover the starter-first workflow.

## Baseline

- Current UI baseline: `5d76306 Clean up Trace Studio starter-line controls`
- Tracing/vector baseline: `ddcaeb5 Improve tracing pipeline and SVG cutline export`

## Comments

- Manual tracing should become cleanup/editing, not the main workflow.
- Do not chase full automatic craft-template cleanup in this issue. The goal is a useful first draft that a normal user can delete from and lightly add to.
- Implemented as a starter-first workflow pass. Human review should still validate a real user image at the table before adding more tracing algorithms.
