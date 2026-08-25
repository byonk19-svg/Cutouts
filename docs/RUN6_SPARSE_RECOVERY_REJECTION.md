# Sparse guided-recovery rejection

Date: 2026-08-25
Baseline: `9ca8076760a950da8c3d941566807fa2cb4549ed`

## Decision

The sparse semantic-recovery spike is **rejected for maker-facing UI work**.

It succeeds on controlled low/high synthetic fixtures, but it does not safely
separate the defining accessory from visually similar Run 6 clothing. Run 6
remains a truthful **Fail**.

## Synthetic evidence

The corrected seed model uses:

- definite foreground only on include strokes;
- definite background on exclude influence zones and the crop edge;
- probable background for other unmarked pixels in the bounded crop;
- resolution-relative foreground support and exclusion radii; and
- immutable authoritative Cut Line input.

Six focused tests pass. They pin both ground-truth accessory-mask hashes and
measure recall, IoU, local leakage, annotation coverage, recovery beyond the
relative seed zone, low/high similarity, Cut Line immutability, exclusion, and
safe empty-input refusal.

The synthetic fixtures pass the gate with sparse strokes covering less than
35% of the ground-truth accessory and meaningful recovery beyond the seed zone.

## Real Run 6 evidence

The local source remained uncommitted and retained SHA-256:

`0D68FAC935D14228E5E1823E5E0E740ADCD50BC85C99965953346BF1A83B6BB4`

With three sparse include strokes and one exclude stroke (four total marks),
the proposal recovered the instrument regions but also retained visually
similar clothing/scarf geometry:

| Review region | Detail pixels |
| --- | ---: |
| Accessory body | 3,430 |
| Accessory neck | 2,612 |
| Bow | 3,123 |
| Hat | 3 |
| Scarf/clothing | 1,477 |
| Torso | 402 |
| Footwear | 0 |

Adding a second exclude stroke over the scarf caused the method to refuse the
proposal instead of returning a contaminated result. That is correct safety
behavior, but it means the intended sparse semantic-recovery UX is not proven.

The authoritative Cut Line digest remained unchanged:

`85df6d3c0d4effc68e2c60d610d5314162de68749d96a80106e24da6b0b65982`

## Product boundary

This result proves that sparse annotations can create a clean local proposal on
controlled geometry. It does **not** prove that the maker can roughly indicate
Run 6 and have the software infer the intended accessory. The behavior remains
closer to guided paint-in than semantic recovery for this real source.

No UI, production pipeline, Cut Line, PDF/SVG, project state, provider, or
physical behavior was changed. Do not build the smart-recovery UI around this
spike. The honest next experiment is a direct **Paint Missing Detail** fallback,
with manual reconstruction effort measured separately from the frozen Run 6
Pass definition.
