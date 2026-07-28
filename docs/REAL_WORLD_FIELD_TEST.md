# Cutout Studio Real-World Field Test

## Purpose

Measure how reliably the current PDF-first Cutout Studio workflow handles
ordinary new projects. This is product use, not an acceptance-framework or
algorithm-development program.

The working product promise is:

> Given one clean character image on a simple background, Cutout Studio creates
> a correctly scaled tiled PDF with one practical outer Cut Line, useful
> interior transfer lines, and an optional paint reference, with only light
> cleanup required.

The field test begins from clean current `origin/main`. Record the exact commit
before run 1. Do not change production code, tracing settings, fixtures,
profiles, validators, or workflow tooling between runs 1 and 5.

## Source set

Use 10 previously unseen character sources that the maker has the right to use.
Do not reuse Coraline, Grinch, Max, or existing test fixtures. Do not commit
purchased, personal, or copyrighted source files or derived artifacts unless
redistribution rights are confirmed.

Choose one source for each row. A source may have more than one difficult trait,
but do not replace a failed source with an easier one.

| Run | Required source category | Source ID or local filename | Rights/commit disposition |
| ---: | --- | --- | --- |
| 1 | Clean transparent PNG |  |  |
| 2 | White-background JPEG |  |  |
| 3 | Purchased or authored SVG |  |  |
| 4 | Detailed character SVG |  |  |
| 5 | Baked-checkerboard raster image |  |  |
| 6 | Character on a dark background |  |  |
| 7 | Low-resolution image |  |  |
| 8 | Character with thin limbs |  |  |
| 9 | Character holding a large accessory |  |  |
| 10 | Character with important facial details |  |  |

## Run protocol

For every source:

1. Start from the same recorded app commit and use the ordinary Upload ->
   Clean Lines -> Colors -> Export workflow.
2. Set the intended Finished Size before judging linework.
3. Use the default recommended path first. Record every Connected Line Segment
   deletion and Feature Line addition.
4. Stop the cleanup timer when the packet is ready to export. Do not exclude
   time spent redrawing a major region.
5. Export the PDF and inspect finished size, calibration content, tile labels,
   page order, and adjacent overlap digitally.
6. Record the result immediately in the worksheet. A failure stays in the set.

Do not tune the algorithm or add source-specific logic during runs 1 through 5.
After run 5, continue through run 10 on the same production behavior unless a
scale, calibration, tiling, data-loss, or crash defect makes completion
impossible. Record such a defect as a failure before any emergency correction.

For three deliberately varied runs, print the cover and two adjacent pages at
Actual Size / 100%, measure the calibration square, assemble the pages, and
transfer one outer Cut Line plus one interior Detail Line.

## Results worksheet

Use `Yes` or `No` where requested. `Overall result` must be `Pass`,
`Heavy cleanup`, or `Fail`.

| Run | Source type | Cut Line usable | Major features present | Deletions | Additions | Major region redrawn | Cleanup minutes | Color Guide useful | PDF scale/tiling correct | Overall result | Notes |
| ---: | --- | --- | --- | ---: | ---: | --- | ---: | --- | --- | --- | --- |
| 1 | Transparent PNG |  |  |  |  |  |  |  |  |  |  |
| 2 | White-background JPEG |  |  |  |  |  |  |  |  |  |  |
| 3 | Purchased/authored SVG |  |  |  |  |  |  |  |  |  |  |
| 4 | Detailed SVG |  |  |  |  |  |  |  |  |  |  |
| 5 | Baked-checkerboard image |  |  |  |  |  |  |  |  |  |  |
| 6 | Dark-background image |  |  |  |  |  |  |  |  |  |  |
| 7 | Low-resolution image |  |  |  |  |  |  |  |  |  |  |
| 8 | Thin-limbed character |  |  |  |  |  |  |  |  |  |  |
| 9 | Character with accessory |  |  |  |  |  |  |  |  |  |  |
| 10 | Facial-detail character |  |  |  |  |  |  |  |  |  |  |

## Physical checks

Select three runs before printing so the physical sample is not chosen only
from the easiest results.

| Run | Actual Size used | 1-inch calibration correct | Adjacent pages align | Outer Cut Line transfers | Detail Line transfers | Line weight practical | Color Guide useful | Notes |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |

## Decision gate

Call the current workflow broadly reliable for this source range only if:

- at least 8 of 10 sources produce usable packets;
- there are zero Finished Size, calibration, or tiling failures;
- median cleanup time is five minutes or less;
- median cleanup actions (deletions plus additions) are five or fewer;
- no major face, body, clothing, limb, or accessory region requires
  reconstruction; and
- all three physical print, assembly, and representative transfer checks pass.

After all 10 runs, group failures by observed cause. Fix only the problem that
appeared most often or completely blocked output, then rerun the same 10
sources. Do not create a new product feature, Acceptance Fixture, validation
framework, AI experiment, editor tool, geometry feature, or orchestration layer
unless the recorded repeated blocker directly requires it.

## Summary

| Measure | Result |
| --- | --- |
| Recorded commit |  |
| Usable packets |  / 10 |
| Pass / Heavy cleanup / Fail |  /  /  |
| Median cleanup minutes |  |
| Median cleanup actions |  |
| Finished Size/calibration/tiling failures |  |
| Successful physical checks |  / 3 |
| Most frequent blocker |  |
| Decision | Reliable / Fix repeated blocker / Reassess promise |
