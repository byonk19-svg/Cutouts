# Choose the semantic output contract

**Status:** resolved
**Label:** wayfinder:research
**Parent:** [Semantic boundary-selection wayfinder](../map.md)
**Assignee:** Codex
**Claimed:** 2026-07-13
**Resolved by:** Codex on 2026-07-13

## Question

Should the semantic stage return protected region masks, important-boundary masks, labeled vector paths, simplified raster linework, or a combination, and which contract best preserves deterministic cleanup, vectorization, editing, and export?

## Resolution must record

- candidate contracts and their tradeoffs
- coordinate-space and resolution requirements
- confidence or labeling requirements
- deterministic validation possible at the boundary
- the recommended narrow interface into the current pipeline

## Resolution

Recommended contract: a provider-independent, source-pixel semantic mask pack
with two required channels, `protectedRegions` and `importantBoundaries`.

- `coordinateSpace` is the full decoded RGBA source grid
- `widthPx` and `heightPx` must match the decoded source image exactly
- each component carries an allow-listed `label` and `confidence` in `[0, 1]`
- validation is all-or-nothing; any malformed field invalidates the response
- invalid responses fall back to the existing deterministic workflow
- provider-specific parsing and resizing stay behind the adapter boundary
- semantic masks are clipped to the deterministic subject mask, cropped with
  the same deterministic bounds, and only then resized into preview or print
  working space with nearest-neighbor resampling
- protected regions may annotate or preserve pixels only inside the subject
  mask; they must never expand or replace it
- vector cutline geometry, tiling, calibration, and PDF export remain
  deterministic and outside the model contract

Supporting detail is recorded in
[`../research/03-semantic-output-contract.md`](../research/03-semantic-output-contract.md).
