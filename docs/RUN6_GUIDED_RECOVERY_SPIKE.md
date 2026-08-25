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
GrabCut with those semantic hints, keeps only recovered components touched by
the include strokes, suppresses the authoritative silhouette boundary, and
returns a separate Detail Line proposal. Empty or contradictory annotations
return no proposal. The authoritative mask is never modified.

## Synthetic result

The four spike tests pass for both proportional fixture sizes:

```text
python -m unittest backend.tests.test_accessory_recovery_spike
....
Ran 4 tests ...
OK
```

The low-resolution fixture preserves the accessory body, connector, and
crossing component while excluding the distant artifact and nearby subject
material. The high-resolution fixture preserves the same relationships.

## Local Run 6 result

The rights-cleared local Run 6 source was evaluated without committing the
source image or annotation masks. The source SHA-256 remained:

`0D68FAC935D14228E5E1823E5E0E740ADCD50BC85C99965953346BF1A83B6BB4`

The stored local annotation set used three broad include strokes and three
exclude strokes. The resulting proposal metadata is in the local diagnostic
output directory `output/run6-guided-local-v2/`.

Measured detail pixels by review region:

| Region | Detail pixels |
| --- | ---: |
| Accessory body | 1,574 |
| Accessory neck | 1,283 |
| Bow | 1,842 |
| Hat | 9 |
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

The local deterministic hypothesis **passes this spike**:

> A small number of explicit include/exclude strokes can supply enough local
> semantic information to recover a defining accessory without broad global
> dark-region expansion.

This justifies a separate maker-facing design/implementation task. It does not
authorize automatic recovery, Cut Line changes, export integration, or a claim
that Run 6 has passed the field-test promise. Run 6 remains Fail until a real
workflow proposal is surfaced, accepted, exported, and judged under the existing
cleanup budget.

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
