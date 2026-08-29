# Automated Detail Line quality diagnostics

This read-only diagnostic makes repeated print-scale line-quality findings
measurable without turning maker acceptance into an automated pass/fail claim.
It is not imported by the tracing or export pipeline.

## Usage

Analyze a raster detail layer:

```text
python -m backend.cutout_studio.detail_quality_diagnostics path/to/detail.png --output output/detail-quality.json
```

Analyze a printable PDF. Trace pages are selected from `Page N of M` labels;
when labels are absent, every page is rendered:

```text
python -m backend.cutout_studio.detail_quality_diagnostics path/to/template.pdf --output output/detail-quality.json
```

For layer attribution, use the Python API `build_pdf_layer_report(...)`. Each
selected page then includes metrics for the complete rendered page, a true
furniture-only render with image XObjects suppressed in a diagnostic PDF copy,
and the largest embedded trace raster resampled to its PDF placement rectangle.
The embedded raster is the combined Cut Line plus Detail Lines layer;
separating those two requires source-stage artifacts or an accepted Cut Line
mask and should not be inferred from whole-page pixels.

## Reported signals

- `image_width_px` and `image_height_px`: raster dimensions used for the
  measurement; use these to normalize comparisons across render sizes.
- `width_p50_px`, `width_p90_px`, and `width_p95_px`: effective local ink width
  from the raster distance transform. High percentiles expose oversized bands.
- `width_p50_pt`, `width_p90_pt`, and `width_p95_pt`: the same widths converted
  to points using `72 / comparison_dpi`.
- `ink_density`: fraction of pixels carrying dark linework.
- `component_count`: connected line component count.
- `broad_ink_fraction`: fraction of ink pixels at least 8 pixels wide.
- `broad_ink_fraction_4pt`: fraction of ink pixels at least 4 physical points
  wide at the reported comparison DPI. Use this field for cross-resolution
  conclusions; the fixed-pixel field is retained for historical reports.
- `boundary_complexity`: area-weighted contour-to-convex-hull ratio. Higher values
  indicate more irregular/jagged boundaries.
- `small_component_fraction`: fraction of ink in tiny isolated components.

The aggregate section reports medians across PDF trace pages. Compare the same
source and finished-size settings across revisions; do not compare raw pixel
values from unrelated render sizes without normalizing the scale.

## Interpretation boundary

These metrics identify where a revision changes raster behavior and provide
repeatable regression evidence. They do not decide whether a maker considers a
line usable, whether a feature is semantically correct, or whether a printed
packet transfers well. Those remain human and physical checks.
