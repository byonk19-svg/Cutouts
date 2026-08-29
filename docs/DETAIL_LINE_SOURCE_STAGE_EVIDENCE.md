# Source-stage Detail Line evidence

Date: 2026-08-28
Baseline: `ffde73b134c6f62ed73c8b6ba1985b4cd2f033c9`

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
