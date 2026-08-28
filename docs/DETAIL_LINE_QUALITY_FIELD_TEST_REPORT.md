# Corrected field-test Detail Line quality report

Generated: 2026-08-27
Analyzer baseline: `fddeb08b806c7d94c606b8e48b97624f95799a15`
Inputs: the ten locally available corrected-baseline PDFs recorded by the field-test worksheet

## Measurements

The analyzer rendered each PDF's labeled trace pages and measured effective ink
width, dark-pixel density, broad-band ink, and contour complexity. Median values
describe the packet; maximum values identify an outlier page that may deserve
visual inspection.

| Run | Trace pages | P90 width median px | P90 width max px | Broad ink median | Broad ink max | Complexity median | Complexity max |
| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |
| 1 | 8 | 11.600 | 12.000 | 0.293513 | 0.387991 | 1.414249 | 1.715012 |
| 2 | 20 | 5.600 | 6.000 | 0.000000 | 0.000000 | 1.268823 | 1.743127 |
| 3 | 8 | 7.194 | 21.194 | 0.077828 | 0.518648 | 1.278652 | 2.328798 |
| 4 | 24 | 6.197 | 15.594 | 0.010852 | 0.377926 | 1.390308 | 1.971723 |
| 5 | 12 | 6.394 | 14.000 | 0.031157 | 0.398710 | 1.436168 | 2.849099 |
| 6 | 8 | 6.000 | 8.394 | 0.000777 | 0.115356 | 1.228206 | 2.155570 |
| 7 | 20 | 5.600 | 6.000 | 0.000000 | 0.000000 | 1.171358 | 1.316109 |
| 8 | 8 | 6.000 | 6.394 | 0.000063 | 0.004212 | 1.782154 | 2.538247 |
| 9 | 16 | 6.000 | 19.988 | 0.000000 | 0.548620 | 1.319441 | 3.044006 |
| 10 | 20 | 6.000 | 14.388 | 0.000000 | 0.489752 | 1.287709 | 1.769512 |

## What this shows

- Run 8 has the highest median contour complexity.
- Run 9 has the highest page-level maximum complexity/broad-band signal, and Run
  5 has the second-highest page-level maximum.
- Runs 3, 9, and 10 remain the strongest authored-SVG/opaque-PNG candidates for
  doubled or banded interior details based on their selected outlier pages.
- Run 4 shows the same pattern at a lower maximum intensity.
- Run 8 has the highest contour-complexity values, consistent with its separate
  thin-silhouette/jaggedness problem rather than the authored-SVG banding
  pattern.
- Runs 2, 6, and 7 have comparatively sparse narrow raster ink by these
  measures; that does not prove semantic completeness or physical usability.

These metrics are diagnostic evidence, not automatic maker-quality verdicts.
The rendered artifact and human/physical review remain authoritative. No field-
test classification or production behavior was changed by this report.

## Layer attribution follow-up

The layer-aware report separates page furniture from the embedded trace raster.
Across the primary cases, furniture-only P90 width is 2.8 px with zero broad
ink, while the combined trace raster is substantially higher:

| Run | Combined trace P90 median | Combined trace broad-ink median |
| --- | ---: | ---: |
| 3 | 14.594 px | 0.476927 |
| 4 | 12.188 px | 0.433230 |
| 9 | 10.788 px | 0.396699 |
| 10 | 11.588 px | 0.421293 |

This proves the packet spikes are carried by trace content rather than labels,
crop marks, overlap guides, or calibration furniture. The PDF raster still
combines Cut Line and Detail Lines, so it does not by itself prove that Detail
Lines alone cause every spike.

## Reproduction

The JSON reports were generated locally under `output/detail-quality-field-test/`
from the exact PDF paths recorded in `docs/REAL_WORLD_FIELD_TEST.md`:

```text
python -m backend.cutout_studio.detail_quality_diagnostics <packet.pdf> --output <report.json>
```
