# Flat Line-Art Detection Design

## Problem

Balanced starter lines currently treat every source as rendered artwork. For flat cartoons that already contain thick black outlines, `_clean_feature_line_mask()` detects both sides of each source stroke through grayscale edges and Lab color boundaries. One source line can therefore become two nearby contours, while the generated outer cutline can add another contour near the silhouette.

Rendered and softly shaded sources still need boundary detection. The fix must select a different detail-extraction path for existing line art without weakening the established rendered-image behavior.

## Classification

Add a deterministic flat-line-art classifier near the detail-mask helpers. It evaluates the cropped working image and subject mask using four bounded signals:

- background pixels are predominantly near white or transparent;
- subject colors collapse into a small number of populated quantized bins;
- a meaningful but bounded share of subject pixels are dark ink;
- non-ink subject regions have low local gradient or texture variation.

The classifier returns both the decision and diagnostics used by analysis. It must be conservative: ambiguous inputs continue through the existing rendered-image detector. Tests define the accepted ranges using synthetic flat-cartoon, soft-gradient, textured, and photographic-style fixtures rather than relying on one production image.

## Detail Extraction

When Balanced mode receives a confidently classified flat cartoon:

1. Extract dark pixels from the flattened working image as existing ink.
2. Clean isolated specks and components using the established component utilities.
3. Preserve coherent source strokes rather than applying `FIND_EDGES`, Lab boundary detection, or head-feature boosting.
4. Suppress detail ink inside a narrow band adjacent to the generated subject boundary so the outer cutline remains the only silhouette line.
5. Return a binary detail mask through the existing detail-layer and export contracts.

The initial implementation preserves the source ink shape. It does not add skeletonization because thinning can introduce branches and gaps at joins. Existing preview and print-width handling remains responsible for display and export thickness.

Simple, Detailed, manual, rendered Balanced, PDF geometry, SVG geometry, and outer-cutline generation remain unchanged.

## Product Feedback And Override

Analysis exposes a flat-line-art detection flag. Trace status displays `Existing line art detected` when active so users understand why the starter result differs from rendered-image tracing.

More Tools provides an override with three choices:

- `Auto` uses classification and is the default.
- `Existing line art` forces dark-ink extraction.
- `Rendered image` forces the current boundary detector.

The override is persisted with project settings and sent through the existing analysis/export requests. Legacy projects default to `Auto`.

## Failure Handling

If classification is uncertain, the app uses the existing rendered-image path. If forced existing-line-art extraction produces no meaningful ink, analysis returns the current starter-line result plus a warning instead of silently generating an empty detail layer.

## Testing

Implementation proceeds test-first:

- a thick synthetic black stroke produces one preserved ink region rather than two edge contours;
- silhouette-adjacent ink is removed from the detail layer while interior ink remains;
- flat-cartoon fixtures classify as line art;
- soft gradients and textured/rendered fixtures do not classify as line art;
- `Auto`, forced line-art, forced rendered, and legacy project settings round-trip correctly;
- Trace status exposes the selected detection result and More Tools exposes the override;
- the full backend, frontend, build, PDF/SVG, and Playwright suites remain green.

## Acceptance

With the original underlay hidden, an already-outlined cartoon no longer shows hollow or doubled contours caused by tracing both sides of its black source strokes. Rendered Coraline-style inputs retain the existing boundary-based behavior. No tracing mode silently changes without a visible status indication, and users can override incorrect classification without leaving Clean Lines.
