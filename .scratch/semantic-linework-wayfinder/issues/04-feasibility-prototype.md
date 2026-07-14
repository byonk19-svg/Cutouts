# Prototype semantic boundary-selection feasibility

**Status:** resolved
**Label:** wayfinder:prototype
**Parent:** [Semantic boundary-selection wayfinder](../map.md)
**Assignee:** Codex
**Claimed:** 2026-07-13
**Resolved by:** Codex on 2026-07-13

## Question

Can the selected semantic boundary approach preserve major paint regions and suppress decorative detail across the fixed corpus well enough to justify a production MVP?

## Resolution must record

- a throwaway prototype using the selected output contract
- side-by-side artifacts for every evaluation fixture
- one row per attempted fixture in the [evidence manifest](../evidence-manifest.md)
- approximate latency and cost or local resource use
- failure categories and fallback implications
- a clear proceed, revise, or stop recommendation

## Resolution

**Revise.** The mask-first contract and deterministic projection/export
boundary passed, but the evaluated local CLIPSeg model failed semantic quality
acceptance on all four fixtures.

Evidence: [`../corpus/runs/clipseg-local-v1/`](../corpus/runs/clipseg-local-v1/verdict.md)

### Measured result

- local model: `Xenova/clipseg-rd64-refined`
- pinned revision: `924dc94f85f58739f353f94258b33bc47eae4862`
- inference latency: 10.1-12.7 seconds per image
- estimated service cost: $0.00 per image
- peak process memory: approximately 421-452 MB
- pinned local model download: 168.9 MiB
- corpus result: four of four fixtures failed human semantic-linework review

### What passed

- masks were clipped to the deterministic subject mask and projected through
  the existing crop/resize geometry
- the outer cutline remained deterministic
- generated detail appeared consistently in preview, SVG, and tiled PDF
- existing scale, tiling, overlap, calibration, and fallback behavior remained
  outside the model

### What failed

- major face, clothing, hand, strap, accessory, fur, and footwear boundaries
  were missing or fragmented
- every fixture required major manual reconstruction
- region contours sometimes duplicated the deterministic cutline
- external-provider comparison was blocked because the available Claude CLI
  returned HTTP 401 before any image request

Do not create a production MVP issue from this result. Compare one stronger
structured-vision provider against the same corpus and contract first.

## Comments

- The initial ONNX multi-prompt call exposed a batch-shape mismatch. Sequential
  prompt evaluation produced a reproducible one-command run without changing
  production code.
