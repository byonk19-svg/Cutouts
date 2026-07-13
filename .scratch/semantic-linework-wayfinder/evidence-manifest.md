# Semantic linework evidence manifest

Use one row per fixture attempt so prototype results can be reproduced and
compared. Keep source fixtures non-sensitive and legally usable.

| Fixture | Source file | Source dimensions | Provider/model/version | Request version | Output contract version | Latency | Estimated cost | Result status | Artifact paths | Human-review notes | Failure category |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| | | | | | | | | | | | |

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
