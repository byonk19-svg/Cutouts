# Doubled interior-line diagnosis (read-only)

Date: 2026-08-27
Baseline: `f9972682d006950711e9893bae4cb6064038cda3`

## Scope and controls

The diagnosis uses corrected-baseline packets for Runs 3, 4, 9, and 10, with
Runs 2 and 7 as comparatively narrow raster controls. It does not modify
tracing code or historical field-test classifications. Purchased SVG derivatives
remain local; this document records metrics and stage conclusions only.

## Page and layer evidence

The layer-aware analyzer records 1-based trace-page and PDF-page indices, row /
column labels, per-page P50/P90/P95 width, broad-ink fraction, density,
complexity, and packet-maximum flags.
Its furniture-only regression includes a crop mark drawn over the trace-image
placement area, proving that vector page furniture is retained when the image
XObject is suppressed.
Width is reported in both comparison-plane pixels and physical points; the
normalized PDF layer reports use 72 DPI, so one comparison pixel equals one
point.

For the four primary packets, true furniture-only pages have median P90 width
2.0-2.8 px and zero broad-ink fraction. The embedded trace raster (Cut Line
plus Detail Lines), resampled to the same 72 DPI placement rectangle, has higher
medians:

| Run | Highest trace P90 page | Highest broad-ink page | Highest complexity page | Trace P90 median |
| ---: | ---: | ---: | ---: | ---: |
| 3 | 1 (row 1 / column 1) | 1 (row 1 / column 1) | 3 (row 2 / column 1) | 7.797 px |
| 4 | 9 (row 3 / column 1) | 16 (row 4 / column 2) | 19 (row 5 / column 1) | 6.794 px |
| 9 | 2 (row 1 / column 2) | 2 (row 1 / column 2) | 1 (row 1 / column 1) | 6.000 px |
| 10 | 7 (row 2 / column 1) | 7 (row 2 / column 1) | 4 (row 1 / column 2) | 6.000 px |

This rules out page labels, crop marks, overlap guides, and calibration content
as the primary explanation for the spikes. The remaining PDF limitation is
that the embedded trace raster combines the Cut Line and Detail Lines.

## Source-path conclusions

### Authored SVG import (Runs 3, 4, 9)

The source SVGs contain filled color regions and dark outlined shapes. Their
frontend fast path rasterizes authored ink into an editable raster layer; PDF
export then resizes that accepted layer through `_edited_detail_layer`. This
path does not pass the imported detail through the backend's rendered-source
centerline/simplification stages. The strongest current lead is therefore the
accepted imported raster itself: broad/doubled source shapes remain broad when
they reach print scale. This is a code-path inference, not yet a natural-render
stage proof.

### Opaque PNG rendered extraction (Run 10)

Run 10 uses the backend rendered path. Its trace content shows the same printed
symptom, but that does not establish an SVG-shared cause. The relevant stages to
inspect next are the rendered color-boundary/detail candidate, protected-region
restoration, final detail filtering, and print-width application. A separate
source-stage capture is required before selecting a production change.

## Diagnosis status

The PDF layer evidence proves that the spikes belong to trace content rather
than page furniture. It does not yet prove a single shared root cause between
authored SVG and opaque PNG inputs, and it does not justify a global
centerlining or skeletonization change.

Production change justified: **No - diagnosis only.**
