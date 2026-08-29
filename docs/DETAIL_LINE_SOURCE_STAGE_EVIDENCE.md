# Source-stage Detail Line evidence

Date: 2026-08-29
Baseline: `24e4465bb23a34e81c8e522342e8a00e7fd2e1fd`

## Run 10: opaque PNG rendered path

Source: `tmp/field-test-sources/run-10-mustache-cartoon-guy.png`
Source SHA-256: `F9A5D3085E961958F4F39C6A31638E2759563AE53A6A71AB6B9B9B5599D2FD94`

The current pipeline selects `template_style=clean` and
`detailExtractionModeUsed=rendered` for this source. Stage artifacts were
captured locally under `output/detail-stage-run10/` and the print-scale layers
under `output/detail-stage-run10-print/`.

| Stage | P90 width px | P90 width pt at 144 DPI | Broad ink | Interpretation |
| --- | ---: | ---: | ---: | --- |
| Grayscale edge candidate | 4.000 | 2.000 | 0.000652 | narrow candidate |
| Color-boundary candidate | 6.000 | 3.000 | 0.016549 | narrow candidate |
| Combined raw candidate | 6.000 | 3.000 | 0.034493 | still narrow |
| Component-filtered candidate | 6.000 | 3.000 | 0.034608 | no broadening yet |
| Preview starter detail | 6.000 | 3.000 | 0.038604 | no broadening yet |
| Print Cut Line only | 10.000 | 5.000 | 0.382594 | outer line contribution |
| Print Detail Lines only | 26.363 | 13.181 | 0.712126 | first broad-band signal |
| Print composed trace | 25.588 | 12.794 | 0.651507 | broad detail carried forward |

Local stage artifact hashes:

| Artifact | SHA-256 |
| --- | --- |
| `luminance-edges.png` | `77B534A1B19367A88A1A68A11A3BB1C96D8447C301A429C0D09B4CEAE6C1AECF` |
| `color-boundaries.png` | `CD7B212142B393A44D7D662D19ABAB449A466FA588FB5A8741B63B88819721D2` |
| `raw-detail-candidates.png` | `BC3816FDEF952ED7A2AE8EFCE5111CBAFDE44DDF203B55F08170D3538298A62E` |
| `cleaned-detail-components.png` | `0F810889DE28CEB2A27FE3E9AD97A17AF8EC832F0AA5E52F48FCE6E0D4AA450D` |
| `final-starter-details.png` | `0391B85DE4FFAF21A541BF755E569BB38756B828879F1368B88454456F787EA8` |
| `print/outer.png` | `DF16D6FC2C0ADE6C647B3BE86FF79CB893A37CC6715C49ACE19446B6F57A34CE` |
| `print/detail.png` | `1B9CA531943A28C887732C76A7E199D44DD211B4790713019F754CF72AAB1800` |
| `print/composed.png` | `498472F76743D12C5DD73573C19707C26E649981FF64A932F7107AD4CC89B112` |

The measured first abnormal stage for Run 10 is therefore the print-scale
Detail Line layer, after the preview candidate and during print-width/render
preparation. This is a rendered-raster path finding, not evidence that the
authored-SVG path shares the same cause.

## Authored SVG cases

Runs 3, 4, and 9 use the frontend authored-ink fast path. The source SVGs are
filled/outlined artwork; qualifying dark-neutral pixels are rasterized into an
editable Detail Line layer, and accepted detail is later normalized by
`_edited_detail_layer` for PDF export. Their normalized PDF trace rasters show
the same broad-band symptom while furniture-only renders remain narrow.

The exact natural-render, classification-canvas, and `svgInkForPreview` pixel
captures require the browser rasterization environment and remain a separate
local-only capture gap. The current evidence supports an imported-raster lead,
but it does not prove whether the first abnormal SVG stage is the source render,
dark-ink extraction, Cut Line clearing, accepted-canvas state, or print resize.

## Diagnosis boundary

- PDF furniture is independently suppressed and measured at the same 72 DPI
  plane as complete-page renders.
- Embedded trace rasters are resampled to their PDF placement rectangles and
  report both pixels and physical points.
- Run 10 has a reproducible print-detail broadening signal.
- SVG and PNG causes are not assumed to be shared.
- No production tracing change is justified by this evidence package.

## Final normalized Run 10 decision

The earlier print-first interpretation is superseded by this normalized pass.
The canonical comparison plane is the final trace geometry at 144 DPI. Preview
stages are resampled into that plane with nearest-neighbor for binary masks and
LANCZOS for source/flattened imagery; native dimensions and effective DPI are
retained in the manifests. Broad ink is reported at a physical threshold of
4.0 pt (`thresholdPx = 4 * comparisonDpi / 72`).

### Fixed ROI

The fixed ROI is the face interior containing both eyes, nose, mustache, and
mouth. It is expressed in support-crop normalized coordinates
`[0.27, 0.24, 0.73, 0.54]`, mapped to source, preview, and print coordinates in
the Run 10 manifest. It is wholly inside the authoritative Cut Line; no Cut
Line pixels are included.

Run 10 source: `tmp/field-test-sources/run-10-mustache-cartoon-guy.png`
(`F9A5D3085E961958F4F39C6A31638E2759563AE53A6A71AB6B9B9B5599D2FD94`).
Recorded finished size is `31.760748 x 36.0 in`; the canonical plane is
`4574 x 5184` pixels.

### Normalized transition

The fixed ROI does not show a narrow-to-broad transition introduced by print
export. In the production-equivalent rendered path, the print luminance-edge
candidate is already about `5.394 pt` P90 in the ROI. The color-boundary
candidate increases that to `10.0 pt`, and the combined raw candidate reaches
`11.984 pt`; the final width expansion reaches `13.784 pt`. The normalized
preview candidate is already `27.0 pt` P90 in the same ROI because the source
is only about 15 DPI before print resampling. In other words, print preparation
does not create the first abnormal signal; it carries forward source-derived
edge bands and adds a bounded width expansion.

The fresh current-main PDF is
`output/run10-final-diagnosis-v3/run-10-current-main.pdf` with SHA-256
`5698DEFEC15A485953316B10E6482DA7123B70A683AA18A34015DA90A0D0E813`.
Its rendered trace pages reproduce the historical symptom on outlier trace
page 7 (row 2 / column 2). The historical corrected-baseline PDF remains
`C:\Users\byonk\Downloads\run-10-corrected-baseline-mustache-cartoon-guy-cutout-template-pack.pdf`
with SHA-256
`81C8B344DEF30947152B1F92C66B37022E67A0CBF12E3C3336CA1F3601E4FCC4`.
The current packet has the same 20 trace-page structure and nearly identical
layer metrics, so the symptom is reproduced rather than removed.

The complete hashable stage manifest and canonical/ROI artifacts are under
`output/run10-final-diagnosis-v3/run-10/manifest.json` (local-only output).

### Controls

The accepted Max fixture was captured with its exact 24-inch, smoothing-4,
2-by-4 layout settings. It uses the authored `lineArt` path: the fixed ROI is
about `2.0 pt` P90 before width expansion and `4.2 pt` after, with no harmful
4-point broadening transition. Its fresh PDF has eight trace pages and SHA-256
`CDA43EA0E27986FEF706925DBCAB033D8AD8F986A71E12D6434BF16F4AEDAC8A`.

Run 7 was used as the narrow raster control. Its final print detail is about
`2.0 pt` P90 before expansion and `4.2 pt` after, with no Run 10-like ROI
transition. Its fresh PDF SHA-256 is
`B699E8C2E41BB64399185F4EB235C0CC636459A08A524F64DD3633E360BF627E`.
The control summary is recorded in
`output/run10-final-diagnosis-v3/run-07-control-summary.json` (local-only
output); its final physical-plane transitions are narrow before expansion and
remain near the 4-point line-width boundary after expansion.

### Forced decision: Outcome B - park Run 10

No safe, bounded production correction is justified by this evidence. The
first harmful width is distributed across source-derived luminance/color edge
candidates rather than introduced by one isolated export step; the preview
and print branches differ because of effective resolution; and any change to
color-boundary or edge interpretation would be a broad rendered-source
heuristic without semantic knowledge of whether paired edges are intentional
boundaries or one maker transfer line. The Max and narrow controls remain
healthy, but that contrast is not enough to establish a universally safe
replacement rule.

Run 10 is therefore parked. No production issue was created, no field-test
classification changed, and no further Run 10 diagnostic follow-up is
authorized without new evidence (for example, a source-class-specific semantic
signal or a reviewed maker workflow that defines which paired edges may be
collapsed).
