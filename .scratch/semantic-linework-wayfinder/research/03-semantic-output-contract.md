# Semantic Output Contract Recommendation

## Decision

Use a provider-independent, source-pixel, mask-first semantic contract:

- one `protectedRegions` channel for areas that must survive cleanup
- one `importantBoundaries` channel for transfer-worthy interior edges
- no model-owned cutline geometry
- no model-owned SVG/PDF export geometry

This is the narrowest contract that still preserves deterministic cleanup,
vectorization, editability, cutline geometry, and export.

## Compared Options

| Candidate | Strengths | Weaknesses | Fit |
| --- | --- | --- | --- |
| Protected region masks | Strong preservation signal; easy to validate; easy to merge with existing cleanup | Does not identify which edges should become starter detail | Good, but incomplete alone |
| Important-boundary masks | Directly supports starter line selection and cleanup | Too weak by itself to express keep-vs-drop intent for whole regions | Good, but incomplete alone |
| Labeled vector paths | Human-readable and SVG-friendly | Too close to geometry control; hard to validate; risks letting the model own cutline shape | Poor fit for this workflow boundary |
| Simplified raster linework | Easy to preview and edit in the current UI | Conflates semantic intent with rendering; loses preserve-vs-remove metadata | Useful as a derived artifact, not as the contract |
| Mask combination | Separates preserve intent from boundary intent; deterministic downstream synthesis remains possible | Slightly more schema than a single raster | Best fit |

## Recommended Contract

The semantic stage should return a normalized JSON object with this shape:

```json
{
  "schemaVersion": "semantic-selection-v1",
  "coordinateSpace": "source-pixels",
  "widthPx": 720,
  "heightPx": 960,
  "protectedRegions": [
    {
      "id": "region-1",
      "label": "hair",
      "confidence": 0.92,
      "maskPngDataUrl": "data:image/png;base64,..."
    }
  ],
  "importantBoundaries": [
    {
      "id": "boundary-1",
      "label": "hair-edge",
      "confidence": 0.88,
      "maskPngDataUrl": "data:image/png;base64,..."
    }
  ]
}
```

### Required fields

- `schemaVersion`: fixed string for compatibility gating
- `coordinateSpace`: must be `source-pixels`
- `widthPx` and `heightPx`: exact source-image dimensions
- `protectedRegions`: array of connected-component masks that must survive
  cleanup
- `importantBoundaries`: array of connected-component masks that should become
  starter detail lines

### Label set

Use a small provider-independent allow-list:

- protected regions: `face`, `hair`, `hands`, `clothing`, `footwear`,
  `accessory`, `fur`, `strap`
- important boundaries: `face-edge`, `hair-edge`, `garment-seam`,
  `hand-edge`, `boot-edge`, `accessory-edge`

Labels are advisory for synthesis and review. Geometry must still be derived
deterministically by the backend. Silhouette labels are deliberately excluded:
the deterministic subject mask and outer cutline remain the sole source of
silhouette geometry.

### Confidence

- confidence is a float from `0.0` to `1.0`
- confidence is required on every component
- confidence is used for ranking, telemetry, and low-confidence suppression
- confidence does not directly control cutline geometry or PDF export

## Coordinate Space And Resolution

Use the full decoded RGBA source grid as the canonical contract space.

Why:

- it matches the decoded image returned by `_load_image`
- it keeps the contract aligned with the pre-crop source image, not the
  preview or print working space
- it avoids an extra resize convention in the public contract
- it lets the adapter validate exact width and height before synthesis
- it keeps the semantic result aligned with the deterministic crop, cleanup,
  and detail-layer postprocessing code

The frontend does not consume source pixels directly. Frontend geometry is
derived later from `analyze_template` after deterministic bounds calculation,
cropping, and preview resizing.

If a provider requires internal resizing, that stays inside the adapter. The
adapter must back-map the response to the original source-pixel grid before the
result is accepted.

### Deterministic Projection

After validation, the backend must project the semantic output through the
existing deterministic geometry steps:

1. clip each semantic mask to the deterministic subject mask
2. crop using the exact same deterministic bounds computed for the source mask
3. resize the cropped masks into preview or print working space with
   nearest-neighbor resampling

This projection preserves the subject mask as the source of truth for the
outer cutline. Protected regions may only annotate or preserve pixels that are
already inside the subject mask; they must never expand or replace it.

## Validation

A response is valid only if all of the following are true:

- the payload parses as JSON
- `schemaVersion` matches the expected contract version
- `coordinateSpace` is `source-pixels`
- `widthPx` and `heightPx` match the uploaded source image exactly
- every component mask decodes successfully
- every mask decodes as PNG data in `L` or `RGBA` mode
- every mask is binary after decoding:
  - `L` masks contain only `0` and `255`
  - `RGBA` masks contain only black RGB values with alpha `0` or `255`
- every mask has the declared dimensions
- every `confidence` value is finite and within `[0, 1]`
- every `label` is on the allow-list
- at least one protected region is present
- at least one important boundary is present for the feasibility prototype

Any invalid field makes the entire response invalid. Do not partially accept a
broken response.

## Invalid Response Fallback

If the semantic response is invalid, the adapter must:

1. reject the response as `invalid-response`
2. preserve the project state
3. fall back to the existing deterministic workflow
4. keep cutline geometry, export geometry, and manual editing under the current
   non-AI pipeline

This means the semantic stage can fail safely without blocking the user from
the current Wood Template / Faithful Artwork / manual cleanup path.

## Adapter Boundary

Keep the provider-specific code in one adapter layer.

The adapter is responsible for:

- model and provider selection
- request formatting
- source-image normalization if the provider needs it
- parsing the provider response
- converting provider-specific output into the contract above
- validating dimensions, labels, confidence, and binary masks
- mapping accepted masks into the deterministic backend pipeline

The deterministic backend is responsible for:

- cleanup and simplification
- turning subject masks into the outer cutline path
- turning important boundaries into starter raster linework
- vectorizing only the geometry that the app already owns
- SVG and PDF export

The provider must never own `outerCutPath`, page tiling, calibration, or PDF
assembly.

## Why This Is The Best Narrow Fit

The current app already treats the outer cutline as a deterministic vector path
and the editable detail layer as a raster suggestion layer. The semantic stage
should therefore supply preservation and boundary intent, not finished geometry.

That aligns with the current pipeline:

- `backend/cutout_studio/pipeline.py` builds the cutline and detail layers
  deterministically
- `src/cutoutProject.ts` stores `outerCutPath`, `detailLinePngDataUrl`, and
  `traceQuality` as derived analysis
- `src/traceLineworkSvg.ts` exports the locked cutline and editable manual
  strokes
- `src/traceQuality.ts` already validates whether the cutline exists and stays
  in bounds

The recommended contract fits those boundaries without forcing the model to
emit geometry that should remain deterministic.

## Feasibility Prototype Implication

For the prototype, the semantic stage can be evaluated by:

- preserving major regions through `protectedRegions`
- preserving transfer-worthy boundaries through `importantBoundaries`
- letting deterministic cleanup convert those masks into starter linework
- keeping the outer cutline and export path fully deterministic

That is precise enough to build the feasibility prototype without changing the
current export pipeline contract.
