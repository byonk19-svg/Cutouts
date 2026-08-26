# Paint Missing Detail feasibility spike

Date: 2026-08-25
Baseline: `5258d8113f80f571ad5e8e5edf2028597ca317a7`
Scope: proposal-only feasibility; no UI, persistence, or export integration

## Method

`backend/cutout_studio/paint_in_detail_spike.py` treats the maker-painted mask
as authoritative local input. It draws the painted-region boundary, keeps
source-supported Canny edges inside that mask, suppresses the authoritative Cut
Line perimeter, removes isolated specks, and never expands outside the painted
region. Empty paint returns no proposal.

The helper is not imported by the production pipeline. Its output is a
non-accepted Detail Line proposal only.

The comparison harness uses a symmetric, resolution-relative protected band
around the authoritative Cut Line. A straddling-paint regression proves that
neither the inside nor outside perimeter becomes a duplicate Detail Line while
farther support detail remains available.

The tests now pass the actual one-component Cut Line mask returned by
`_subject_geometry`, not the broader cleaned support mask. They also prove
subject-relative behavior with large blank padding and keep a disconnected
support accessory eligible without treating it as a second Cut Line.

## Synthetic result

Four focused tests pass for both proportional fixture sizes. The proposal:

- preserves the accessory body, connector, and crossing component;
- excludes the distant artifact;
- remains strictly bounded by the painted mask; and
- leaves the authoritative Cut Line digest unchanged.

## Local Run 6 result

The local source retained SHA-256:

`0D68FAC935D14228E5E1823E5E0E740ADCD50BC85C99965953346BF1A83B6BB4`

Three broad paint gestures over the body, neck, and bow produced a recognizable
accessory proposal. The local metadata is in
`output/run6-paint-in-local-v4/`.

| Review region | Detail pixels |
| --- | ---: |
| Accessory body | 1,569 |
| Accessory neck | 1,203 |
| Bow | 1,906 |
| Hat | 47 |
| Scarf/clothing | 659 |
| Torso | 0 |
| Footwear | 0 |

The proposal is visibly more complete than the automatic Run 6 starter and is
bounded to the maker-painted area. It also demonstrates the honest limitation:
the tool does not distinguish clothing that the maker paints over. An erase
gesture can remove that material, but this spike did not establish a timed,
maker-reviewed comparison against equivalent manual Feature Lines.

## Decision

The direct paint-in fallback is **promising but not yet proven for production
UI integration**. It may be a useful manual reconstruction aid, but it does
not change Run 6's frozen Fail classification and cannot be described as smart
recovery or automatic semantic selection.

Before building the workflow, record a timed maker comparison against the
existing Feature Line tool. The comparison must count paint/erase gestures,
cleanup minutes, and whether painting most of the accessory still feels like
major region reconstruction. Only then can the product decide whether this
fallback materially reduces real work.

No Cut Line, finished size, PDF/SVG, project state, provider, or physical
behavior changed in this spike.

The disposable pointer-comparison surface is local-only at
`output/paint-in-comparison/index.html`; it is not production UI.
