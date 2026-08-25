# Maker-guided local accessory recovery spike

Date: 2026-08-25
Baseline: `f5e4807447f0d9c2ed10bcd1ca40de540e6e9068`
Scope: fixture-first feasibility only; no UI or production-pipeline integration

## Method

`backend/cutout_studio/accessory_recovery_spike.py` is a proposal-only local
experiment. It is not imported by the production pipeline.

The experiment accepts:

- the source RGB image;
- the existing authoritative subject mask;
- broad maker **include strokes**; and
- optional maker **exclude strokes**.

It creates a bounded local region around the include strokes, seeds OpenCV
GrabCut with those semantic hints, keeps unmarked pixels as probable
background rather than definite background, uses resolution-relative probable
foreground support and exclude influence, keeps only recovered components
touched by the include strokes, suppresses the authoritative silhouette
boundary, and returns a separate Detail Line proposal. Empty or contradictory
annotations return no proposal. The authoritative mask is never modified.
The spike uses the source image as its canonical processing space; all dilation
radii are derived as proportions of the source dimensions rather than fixed
pixel values.

## Synthetic result

The six spike tests pass for both proportional fixture sizes:

```text
python -m unittest backend.tests.test_accessory_recovery_spike
....
Ran 6 tests ...
OK
```

The tests measure ground-truth accessory recall, intersection-over-union,
outside-accessory leakage, annotation coverage, recovery beyond a relative
seed zone, and low/high metric similarity. The sparse annotations cover less
than 35% of the ground-truth accessory while the proposal expands materially
beyond the seed zone. Both fixture scales preserve the body, connector, and
crossing component while excluding the distant artifact and nearby subject
material.

## Local Run 6 result

The rights-cleared local Run 6 source was evaluated without committing the
source image or annotation masks. The source SHA-256 remained:

`0D68FAC935D14228E5E1823E5E0E740ADCD50BC85C99965953346BF1A83B6BB4`

The stored local annotation set used three sparse include strokes and one
exclude stroke (four total marks). The resulting proposal metadata is in the
local diagnostic output directory `output/run6-guided-local-sparse-v4/`.

Measured detail pixels by review region:

| Region | Detail pixels |
| --- | ---: |
| Accessory body | 3,212 |
| Accessory neck | 2,557 |
| Bow | 2,995 |
| Hat | 3 |
| Torso | 0 |
| Footwear | 0 |

The visual proposal shows a recognizable body/neck relationship and a separate
bow while avoiding the broad hat, torso, and footwear regions. The proposal is
still deliberately a diagnostic raster, not accepted/exportable project state.

The authoritative-mask digest was unchanged before and after proposal creation:

`85df6d3c0d4effc68e2c60d610d5314162de68749d96a80106e24da6b0b65982`

No Cut Line, finished dimensions, PDF, SVG, or project-session state was
modified.

## Feasibility decision

The corrected sparse-recovery hypothesis passes the **synthetic** gate but is
rejected for the real Run 6 product lane:

> Sparse include/exclude strokes can recover controlled synthetic geometry, but
> Run 6 still requires more semantic separation than this deterministic method
> can provide without clothing contamination.

This does not justify a maker-facing smart-recovery feature. It does not
authorize automatic recovery, Cut Line changes, export integration, or a claim
that Run 6 has passed the field-test promise. Run 6 remains Fail. The rejection
details and the four-mark real-source result are recorded in
`docs/RUN6_SPARSE_RECOVERY_REJECTION.md`.

## Safety boundary for the next task

The next implementation may expose this proposal through Clean Lines only if
it preserves these rules:

- original accepted Detail Lines remain authoritative until explicit acceptance;
- proposal and annotation overlays never print or export;
- source replacement invalidates annotations and proposals;
- failed or ambiguous recovery leaves accepted geometry unchanged;
- Cut Line bytes/geometry and physical scale remain untouched; and
- no provider request, named-source tuning, centerline automation, or global
  threshold change is introduced.
