# Semantic linework evidence manifest

Use one row per fixture attempt so prototype results can be reproduced and
compared. Keep source fixtures non-sensitive and legally usable.

| Fixture | Source file | Source dimensions | Provider/model/version | Request version | Output contract version | Latency | Estimated cost | Result status | Artifact paths | Human-review notes | Failure category |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| soft-shaded-render | `corpus/sources/soft-shaded-render.png` | 720 x 960 | local-transformers-js / Xenova/clipseg-rd64-refined / 924dc94f85f58739f353f94258b33bc47eae4862 | clipseg-prompts-v1 | semantic-selection-v1 | 10101 ms | $0.00 | completed | `corpus/runs/clipseg-local-v1/soft-shaded-render/` | Fail: major paint boundaries missing; 10-14 additions estimated | semantic-under-selection |
| flat-outlined-cartoon | `corpus/sources/flat-outlined-cartoon.jpg` | 720 x 960 | local-transformers-js / Xenova/clipseg-rd64-refined / 924dc94f85f58739f353f94258b33bc47eae4862 | clipseg-prompts-v1 | semantic-selection-v1 | 12289 ms | $0.00 | completed | `corpus/runs/clipseg-local-v1/flat-outlined-cartoon/` | Fail: major paint boundaries missing; 8-12 additions estimated | semantic-under-selection |
| transparent-cartoon | `corpus/sources/transparent-cartoon.png` | 720 x 960 | local-transformers-js / Xenova/clipseg-rd64-refined / 924dc94f85f58739f353f94258b33bc47eae4862 | clipseg-prompts-v1 | semantic-selection-v1 | 11914 ms | $0.00 | completed | `corpus/runs/clipseg-local-v1/transparent-cartoon/` | Fail: major paint boundaries missing; 9-13 additions estimated | semantic-under-selection |
| dark-complex-cartoon | `corpus/sources/dark-complex-cartoon.png` | 800 x 960 | local-transformers-js / Xenova/clipseg-rd64-refined / 924dc94f85f58739f353f94258b33bc47eae4862 | clipseg-prompts-v1 | semantic-selection-v1 | 12723 ms | $0.00 | completed | `corpus/runs/clipseg-local-v1/dark-complex-cartoon/` | Fail: major paint boundaries missing; 12-16 additions estimated | semantic-under-selection |

## Field rules

- `Fixture`: stable, anonymized fixture identifier.
- `Source file`: repository-relative path to the fixed corpus source.
- `Source dimensions`: width x height in source pixels.
- `Provider/model/version`: exact provider and model identifiers reported for
  the attempt.
- `Request version`: versioned prompt or structured request identifier.
- `Output contract version`: version of the selected semantic output schema.
- `Latency`: end-to-end semantic-stage duration for the attempt.
- `Estimated cost`: total cost across all model calls for the attempt.
- `Result status`: success, invalid-response, service-failure, or fallback.
- `Artifact paths`: repository-relative paths for source, semantic output,
  cleaned linework, original-off preview, SVG, and rendered PDF artifacts.
- `Human-review notes`: concise assessment against the corpus fixture's
  expected transfer-worthy boundaries.
- `Failure category`: stable structured category, or `none` for a successful
  result.
