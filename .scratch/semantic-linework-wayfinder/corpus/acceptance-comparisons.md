# Human Acceptance Comparisons

Copy this checklist to each run's `<fixture-id>/acceptance.md`. Record `pass`,
`fail`, or `not applicable` for every item and explain each failure.

## Identity

- Fixture ID:
- Experiment ID:
- Reviewer:
- Review date:
- Source SHA-256 matches `generated-files.json`:

## Source vs generated linework

- The complete outside silhouette is present and unchanged.
- Expected face, hair, clothing, limb, footwear, hand, fur, and accessory
  boundaries listed in `README.md` remain recognizable.
- Paint-region separators are deliberate and distributed across the full
  character rather than concentrated in one area.
- Highlights, texture, shading steps, tiny marks, and duplicate contours are
  substantially reduced.
- Dark colored fills do not become solid linework regions.
- No major region requires manual reconstruction.
- Remaining cleanup is limited to adding or deleting a small number of lines.

## Generated linework vs original-off preview

- The preview contains the same accepted lines as the generated-linework file.
- The source image is fully hidden.
- No gray halos, color fills, stale layers, or duplicate cutline are visible.

## Original-off preview vs SVG

- Every accepted interior boundary appears in the SVG.
- The outside cutline remains a single closed path.
- Path geometry stays inside the preview viewBox.
- Stroke weight remains suitable for editing and transfer.

## SVG vs rendered PDF

- Accepted linework appears on the corresponding tiled pages.
- Scale, page order, overlap, and calibration are unchanged.
- Lines remain dark, separated, and physically traceable at 100% print scale.
- No boundary disappears or merges solely because of PDF rendering.

## Verdict

- Overall: pass / fail
- Missing important boundaries:
- Unwanted minor boundaries:
- Export discrepancies:
- Estimated manual additions/deletions:
- Notes:
