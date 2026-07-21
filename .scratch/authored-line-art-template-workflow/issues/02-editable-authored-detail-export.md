# 02 - Editable Authored Detail Export

**What to build:** A maker can keep, remove, and add transfer-worthy authored
detail lines in Clean Lines, then export exactly that accepted detail layer with
one clean Cut Line in matching SVG and tiled PDF outputs.

**Blocked by:** 01 - Reliable Authored Line-Art Import.

**Status:** complete

- [x] Authored detail ink adjacent to the Cut Line is suppressed so the printable
  drawing does not show a duplicate exterior contour.
- [x] Interior authored ink remains editable alongside manual Feature Lines.
- [x] Accepted authored details and manual Feature Lines survive save and restore.
- [x] Original-off preview, SVG, and tiled PDF use the same accepted detail
  layer while keeping current finished size and print geometry unchanged.
- [x] Regression tests prove the exported outputs remain aligned and preserve
  the authoritative Cut Line.

## Comments

- Human workflow acceptance completed through ticket 04's physical print check on 2026-07-21.

- Implemented test-first on `codex/detailed-line-art-routing`. Clean Lines now
  keeps accepted authored detail and manual Feature Lines on separate aligned
  canvases, so either layer can remain present without being flattened into or
  discarded by the other.
- Project save/restore preserves both artifacts. SVG export includes the
  accepted-detail layer, manual-strokes layer, and one authoritative Cut Line;
  PDF export sends the same accepted detail plus vector Feature Lines.
- The PDF regression proves accepted detail is unchanged when Feature Lines are
  added, page count and media boxes remain identical, and the vector stroke is
  still present. Existing exterior-contour suppression and protected SVG/PDF
  geometry tests remain green.
- Verification: `pnpm verify` passed 88 backend tests, all TypeScript suites,
  TypeScript compilation, and the production build. The isolated serial
  Chromium run passed 28/28. Focused backend, persistence, SVG, and browser
  checks passed; `git diff --check`, Standards review, and Spec review passed.
- No external provider request was made. Tickets 03-04, Cut Line path geometry,
  SVG viewBox/calibration, Finished Size, tiling, overlap, and PDF page geometry
  were not changed.
