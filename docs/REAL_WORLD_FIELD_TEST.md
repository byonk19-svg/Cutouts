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

This protocol correction is based on the stabilized `main` commit
`cf445db8a8e620aa24680b0f40fc59d30c5281ab`. Do not select sources or begin a
run from that pre-correction baseline. After this docs-only PR merges, record
its resulting merge SHA as the round's `Recorded commit`; that post-merge SHA,
not `cf445db8`, is the only app commit used for all ten runs.

Do not change production code, tracing settings, fixtures, profiles, validators,
or workflow tooling during the round.

## Outcome definitions

- **Pass:** The packet meets the product promise with light cleanup: no more
  than 5 minutes and no more than 5 deliberate delete/add actions, no major
  region reconstruction, a usable Cut Line and important Detail Lines, and
  correct PDF mechanics.
- **Heavy cleanup:** The output is ultimately usable, but exceeds the light
  cleanup promise in time, deliberate actions, or reconstruction effort.
- **Fail:** The output is unusable, requires major reconstruction, or has a
  scale, calibration, tiling, data-loss, or other blocking defect.

Only **Pass** counts toward the required 8-of-10 reliability gate. Heavy
cleanup does not count as a passing source.

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

Before executing or evaluating any of the ten sources, record three distinct
run numbers in the Physical checks table. Choose them before Run 1 and without
seeing any results; do not defer this choice until printing. Keep those
preselected numbers if the round must be restarted.

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

If any production-code correction becomes necessary during the round, stop the
round immediately. Do not apply the correction and continue, and do not count
the partial round. After the fix is merged, record the new `main` merge SHA as
the `Recorded commit` and restart all ten sources from Run 1, using the same
source set and preselected physical-test run numbers.

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

The three run numbers must already be recorded before any source is executed or
evaluated, as required by the Run protocol. This keeps the physical sample from
being chosen only from the easiest results.

| Run | Actual Size used | 1-inch calibration correct | Adjacent pages align | Outer Cut Line transfers | Detail Line transfers | Line weight practical | Color Guide useful | Notes |
| ---: | --- | --- | --- | --- | --- | --- | --- | --- |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |
|  |  |  |  |  |  |  |  |  |

## Decision gate

Call the current workflow broadly reliable for this source range only if:

- at least 8 of 10 sources are classified **Pass**; **Heavy cleanup** does not
  count toward this requirement;
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
| Recorded commit (post-protocol merge SHA) |  |
| Usable packets |  / 10 |
| Pass / Heavy cleanup / Fail |  /  /  |
| Median cleanup minutes |  |
| Median cleanup actions |  |
| Finished Size/calibration/tiling failures |  |
| Successful physical checks |  / 3 |
| Most frequent blocker |  |
| Decision | Reliable / Fix repeated blocker / Reassess promise |
