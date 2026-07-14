# Compare a structured-vision provider

**Status:** blocked
**Label:** wayfinder:prototype
**Parent:** [Semantic boundary-selection wayfinder](../map.md)
**Blocked by:** [Provision an approved structured-vision provider](05-provision-structured-vision-provider.md)

## Question

Does an approved structured-vision provider produce materially better
protected-region and important-boundary masks than the failed local CLIPSeg
baseline across the fixed corpus?

## Resolution must record

- normalized `semantic-selection-v1` output for every fixture
- source, semantic output, cleaned linework, original-off preview, SVG, and
  rendered PDF artifacts
- cost, latency, provider/model/version, and failure category per fixture
- manual additions/deletions compared with `clipseg-local-v1`
- deterministic fallback behavior on invalid or failed responses
- exactly one verdict: Proceed, Revise, or Stop

Do not integrate the provider into production code in this ticket.
