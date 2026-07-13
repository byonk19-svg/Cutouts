# Semantic linework simplification

**Status:** needs-triage

## Problem

Producing artist-simplified transfer linework from arbitrary artwork requires semantic feature selection. Deterministic contour pruning cannot consistently distinguish important paint boundaries from minor decorative lines.

The current Minimal mode is intentionally labeled experimental because it can remove useful coat, limb, footwear, and accessory boundaries while retaining visually unimportant fragments. Wood Template - Recommended remains the dependable default.

## Follow-up scope

- Evaluate an AI-assisted image-to-line-art stage that identifies semantic character regions before vectorization.
- Preserve face, hair, clothing, limb, footwear, hand, fur, and accessory boundaries required for painting.
- Remove highlights, texture, minor folds, duplicate contours, and decorative accents.
- Keep the existing deterministic outer cutline and PDF geometry unchanged.
- Require side-by-side source, generated linework, and rendered PDF acceptance artifacts.

## Acceptance boundary

Do not promote Minimal as Max-style output until arbitrary rendered and flat-cartoon sources produce deliberately illustrated transfer drawings across the full character without manual reconstruction.
