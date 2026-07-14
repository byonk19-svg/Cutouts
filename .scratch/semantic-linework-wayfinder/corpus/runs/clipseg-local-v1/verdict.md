# Feasibility verdict: Revise

## Conclusion

**Revise.** The selected mask-first contract and deterministic projection/export
boundary are viable, but `Xenova/clipseg-rd64-refined` is not a viable semantic
selector for Cutout Studio's transfer-line requirements.

Do not proceed to a production MVP with this model. Do not change the existing
Wood Template - Recommended workflow based on this result.

## What passed

- All four fixed corpus fixtures ran through one local, pinned model revision.
- Source images remained local.
- Inference completed in 10.1-12.7 seconds per image at $0.00 service cost.
- Peak process memory was approximately 421-452 MB.
- The pinned q4 model cache occupied 168.9 MiB.
- Semantic masks were validated, clipped to the deterministic subject mask,
  cropped with the same bounds, and resized with nearest-neighbor sampling.
- The deterministic outer cutline remained unchanged.
- The accepted detail layer appeared consistently in preview, SVG, and tiled
  PDF output.
- PDF scale, page order, overlap, and calibration remained under the existing
  backend.

## What failed

- Every fixture required major manual reconstruction.
- Important face, clothing, hand, strap, accessory, fur, and footwear
  boundaries were absent or fragmented.
- Region prompts produced coarse filled areas whose contours do not reliably
  correspond to deliberate paint boundaries.
- Several generated boundaries duplicated or drifted near the deterministic
  cutline.
- The prototype proved export compatibility but did not prove in-editor
  regeneration or edit preservation.

## Failure categories

- `semantic-under-selection`: major transfer-worthy boundaries were missing on
  all four fixtures.
- `boundary-fragmentation`: hands, footwear, accessories, and clothing edges
  contained gaps or irregular contours.
- `near-cutline-duplication`: model-derived region contours sometimes ran next
  to the deterministic silhouette.
- `provider-authentication`: the authenticated Claude CLI reported HTTP 401
  before any image request, so no external-provider comparison was possible.
- `onnx-batch-shape-mismatch`: the initial multi-prompt ONNX call failed; the
  prototype worked around this by evaluating prompts sequentially.

## Next evidence needed

Evaluate one stronger structured-vision provider against the same contract and
corpus. It must return or be deterministically adapted into protected-region
and important-boundary masks, preserve the existing fallback, and report total
cost and latency. A production MVP issue remains premature until that comparison
substantially reduces manual reconstruction across all four fixtures.
